import { Resend } from "resend";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import { standardVatFraction } from "@/lib/woo-vat-split";

const NOTIFICATION_TO = "office@uncuttv.at";
const NOTIFICATION_FROM = "UncutTV <office@uncuttv.at>";

/** Matches WooCommerce cart line shape used by sync-order / create-bank-order. */
export type WholesaleCartLine = {
  id: number;
  name: string;
  qty: number;
  price: string;
};

export type WholesaleTaxPipeline =
  | "wholesale_at"
  | "wholesale_eu_rc"
  /** Wholesale EU außer AT, ohne Reverse Charge — MwSt wird nach Zielland ausgewiesen */
  | "wholesale_eu_vat";

export interface WholesaleOrderNotification {
  orderId: number;
  orderNumber: string;
  orderDateLabel: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    company?: string;
    vatNumber?: string;
  };
  billing: {
    street: string;
    postcode: string;
    city: string;
    country: string;
  };
  shippingAddress: {
    firstName: string;
    lastName: string;
    street: string;
    postcode: string;
    city: string;
    country: string;
    state?: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  shipping: {
    method: string;
    cost: number;
  };
  totals: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
  };
  paymentMethod: string;
  pipeline: WholesaleTaxPipeline;
  taxNote?: string;
  wooAdminUrl: string;
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value).trim();
  return String(value).trim();
}

function normalizeCountry(code: string | undefined): string {
  return asString(code).toUpperCase();
}

export function billingVatFromOrderMeta(
  meta: Array<{ key?: string; value?: unknown }> | undefined
): string | undefined {
  const e = meta?.find(
    (m) => m.key === "_billing_vat" || m.key === "billing_vat"
  );
  const s = asString(e?.value);
  return s || undefined;
}

/**
 * Reverse Charge aus Meta oder Flag.
 * Woo schreibt `_uncuttv_reverse_charge === "yes"` — wir spiegeln dieselbe Logik.
 */
export function resolveWholesaleTaxPipeline(
  isWholesale: boolean,
  shippingCountry: string,
  isReverseChargeFlag: boolean,
  metaReverseChargeYes?: boolean
): WholesaleTaxPipeline | null {
  if (!isWholesale) return null;
  const isRC = isReverseChargeFlag || metaReverseChargeYes === true;
  if (isRC) return "wholesale_eu_rc";
  const c = normalizeCountry(shippingCountry);
  if (c === "AT") return "wholesale_at";
  return "wholesale_eu_vat";
}

