/**
 * Shared order-confirmation email helpers (HTML, PDF retry, Woo meta).
 * Entry point for sending: @/lib/send-order-confirmation-with-pdf
 */
import { WHOLESALE_ROLE } from "@/lib/auth-constants";
import { formatTranslation, getTranslation } from "@/lib/translations";
import type { CartMeta } from "@/lib/wc-order-from-payment";
import {
  fetchWooInvoicePdf,
  WooInvoiceFetchError,
} from "@/lib/fetch-woo-invoice";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import { stripe } from "@/lib/stripe";
import { wooFetch } from "@/lib/woocommerce";

export const CONFIRMATION_EMAIL_META_KEY = "_uncuttv_confirmation_email_sent";
export const PDF_PENDING_META_KEY = "_uncuttv_pdf_pending";

export const PDF_RETRY_ATTEMPTS_DEFAULT = 5;
export const PDF_RETRY_DELAY_MS_DEFAULT = 3000;

const CUSTOMER_FROM = "UncutTV <noreply@uncuttv.at>";
const BANK_CUSTOMER_FROM = "UncutTV <office@uncuttv.at>";
const OFFICE_FROM = "UncutTV System <noreply@uncuttv.at>";
const OFFICE_TO = "office@uncuttv.at";
const SHOP_KONTO_URL = "https://uncuttv.at/konto";

export { CUSTOMER_FROM, BANK_CUSTOMER_FROM, OFFICE_FROM, OFFICE_TO };

type WooAddress = {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  email?: string;
  phone?: string;
};

type WooLineItem = {
  name?: string;
  quantity?: number;
  total?: string;
  product_id?: number;
  image?: { src?: string };
};

type WooShippingLine = {
  method_title?: string;
  total?: string;
};

type WooCouponLine = {
  code?: string;
  discount?: string;
};

export type OrderConfirmationWooOrder = {
  id?: number;
  number?: string;
  status?: string;
  currency?: string;
  total?: string;
  discount_total?: string;
  date_paid?: string | null;
  customer_id?: number;
  payment_method?: string;
  payment_method_title?: string;
  billing?: WooAddress;
  shipping?: WooAddress;
  line_items?: WooLineItem[];
  shipping_lines?: WooShippingLine[];
  coupon_lines?: WooCouponLine[];
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

type WooCustomerRole = {
  role?: string;
  roles?: string[];
};

/** Same sentinel as create-bank-order / wholesale-bank-reminders. */
function hasMetaYes(
  order: OrderConfirmationWooOrder,
  key: string
): boolean {
  const entry = order.meta_data?.find((m) => m.key === key);
  const val = asString(entry?.value).toLowerCase();
  return val === "yes";
}

function metaValue(order: OrderConfirmationWooOrder, key: string): string {
  const entry = order.meta_data?.find((m) => m.key === key);
  return asString(entry?.value);
}

/** Mirrors wholesale-bank-reminders customerIsWholesale + WHOLESALE_ROLE. */
function customerIsWholesale(c: WooCustomerRole): boolean {
  if (asString(c.role).toLowerCase() === WHOLESALE_ROLE) return true;
  return (
    Array.isArray(c.roles) &&
    c.roles.some((r) => asString(r).toLowerCase() === WHOLESALE_ROLE)
  );
}

/**
 * Resolves wholesale checkout from persisted order data — mirrors
 * wc-order-from-payment isWholesaleCheckout (PI metadata + wholesale customer).
 */
export async function resolveIsWholesaleOrder(
  order: OrderConfirmationWooOrder
): Promise<boolean> {
  if (hasMetaYes(order, "_uncuttv_is_wholesale")) {
    return true;
  }

  const piId = metaValue(order, "_stripe_pi_id");
  if (piId.startsWith("pi_")) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.metadata?.is_wholesale === "true") {
        return true;
      }
    } catch (err) {
      console.warn(
        `[OrderMail] Could not read Stripe PI ${piId} for wholesale check:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const customerId = order.customer_id;
  if (
    typeof customerId === "number" &&
    Number.isFinite(customerId) &&
    customerId > 0
  ) {
    try {
      const customer = await wooFetch<WooCustomerRole>(
        `/customers/${encodeURIComponent(String(customerId))}`,
        {},
        { cache: "no-store" }
      );
      if (customerIsWholesale(customer)) {
        return true;
      }
    } catch (err) {
      console.warn(
        `[OrderMail] Could not fetch customer ${customerId} for wholesale check:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return false;
}

export type OrderConfirmationInput = {
  orderId: number;
  /** Optional snapshot from sync — full order is re-fetched when needed. */
  orderData?: OrderConfirmationWooOrder | unknown;
};

function resendConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return !!k && k !== "your_resend_api_key";
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value).trim();
  return String(value).trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function metaFlagYes(
  order: OrderConfirmationWooOrder,
  key: string
): boolean {
  const entry = order.meta_data?.find((m) => m.key === key);
  const val = asString(entry?.value).toLowerCase();
  return val === "yes" || val === "true" || val === "1";
}

