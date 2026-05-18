import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { parsePrice } from "@/lib/parse-price";

interface CartMeta {
  id: number;
  name: string;
  qty: number;
  price: string;
}

function parseCartMeta(raw: string | undefined): CartMeta[] {
  try {
    return JSON.parse(raw || "[]") as CartMeta[];
  } catch {
    return [];
  }
}

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

      // WooCommerce product IDs for Meta tracking — stored in session metadata
      const cartMeta = parseCartMeta(session.metadata?.cart_items);
      const line_items = cartMeta.map((item) => ({
        product_id: String(item.id),
        name: item.name,
        quantity: item.qty,
        price: parsePrice(item.price),
      }));

      return NextResponse.json({
        customerName: session.customer_details?.name || "",
        customerEmail: session.customer_details?.email || "",
        total: ((session.amount_total ?? 0) / 100).toFixed(2),
        currency: session.currency || "eur",
        items,
        shippingCents,
        isWholesaleShipping: false,
        line_items,
      });
    }

    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      const cartMeta = parseCartMeta(pi.metadata?.cart_items);

      const items = cartMeta.map((item) => ({
        description: item.name,
        quantity: item.qty,
        amount: Math.round(parsePrice(item.price) * 100) * item.qty,
      }));

      const line_items = cartMeta.map((item) => ({
        product_id: String(item.id),
        name: item.name,
        quantity: item.qty,
        price: parsePrice(item.price),
      }));

      const shippingMeta = parseInt(pi.metadata?.shipping_cents ?? "", 10);
      const shippingCents =
        Number.isFinite(shippingMeta) && shippingMeta > 0 ? shippingMeta : 0;
      const isWholesaleShipping = pi.metadata?.is_wholesale === "true";
      const shippingMethodTitle =
        typeof pi.metadata?.shipping_method_title === "string"
          ? pi.metadata.shipping_method_title.trim()
          : "";
      const shippingCountry =
        typeof pi.metadata?.shipping_country === "string"
          ? pi.metadata.shipping_country.trim().toUpperCase()
          : "";

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
        shippingMethodTitle: shippingMethodTitle || undefined,
        shippingCountry: shippingCountry || undefined,
        line_items,
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
