import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const customerId =
      cookieStore.get("woo_customer_id")?.value ||
      cookieStore.get("haendler_id")?.value;

    if (!customerId) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const body = await request.json();

    console.log("[Update] Customer ID:", customerId);
    console.log("[Update] Request body:", JSON.stringify(body, null, 2));
    console.log("[Update] Shipping being saved:", JSON.stringify(body.shipping, null, 2));
    console.log("[Update] Billing being saved:", JSON.stringify(body.billing, null, 2));
    console.log("[Update] Meta data being saved:", JSON.stringify(body.meta_data, null, 2));

    const wooUrl = `${WOO_URL}/wp-json/wc/v3/customers/${customerId}`;
    console.log("[Update] PUT to:", wooUrl);

    const res = await fetch(wooUrl, {
      method: "PUT",
      headers: {
        Authorization: AUTH_HEADER,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    console.log("[Update] WooCommerce response status:", res.status);

    if (!res.ok) {
      console.log("[Update] WooCommerce error:", responseText.slice(0, 500));
      let errMsg = "Aktualisierung fehlgeschlagen.";
      try {
        const err = JSON.parse(responseText);
        errMsg = err.message || errMsg;
      } catch {
        // not JSON
      }
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const customer = JSON.parse(responseText);
    console.log("[Update] WooCommerce returned shipping:", JSON.stringify(customer.shipping, null, 2));
    console.log("[Update] WooCommerce returned billing:", JSON.stringify(customer.billing, null, 2));
    console.log("[Update] WooCommerce returned meta_data (uid):",
      JSON.stringify(customer.meta_data?.filter((m: { key: string }) => m.key === "uid_nummer"), null, 2)
    );

    return NextResponse.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      billing: customer.billing,
      shipping: customer.shipping,
    });
  } catch (error) {
    console.error("[Update] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Aktualisierung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