/** Idempotency: fully done, or initial mail sent and PDF follow-up pending. */
export function confirmationSendBlocked(
  order: OrderConfirmationWooOrder
): boolean {
  return (
    metaFlagYes(order, CONFIRMATION_EMAIL_META_KEY) ||
    metaFlagYes(order, PDF_PENDING_META_KEY)
  );
}

export async function fetchOrder(
  orderId: number
): Promise<OrderConfirmationWooOrder> {
  return wooFetch<OrderConfirmationWooOrder>(
    `/orders/${encodeURIComponent(String(orderId))}`,
    {},
    { cache: "no-store" }
  );
}

export async function updateOrderMeta(
  orderId: number,
  entries: Array<{ key: string; value: string }>
): Promise<void> {
  const res = await fetch(
    `${process.env.WOOCOMMERCE_URL!.replace(/\/$/, "")}/wp-json/wc/v3/orders/${encodeURIComponent(String(orderId))}`,
    {
      method: "PUT",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.WOOCOMMERCE_KEY}:${process.env.WOOCOMMERCE_SECRET}`
          ).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta_data: entries.map((e) => ({ key: e.key, value: e.value })),
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[OrderMail] Failed to set meta on order ${orderId}:`,
      res.status,
      text.slice(0, 200)
    );
  }
}

function pdfFetchFailureReason(err: unknown): string {
  if (err instanceof WooInvoiceFetchError) {
    return String(err.status);
  }
  if (err instanceof Error) {
    return err.message.slice(0, 80) || "error";
  }
  return "unknown";
}

export type PdfRetryOptions = {
  attempts?: number;
  delayMs?: number;
  logPrefix?: string;
};

export async function fetchInvoicePdfWithRetry(
  orderId: number,
  orderNumber: string,
  options?: PdfRetryOptions
): Promise<{ buffer: ArrayBuffer; filename: string } | null> {
  const attempts = options?.attempts ?? PDF_RETRY_ATTEMPTS_DEFAULT;
  const delayMs = options?.delayMs ?? PDF_RETRY_DELAY_MS_DEFAULT;
  const logPrefix = options?.logPrefix ?? "[OrderMail]";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const pdf = await fetchWooInvoicePdf(orderId, { orderNumber });
      return pdf;
    } catch (err) {
      const reason = pdfFetchFailureReason(err);
      if (attempt >= attempts) {
        console.warn(
          `${logPrefix} PDF fetch failed for order ${orderId} (final attempt ${attempt}/${attempts}, reason: ${reason}):`,
          err instanceof Error ? err.message : String(err)
        );
        return null;
      }
      console.log(
        `${logPrefix} PDF retry ${attempt}/${attempts} for order ${orderId} (reason: ${reason}), next in ${delayMs}ms`
      );
      await sleep(delayMs);
    }
  }
  return null;
}

function customerName(order: OrderConfirmationWooOrder): string {
  const b = order.billing ?? {};
  return [asString(b.first_name), asString(b.last_name)]
    .filter(Boolean)
    .join(" ");
}

