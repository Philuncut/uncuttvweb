import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

interface CartMeta {
  id: number;
  name: string;
  qty: number;
  price: string;
}

interface CustomerInfo {
  email: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  country: string;
}

interface SyncBody {
  // Stripe Checkout Session flow
  sessionId?: string;
  // Direct PaymentIntent flow
  paymentIntentId?: string;
  customer?: CustomerInfo;
  items?: CartMeta[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncBody;

    let cartItems: CartMeta[] = [];
    let billing: Record<string, string> = {};
    let shipping: Record<string, string> = {};
    let transactionId = "";

    if (body.sessionId) {
      // Stripe Checkout Session flow
      const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
        expand: ["customer_details", "line_items"],
      });

      if (session.payment_status !== "paid") {
        return NextResponse.json(
          { error: "Zahlung nicht abgeschlossen." },
          { status: 400 }
        );
      }

      cartItems = JSON.parse(session.metadata?.cart_items || "[]");
      transactionId = session.payment_intent as string;

      const customer = session.customer_details;
      const ship = session.shipping_details;

      billing = {
        first_name: customer?.name?.split(" ")[0] || "",
        last_name: customer?.name?.split(" ").slice(1).join(" ") || "",
        email: customer?.email || "",
        phone: customer?.phone || "",
        address_1: customer?.address?.line1 || "",
        address_2: customer?.address?.line2 || "",
        city: customer?.address?.city || "",
        postcode: customer?.address?.postal_code || "",
        country: customer?.address?.country || "",
      };

      shipping = {
        first_name: ship?.name?.split(" ")[0] || billing.first_name,
        last_name: ship?.name?.split(" ").slice(1).join(" ") || billing.last_name,
        address_1: ship?.address?.line1 || billing.address_1,
        address_2: ship?.address?.line2 || billing.address_2,
        city: ship?.address?.city || billing.city,
        postcode: ship?.address?.postal_code || billing.postcode,
        country: ship?.address?.country || billing.country,
      };
    } else if (body.paymentIntentId && body.customer && body.items) {
      // Direct PaymentIntent flow
      cartItems = body.items;
      transactionId = body.paymentIntentId;

      const c = body.customer;
      billing = {
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        address_1: c.street,
        city: c.city,
        postcode: c.zip,
        country: c.country,
      };
      shipping = { ...billing };
    } else {
      return NextResponse.json(
        { error: "Fehlende Daten." },
        { status: 400 }
      );
    }

    if (cartItems.length === 0) {
      return NextResponse.json(
        { error: "Keine Artikel gefunden." },
        { status: 400 }
      );
    }

    const orderData = {
      status: "processing",
      payment_method: "stripe",
      payment_method_title: "Stripe",
      set_paid: true,
      billing,
      shipping,
      line_items: cartItems.map((item) => ({
        product_id: item.id,
        quantity: item.qty,
        total: (parseFloat(item.price) * item.qty).toFixed(2),
      })),
      transaction_id: transactionId,
    };

    const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
    const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
    const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;

    const res = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString(
            "base64"
          ),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WooCommerce order creation failed: ${errText}`);
    }

    const order = await res.json();

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.number,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
