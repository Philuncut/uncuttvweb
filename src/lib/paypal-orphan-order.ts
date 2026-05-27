import { Resend } from "resend";
import { parsePrice } from "@/lib/parse-price";
import { OFFICE_TO } from "@/lib/order-confirmation-email";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  isValidCheckoutEmail,
  normalizeCheckoutEmail,
} from "@/lib/paypal-capture";
import type { CartMeta } from "@/lib/wc-order-from-payment";

/** Verified sender — same as abandoned-cart cron mails. */
const ORPHAN_ALERT_FROM = "UncutTV <office@uncuttv.at>";

export type PayPalOrphanAlertPayload = {
  reason: string;
  paypalOrderId: string;
  captureId?: string;
  amount?: string;
  email?: string;
  payerEmail?: string;
  formEmail?: string;
  syncStatus?: number;
  syncError?: unknown;
  cartItems?: CartMeta[];
  rawBody?: unknown;
};

export type PersistPayPalOrphanInput = {
  paypal_order_id: string;
  capture_id?: string | null;
  amount_eur?: number | null;
  customer_email?: string | null;
  raw_body?: unknown;
  error_reason: string;
  error_details?: unknown;
};

function resendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  return Boolean(key && key !== "your_resend_api_key");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

export function paypalOrderIdFromPaymentIntent(
  paymentIntentId: string | undefined
): string {
  const ref = asString(paymentIntentId);
  return ref.startsWith("paypal_") ? ref.slice("paypal_".length) : ref;
}

export function resolveSyncBodyEmail(body: {
  customer?: { email?: string };
  customerEmail?: string;
  billing?: { email?: string };
}): string {
  return normalizeCheckoutEmail(
    asString(body.customer?.email) ||
      asString(body.customerEmail) ||
      asString(body.billing?.email)
  );
}

export function estimateOrphanAmountEur(body: {
  items?: CartMeta[];
  checkoutShipping?: { rate?: number };
}): number | null {
  const items = body.items ?? [];
  if (items.length === 0) return null;

  let total = 0;
  for (const item of items) {
    total += parsePrice(item.price) * Math.max(1, item.qty);
  }
  const shipRate = body.checkoutShipping?.rate;
  if (typeof shipRate === "number" && Number.isFinite(shipRate) && shipRate > 0) {
    total += shipRate;
  }
  return Math.round(total * 100) / 100;
}

export async function persistPayPalOrphan(
  data: PersistPayPalOrphanInput
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[orphan-persist] Supabase not configured");
    return;
  }

  const { error } = await supabase.from("paypal_orphan_orders").upsert(
    {
      ...data,
      resolved: false,
    },
    { onConflict: "paypal_order_id" }
  );

  if (error) {
    console.error("[orphan-persist] Supabase error:", error.message);
  }
}

export async function notifyPayPalOrphanAdmin(
  payload: PayPalOrphanAlertPayload
): Promise<boolean> {
  if (!resendConfigured()) {
    console.error("[admin-alert] RESEND_API_KEY not configured");
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const orderId = escapeHtml(payload.paypalOrderId);
  const captureId = escapeHtml(payload.captureId ?? "n/a");
  const reason = escapeHtml(payload.reason);
  const amount = escapeHtml(payload.amount ?? "n/a");
  const email = escapeHtml(
    payload.email || payload.payerEmail || payload.formEmail || "LEER"
  );
  const payloadJson = escapeHtml(JSON.stringify(payload, null, 2));

  const html = `
    <h2>PayPal Capture ohne WooCommerce-Order</h2>
    <p><strong>Reason:</strong> ${reason}</p>
    <p><strong>PayPal Order-ID:</strong> ${orderId}</p>
    <p><strong>Capture-ID:</strong> ${captureId}</p>
    <p><strong>Betrag:</strong> €${amount}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Zeit:</strong> ${new Date().toISOString()}</p>
    <hr>
    <h3>Recovery-Schritte</h3>
    <ol>
      <li>PayPal-Dashboard → Order-ID ${orderId} → vollständige Kundendaten</li>
      <li>WooCommerce-Order manuell anlegen</li>
      <li>Bestätigungs-Mail manuell auslösen</li>
      <li>Supabase paypal_orphan_orders → resolved=true + WC-Order-ID</li>
    </ol>
    <hr>
    <h3>Full Payload</h3>
    <pre>${payloadJson}</pre>
  `;

  try {
    await resend.emails.send({
      from: ORPHAN_ALERT_FROM,
      to: [OFFICE_TO, "p.gasser@phils.at"],
      subject: `PayPal-Bestellung ohne WC-Order: ${payload.paypalOrderId}`,
      html,
    });
    return true;
  } catch (err) {
    console.error(
      "[admin-alert] Failed to send:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

export async function recordPayPalOrphanFailure(
  persist: PersistPayPalOrphanInput,
  alert: PayPalOrphanAlertPayload
): Promise<void> {
  await persistPayPalOrphan(persist);
  await notifyPayPalOrphanAdmin(alert);
}

export function validatePayPalSyncEmail(email: string): boolean {
  return isValidCheckoutEmail(email);
}
