import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-session";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { session } = auth;

  try {
    // Kundennummer und Mailadresse stammen aus dem geprüften Token. Vorher
    // reichte ein selbst gesetztes Cookie `woo_customer_id`, um fremde
    // Kundendaten samt Bestellhistorie zu lesen.
    const customerId = session.customerId;

    const cusRes = await fetch(
      `${WOO_URL}/wp-json/wc/v3/customers/${customerId}`,
      {
        headers: {
          Authorization: AUTH_HEADER,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (cusRes.ok) {
      const customer = await cusRes.json();

      const ordRes = await fetch(
        `${WOO_URL}/wp-json/wc/v3/orders?customer=${customerId}&per_page=20&orderby=date&order=desc`,
        {
          headers: {
            Authorization: AUTH_HEADER,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      let orders: unknown[] = [];
      if (ordRes.ok) {
        orders = await ordRes.json();
      }

      return NextResponse.json({
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        role: session.roles[0] ?? "customer",
        billing: customer.billing,
        shipping: customer.shipping,
        meta_data: customer.meta_data || [],
        orders,
      });
    }

    // Kein WooCommerce-Kunde zur Nummer — typischerweise ein reines
    // WordPress-Konto wie ein Administrator. Die Bestellungen werden dann
    // über die geprüfte Mailadresse gesucht, nicht über ein Cookie.
    let orders: unknown[] = [];
    if (session.email) {
      const ordRes = await fetch(
        `${WOO_URL}/wp-json/wc/v3/orders?search=${encodeURIComponent(session.email)}&per_page=20&orderby=date&order=desc`,
        {
          headers: {
            Authorization: AUTH_HEADER,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );
      if (ordRes.ok) {
        orders = await ordRes.json();
      }
    }

    return NextResponse.json({
      id: session.wpUserId,
      email: session.email,
      firstName: "",
      lastName: "",
      role: session.roles[0] ?? "customer",
      billing: {},
      shipping: {},
      orders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fehler beim Laden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