function formatAddress(addr: WooAddress | undefined): string {
  if (!addr) return "—";
  const lines = [
    [asString(addr.first_name), asString(addr.last_name)]
      .filter(Boolean)
      .join(" "),
    asString(addr.company),
    asString(addr.address_1),
    asString(addr.address_2),
    [asString(addr.postcode), asString(addr.city)].filter(Boolean).join(" "),
    asString(addr.state),
    asString(addr.country),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("<br/>") : "—";
}

function paymentStatusLabel(order: OrderConfirmationWooOrder): string {
  if (order.date_paid) return "Bezahlt";
  const status = asString(order.status).toLowerCase();
  if (status === "processing" || status === "completed") return "Bezahlt";
  if (status === "pending" || status === "on-hold") return "Ausstehend";
  return status || "Unbekannt";
}

function wooAdminEditUrl(orderId: number): string {
  const base = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  return `${base}/wp-admin/post.php?post=${orderId}&action=edit`;
}

function invoiceDownloadHint(orderId: number): string {
  return `https://uncuttv.at/api/orders/invoice?order_id=${orderId}`;
}

export function buildCustomerEmailHtml(
  order: OrderConfirmationWooOrder,
  opts: { pdfAttached: boolean; orderId: number }
): string {
  const orderNumber = asString(order.number) || String(opts.orderId);
  const currency = (asString(order.currency) || "EUR").toUpperCase();
  const name = customerName(order) || "Kunde";
  const paymentTitle =
    asString(order.payment_method_title) ||
    asString(order.payment_method) ||
    "Online-Zahlung";
  const shippingLine = order.shipping_lines?.[0];
  const shippingTitle = asString(shippingLine?.method_title) || "Versand";
  const shippingTotal = parsePrice(String(shippingLine?.total ?? "0"));
  const shippingLabel =
    shippingTotal <= 0 ? "Kostenlos" : formatPrice(shippingTotal, currency);

  const discountTotal = parsePrice(String(order.discount_total ?? "0"));
  const couponCodes =
    order.coupon_lines
      ?.map((c) => asString(c.code))
      .filter(Boolean)
      .join(", ") ?? "";

  const itemRows = (order.line_items ?? [])
    .map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const lineTotal = parsePrice(String(item.total ?? "0"));
      const imgSrc = asString(item.image?.src);
      const imgCell = imgSrc
        ? `<td style="padding:8px 8px 8px 0;vertical-align:middle;width:52px;">
             <img src="${escapeHtml(imgSrc)}" alt="" width="48" height="48" style="display:block;object-fit:cover;border:1px solid #222;" />
           </td>`
        : `<td style="padding:8px 8px 8px 0;width:52px;"></td>`;

      return `
        <tr>
          ${imgCell}
          <td style="padding:8px 0;color:#ccc;border-bottom:1px solid #222;vertical-align:middle;">
            ${qty}× ${escapeHtml(asString(item.name) || "Artikel")}
          </td>
          <td style="padding:8px 0;color:#ccc;border-bottom:1px solid #222;text-align:right;vertical-align:middle;white-space:nowrap;">
            ${formatPrice(lineTotal, currency)}
          </td>
        </tr>`;
    })
    .join("");

  const invoiceNote = opts.pdfAttached
    ? `<p style="font-size:14px;line-height:1.6;color:#888;margin:16px 0 0;">
         Deine Rechnung findest du im Anhang dieser E-Mail.
       </p>`
    : `<p style="font-size:14px;line-height:1.6;color:#888;margin:16px 0 0;">
         Die Rechnung folgt in Kürze per separater E-Mail. Du kannst sie auch jederzeit in deinem
         <a href="${SHOP_KONTO_URL}" style="color:#c0392b;">Kundenkonto</a> herunterladen
         (${escapeHtml(invoiceDownloadHint(opts.orderId))} — Anmeldung erforderlich).
       </p>`;

  return `
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#0a0a0a;color:#fff;padding:40px 32px;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:0.05em;margin:0;">
        <span style="color:#fff;">UNCUT</span><span style="color:#c0392b;">TV</span>
      </h1>
      <p style="color:#888;font-size:14px;margin-top:8px;">Bestellbestätigung</p>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:16px;line-height:1.6;color:#ccc;">
        Hallo ${escapeHtml(name)},<br/><br/>
        vielen Dank für deine Bestellung <strong style="color:#fff;">#${escapeHtml(orderNumber)}</strong>.
        Wir haben deine Zahlung erhalten und bearbeiten deine Bestellung.
      </p>

      <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">Bestellübersicht</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${itemRows}
        ${
          discountTotal > 0
            ? `<tr>
                 <td colspan="2" style="padding:8px 0;color:#888;border-bottom:1px solid #222;">Rabatt${couponCodes ? ` (${escapeHtml(couponCodes)})` : ""}</td>
                 <td style="padding:8px 0;color:#c0392b;border-bottom:1px solid #222;text-align:right;">−${formatPrice(discountTotal, currency)}</td>
               </tr>`
            : ""
        }
        <tr>
          <td colspan="2" style="padding:8px 0;color:#888;">${escapeHtml(shippingTitle)}</td>
          <td style="padding:8px 0;color:#ccc;text-align:right;">${shippingLabel}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:12px 0;color:#fff;font-weight:bold;font-size:16px;">Gesamt</td>
          <td style="padding:12px 0;color:#c0392b;font-weight:bold;font-size:16px;text-align:right;">
            ${formatPrice(parsePrice(String(order.total ?? "0")), currency)}
          </td>
        </tr>
      </table>

      <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 8px;">Versandadresse</h3>
      <p style="font-size:14px;line-height:1.6;color:#ccc;margin:0;">${formatAddress(order.shipping ?? order.billing)}</p>

      <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 8px;">Zahlung &amp; Versand</h3>
      <p style="font-size:14px;line-height:1.6;color:#ccc;margin:0;">
        Zahlungsart: <strong style="color:#fff;">${escapeHtml(paymentTitle)}</strong><br/>
        Versandart: <strong style="color:#fff;">${escapeHtml(shippingTitle)}</strong>
      </p>

      ${invoiceNote}

      <a href="${SHOP_KONTO_URL}"
         style="display:block;margin:32px 0 16px;padding:14px 24px;background:#c0392b;color:#fff;text-align:center;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:0.1em;">
        BESTELLVERLAUF ANSEHEN →
      </a>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:13px;color:#888;line-height:1.5;">
        Fragen? Schreib uns an
        <a href="mailto:office@uncuttv.at" style="color:#c0392b;">office@uncuttv.at</a>.
      </p>

      <p style="font-size:11px;color:#555;line-height:1.5;margin-top:16px;">
        UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich
      </p>
    </div>
  `;
}

