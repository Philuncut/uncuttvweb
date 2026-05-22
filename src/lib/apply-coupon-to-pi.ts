import type { CartItem } from "@/lib/CartContext";
import {
  applyCouponToSubtotalCents,
  type CouponPiMetadata,
} from "@/lib/coupon-helpers";
import {
  COUPON_ALREADY_USED_MESSAGE,
  COUPON_ERROR_ALREADY_USED,
} from "@/lib/coupon-validator";

export {
  applyCouponToSubtotalCents,
  type CouponPiMetadata,
} from "@/lib/coupon-helpers";

export type CouponPiApplyResult = {
  discountCents: number;
  couponMeta: CouponPiMetadata | Record<string, never>;
  couponCodeApplied: string | null;
  couponRejected: typeof COUPON_ERROR_ALREADY_USED | null;
};

/**
 * Applies coupon to PI subtotal; strips discount if email already used the code
 * (usage_limit_per_user) so Stripe is not charged with a WC-rejected coupon.
 */
export async function applyCouponForPaymentIntent(
  couponCode: string,
  subtotalCents: number,
  items: CartItem[],
  customerEmail?: string
): Promise<
  | { ok: true; data: CouponPiApplyResult }
  | { ok: false; error: string; errorCode?: string }
> {
  const applied = await applyCouponToSubtotalCents(
    couponCode,
    subtotalCents,
    items,
    customerEmail?.trim() || undefined
  );

  if (!applied.ok) {
    if (
      applied.errorCode === COUPON_ERROR_ALREADY_USED ||
      applied.error === COUPON_ALREADY_USED_MESSAGE
    ) {
      console.warn(
        "[coupon-pi] usage_limit_per_user — coupon stripped before PI update:",
        couponCode,
        customerEmail
      );
      return {
        ok: true,
        data: {
          discountCents: 0,
          couponMeta: {},
          couponCodeApplied: null,
          couponRejected: COUPON_ERROR_ALREADY_USED,
        },
      };
    }
    return {
      ok: false,
      error: applied.error,
      errorCode: applied.errorCode,
    };
  }

  return {
    ok: true,
    data: {
      discountCents: applied.discountCents,
      couponMeta: applied.metadata,
      couponCodeApplied: applied.metadata.coupon_code,
      couponRejected: null,
    },
  };
}
