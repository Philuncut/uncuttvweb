import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Kein Code angegeben." },
      { status: 400 }
    );
  }

  try {
    // Try to find a promotion code matching the user's input
    const promotionCodes = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });

    if (promotionCodes.data.length > 0) {
      const promo = promotionCodes.data[0] as unknown as {
        id: string;
        coupon: { id: string; name?: string; percent_off?: number; amount_off?: number; currency?: string };
      };
      const coupon = promo.coupon;

      return NextResponse.json({
        valid: true,
        couponId: coupon.id,
        promoCodeId: promo.id,
        name: coupon.name || code.toUpperCase(),
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off
          ? (coupon.amount_off / 100).toFixed(2)
          : null,
        currency: coupon.currency,
      });
    }

    // Fallback: try direct coupon ID lookup
    const coupon = await stripe.coupons.retrieve(code);
    if (coupon && coupon.valid) {
      return NextResponse.json({
        valid: true,
        couponId: coupon.id,
        name: coupon.name || code.toUpperCase(),
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off
          ? (coupon.amount_off / 100).toFixed(2)
          : null,
        currency: coupon.currency,
      });
    }

    return NextResponse.json({ valid: false, error: "Ungültiger Code." });
  } catch {
    return NextResponse.json({ valid: false, error: "Ungültiger Code." });
  }
}
