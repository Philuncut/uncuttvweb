import { wooFetchAll } from "@/lib/woocommerce";

const RECOVERY_PREFIX = "RECOVERY-";

interface WooCouponRow {
  id?: number;
  code?: string;
  email_restrictions?: string[];
  date_created?: string;
  date_created_gmt?: string;
}

function parseCouponCreatedUtc(coupon: WooCouponRow): Date | null {
  const raw =
    typeof coupon.date_created_gmt === "string" && coupon.date_created_gmt.trim()
      ? coupon.date_created_gmt.trim()
      : typeof coupon.date_created === "string" && coupon.date_created.trim()
        ? coupon.date_created.trim()
        : null;
  if (!raw) return null;
  const hasTz =
    /Z$/i.test(raw) ||
    /[+-]\d{2}:?\d{2}$/.test(raw) ||
    /[+-]\d{2}$/.test(raw.slice(-6));
  const iso = hasTz ? raw : `${raw}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True if `email` received a RECOVERY-* coupon in the last `days` days.
 */
export async function hasRecentRecoveryCoupon(
  email: string,
  days: number
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const coupons = await wooFetchAll<WooCouponRow>(
    "/coupons",
    {
      per_page: "100",
      search: RECOVERY_PREFIX,
      orderby: "date",
      order: "desc",
    },
    { cache: "no-store" }
  );

  for (const coupon of coupons) {
    const code =
      typeof coupon.code === "string" ? coupon.code.trim().toUpperCase() : "";
    if (!code.startsWith(RECOVERY_PREFIX)) continue;

    const restrictions = Array.isArray(coupon.email_restrictions)
      ? coupon.email_restrictions
          .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
          .filter(Boolean)
      : [];
    if (!restrictions.includes(normalized)) continue;

    const created = parseCouponCreatedUtc(coupon);
    if (!created) continue;
    if (created.getTime() >= cutoff) return true;
  }

  return false;
}
