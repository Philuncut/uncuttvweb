import { NextResponse } from "next/server";
import type { CartItem } from "@/lib/CartContext";
import { isCountryBlocked } from "@/lib/blocked-countries";
import { isWholesaleCountryAllowed } from "@/lib/wholesale-allowed-countries";
import { applyCouponToSubtotalCents } from "@/lib/coupon-helpers";
import { cookies } from "next/headers";
import { shouldSendExplicitEuB2cLineAmounts, shouldSendExplicitNonEuLineAmounts } from "@/lib/eu-vat-rates";
import {
  splitGrossForWooRest,
  buildWholesaleNonRcLineItem,
  buildEuB2cNonAtLineItem,
  buildEuB2cNonAtLineItemWithBakedDiscount,
  buildNonEuB2cLineItem,
  buildNonEuB2cLineItemWithBakedDiscount,
  splitGrossForNonEu,
  addTaxToNet,
  standardVatFraction,
  buildEuB2cWooShippingTaxes,
} from "@/lib/woo-vat-split";
import { parsePrice } from "@/lib/parse-price";
import {
  billingVatFromOrderMeta,
  enqueueWholesaleOfficeNotification,
} from "@/lib/notify-wholesale-order";
import { sendOrderConfirmationWithPdf } from "@/lib/send-order-confirmation-with-pdf";
import {
  buildVideoUtmOrderMeta,
  mergeVideoUtmIntoMeta,
  type VideoUtmInput,
} from "@/lib/video-utm-server";
import type { CartMeta } from "@/lib/wc-order-from-payment";
import {
  allocateDiscountCentsToLines,
  appendAppliedCouponOrderMeta,
  buildWooCouponLines,
  shouldBakeCouponIntoLineItems,
} from "@/lib/woo-coupon-line-discount";

interface Body {
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    street: string;
    zip: string;
    city: string;
    country: string;
    state?: string;
  };
  items: CartMeta[];
  /** Optional — same shape as /api/sync-order (checkout passes company + VAT). */
  billing?: Record<string, string>;
  meta_data?: Array<{ key: string; value: unknown }>;
  checkoutShipping?: {
    rate: number;
    label: string;
    method_id: string;
    rate_id?: string;
    instance_id?: number;
  };
  isReverseCharge?: boolean;
  isWholesale?: boolean;
  locale?: "de" | "en";
  videoUtm?: VideoUtmInput;
  couponCode?: string;
  customerEmail?: string;
}

