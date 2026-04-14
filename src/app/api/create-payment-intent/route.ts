import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type { CartItem } from "@/lib/CartContext";

interface Body {
  items: CartItem[];
  couponId?: string;
}

export async function POST(request: Request) {
  console.log("[Stripe Debug] SECRET_KEY prefix:", process.env.STRIPE_SECRET_KEY?.slice(0, 20));
  try {
    const { items, couponId } = (await request.json()) as Body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Warenkorb ist leer." },
        { status: 400 }
      );
    }

    let totalCents = items.reduce((sum, item) => {
      return sum + Math.round(parseFloat(item.product.price) * 100) * item.quantity;
    }, 0);

    // Apply coupon discount if provided
    let discountLabel = "";
    if (couponId) {
      try {
        const coupon = await stripe.coupons.retrieve(couponId);
        if (coupon.valid) {
          if (coupon.percent_off) {
            const discount = Math.round(totalCents * (coupon.percent_off / 100));
            totalCents -= discount;
            discountLabel = `-${coupon.percent_off}%`;
          } else if (coupon.amount_off) {
            totalCents = Math.max(0, totalCents - coupon.amount_off);
            discountLabel = `-€${(coupon.amount_off / 100).toFixed(2)}`;
          }
        }
      } catch {
        // Invalid coupon — ignore silently, charge full price
      }
    }

    if (totalCents < 50) {
      return NextResponse.json(
        { error: "Mindestbestellwert nicht erreicht." },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        cart_items: JSON.stringify(
          items.map((i) => ({
            id: i.product.id,
            name: i.product.name,
            qty: i.quantity,
            price: i.product.price,
          }))
        ),
        coupon: couponId || "",
        discount: discountLabel,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PaymentIntent fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
