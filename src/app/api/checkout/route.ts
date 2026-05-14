import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type { CartItem } from "@/lib/CartContext";
import { parsePrice } from "@/lib/parse-price";

interface CheckoutBody {
  items: CartItem[];
  couponId?: string;
  email?: string;
}

export async function POST(request: Request) {
  try {
    const { items, couponId, email } = (await request.json()) as CheckoutBody;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Warenkorb ist leer." },
        { status: 400 }
      );
    }

    const line_items = items.map((item) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: item.product.name,
          images: item.product.images[0]?.src
            ? [item.product.images[0].src]
            : [],
        },
        unit_amount: Math.round(parsePrice(item.product.price) * 100),
      },
      quantity: item.quantity,
    }));

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] =
      {
        mode: "payment",
        line_items,
        success_url: `${request.headers.get("origin")}/bestellung/erfolg?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${request.headers.get("origin")}/shop`,
        allow_promotion_codes: !couponId,
        shipping_address_collection: {
          allowed_countries: ["AT", "DE", "CH"],
        },
        metadata: {
          cart_items: JSON.stringify(
            items.map((i) => ({
              id: i.product.id,
              name: i.product.name,
              qty: i.quantity,
              price: i.product.price,
            }))
          ),
        },
      };

    if (email) {
      sessionParams.customer_email = email;
    }

    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