export function buildOfficeEmailHtml(
  order: OrderConfirmationWooOrder,
  orderId: number
): string {
  const orderNumber = asString(order.number) || String(orderId);
  const currency = (asString(order.currency) || "EUR").toUpperCase();
  const b = order.billing ?? {};
  const paymentTitle =
    asString(order.payment_method_title) ||
    asString(order.payment_method) ||
    "Online-Zahlung";
  const totalFormatted = formatPrice(
    parsePrice(String(order.total ?? "0")),
    currency
  );

  const itemLines = (order.line_items ?? [])
    .map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const lineTotal = formatPrice(
        parsePrice(String(item.total ?? "0")),
        currency
      );
      return `<li style="margin:4px 0;color:#ccc;">${qty}× ${escapeHtml(asString(item.name))} — ${lineTotal}</li>`;
    })
    .join("");

  const adminUrl = wooAdminEditUrl(orderId);

  return `
    <div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#111;color:#eee;padding:24px;">
      <h2 style="margin:0 0 8px;color:#c0392b;font-size:20px;">Neue Bestellung #${escapeHtml(orderNumber)}</h2>
      <p style="margin:0 0 16px;color:#888;font-size:13px;">
        <a href="${escapeHtml(adminUrl)}" style="color:#c0392b;">In WooCommerce öffnen</a>
        · Order-ID ${orderId}
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr>
          <td style="padding:6px 0;color:#888;width:140px;">Kunde</td>
          <td style="padding:6px 0;color:#fff;">${escapeHtml(customerName(order))}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">E-Mail</td>
          <td style="padding:6px 0;"><a href="mailto:${escapeHtml(asString(b.email))}" style="color:#c0392b;">${escapeHtml(asString(b.email))}</a></td>
        </tr>
        ${
          asString(b.phone)
            ? `<tr>
                 <td style="padding:6px 0;color:#888;">Telefon</td>
                 <td style="padding:6px 0;color:#fff;">${escapeHtml(asString(b.phone))}</td>
               </tr>`
            : ""
        }
        <tr>
          <td style="padding:6px 0;color:#888;">Zahlungsart</td>
          <td style="padding:6px 0;color:#fff;">${escapeHtml(paymentTitle)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">Status</td>
          <td style="padding:6px 0;color:#fff;">${escapeHtml(paymentStatusLabel(order))}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">Gesamt</td>
          <td style="padding:6px 0;color:#c0392b;font-weight:bold;">${totalFormatted}</td>
        </tr>
      </table>

      <h3 style="font-size:12px;color:#888;text-transform:uppercase;margin:16px 0 8px;">Artikel</h3>
      <ul style="margin:0;padding-left:20px;font-size:14px;">${itemLines || "<li>—</li>"}</ul>

      <h3 style="font-size:12px;color:#888;text-transform:uppercase;margin:16px 0 8px;">Versandadresse</h3>
      <p style="font-size:14px;line-height:1.5;color:#ccc;margin:0;">${formatAddress(order.shipping ?? order.billing)}</p>
    </div>
  `;
}

