import crypto from "crypto";

const RECOVERY_CODE_PREFIX = "RECOVERY-";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RecoveryCouponResult = {
  code: string;
  expiry_date: string;
  woo_id: number;
};

function wooAuthHeader(): string {
  const key = process.env.WOOCOMMERCE_KEY!;
  const secret = process.env.WOOCOMMERCE_SECRET!;
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

function randomRecoverySuffix(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

function formatExpiryLabel(expiresAt: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(expiresAt);
}

/**
 * Creates a single-use 10% recovery coupon tied to `email`, valid 24h, min €30.
 */
export async function generateRecoveryCoupon(
  email: string,
  _cartTotal: number
): Promise<RecoveryCouponResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new Error("Invalid email for recovery coupon");
  }

  const wooUrl = process.env.WOOCOMMERCE_URL!.replace(/\/$/, "");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const code = `${RECOVERY_CODE_PREFIX}${randomRecoverySuffix(8)}`;

  const res = await fetch(`${wooUrl}/wp-json/wc/v3/coupons`, {
    method: "POST",
    headers: {
      Authorization: wooAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      code,
      discount_type: "percent",
      amount: "10",
      individual_use: true,
      usage_limit: 1,
      email_restrictions: [normalizedEmail],
      minimum_amount: "30.00",
      date_expires: expiresAt.toISOString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `WooCommerce coupon create failed: ${res.status} ${text.slice(0, 200)}`
    );
  }

  const created = (await res.json()) as { id?: number; code?: string };
  if (!created?.id) {
    throw new Error("WooCommerce coupon creation returned no id");
  }

  return {
    code: created.code ?? code,
    expiry_date: formatExpiryLabel(expiresAt),
    woo_id: created.id,
  };
}
