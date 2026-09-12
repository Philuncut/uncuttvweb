import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-session";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  // Die Kundennummer kommt aus dem geprüften Token. Vorher stand sie in
  // einem Cookie, das der Aufrufer selbst setzen konnte — damit ließen sich
  // fremde Rechnungs- und Lieferadressen überschreiben.
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { session } = auth;

  try {
    const body = await request.json();

    const res = await fetch(
      `${WOO_URL}/wp-json/wc/v3/customers/${session.customerId}`,
      {
        method: "PUT",
        headers: {
          Authorization: AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    const responseText = await res.text();

    if (!res.ok) {
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

    return NextResponse.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      billing: customer.billing,
      shipping: customer.shipping,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aktualisierung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
