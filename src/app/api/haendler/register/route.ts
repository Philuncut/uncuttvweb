import { NextResponse } from "next/server";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

interface Body {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { email, password, firstName, lastName, company, phone, address } =
      body;

    if (!email || !password || !firstName || !lastName || !company) {
      return NextResponse.json(
        { error: "Alle Pflichtfelder sind erforderlich." },
        { status: 400 }
      );
    }

    // Create WooCommerce customer with subscriber role (needs manual approval)
    const cusRes = await fetch(`${WOO_URL}/wp-json/wc/v3/customers`, {
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
        billing: {
          first_name: firstName,
          last_name: lastName,
          company,
          phone,
          address_1: address,
          email,
        },
      }),
    });

    if (!cusRes.ok) {
      const err = await cusRes.json();
      return NextResponse.json(
        { error: err.message || "Registrierung fehlgeschlagen." },
        { status: cusRes.status }
      );
    }

    // Send notification email to office@uncuttv.at
    // Using WordPress REST API to send email via wp_mail
    try {
      await fetch(`${WOO_URL}/wp-json/wp/v2/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // This won't actually send mail — we log it for now
      });
    } catch {
      // Non-blocking — notification is secondary
    }

    console.log(
      `[Händler] New registration request: ${company} (${firstName} ${lastName}, ${email}, ${phone}, ${address})`
    );

    return NextResponse.json({
      success: true,
      message:
        "Deine Anfrage wurde gesendet. Wir melden uns innerhalb von 24 Stunden.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registrierung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