function wholesaleTotals(
  items: WholesaleCartLine[],
  shippingNet: number,
  taxCountry: string,
  isRC: boolean
): WholesaleOrderNotification["totals"] {
  const qty = (item: WholesaleCartLine) =>
    Math.max(1, Number(item.qty) || 1);
  let subtotal = 0;
  for (const item of items) {
    const unitNet = Math.max(0, parsePrice(item.price));
    subtotal += unitNet * qty(item);
  }
  const ship = Math.max(0, shippingNet);
  const r = standardVatFraction(taxCountry);
  const tax = isRC ? 0 : (subtotal + ship) * r;
  const total = subtotal + ship + tax;
  return {
    subtotal,
    shipping: ship,
    tax,
    total,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildWholesaleOrderNotification(
  args: {
    orderId: number;
    orderNumber: string;
    billing: Record<string, string>;
    shipping: Record<string, string>;
    items: WholesaleCartLine[];
    checkoutShipping?: {
      rate: number;
      label: string;
      method_id: string;
    } | null;
    taxCountry: string;
    isWholesaleCheckout: boolean;
    isReverseCharge: boolean;
    /** Nach Woo-POST: Meta enthält RC-Marker */
    orderMeta?: Array<{ key?: string; value?: unknown }>;
    paymentMethodTitle: string;
    vatNumber?: string;
    wooCommerceBaseUrl: string;
  }
): WholesaleOrderNotification | null {
  const pipeline = resolveWholesaleTaxPipeline(
    args.isWholesaleCheckout,
    args.shipping.country || args.taxCountry,
    args.isReverseCharge,
    args.orderMeta?.some(
      (m) =>
        m.key === "_uncuttv_reverse_charge" && asString(m.value) === "yes"
    )
  );
  if (!pipeline) return null;

  const shipNorm =
    args.checkoutShipping &&
    typeof args.checkoutShipping.rate === "number" &&
    !Number.isNaN(args.checkoutShipping.rate) &&
    !(
      args.checkoutShipping.method_id === "none" &&
      args.checkoutShipping.rate === 0
    )
      ? Math.max(0, args.checkoutShipping.rate)
      : 0;

  const shipLabel =
    args.checkoutShipping &&
    typeof args.checkoutShipping.label === "string" &&
    args.checkoutShipping.label.trim()
      ? args.checkoutShipping.label.trim()
      : shipNorm > 0
        ? "Versand"
        : "—";

  const isRC = pipeline === "wholesale_eu_rc";
  const totals = wholesaleTotals(
    args.items,
    shipNorm,
    args.taxCountry,
    isRC
  );

  const taxNote =
    pipeline === "wholesale_eu_rc"
      ? "Steuerschuldnerschaft des Leistungsempfängers gem. Art. 196 MwStSystRL"
      : pipeline === "wholesale_at"
        ? "Österreichische Umsatzsteuer (20 %)."
        : "MwSt wird nach Lieferland ausgewiesen.";

  const wooAdminUrl = `${args.wooCommerceBaseUrl.replace(/\/$/, "")}/wp-admin/post.php?post=${args.orderId}&action=edit`;

  const qty = (item: WholesaleCartLine) =>
    Math.max(1, Number(item.qty) || 1);

  return {
    orderId: args.orderId,
    orderNumber: String(args.orderNumber),
    orderDateLabel: new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date()),
    customer: {
      firstName: asString(args.billing.first_name),
      lastName: asString(args.billing.last_name),
      email: asString(args.billing.email),
      phone: asString(args.billing.phone) || undefined,
      company: asString(args.billing.company) || undefined,
      vatNumber: args.vatNumber?.trim() || undefined,
    },
    billing: {
      street: [
        asString(args.billing.address_1),
        asString(args.billing.address_2),
      ]
        .filter(Boolean)
        .join(", "),
      postcode: asString(args.billing.postcode),
      city: asString(args.billing.city),
      country: normalizeCountry(args.billing.country) || asString(args.billing.country),
    },
    shippingAddress: {
      firstName: asString(args.shipping.first_name),
      lastName: asString(args.shipping.last_name),
      street: [
        asString(args.shipping.address_1),
        asString(args.shipping.address_2),
      ]
        .filter(Boolean)
        .join(", "),
      postcode: asString(args.shipping.postcode),
      city: asString(args.shipping.city),
      country:
        normalizeCountry(args.shipping.country) ||
        asString(args.shipping.country),
      state: asString(args.shipping.state) || undefined,
    },
    items: args.items.map((item) => {
      const q = qty(item);
      const unitNet = Math.max(0, parsePrice(item.price));
      return {
        name: item.name,
        quantity: q,
        unitPrice: unitNet,
        lineTotal: unitNet * q,
      };
    }),
    shipping: {
      method: shipLabel,
      cost: shipNorm,
    },
    totals,
    paymentMethod: args.paymentMethodTitle,
    pipeline,
    taxNote,
    wooAdminUrl,
  };
}

export function buildWholesaleEmailHtml(data: WholesaleOrderNotification): string {
  const pipeBanner =
    data.pipeline === "wholesale_eu_rc"
      ? {
          bg: "#fff3cd",
          border: "#ffc107",
          color: "#856404",
          text: "⚠️ REVERSE CHARGE",
        }
      : data.pipeline === "wholesale_at"
        ? {
            bg: "#e9ecef",
            border: "#ced4da",
            color: "#495057",
            text: "Wholesale Österreich (20 % USt)",
          }
        : {
            bg: "#e9ecef",
            border: "#ced4da",
            color: "#495057",
            text: "Wholesale EU — ausgewiesene MwSt (Zielland)",
          };

  const taxRowLabel =
    data.pipeline === "wholesale_eu_rc"
      ? "USt"
      : data.pipeline === "wholesale_at"
        ? "USt (20 %)"
        : "USt";

  const taxRowValue =
    data.pipeline === "wholesale_eu_rc"
      ? `${formatPrice(0)} (Reverse Charge)`
      : formatPrice(data.totals.tax);

  const itemRows = data.items
    .map(
      (line) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eeeeee;color:#111111;font-size:14px;line-height:1.4;">${escapeHtml(line.name)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eeeeee;color:#111111;font-size:14px;text-align:center;">${line.quantity}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eeeeee;color:#111111;font-size:14px;text-align:right;white-space:nowrap;">${formatPrice(line.unitPrice)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eeeeee;color:#111111;font-size:14px;text-align:right;white-space:nowrap;">${formatPrice(line.lineTotal)}</td>
    </tr>`
    )
    .join("");

  const shipBlock =
    data.shipping.cost > 0 || data.shipping.method !== "—"
      ? `
    <tr>
      <td colspan="4" style="padding:14px 8px 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#666666;font-weight:bold;">Versand</td>
    </tr>
    <tr>
      <td colspan="3" style="padding:6px 8px;color:#333333;font-size:14px;">${escapeHtml(data.shipping.method)}</td>
      <td style="padding:6px 8px;text-align:right;color:#111111;font-size:14px;white-space:nowrap;">${formatPrice(data.shipping.cost)} <span style="color:#888;font-size:11px;">(netto)</span></td>
    </tr>`
      : "";

  const custCompany = data.customer.company
    ? `<tr><td style="padding:6px 0;color:#888888;width:140px;">Firma</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.customer.company)}</td></tr>`
    : "";
  const custVat = data.customer.vatNumber
    ? `<tr><td style="padding:6px 0;color:#888888;">UID</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.customer.vatNumber)}</td></tr>`
    : "";
  const custPhone = data.customer.phone
    ? `<tr><td style="padding:6px 0;color:#888888;">Telefon</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.customer.phone)}</td></tr>`
    : "";

  const shipStateRow = data.shippingAddress.state
    ? `<tr><td style="padding:6px 0;color:#888888;">Bundesland</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.shippingAddress.state)}</td></tr>`
    : "";

  const rcLegal =
    data.pipeline === "wholesale_eu_rc"
      ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 0;">
      <tr>
        <td style="padding:12px 14px;background:#fafafa;border-left:4px solid #c0392b;color:#333333;font-size:13px;line-height:1.5;">
          ${escapeHtml(
            "Steuerschuldnerschaft des Leistungsempfängers gem. Art. 196 MwStSystRL"
          )}
        </td>
      </tr>
    </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Wholesale-Bestellung #${escapeHtml(data.orderNumber)}</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .wrapper { width: 100% !important; }
      .px { padding-left: 16px !important; padding-right: 16px !important; }
      .hide-m { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="wrapper" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
          <tr>
            <td class="px" style="padding:28px 28px 12px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <p style="margin:0;font-size:11px;letter-spacing:0.14em;color:#c0392b;font-weight:bold;">WHOLESALE BESTELLUNG</p>
              <h1 style="margin:10px 0 0;font-size:22px;line-height:1.25;color:#111111;font-weight:800;">Neue Bestellung #${escapeHtml(data.orderNumber)}</h1>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 28px 16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${pipeBanner.bg};border:1px solid ${pipeBanner.border};border-radius:4px;">
                <tr>
                  <td style="padding:12px 14px;color:${pipeBanner.color};font-size:14px;font-weight:bold;">
                    ${escapeHtml(pipeBanner.text)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 28px 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;font-size:14px;line-height:1.55;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td colspan="2" style="padding:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#666666;font-weight:bold;">Bestellung</td>
                </tr>
                <tr><td style="padding:6px 0;color:#888888;width:140px;">Bestellnr.</td><td style="padding:6px 0;color:#111111;font-weight:600;">${escapeHtml(data.orderNumber)}</td></tr>
                <tr><td style="padding:6px 0;color:#888888;">Datum</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.orderDateLabel)}</td></tr>
                <tr><td style="padding:6px 0;color:#888888;">Zahlungsart</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.paymentMethod)}</td></tr>
                <tr><td style="padding:6px 0;color:#888888;">Pipeline</td><td style="padding:6px 0;color:#111111;">${escapeHtml(data.pipeline)}</td></tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:22px;">
                <tr>
                  <td colspan="2" style="padding:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#666666;font-weight:bold;">Kunde</td>
                </tr>
                <tr><td style="padding:6px 0;color:#888888;width:140px;">Name</td><td style="padding:6px 0;color:#111111;">${escapeHtml(`${data.customer.firstName} ${data.customer.lastName}`.trim() || "—")}</td></tr>
                ${custCompany}
                ${custVat}
                <tr><td style="padding:6px 0;color:#888888;">E-Mail</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(data.customer.email)}" style="color:#c0392b;text-decoration:none;">${escapeHtml(data.customer.email)}</a></td></tr>
                ${custPhone}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:22px;">
                <tr>
                  <td colspan="2" style="padding:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#666666;font-weight:bold;">Rechnungsadresse</td>
                </tr>
                <tr><td style="padding:6px 0;color:#111111;line-height:1.5;">${escapeHtml(data.billing.street || "—")}<br/>${escapeHtml(`${data.billing.postcode} ${data.billing.city}`.trim())}<br/>${escapeHtml(data.billing.country)}</td></tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:22px;">
                <tr>
                  <td colspan="2" style="padding:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#666666;font-weight:bold;">Lieferadresse</td>
                </tr>
                <tr><td style="padding:6px 0;color:#111111;line-height:1.5;">
                  ${escapeHtml(`${data.shippingAddress.firstName} ${data.shippingAddress.lastName}`.trim())}<br/>
                  ${escapeHtml(data.shippingAddress.street || "—")}<br/>
                  ${escapeHtml(`${data.shippingAddress.postcode} ${data.shippingAddress.city}`.trim())}<br/>
                  ${escapeHtml(data.shippingAddress.country)}
                </td></tr>
                ${shipStateRow}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:24px;">
                <tr>
                  <td colspan="4" style="padding:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#666666;font-weight:bold;">Produkte <span style="font-weight:normal;color:#999;">(Einzelpreis netto)</span></td>
                </tr>
                <tr style="background:#fafafa;">
                  <th align="left" style="padding:8px;font-size:11px;color:#666666;text-transform:uppercase;">Artikel</th>
                  <th style="padding:8px;font-size:11px;color:#666666;text-transform:uppercase;text-align:center;width:52px;">Menge</th>
                  <th style="padding:8px;font-size:11px;color:#666666;text-transform:uppercase;text-align:right;">Einzel</th>
                  <th style="padding:8px;font-size:11px;color:#666666;text-transform:uppercase;text-align:right;">Summe netto</th>
                </tr>
                ${itemRows}
                ${shipBlock}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:18px;">
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;">Zwischensumme (netto)</td>
                  <td style="padding:8px 0;text-align:right;color:#111111;font-size:14px;white-space:nowrap;">${formatPrice(data.totals.subtotal)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;">Versand (netto)</td>
                  <td style="padding:8px 0;text-align:right;color:#111111;font-size:14px;white-space:nowrap;">${formatPrice(data.totals.shipping)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;">${escapeHtml(taxRowLabel)}</td>
                  <td style="padding:8px 0;text-align:right;color:#111111;font-size:14px;white-space:nowrap;">${taxRowValue}</td>
                </tr>
                <tr>
                  <td style="padding:14px 0 8px;border-top:2px solid #111111;color:#111111;font-size:16px;font-weight:bold;">Gesamtbetrag (brutto)</td>
                  <td style="padding:14px 0 8px;border-top:2px solid #111111;text-align:right;color:#c0392b;font-size:18px;font-weight:bold;white-space:nowrap;">${formatPrice(data.totals.total)}</td>
                </tr>
              </table>

              ${rcLegal}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">
                <tr>
                  <td bgcolor="#c0392b" style="border-radius:4px;mso-padding-alt:14px 28px;">
                    <a href="${escapeHtml(data.wooAdminUrl)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 28px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
                      In WooCommerce-Admin öffnen
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:12px;color:#888888;line-height:1.5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                ${escapeHtml(data.taxNote ?? "")}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#fafafa;border-top:1px solid #eeeeee;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#999999;text-align:center;">
              UncutTV · automatische Wholesale-Benachrichtigung · Order-ID ${data.orderId}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function resendApiKeyOk(): boolean {
  const k = process.env.RESEND_API_KEY;
  return !!k && k !== "your_resend_api_key";
}

export async function notifyWholesaleOrder(
  data: WholesaleOrderNotification
): Promise<{ sent: boolean; error?: string }> {
  if (!resendApiKeyOk()) {
    console.warn("[notify-wholesale-order] RESEND_API_KEY missing, skipping");
    return { sent: false, error: "no_api_key" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const subject = `[Wholesale] Neue Bestellung #${data.orderNumber} — ${data.customer.company ?? data.customer.lastName}`;

    const { error } = await resend.emails.send({
      from: NOTIFICATION_FROM,
      to: NOTIFICATION_TO,
      subject,
      html: buildWholesaleEmailHtml(data),
    });

    if (error) {
      console.error("[notify-wholesale-order] Resend API:", error);
      return { sent: false, error: error.message };
    }

    return { sent: true };
  } catch (err) {
    console.error("[notify-wholesale-order]", err);
    return { sent: false, error: String(err) };
  }
}

/**
 * Nicht-blockierend: Aufrufer awaitiert nicht; Fehler nur geloggt.
 */
export function enqueueWholesaleOfficeNotification(
  args: Parameters<typeof buildWholesaleOrderNotification>[0]
): void {
  if (!args.isWholesaleCheckout) return;
  const payload = buildWholesaleOrderNotification(args);
  if (!payload) return;
  notifyWholesaleOrder(payload).catch((err) =>
    console.error("[email-notify-failed]", err)
  );
}
