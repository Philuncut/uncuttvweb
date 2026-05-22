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
  buildNonEuB2cLineItem,
  splitGrossForNonEu,
  addTaxToNet,
  standardVatFraction,
} from "@/lib/woo-vat-split";
import { parsePrice } from "@/lib/parse-price";
import { formatPrice } from "@/lib/format-price";
import {
  billingVatFromOrderMeta,
  enqueueWholesaleOfficeNotification,
} from "@/lib/notify-wholesale-order";
import { formatTranslation, getTranslation } from "@/lib/translations";
import {
  buildVideoUtmOrderMeta,
  mergeVideoUtmIntoMeta,
  type VideoUtmInput,
} from "@/lib/video-utm-server";
import type { CartMeta } from "@/lib/wc-order-from-payment";
import {
  allocateDiscountCentsToLines,
  buildLineItemWithCouponDiscount,
} from "@/lib/woo-coupon-line-discount";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

async function sendBankTransferEmail(
  email: string,
  customerName: string,
  orderNumber: string,
  items: CartMeta[],
  total: string,
  options: {
    isWholesale: boolean;
    locale: "de" | "en";
    discountEur?: number;
    couponCode?: string;
  }
) {
  if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key") {
    console.log("[BankOrder] No Resend API key, skipping email");
    return;
  }

  const { isWholesale, locale, discountEur = 0, couponCode = "" } = options;
  const bankPaymentText = getTranslation(
    isWholesale ? "BANK_TEXT_WHOLESALE" : "BANK_TEXT_B2C",
    locale
  );
  const bankHint = isWholesale
    ? getTranslation("BANK_HINT_WHOLESALE", locale)
    : "";
  const thanksLine = formatTranslation("EMAIL_BANK_GREETING", locale, {
    name: customerName,
    order: orderNumber,
  });
  const orderOverviewTitle = getTranslation("EMAIL_ORDER_OVERVIEW", locale);
  const footerNote = getTranslation("EMAIL_FOOTER_AFTER_PAYMENT", locale);
  const emailSubject = getTranslation("EMAIL_BANK_SUBJECT", locale);
  const confirmationLabel = getTranslation("EMAIL_ORDER_CONFIRMATION", locale);
  const accountHolderLabel = getTranslation("EMAIL_ACCOUNT_HOLDER", locale);
  const bankLabel = getTranslation("EMAIL_BANK_LABEL", locale);
  const referenceLabel = getTranslation("EMAIL_PAYMENT_REFERENCE", locale);
  const referenceValue = formatTranslation("EMAIL_ORDER_REFERENCE_VALUE", locale, {
    order: orderNumber,
  });
  const totalLabel = getTranslation("GESAMT", locale);

  const itemRows = items
    .map((item) => {
      const lineTotal = formatPrice(parsePrice(item.price) * item.qty);
      return `
        <tr>
          <td style="padding:8px 0;color:#ccc;border-bottom:1px solid #222;">${item.qty}× ${item.name}</td>
          <td style="padding:8px 0;color:#ccc;border-bottom:1px solid #222;text-align:right;">${lineTotal}</td>
        </tr>`;
    })
    .join("");

  const discountRow =
    discountEur > 0
      ? `<tr>
          <td style="padding:8px 0;color:#888;border-bottom:1px solid #222;">Rabatt${couponCode ? ` (${couponCode})` : ""}</td>
          <td style="padding:8px 0;color:#c0392b;border-bottom:1px solid #222;text-align:right;">−${formatPrice(discountEur)}</td>
        </tr>`
      : "";

  const html = `
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#0a0a0a;color:#fff;padding:40px 32px;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:0.05em;margin:0;">
        <span style="color:#fff;">UNCUT</span><span style="color:#c0392b;">TV</span>
      </h1>
      <p style="color:#888;font-size:14px;margin-top:8px;">${confirmationLabel}</p>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:16px;line-height:1.6;color:#ccc;">
        ${thanksLine}
        ${bankPaymentText}
      </p>

      <div style="margin:24px 0;padding:20px;border:1px solid #222;background:#111;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:4px 0;color:#888;">${accountHolderLabel}</td>
            <td style="padding:4px 0;color:#fff;text-align:right;font-weight:bold;">UncutTV GmbH</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#888;">${bankLabel}</td>
            <td style="padding:4px 0;color:#fff;text-align:right;">Raiffeisen Landesbank Tirol AG</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#888;">IBAN:</td>
            <td style="padding:4px 0;color:#fff;text-align:right;font-weight:bold;">AT52 3600 0000 0083 4978</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#888;">BIC:</td>
            <td style="padding:4px 0;color:#fff;text-align:right;">RZTIAT22</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#888;">${referenceLabel}</td>
            <td style="padding:4px 0;color:#c0392b;text-align:right;font-weight:bold;">${referenceValue}</td>
          </tr>
        </table>
      </div>
      ${
        bankHint
          ? `<p style="font-size:12px;color:#888;margin-top:12px;line-height:1.5;">${bankHint}</p>`
          : ""
      }

      <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">${orderOverviewTitle}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${itemRows}
        ${discountRow}
        <tr>
          <td style="padding:12px 0;color:#fff;font-weight:bold;font-size:16px;">${totalLabel}</td>
          <td style="padding:12px 0;color:#c0392b;font-weight:bold;font-size:16px;text-align:right;">${formatPrice(parsePrice(total))}</td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:13px;color:#888;line-height:1.5;">
        ${footerNote} <a href="mailto:office@uncuttv.at" style="color:#c0392b;">office@uncuttv.at</a>.
      </p>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:11px;color:#555;line-height:1.5;">
        UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "UncutTV <office@uncuttv.at>",
        to: [email],
        subject: emailSubject,
        html,
      }),
    });

    if (res.ok) {
      console.log("[BankOrder] Confirmation email sent to:", email);
    } else {
      const err = await res.text();
      console.error("[BankOrder] Resend error:", res.status, err.slice(0, 200));
    }
  } catch (err) {
    console.error("[BankOrder] Failed to send email:", err);
  }
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
          return lineDiscountEur > 0
            ? buildLineItemWithCouponDiscount(
                item,
                taxCountry,
                "eu_b2c",
                lineDiscountEur
              )
            : buildEuB2cNonAtLineItem(item, taxCountry);
        }
        if (shouldSendExplicitNonEuLineAmounts(taxCountry)) {
          return lineDiscountEur > 0
            ? buildLineItemWithCouponDiscount(
                item,
                taxCountry,
                "non_eu",
                lineDiscountEur
              )
            : buildNonEuB2cLineItem(item);
        }
        return {
          product_id: Number(item.id),
          quantity: item.qty,
        };
      }),
    };

    if (normalizedCoupon) {
      orderData.coupon_lines = [{ code: normalizedCoupon }];
    }

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

    await sendBankTransferEmail(
      customer.email,
      `${customer.firstName} ${customer.lastName}`,
      order.number,
      items,
      total,
      {
        isWholesale: isWholesaleCheckout,
        locale,
        discountEur,
        couponCode: normalizedCoupon ?? undefined,
      }
    );

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
