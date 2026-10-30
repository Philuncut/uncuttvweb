import type Stripe from "stripe";
import { isCountryBlocked } from "@/lib/blocked-countries";
import { isWholesaleCountryAllowed } from "@/lib/wholesale-allowed-countries";
import {
  shouldSendExplicitEuB2cLineAmounts,
  shouldSendExplicitNonEuLineAmounts,
} from "@/lib/eu-vat-rates";
import {
  splitGrossForWooRest,
  buildWholesaleNonRcLineItem,
  buildEuB2cNonAtLineItem,
  buildEuB2cNonAtLineItemWithBakedDiscount,
  buildNonEuB2cLineItem,
  buildNonEuB2cLineItemWithBakedDiscount,
  splitGrossForNonEu,
  addTaxToNet,
  buildEuB2cWooShippingTaxes,
} from "@/lib/woo-vat-split";
import { parsePrice } from "@/lib/parse-price";
import {
  buildMarketingUtmOrderMeta,
  mergeMarketingUtmIntoMeta,
  type MarketingUtmInput,
} from "@/lib/marketing-utm-server";
import {
  buildVideoUtmOrderMeta,
  mergeVideoUtmIntoMeta,
  type OrderMetaEntry,
  type VideoUtmInput,
} from "@/lib/video-utm-server";
import {
  allocateDiscountCentsToLines,
  appendAppliedCouponOrderMeta,
  buildWooCouponLines,
  shouldBakeCouponIntoLineItems,
} from "@/lib/woo-coupon-line-discount";
import { wooFetch } from "@/lib/woocommerce";
import { resolveOrderCustomer } from "@/lib/order-customer";

export type CartMeta = {
  id: number;
  name: string;
  qty: number;
  price: string;
};

export type CustomerInfo = {
  email: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  state?: string;
};

export type CheckoutShippingInput = {
  rate: number;
  label: string;
  method_id: string;
  rate_id?: string;
  instance_id?: number;
};

/** Optional checkout fields when sync-order still posts client context (Phase 2 bridge). */
export type WooOrderSyncContext = {
  customer?: CustomerInfo;
  items?: CartMeta[];
  billing?: Record<string, string>;
  meta_data?: OrderMetaEntry[];
  checkoutShipping?: CheckoutShippingInput;
  isReverseCharge?: boolean;
  isWholesale?: boolean;
  videoUtm?: VideoUtmInput;
  marketingUtm?: MarketingUtmInput;
};

export interface CreateWooOrderInput {
  paymentIntentId: string;
  /** Merged over PI-derived values when present (card/Klarna sync-order). */
  syncContext?: WooOrderSyncContext;
}

/**
 * Ergebnis einer Bestellanlage. `status` beschreibt den Zahlungszustand:
 * "pending" = angelegt, Zahlung noch nicht serverseitig bestaetigt;
 * "paid" = soeben als bezahlt verbucht; "already_paid" = war schon bezahlt;
 * "amount_mismatch" = Zahlung da, Betrag passt nicht, Bestellung on-hold.
 */
export interface CreateWooOrderResult {
  orderId: number;
  orderNumber: string;
  status: "pending" | "paid" | "already_paid" | "amount_mismatch";
  /** Summe der Woo-Bestellung in Cent (Grundlage fuer PayPal-Betrag und Abgleich). */
  totalCents: number;
  wooOrder: unknown;
}

type WooOrderRow = {
  id: number;
  number: string;
  status?: string;
  meta_data?: Array<{ key?: string; value?: unknown }>;
  payment_method_title?: string;
};

const UNCUTTV_ORDER_META_KEYS = [
  "_uncuttv_reverse_charge",
  "_uncuttv_third_country",
  "_uncuttv_tax_free_export",
  "_uncuttv_vies_consultation",
  "_uncuttv_vies_request_date",
  "_uncuttv_vies_company_name",
] as const;

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value).trim();
  return String(value).trim();
}

