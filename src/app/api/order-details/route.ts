import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");

  try {
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items"],
      });

      const items =
        session.line_items?.data.map((item) => ({
          description: item.description,
          quantity: item.quantity ?? 1,
          amount: item.amount_total ?? 0,
        })) ?? [];

      const shippingCents =
        session.total_details?.amount_shipping != null
          ? session.total_details.amount_shipping
          : 0;

      return NextResponse.json({
        customerName: session.customer_details?.name || "",
        customerEmail: session.customer_details?.email || "",
        total: ((session.amount_total ?? 0) / 100).toFixed(2),
        currency: session.currency || "eur",
        items,
        shippingCents,
        isWholesaleShipping: false,
      });
    }

    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Parse cart items from PI metadata
      interface CartMeta {
        id: number;
        name: string;
        qty: number;
        price: string;
      }
      const cartItems: CartMeta[] = JSON.parse(
        pi.metadata?.cart_items || "[]"
      );

      const items = cartItems.map((item) => ({
        description: item.name,
        quantity: item.qty,
        amount: Math.round(parseFloat(item.price) * 100) * item.qty,
      }));

      const shippingMeta = parseInt(pi.metadata?.shipping_cents ?? "", 10);
      const shippingCents =
        Number.isFinite(shippingMeta) && shippingMeta > 0 ? shippingMeta : 0;
      const isWholesaleShipping = pi.metadata?.is_wholesale === "true";

      // Try to get customer email from the payment method's billing details
      let customerEmail = "";
      let customerName = "";
      if (pi.latest_charge) {
        try {
          const charge = await stripe.charges.retrieve(
            pi.latest_charge as string
          );
          customerEmail = charge.billing_details?.email || "";
          customerName = charge.billing_details?.name || "";
        } catch {
          // charge not available yet
        }
      }

      return NextResponse.json({
        customerName,
        customerEmail,
        total: (pi.amount / 100).toFixed(2),
        currency: pi.currency || "eur",
        items,
        shippingCents,
        isWholesaleShipping,
      });
    }

    return NextResponse.json(
      { error: "Keine Session-ID oder PaymentIntent-ID." },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Bestellung nicht gefunden." },
      { status: 404 }
    );
  }
}
