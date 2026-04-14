import { NextResponse } from "next/server";

interface CartMeta {
  id: number;
  name: string;
  qty: number;
  price: string;
}

interface Body {
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    street: string;
    zip: string;
    city: string;
    country: string;
  };
  items: CartMeta[];
}

export async function POST(request: Request) {
  try {
    const { customer, items } = (await request.json()) as Body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Keine Artikel." },
        { status: 400 }
      );
    }

    const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
    const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
    const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;

    const orderData = {
      status: "pending",
      payment_method: "bacs",
      payment_method_title: "Überweisung",
      set_paid: false,
      billing: {
        first_name: customer.firstName,
        last_name: customer.lastName,
        email: customer.email,
        address_1: customer.street,
        city: customer.city,
        postcode: customer.zip,
        country: customer.country,
      },
      shipping: {
        first_name: customer.firstName,
        last_name: customer.lastName,
        address_1: customer.street,
        city: customer.city,
        postcode: customer.zip,
        country: customer.country,
      },
      line_items: items.map((item) => ({
        product_id: item.id,
        quantity: item.qty,
        total: (parseFloat(item.price) * item.qty).toFixed(2),
      })),
    };

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
      error instanceof Error ? error.message : "Bestellung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
