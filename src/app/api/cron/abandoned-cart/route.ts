import { Resend } from "resend";
import { wooFetchAll } from "@/lib/woocommerce";
import { hasRecentRecoveryCoupon } from "@/lib/abandoned-cart-tracking";
import { generateRecoveryCoupon } from "@/lib/coupon-generator";
import {
  ABANDONED_CART_TEMPLATES,
  cartTotalFromItems,
} from "@/lib/abandoned-cart-templates";
import {
  ABANDONED_CART_SENT_1H_KEY,
  ABANDONED_CART_SENT_24H_KEY,
  ABANDONED_CART_SENT_72H_KEY,
} from "@/lib/persisted-cart";
import {
  type WooCustomerRow,
  ABANDONED_CART_EXPIRE_HOURS,
  customerIsWholesale,
  customerEmail,
  extractPersistedCart,
  parseCartUpdatedAt,
  hoursSince,
  hasMetaYes,
  buildAbandonedCartEmailData,
  setAbandonedCartMetaFlag,
  setAllAbandonedCartSentFlags,
  isAbandonedCartInitializeMode,
  shopCtaUrl,
  checkoutCtaUrl,
  customerLocale,
} from "@/lib/abandoned-cart-cron-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAIL_1_HOURS = 1;
const MAIL_2_HOURS = 24;
const MAIL_3_HOURS = 72;
const RESEND_SEND_DELAY_MS = 150;

const PURCHASE_STATUSES = [
  "pending",
  "processing",
  "on-hold",
  "completed",
] as const;

interface WooOrderRow {
  id: number;
  date_created?: string;
  date_created_gmt?: string;
}

function resendConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return !!k && k !== "your_resend_api_key";
}

