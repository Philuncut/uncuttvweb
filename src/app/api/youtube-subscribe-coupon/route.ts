import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { generateYouTubeCoupon } from "@/lib/coupon-generator";
import {
  youtubeCouponMailHtml,
  youtubeCouponMailSubject,
} from "@/lib/youtube-coupon-mail-template";

export const dynamic = "force-dynamic";

const CLAIM_COOLDOWN_DAYS = 180;
const COUPON_EXPIRY_DAYS = 14;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request): Promise<Response> {
  let email: string;
  let locale: "de" | "en" = "de";

  try {
    const body = (await request.json()) as { email?: string; locale?: string };
    email = body.email?.trim().toLowerCase() ?? "";
    locale = body.locale === "en" ? "en" : "de";
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return Response.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 }
    );
  }

  // 180-day cooldown check
  const cutoff = new Date(
    Date.now() - CLAIM_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  );
  const { data: existing } = await supabase
    .from("shop_youtube_coupon_log")
    .select("id")
    .eq("email", email)
    .gte("created_at", cutoff.toISOString())
    .limit(1)
    .maybeSingle();

  if (existing) {
    return Response.json({ ok: false, alreadyClaimed: true });
  }

  // Generate WooCommerce coupon
  let couponCode: string;
  let expiryDate: string;
  try {
    const result = await generateYouTubeCoupon(email);
    couponCode = result.code;
    expiryDate = result.expiry_date;
  } catch (err) {
    console.error("[youtube-subscribe-coupon] Coupon generation failed", err);
    return Response.json(
      { ok: false, error: "coupon_generation_failed" },
      { status: 500 }
    );
  }

  // Log to Supabase (non-fatal if it fails)
  const expiresAt = new Date(
    Date.now() + COUPON_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );
  const { error: logError } = await supabase
    .from("shop_youtube_coupon_log")
    .insert({
      email,
      coupon_code: couponCode,
      expires_at: expiresAt.toISOString(),
    });

  if (logError) {
    console.error(
      "[youtube-subscribe-coupon] Log insert failed — coupon still created",
      logError.message
    );
  }

  // Send email via Resend (non-fatal — coupon exists even if mail fails)
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey && resendKey !== "your_resend_api_key") {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "UncutTV <office@uncuttv.at>",
        to: email,
        bcc: "office@uncuttv.at",
        reply_to: "office@uncuttv.at",
        subject: youtubeCouponMailSubject(locale),
        html: youtubeCouponMailHtml({ couponCode, expiryDate, locale }),
      } as never);
    } catch (err) {
      console.error(
        "[youtube-subscribe-coupon] Email send failed — coupon still created",
        err
      );
    }
  }

  return Response.json({ ok: true });
}