type WooCustomer = {
  billing?: { company?: string; [key: string]: unknown };
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

function billingVatFromCustomerMeta(customer: WooCustomer): string {
  const entry = customer.meta_data?.find(
    (m) => m?.key === "_billing_vat" || m?.key === "billing_vat"
  );
  return asString(entry?.value);
}

function vatFromOrderMeta(meta: OrderMetaEntry[] | undefined): string {
  const entry = meta?.find(
    (m) => m.key === "_billing_vat" || m.key === "billing_vat"
  );
  return asString(entry?.value);
}

function mergeOrderMetaData(
  existing: OrderMetaEntry[] | undefined,
  vatFromFrontend: string,
  vatFromProfile: string,
  stripeMeta: { piId?: string; chargeId?: string }
): OrderMetaEntry[] | undefined {
  const base = [...(existing ?? [])].filter(
    (m) =>
      m.key !== "_billing_vat" &&
      m.key !== "billing_vat" &&
      m.key !== "_eu_vat_guard_order_vat_number" &&
      m.key !== "_eu_vat_guard_order_vat_exempt" &&
      m.key !== "_stripe_pi_id" &&
      m.key !== "_stripe_charge_id" &&
      !UNCUTTV_ORDER_META_KEYS.includes(
        m.key as (typeof UNCUTTV_ORDER_META_KEYS)[number]
      )
  );
  const vat = asString(vatFromFrontend) || asString(vatFromProfile);
  if (vat) {
    base.push({ key: "_billing_vat", value: vat });
    base.push({ key: "_eu_vat_guard_order_vat_number", value: vat });
  }
  if (stripeMeta.piId?.startsWith("pi_")) {
    base.push({ key: "_stripe_pi_id", value: stripeMeta.piId });
  }
  if (stripeMeta.chargeId) {
    base.push({ key: "_stripe_charge_id", value: stripeMeta.chargeId });
  }
  return base.length > 0 ? base : undefined;
}

function appendReverseChargeMeta(
  meta: OrderMetaEntry[] | undefined,
  isRC: boolean
): OrderMetaEntry[] | undefined {
  if (!isRC) return meta;
  const base = [...(meta ?? [])];
  base.push({ key: "_uncuttv_reverse_charge", value: "yes" });
  base.push({ key: "_eu_vat_guard_order_vat_exempt", value: "yes" });
  return base;
}

function appendThirdCountryExportMeta(
  meta: OrderMetaEntry[] | undefined,
  isThirdCountryB2c: boolean
): OrderMetaEntry[] | undefined {
  if (!isThirdCountryB2c) return meta;
  const base = [...(meta ?? [])];
  base.push({ key: "_uncuttv_third_country", value: "yes" });
  base.push({ key: "_uncuttv_tax_free_export", value: "yes" });
  return base;
}

function splitName(fullName: string | null | undefined): {
  first: string;
  last: string;
} {
  const parts = asString(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return {
    first: parts[0] ?? "",
    last: parts.slice(1).join(" "),
  };
}

async function fetchWooCustomer(customerId: string): Promise<WooCustomer | null> {
  try {
    return await wooFetch<WooCustomer>(
      `/customers/${encodeURIComponent(customerId)}`,
      {},
      { cache: "no-store" }
    );
  } catch {
    return null;
  }
}

type WooOrderListRow = WooOrderRow & { transaction_id?: string };

/**
 * Passt die Bestellung zur Zahlungsreferenz (`pi_...` oder `paypal_...`)?
 * Gesucht wird in transaction_id, `_stripe_pi_id` und `_uncuttv_payment_ref`.
 * Letzteres schreibt der Shop seit Oktober 2026 beim Anlegen der offenen
 * Bestellung, damit auch unbezahlte Bestellungen gefunden werden (bei PayPal
 * steht in transaction_id spaeter die Capture-ID, nicht die Order-ID).
 */
function orderMatchesStripePaymentIntent(
  order: WooOrderListRow,
  paymentIntentId: string
): boolean {
  if (order.transaction_id === paymentIntentId) return true;
  const meta = order.meta_data ?? [];
  for (const m of meta) {
    if (
      (m.key === "_stripe_pi_id" || m.key === "_uncuttv_payment_ref") &&
      asString(m.value) === paymentIntentId
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Idempotency lookup (Option A + verification).
 * IONOS/Woo often ignores meta_key/meta_value on GET /orders — never trust the
 * first row without checking meta_data or transaction_id.
 */
export async function findWooOrderByStripePaymentIntentId(
  paymentIntentId: string
): Promise<WooOrderRow | null> {
  try {
    const byMeta = await wooFetch<WooOrderListRow[]>(
      "/orders",
      {
        meta_key: "_stripe_pi_id",
        meta_value: paymentIntentId,
        per_page: "20",
        orderby: "date",
        order: "desc",
      },
      { cache: "no-store" }
    );
    for (const order of byMeta ?? []) {
      if (orderMatchesStripePaymentIntent(order, paymentIntentId)) {
        return order;
      }
    }

    const byRef = await wooFetch<WooOrderListRow[]>(
      "/orders",
      {
        meta_key: "_uncuttv_payment_ref",
        meta_value: paymentIntentId,
        per_page: "20",
        orderby: "date",
        order: "desc",
      },
      { cache: "no-store" }
    );
    for (const order of byRef ?? []) {
      if (orderMatchesStripePaymentIntent(order, paymentIntentId)) {
        return order;
      }
    }

    const bySearch = await wooFetch<WooOrderListRow[]>(
      "/orders",
      {
        search: paymentIntentId,
        per_page: "20",
        orderby: "date",
        order: "desc",
      },
      { cache: "no-store" }
    );
    for (const order of bySearch ?? []) {
      if (orderMatchesStripePaymentIntent(order, paymentIntentId)) {
        return order;
      }
    }
  } catch (lookupErr) {
    console.warn(
      "[wc-order] PI idempotency lookup failed, will attempt create:",
      lookupErr instanceof Error ? lookupErr.message : lookupErr
    );
  }

  return null;
}

/** Stripe PI (`pi_*`) or PayPal ref (`paypal_*`) — matches `transaction_id` / `_stripe_pi_id`. */
export function findWooOrderByPaymentReference(
  paymentRef: string
): Promise<WooOrderRow | null> {
  return findWooOrderByStripePaymentIntentId(paymentRef);
}

export type WooOrderForDetails = WooOrderRow & {
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    city?: string;
    postcode?: string;
    country?: string;
    state?: string;
  };
  customer_id?: number;
  shipping?: { country?: string };
  line_items?: Array<{
    product_id?: number;
    name?: string;
    quantity?: number;
    total?: string;
  }>;
  shipping_lines?: Array<{
    method_title?: string;
    total?: string;
  }>;
  total?: string;
  currency?: string;
};

export type OrderDetailsApiPayload = {
  woo_order_id: string;
  /** Woo-Status (pending, processing, ...). "pending" = Zahlung noch nicht bestaetigt. */
  orderStatus?: string;
  customerName: string;
  customerEmail: string;
  total: string;
  currency: string;
  items: Array<{ description: string; quantity: number; amount: number }>;
  shippingCents: number;
  isWholesaleShipping: boolean;
  shippingMethodTitle?: string;
  shippingCountry?: string;
  line_items: Array<{
    product_id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
};

export function mapWooOrderToOrderDetailsPayload(
  order: WooOrderForDetails
): OrderDetailsApiPayload {
  const billing = order.billing ?? {};
  const first = asString(billing.first_name);
  const last = asString(billing.last_name);
  const customerName = [first, last].filter(Boolean).join(" ");

  const wooLineItems = order.line_items ?? [];
  const items = wooLineItems.map((li) => {
    const qty = Math.max(1, Number(li.quantity) || 1);
    const lineTotalEuro = parsePrice(String(li.total ?? "0"));
    return {
      description: asString(li.name) || "Artikel",
      quantity: qty,
      amount: Math.round(lineTotalEuro * 100),
    };
  });

  const line_items = wooLineItems.map((li) => {
    const qty = Math.max(1, Number(li.quantity) || 1);
    const lineTotalEuro = parsePrice(String(li.total ?? "0"));
    return {
      product_id: String(li.product_id ?? 0),
      name: asString(li.name),
      quantity: qty,
      price: lineTotalEuro / qty,
    };
  });

  let shippingCents = 0;
  let shippingMethodTitle = "";
  for (const line of order.shipping_lines ?? []) {
    shippingCents += Math.round(parsePrice(String(line.total ?? "0")) * 100);
    if (!shippingMethodTitle && line.method_title) {
      shippingMethodTitle = asString(line.method_title);
    }
  }

  const shipCountry = asString(order.shipping?.country).toUpperCase();

  return {
    woo_order_id: String(order.id),
    orderStatus: asString(order.status) || undefined,
    customerName,
    customerEmail: asString(billing.email),
    total: asString(order.total) || "0.00",
    currency: (asString(order.currency) || "eur").toLowerCase(),
    items,
    shippingCents,
    isWholesaleShipping: false,
    shippingMethodTitle: shippingMethodTitle || undefined,
    shippingCountry: shipCountry || undefined,
    line_items,
  };
}

export type CreateWooOrderFromCheckoutSyncInput = {
  cartItems: CartMeta[];
  billing: Record<string, string>;
  shipping: Record<string, string>;
  /**
   * Zahlungsreferenz (`pi_...` oder `paypal_...`). Wird NICHT mehr als
   * transaction_id gesetzt (das macht erst markiereBestellungBezahlt mit dem
   * geprueften Beleg), sondern als Meta `_uncuttv_payment_ref`, damit die
   * offene Bestellung wiedergefunden wird.
   */
  transactionId: string;
  /** Zahlungsweg der Bestellung; bestimmt payment_method in Woo. Standard stripe. */
  zahlungsart?: "stripe" | "paypal";
  /** Kassen-Sitzung des Browsers (Idempotenz), Meta `_uncuttv_checkout_key`. */
  checkoutKey?: string;
  /** Fingerabdruck von Warenkorb und Adresse, Meta `_uncuttv_checkout_fingerprint`. */
  fingerabdruck?: string;
  isReverseCharge: boolean;
  isWholesaleCheckout: boolean;
  billingOverrides?: Record<string, string>;
  meta_data?: OrderMetaEntry[];
  checkoutShipping?: CheckoutShippingInput;
  videoUtm?: VideoUtmInput;
  marketingUtm?: MarketingUtmInput;
  stripePiId?: string;
  stripeChargeId?: string;
  /** WooCommerce coupon code from PaymentIntent metadata. */
  couponCode?: string;
  /** Stripe PI amount in cents (for post-create total check). */
  stripeAmountCents?: number;
  /** Subtotal discount in cents (from PI metadata) — applied to explicit WC line totals. */
  stripeDiscountCents?: number;
};

export async function createWooOrderFromCheckoutSync(
  input: CreateWooOrderFromCheckoutSyncInput
): Promise<CreateWooOrderResult> {
  const {
    cartItems,
    billing,
    shipping,
    transactionId,
    zahlungsart = "stripe",
    checkoutKey,
    fingerabdruck,
    isReverseCharge,
    isWholesaleCheckout,
    billingOverrides,
    meta_data,
    checkoutShipping,
    videoUtm,
    marketingUtm,
    stripePiId,
    stripeChargeId,
    couponCode,
    stripeAmountCents,
    stripeDiscountCents,
  } = input;

  if (cartItems.length === 0) {
    throw new Error("Keine Artikel gefunden.");
  }

  const taxCountry = billing.country || shipping.country || "";

  const shipCountryNorm = (shipping.country || billing.country || "")
    .trim()
    .toUpperCase();
  if (shipCountryNorm && isCountryBlocked(shipCountryNorm)) {
    const err = new Error("Versand in dieses Land ist nicht möglich");
    (err as Error & { code?: string }).code = "country_blocked";
    throw err;
  }
  if (
    isWholesaleCheckout &&
    shipCountryNorm &&
    !isWholesaleCountryAllowed(shipCountryNorm)
  ) {
    const err = new Error("Wholesale ist nur innerhalb der EU verfügbar");
    (err as Error & { code?: string }).code = "wholesale_eu_only";
    throw err;
  }

  // Die Zuordnung kommt ausschliesslich aus dem geprueften Token. Ohne
  // Sitzung wird es eine Gastbestellung, auch wenn ein Cookie eine Nummer
  // nennt. Siehe order-customer.ts.
  const orderCustomer = await resolveOrderCustomer();
  const customerIdStr =
    orderCustomer.customerId > 0 ? String(orderCustomer.customerId) : "";

  let profileCompany = "";
  let profileVat = "";
  if (customerIdStr) {
    const wcCustomer = await fetchWooCustomer(customerIdStr);
    if (wcCustomer) {
      profileCompany = asString(wcCustomer.billing?.company);
      profileVat = billingVatFromCustomerMeta(wcCustomer);
    }
  }

  const mergedBilling = { ...billing };
  if (billingOverrides) {
    for (const [key, val] of Object.entries(billingOverrides)) {
      if (typeof val === "string" && val.trim()) {
        mergedBilling[key] = val;
      }
    }
  }

  const companyFromFrontend = asString(billingOverrides?.company);
  const companyMerged =
    companyFromFrontend ||
    profileCompany ||
    asString(mergedBilling.company);
  if (companyMerged) {
    mergedBilling.company = companyMerged;
  }

  const vatFromFrontendMeta = vatFromOrderMeta(meta_data);

  const normalizedCoupon = couponCode?.trim().toLowerCase();
  const discountCents =
    typeof stripeDiscountCents === "number" &&
    Number.isFinite(stripeDiscountCents) &&
    stripeDiscountCents > 0
      ? Math.round(stripeDiscountCents)
      : 0;
  const discountByLine =
    normalizedCoupon && discountCents > 0
      ? allocateDiscountCentsToLines(cartItems, discountCents)
      : new Map<number, number>();

  // Die Bestellung entsteht VOR der Zahlung als "pending". Auf "processing"
  // geht sie ausschliesslich ueber markiereBestellungBezahlt (bestellung-
  // zahlung.ts) mit serverseitig gepruefter Zahlung. Bis Oktober 2026 stand
  // hier status processing + set_paid true, was unbezahlte und doppelte
  // Bestellungen als "In Bearbeitung" erscheinen liess.
  const orderData: Record<string, unknown> = {
    status: "pending",
    payment_method: zahlungsart,
    payment_method_title: zahlungsart === "paypal" ? "PayPal" : "Stripe",
    set_paid: false,
    send_email: false,
    prices_include_tax: true,
    billing: mergedBilling,
    shipping,
    line_items: cartItems.map((item) => {
      const lineDiscountEur = (discountByLine.get(item.id) ?? 0) / 100;

      if (isReverseCharge) {
        const lineGross = Math.max(
          0,
          parsePrice(item.price) * item.qty - lineDiscountEur
        );
        const lineTotal = lineGross.toFixed(2);
        return {
          product_id: Number(item.id),
          quantity: item.qty,
          subtotal: lineTotal,
          total: lineTotal,
          subtotal_tax: "0.00",
          total_tax: "0.00",
          taxes: [],
        };
      }
      if (isWholesaleCheckout) {
        return buildWholesaleNonRcLineItem(item, taxCountry);
      }
      if (shouldSendExplicitEuB2cLineAmounts(taxCountry)) {
        const lineDiscountCents = discountByLine.get(item.id) ?? 0;
        if (lineDiscountCents > 0) {
          return buildEuB2cNonAtLineItemWithBakedDiscount(
            item,
            taxCountry,
            lineDiscountCents / 100
          );
        }
        return buildEuB2cNonAtLineItem(item, taxCountry);
      }
      if (shouldSendExplicitNonEuLineAmounts(taxCountry)) {
        const lineDiscountCents = discountByLine.get(item.id) ?? 0;
        if (lineDiscountCents > 0) {
          return buildNonEuB2cLineItemWithBakedDiscount(
            item,
            lineDiscountCents / 100
          );
        }
        return buildNonEuB2cLineItem(item);
      }
      return {
        product_id: Number(item.id),
        quantity: item.qty,
      };
    }),
  };

  const couponLines = buildWooCouponLines(
    normalizedCoupon,
    discountCents,
    taxCountry,
    { isReverseCharge }
  );
  if (couponLines) {
    orderData.coupon_lines = couponLines;
  }

  const bakeCouponIntoLines =
    Boolean(normalizedCoupon) &&
    discountCents > 0 &&
    shouldBakeCouponIntoLineItems(taxCountry);

  if (isReverseCharge) {
    orderData.tax_lines = [];
  } else if (
    shouldSendExplicitNonEuLineAmounts(taxCountry) &&
    !isWholesaleCheckout
  ) {
    orderData.tax_lines = [];
  }

  const parsedId = customerIdStr ? parseInt(customerIdStr, 10) : NaN;
  if (customerIdStr && Number.isFinite(parsedId) && parsedId > 0) {
    orderData.customer_id = parsedId;
  }

  if (
    checkoutShipping &&
    typeof checkoutShipping.rate === "number" &&
    !Number.isNaN(checkoutShipping.rate)
  ) {
    const s = checkoutShipping;
    if (!(s.method_id === "none" && s.rate === 0)) {
      const rate = Math.max(0, s.rate);
      let shipTotal: string;
      let shipTax: string;
      let shipTaxes: unknown[] | undefined;
      if (isReverseCharge) {
        shipTotal = rate.toFixed(2);
        shipTax = "0.00";
        shipTaxes = [];
      } else if (isWholesaleCheckout) {
        const p = addTaxToNet(rate, taxCountry);
        shipTotal = p.net;
        shipTax = p.tax;
      } else if (shouldSendExplicitNonEuLineAmounts(taxCountry)) {
        const p = splitGrossForNonEu(rate);
        shipTotal = p.net;
        shipTax = p.tax;
        shipTaxes = [];
      } else if (shouldSendExplicitEuB2cLineAmounts(taxCountry)) {
        const p = splitGrossForWooRest(rate, taxCountry);
        shipTotal = p.net;
        shipTax = p.tax;
        shipTaxes = buildEuB2cWooShippingTaxes(taxCountry, p.tax);
      } else {
        const p = splitGrossForWooRest(rate, taxCountry);
        shipTotal = p.net;
        shipTax = p.tax;
      }
      orderData.shipping_lines = [
        {
          method_id: s.method_id || "flat_rate",
          method_title: s.label || "Versand",
          total: shipTotal,
          total_tax: shipTax,
          ...(isReverseCharge || shipTaxes !== undefined
            ? { taxes: shipTaxes ?? [] }
            : {}),
        },
      ];
    }
  }

  const isThirdCountryB2c =
    !isReverseCharge &&
    !isWholesaleCheckout &&
    shouldSendExplicitNonEuLineAmounts(taxCountry);

  let mergedMeta = mergeOrderMetaData(
    meta_data,
    vatFromFrontendMeta,
    profileVat,
    {
      piId: stripePiId,
      chargeId: stripeChargeId,
    }
  );
  const videoUtmMeta = await buildVideoUtmOrderMeta(videoUtm);
  mergedMeta = mergeVideoUtmIntoMeta(mergedMeta, videoUtmMeta);
  const marketingUtmMeta = buildMarketingUtmOrderMeta(marketingUtm);
  mergedMeta = mergeMarketingUtmIntoMeta(mergedMeta, marketingUtmMeta);
  mergedMeta = appendReverseChargeMeta(mergedMeta, isReverseCharge);
  mergedMeta = appendThirdCountryExportMeta(mergedMeta, isThirdCountryB2c);
  if (bakeCouponIntoLines && normalizedCoupon) {
    mergedMeta = appendAppliedCouponOrderMeta(mergedMeta, {
      code: normalizedCoupon,
      discountCents,
    });
  }
  // Rueckweg von der Zahlung zur Bestellung und Idempotenz-Marker.
  mergedMeta = [...(mergedMeta ?? [])];
  if (transactionId.trim()) {
    mergedMeta.push({ key: "_uncuttv_payment_ref", value: transactionId.trim() });
  }
  if (checkoutKey?.trim()) {
    mergedMeta.push({ key: "_uncuttv_checkout_key", value: checkoutKey.trim() });
  }
  if (fingerabdruck?.trim()) {
    mergedMeta.push({ key: "_uncuttv_checkout_fingerprint", value: fingerabdruck.trim() });
  }
  if (isWholesaleCheckout) {
    // Damit der Webhook (ohne Sitzungs-Cookie) die Haendlerbestellung erkennt.
    mergedMeta.push({ key: "_uncuttv_is_wholesale", value: "yes" });
  }
  if (mergedMeta.length > 0) {
    orderData.meta_data = mergedMeta;
  }

  console.log("[wc-order] Woo order meta_data (pre-POST)", {
    taxCountry,
    isReverseCharge,
    isWholesaleCheckout,
    isThirdCountryB2c,
    stripePiId,
    meta_data: orderData.meta_data,
  });

  const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
  const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
  const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;
  const AUTH_HEADER =
    "Basic " +
    Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString("base64");

  const res = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`, {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderData),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WooCommerce order creation failed: ${errText}`);
  }

  const created = (await res.json()) as WooOrderRow & { total?: string };

  console.log("[wc-order] Woo POST response", {
    orderId: created.id,
    orderNumber: created.number,
  });

  if (
    typeof stripeAmountCents === "number" &&
    Number.isFinite(stripeAmountCents) &&
    created.total != null
  ) {
    const wooTotalCents = Math.round(parsePrice(String(created.total)) * 100);
    const diff = Math.abs(wooTotalCents - stripeAmountCents);
    if (diff > 1) {
      console.warn(
        "[WC-Order] Total mismatch: WC=",
        wooTotalCents,
        "Stripe=",
        stripeAmountCents,
        "orderId=",
        created.id
      );
    }
  }

  // Die Office-Benachrichtigung fuer Haendlerbestellungen kommt erst nach
  // bestaetigtem Zahlungseingang (nachZahlungseingang in bestellung-zahlung.ts),
  // nicht mehr beim Anlegen der unbezahlten Bestellung.

  return {
    orderId: Number(created.id),
    orderNumber: String(created.number ?? created.id),
    status: "pending",
    totalCents: Math.round(parsePrice(String(created.total ?? "0")) * 100),
    wooOrder: created,
  };
}

export function resolveCustomerFromPaymentIntent(
  pi: Stripe.PaymentIntent,
  charge: Stripe.Charge | null,
  syncContext?: WooOrderSyncContext
): { billing: Record<string, string>; shipping: Record<string, string> } {
  if (syncContext?.customer) {
    const c = syncContext.customer;
    const stateVal = asString(c.state);
    const billing: Record<string, string> = {
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      address_1: c.street,
      city: c.city,
      postcode: c.zip,
      country: c.country,
      ...(stateVal ? { state: stateVal } : {}),
    };
    return { billing, shipping: { ...billing } };
  }

  const ship = pi.shipping;
  const bill = charge?.billing_details;
  const shipName = splitName(ship?.name ?? bill?.name);
  const country =
    ship?.address?.country?.trim().toUpperCase() ||
    bill?.address?.country?.trim().toUpperCase() ||
    asString(pi.metadata?.shipping_country).toUpperCase();

  const billing: Record<string, string> = {
    first_name: shipName.first || splitName(bill?.name).first,
    last_name: shipName.last || splitName(bill?.name).last,
    email: asString(bill?.email),
    address_1:
      asString(ship?.address?.line1) || asString(bill?.address?.line1),
    city: asString(ship?.address?.city) || asString(bill?.address?.city),
    postcode:
      asString(ship?.address?.postal_code) ||
      asString(bill?.address?.postal_code),
    country,
    ...(asString(ship?.address?.state || bill?.address?.state)
      ? {
          state: asString(ship?.address?.state || bill?.address?.state),
        }
      : {}),
  };

  return { billing, shipping: { ...billing } };
}

export function resolveCheckoutShippingFromPi(
  pi: Stripe.PaymentIntent,
  syncContext?: WooOrderSyncContext
): CheckoutShippingInput | undefined {
  if (syncContext?.checkoutShipping) {
    return syncContext.checkoutShipping;
  }
  const cents = parseInt(pi.metadata?.shipping_cents ?? "", 10);
  if (!Number.isFinite(cents) || cents < 0) return undefined;
  const rate = cents / 100;
  const label =
    asString(pi.metadata?.shipping_method_title) || "Versand";
  const isWholesale = pi.metadata?.is_wholesale === "true";
  return {
    rate,
    label,
    method_id: isWholesale ? "flat_rate" : "flat_rate",
  };
}