function escForPre(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wooBasicAuth(): string {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.WOOCOMMERCE_KEY}:${process.env.WOOCOMMERCE_SECRET}`
    ).toString("base64")
  );
}

async function customerHasOrderSinceCartUpdate(
  customerId: number,
  since: Date
): Promise<boolean> {
  const wooUrl = process.env.WOOCOMMERCE_URL!.replace(/\/$/, "");
  const afterIso = since.toISOString();
  const statusParam = PURCHASE_STATUSES.join(",");
  const path =
    `/wp-json/wc/v3/orders?customer=${customerId}` +
    `&status=${encodeURIComponent(statusParam)}` +
    `&after=${encodeURIComponent(afterIso)}` +
    `&per_page=1`;
  const r = await fetch(`${wooUrl}${path}`, {
    headers: { Authorization: wooBasicAuth() },
    cache: "no-store",
  });
  if (!r.ok) return false;
  const rows = (await r.json()) as WooOrderRow[];
  return Array.isArray(rows) && rows.length > 0;
}

export async function GET(request: Request): Promise<Response> {
  const expected =
    typeof process.env.ABANDONED_CART_CRON_SECRET === "string" &&
    process.env.ABANDONED_CART_CRON_SECRET.trim()
      ? `Bearer ${process.env.ABANDONED_CART_CRON_SECRET.trim()}`
      : null;
  const authHeaderIn = request.headers.get("authorization");
  if (!expected || authHeaderIn !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    !process.env.WOOCOMMERCE_URL ||
    !process.env.WOOCOMMERCE_KEY ||
    !process.env.WOOCOMMERCE_SECRET
  ) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_woocommerce_env" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const initializeMode = isAbandonedCartInitializeMode();
  const now = new Date();
  const errors: string[] = [];
  const skippedCooldown: string[] = [];
  const sent = { mail1: 0, mail2: 0, mail3: 0 };
  let flagsInitialized = 0;

  const resend = resendConfigured() ? new Resend(process.env.RESEND_API_KEY) : null;

  async function sendCustomerMail(
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    if (!resend) {
      errors.push(`resend_skipped (${to.slice(0, 32)})`);
      return false;
    }
    try {
      const { error } = await resend.emails.send({
        from: "UncutTV <office@uncuttv.at>",
        to,
        bcc: "office@uncuttv.at",
        reply_to: "office@uncuttv.at",
        subject,
        html,
      } as never);
      if (error) {
        errors.push(`resend:${error.message ?? String(error)}`);
        return false;
      }
      await sleep(RESEND_SEND_DELAY_MS);
      return true;
    } catch (e) {
      errors.push(`resend_throw:${String(e)}`);
      return false;
    }
  }

  let customers: WooCustomerRow[] = [];
  try {
    // Woo REST has no customer meta filter — paginate all, filter client-side.
    // If customer count grows past ~5000, a custom WP endpoint would be a worthwhile perf win.
    customers = await wooFetchAll<WooCustomerRow>(
      "/customers",
      { per_page: "100" },
      { cache: "no-store" }
    );
  } catch (e) {
    errors.push(`customers_fetch:${String(e)}`);
    return new Response(
      JSON.stringify({ ok: false, errors }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const withCart = customers.filter((c) => {
    const { cart } = extractPersistedCart(c);
    return cart.length > 0;
  });

  for (const customer of withCart) {
    try {
      if (!customer.id || customer.id <= 0) continue;
      if (customerIsWholesale(customer)) continue;

      const email = customerEmail(customer);
      if (!email.includes("@")) continue;

      const { cart, updated_at } = extractPersistedCart(customer);
      if (cart.length === 0) continue;

      // ABANDONED_CART_INITIALIZE=true: set all sent-flags, no emails (one-time before go-live).
      if (initializeMode) {
        await setAllAbandonedCartSentFlags(customer);
        flagsInitialized += 1;
        continue;
      }

      const updated = updated_at ? parseCartUpdatedAt(updated_at) : null;
      if (!updated) continue;

      const hours = hoursSince(updated, now);
      if (hours > ABANDONED_CART_EXPIRE_HOURS) continue;

      if (await customerHasOrderSinceCartUpdate(customer.id, updated)) {
        continue;
      }

      const locale = customerLocale(customer);
      const meta = customer.meta_data;

      // --- Mail 1: >= 1h && < 24h ---
      if (
        hours >= MAIL_1_HOURS &&
        hours < MAIL_2_HOURS &&
        !hasMetaYes(meta, ABANDONED_CART_SENT_1H_KEY)
      ) {
        const tmpl =
          locale === "en"
            ? ABANDONED_CART_TEMPLATES.mail1En
            : ABANDONED_CART_TEMPLATES.mail1De;
        const data = buildAbandonedCartEmailData(cart, customer, {
          ctaUrl: shopCtaUrl(),
        });
        const ok = await sendCustomerMail(
          email,
          tmpl.subject(),
          tmpl.html(data)
        );
        if (
          ok &&
          (await setAbandonedCartMetaFlag(
            customer,
            ABANDONED_CART_SENT_1H_KEY,
            "yes"
          ))
        ) {
          sent.mail1 += 1;
        }
        continue;
      }

      // --- Mail 2: >= 24h && < 72h ---
      if (
        hours >= MAIL_2_HOURS &&
        hours < MAIL_3_HOURS &&
        !hasMetaYes(meta, ABANDONED_CART_SENT_24H_KEY)
      ) {
        const tmpl =
          locale === "en"
            ? ABANDONED_CART_TEMPLATES.mail2En
            : ABANDONED_CART_TEMPLATES.mail2De;
        const data = buildAbandonedCartEmailData(cart, customer, {
          ctaUrl: checkoutCtaUrl(),
        });
        const ok = await sendCustomerMail(
          email,
          tmpl.subject(),
          tmpl.html(data)
        );
        if (
          ok &&
          (await setAbandonedCartMetaFlag(
            customer,
            ABANDONED_CART_SENT_24H_KEY,
            "yes"
          ))
        ) {
          sent.mail2 += 1;
        }
        continue;
      }

      // --- Mail 3: >= 72h && < 168h ---
      if (
        hours >= MAIL_3_HOURS &&
        hours < ABANDONED_CART_EXPIRE_HOURS &&
        !hasMetaYes(meta, ABANDONED_CART_SENT_72H_KEY)
      ) {
        if (await hasRecentRecoveryCoupon(email, 90)) {
          skippedCooldown.push(email);
          await setAbandonedCartMetaFlag(
            customer,
            ABANDONED_CART_SENT_72H_KEY,
            "yes"
          );
          continue;
        }

        const cartTotal = cartTotalFromItems(cart);

        let couponCode: string | undefined;
        let expiryDate: string | undefined;
        try {
          const coupon = await generateRecoveryCoupon(email, cartTotal);
          couponCode = coupon.code;
          expiryDate = coupon.expiry_date;
        } catch (e) {
          errors.push(`coupon_${customer.id}:${String(e)}`);
          continue;
        }

        const tmpl =
          locale === "en"
            ? ABANDONED_CART_TEMPLATES.mail3En
            : ABANDONED_CART_TEMPLATES.mail3De;
        const data = buildAbandonedCartEmailData(cart, customer, {
          ctaUrl: checkoutCtaUrl(couponCode),
          couponCode,
          expiryDate,
        });
        const ok = await sendCustomerMail(
          email,
          tmpl.subject(),
          tmpl.html(data)
        );
        if (
          ok &&
          (await setAbandonedCartMetaFlag(
            customer,
            ABANDONED_CART_SENT_72H_KEY,
            "yes"
          ))
        ) {
          sent.mail3 += 1;
        }
      }
    } catch (e) {
      errors.push(`customer_${customer.id ?? "?"}:${String(e)}`);
    }
  }

  const sentTotal = sent.mail1 + sent.mail2 + sent.mail3;

  const shouldSendSummary =
    initializeMode ||
    sentTotal > 0 ||
    skippedCooldown.length > 0 ||
    errors.length > 0;

  if (shouldSendSummary && resend) {
    const snapshot = {
      ok: true,
      initialize_mode: initializeMode,
      checked_customers: customers.length,
      carts_with_items: withCart.length,
      flags_initialized: flagsInitialized,
      sent,
      skipped_90d_cooldown: skippedCooldown,
      errors,
    };
    try {
      const summarySubject = initializeMode
        ? `[Abandoned-Cart] INITIALIZE — ${flagsInitialized} customers flagged (no mail)`
        : `[Abandoned-Cart] ${sentTotal} sent, ${skippedCooldown.length} skipped (90d)`;
      await resend.emails.send({
        from: "UncutTV Cron <office@uncuttv.at>",
        to: "office@uncuttv.at",
        subject: summarySubject,
        html: `<pre>${escForPre(JSON.stringify(snapshot, null, 2))}</pre>`,
      } as never);
    } catch (e) {
      errors.push(`summary_mail:${String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      initialize_mode: initializeMode,
      checked_customers: customers.length,
      carts_with_items: withCart.length,
      flags_initialized: flagsInitialized,
      sent,
      skipped_90d_cooldown: skippedCooldown,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