function cartMetaToCartItems(items: CartMeta[]): CartItem[] {
  return items.map((item) => ({
    product: {
      id: Number(item.id),
      name: item.name,
      slug: "",
      price: item.price,
      regular_price: item.price,
      sale_price: "",
      on_sale: false,
      stock_status: "instock" as const,
      sku: "",
      images: [],
      categories: [],
      short_description: "",
      description: "",
      related_ids: [],
    },
    quantity: Math.max(1, Number(item.qty) || 1),
  }));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const {
      customer,
      items,
      billing: bodyBilling,
      meta_data: bodyMeta,
      checkoutShipping,
      isReverseCharge: bodyIsRC,
      couponCode,
      customerEmail,
    } = body;

    const isReverseCharge = bodyIsRC === true;
    const isWholesaleCheckout = body.isWholesale === true;
    const locale: "de" | "en" = body.locale === "en" ? "en" : "de";

    if (!customer || typeof customer.country !== "string") {
      return NextResponse.json(
        { error: "Ungültige Kundendaten." },
        { status: 400 }
      );
    }

    const bankCountryNorm = customer.country.trim().toUpperCase();
    if (bankCountryNorm && isCountryBlocked(bankCountryNorm)) {
      return NextResponse.json(
        {
          error: "country_blocked",
          message: "Versand in dieses Land ist nicht möglich",
        },
        { status: 403 }
      );
    }
    if (
      isWholesaleCheckout &&
      bankCountryNorm &&
      !isWholesaleCountryAllowed(bankCountryNorm)
    ) {
      return NextResponse.json(
        {
          error: "wholesale_eu_only",
          message: "Wholesale ist nur innerhalb der EU verfügbar",
        },
        { status: 403 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Keine Artikel." },
        { status: 400 }
      );
    }

    const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
    const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
    const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;

    const cookieStore = await cookies();
    const wooId = cookieStore.get("woo_customer_id")?.value?.trim();
    const haendlerTok = cookieStore.get("haendler_token")?.value;
    const haendlerId = cookieStore.get("haendler_id")?.value?.trim();
    const customerIdStr =
      wooId || (haendlerTok && haendlerId ? haendlerId : undefined);
    const parsedCustomerId = customerIdStr
      ? parseInt(customerIdStr, 10)
      : NaN;

    const companyFromBody =
      typeof bodyBilling?.company === "string"
        ? bodyBilling.company.trim()
        : "";

    const stateVal =
      typeof customer.state === "string" && customer.state.trim()
        ? customer.state.trim()
        : "";

    const billing: Record<string, string> = {
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      address_1: customer.street,
      city: customer.city,
      postcode: customer.zip,
      country: customer.country,
    };
    if (stateVal) {
      billing.state = stateVal;
    }
    if (companyFromBody) {
      billing.company = companyFromBody;
    }

    const taxCountry = billing.country || customer.country || "";

    let discountCents = 0;
    let couponCodeApplied: string | null = null;
    const codeTrimmed = couponCode?.trim();

    if (codeTrimmed && !isWholesaleCheckout) {
      const subtotalCents = items.reduce(
        (sum, item) =>
          sum +
          Math.round(parsePrice(item.price) * 100) * Math.max(1, item.qty),
        0
      );
      const applied = await applyCouponToSubtotalCents(
        codeTrimmed,
        subtotalCents,
        cartMetaToCartItems(items),
        customerEmail?.trim() || customer.email?.trim()
      );
      if (!applied.ok) {
        return NextResponse.json(
          { error: "invalid_coupon", message: applied.error },
          { status: 400 }
        );
      }
      discountCents = applied.discountCents;
      couponCodeApplied = applied.metadata.coupon_code;
    }

    const normalizedCoupon = couponCodeApplied?.trim().toLowerCase();
    const discountByLine =
      normalizedCoupon && discountCents > 0
        ? allocateDiscountCentsToLines(items, discountCents)
        : new Map<number, number>();

    const videoUtmMeta = await buildVideoUtmOrderMeta(body.videoUtm);
    const meta_data = mergeVideoUtmIntoMeta(
      bodyMeta && bodyMeta.length > 0
        ? [...bodyMeta].filter((e) => e.key !== "_eu_vat_guard_order_vat_exempt")
        : undefined,
      videoUtmMeta
    );

    const orderData: Record<string, unknown> = {
      status: "pending",
      payment_method: "bacs",
      payment_method_title: "Überweisung",
      set_paid: false,
      /**
       * AT-B2C: product_id + qty. EU-B2C außer AT: explizites Netto+MwSt aus Checkout-Brutto.
       * Drittland B2C: Brutto explizit, 0 % USt. Wholesale: Händler-Netto+MwSt. RC: Brutto, 0 %.
       */
      prices_include_tax: true,
      billing,
      shipping: {
        first_name: customer.firstName,
        last_name: customer.lastName,
        address_1: customer.street,
        city: customer.city,
        postcode: customer.zip,
        country: customer.country,
        ...(stateVal ? { state: stateVal } : {}),
      },
      line_items: items.map((item) => {
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

    if (Number.isFinite(parsedCustomerId) && parsedCustomerId > 0) {
      orderData.customer_id = parsedCustomerId;
    }
    if (meta_data) {
      orderData.meta_data = meta_data;
    }

    if (isReverseCharge && orderData.meta_data) {
      const m = orderData.meta_data as Array<{ key: string; value: unknown }>;
      m.push({ key: "_uncuttv_reverse_charge", value: "yes" });
      m.push({ key: "_eu_vat_guard_order_vat_exempt", value: "yes" });
    } else if (isReverseCharge && !orderData.meta_data) {
      orderData.meta_data = [
        { key: "_uncuttv_reverse_charge", value: "yes" },
        { key: "_eu_vat_guard_order_vat_exempt", value: "yes" },
      ];
    } else if (
      shouldSendExplicitNonEuLineAmounts(taxCountry) &&
      !isWholesaleCheckout
    ) {
      if (!orderData.meta_data) {
        orderData.meta_data = [];
      }
      const m = orderData.meta_data as Array<{ key: string; value: unknown }>;
      m.push({ key: "_uncuttv_third_country", value: "yes" });
      m.push({ key: "_uncuttv_tax_free_export", value: "yes" });
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

    {
      const md = Array.isArray(orderData.meta_data)
        ? ([...(orderData.meta_data as Array<{ key: string; value: unknown }>)])
        : [];
      if (
        !md.some((row) => row.key === "_uncuttv_payment_method")
      ) {
        md.push({ key: "_uncuttv_payment_method", value: "bank" });
      }
      if (!md.some((row) => row.key === "_uncuttv_is_wholesale")) {
        md.push({
          key: "_uncuttv_is_wholesale",
          value: isWholesaleCheckout ? "yes" : "no",
        });
      }
      if (!md.some((row) => row.key === "_uncuttv_locale")) {
        md.push({ key: "_uncuttv_locale", value: locale });
      }
      orderData.meta_data = md;
    }

    if (bakeCouponIntoLines && normalizedCoupon) {
      orderData.meta_data = appendAppliedCouponOrderMeta(
        orderData.meta_data as Array<{ key: string; value: unknown }> | undefined,
        { code: normalizedCoupon, discountCents }
      );
    }

    const res = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString(
            "base64"
          ),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WooCommerce order creation failed: ${errText}`);
    }

    const order = await res.json();

    const orderTotalCents = Math.round(
      parsePrice(String((order as { total?: string }).total ?? "0")) * 100
    );
    console.log(
      `[BankTransfer] order=${order.id}, wcTotal=${orderTotalCents}, discount=-${discountCents}, coupon=${normalizedCoupon ?? "none"}`
    );

    enqueueWholesaleOfficeNotification({
      orderId: Number(order.id),
      orderNumber: String((order as { number?: string | number }).number ?? order.id),
      billing,
      shipping: {
        first_name: customer.firstName,
        last_name: customer.lastName,
        address_1: customer.street,
        city: customer.city,
        postcode: customer.zip,
        country: customer.country,
        ...(stateVal ? { state: stateVal } : {}),
      },
      items,
      checkoutShipping,
      taxCountry,
      isWholesaleCheckout,
      isReverseCharge,
      orderMeta: (order as { meta_data?: Array<{ key?: string; value?: unknown }> })
        .meta_data,
      paymentMethodTitle: "Banküberweisung",
      vatNumber: billingVatFromOrderMeta(
        (order as { meta_data?: Array<{ key?: string; value?: unknown }> })
          .meta_data
      ),
      wooCommerceBaseUrl: WOOCOMMERCE_URL,
    });

    // Send bank transfer confirmation email
    const itemsNetSum = items.reduce(
      (sum, item) =>
        sum +
        Math.max(0, parsePrice(item.price)) * Math.max(1, Number(item.qty) || 1),
      0
    );
    const shipNetAmt =
      checkoutShipping &&
      typeof checkoutShipping.rate === "number" &&
      !Number.isNaN(checkoutShipping.rate) &&
      !(checkoutShipping.method_id === "none" && checkoutShipping.rate === 0)
        ? checkoutShipping.rate
        : 0;
    const discountEur = discountCents / 100;
    const total =
      isWholesaleCheckout && !isReverseCharge
        ? (() => {
            const r = standardVatFraction(taxCountry);
            const grossCents = items.reduce((sum, item) => {
              const lineNet =
                Math.max(0, parsePrice(item.price)) *
                Math.max(1, Number(item.qty) || 1);
              return sum + Math.round(lineNet * (1 + r) * 100);
            }, 0) + Math.round(shipNetAmt * (1 + r) * 100);
            return (grossCents / 100).toFixed(2);
          })()
        : Math.max(0, itemsNetSum - discountEur + shipNetAmt).toFixed(2);

    await sendOrderConfirmationWithPdf(Number(order.id), {
      paymentType: "bank_transfer",
      locale,
      bankTransferDetails: {
        customerName: `${customer.firstName} ${customer.lastName}`,
        items,
        total,
        isWholesale: isWholesaleCheckout,
        locale,
        discountEur,
        couponCode: normalizedCoupon ?? undefined,
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.number,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bestellung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
