import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

interface RegisterBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function POST(request: Request) {
  try {
    const { email, password, firstName, lastName } =
      (await request.json()) as RegisterBody;

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Alle Felder sind erforderlich." },
        { status: 400 }
      );
    }

    const res = await fetch(`${WOO_URL}/wp-json/wc/v3/customers`, {
      method: "POST",
      headers: {
        Authorization: AUTH_HEADER,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        username: email,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      const message =
        err.message || "Registrierung fehlgeschlagen.";
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const customer = await res.json();

    const cookieStore = await cookies();
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    } as const;

    cookieStore.set("woo_customer_id", String(customer.id), opts);
    cookieStore.set("woo_customer_email", customer.email, opts);

    return NextResponse.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registrierung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
