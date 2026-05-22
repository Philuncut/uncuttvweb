import type { CartItem } from "@/lib/CartContext";
import {
  cartItemsFromCartLines,
  validateAndComputeCouponDiscount,
} from "@/lib/coupon-validator";

export type CouponPiMetadata = {
  coupon_code: string;
  coupon_wc_id: string;
  discount_amount_cents: string;
  discount_label: string;
};

export async function applyCouponToSubtotalCents(
  couponCode: string,
  subtotalCents: number,
  items: CartItem[],
  customerEmail?: string
): Promise<
  | { ok: true; discountCents: number; metadata: CouponPiMetadata }
  | { ok: false; error: string }
> {
  const applied = await validateAndComputeCouponDiscount({
    code: couponCode,
    cartSubtotalCents: subtotalCents,
    cartItems: cartItemsFromCartLines(items),
    customerEmail,
  });

  if (!applied.ok) {
    return { ok: false, error: applied.error };
  }

  const { validation, discountCents } = applied.data;

  return {
    ok: true,
    discountCents,
    metadata: {
      coupon_code: validation.couponCode,
      coupon_wc_id: String(validation.couponId),
      discount_amount_cents: String(discountCents),
      discount_label: validation.displayLabel,
    },
  };
}