export type BankTransferEmailDetails = {
  customerName: string;
  items: CartMeta[];
  total: string;
  isWholesale: boolean;
  locale: "de" | "en";
  discountEur?: number;
  couponCode?: string;
};

export function buildBankTransferEmailHtml(
  orderNumber: string,
  details: BankTransferEmailDetails,
  opts: { pdfAttached: boolean; orderId: number }
): string {
  const {
    customerName: name,
    items,
    total,
    isWholesale,
    locale,
    discountEur = 0,
    couponCode = "",
  } = details;

  const bankPaymentText = getTranslation(
    isWholesale ? "BANK_TEXT_WHOLESALE" : "BANK_TEXT_B2C",
    locale
  );
  const bankHint = isWholesale
    ? getTranslation("BANK_HINT_WHOLESALE", locale)
    : "";
  const thanksLine = formatTranslation("EMAIL_BANK_GREETING", locale, {
    name,
    order: orderNumber,
  });
  const orderOverviewTitle = getTranslation("EMAIL_ORDER_OVERVIEW", locale);
  const footerNote = getTranslation("EMAIL_FOOTER_AFTER_PAYMENT", locale);
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
          <td style="padding:8px 0;color:#ccc;border-bottom:1px solid #222;">${item.qty}× ${escapeHtml(item.name)}</td>
          <td style="padding:8px 0;color:#ccc;border-bottom:1px solid #222;text-align:right;">${lineTotal}</td>
        </tr>`;
    })
    .join("");

  const discountRow =
    discountEur > 0
      ? `<tr>
          <td style="padding:8px 0;color:#888;border-bottom:1px solid #222;">Rabatt${couponCode ? ` (${escapeHtml(couponCode)})` : ""}</td>
          <td style="padding:8px 0;color:#c0392b;border-bottom:1px solid #222;text-align:right;">−${formatPrice(discountEur)}</td>
        </tr>`
      : "";

  const invoiceNote = opts.pdfAttached
    ? `<p style="font-size:14px;line-height:1.6;color:#888;margin:16px 0 0;">
         Deine Rechnung findest du im Anhang dieser E-Mail.
       </p>`
    : `<p style="font-size:14px;line-height:1.6;color:#888;margin:16px 0 0;">
         Die Rechnung folgt in Kürze per separater E-Mail. Du kannst sie auch jederzeit in deinem
         <a href="${SHOP_KONTO_URL}" style="color:#c0392b;">Kundenkonto</a> herunterladen
         (${escapeHtml(invoiceDownloadHint(opts.orderId))} — Anmeldung erforderlich).
       </p>`;

  return `
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

      ${invoiceNote}

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
}

export function buildInvoiceResendEmailHtml(
  order: OrderConfirmationWooOrder,
  orderId: number
): string {
  const orderNumber = asString(order.number) || String(orderId);
  const name = customerName(order) || "Kunde";
  return `
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#0a0a0a;color:#fff;padding:40px 32px;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:0.05em;margin:0;">
        <span style="color:#fff;">UNCUT</span><span style="color:#c0392b;">TV</span>
      </h1>
      <p style="color:#888;font-size:14px;margin-top:8px;">Rechnung</p>
      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />
      <p style="font-size:16px;line-height:1.6;color:#ccc;">
        Hallo ${escapeHtml(name)},<br/><br/>
        anbei findest du die Rechnung zu deiner Bestellung
        <strong style="color:#fff;">#${escapeHtml(orderNumber)}</strong>.
      </p>
      <p style="font-size:11px;color:#555;line-height:1.5;margin-top:24px;">
        UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich
      </p>
    </div>
  `;
}

export function isResendConfigured(): boolean {
  return resendConfigured();
}

export function getCustomerDisplayName(order: OrderConfirmationWooOrder): string {
  const email = asString(order.billing?.email);
  return customerName(order) || email;
}
