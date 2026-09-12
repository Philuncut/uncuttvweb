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

export const dynamic = "force-dynamic";

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
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json();
      const message = err.message || "Registrierung fehlgeschlagen.";
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const customer = await res.json();

    // Direkt nach dem Anlegen ein Token holen. Vorher setzte diese Route nur
    // Nummer und Mailadresse als Cookies, aber kein Token: Der frisch
    // registrierte Nutzer galt für /api/auth/session als abgemeldet, für
    // /konto und /api/auth/me aber als angemeldet. Ohne Token gibt es jetzt
    // gar keine Sitzung mehr, also muss es hier entstehen.
    let token = "";
    try {
      const jwtRes = await fetch(`${WOO_URL}/wp-json/jwt-auth/v1/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
        cache: "no-store",
      });
      if (jwtRes.ok) {
        const jwtData = await jwtRes.json();
        token = typeof jwtData.token === "string" ? jwtData.token : "";
      }
    } catch {
      // Konto steht, nur die Anmeldung klappte nicht. Der Nutzer meldet
      // sich dann von Hand an.
    }

    if (token) {
      const cookieStore = await cookies();
      const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      } as const;

      cookieStore.set("woo_token", token, opts);
      cookieStore.set("woo_customer_id", String(customer.id), opts);
      cookieStore.set("woo_customer_email", customer.email, opts);
      cookieStore.set("woo_customer_name", customer.first_name ?? "", {
        ...opts,
        httpOnly: false,
      });
    }

    return NextResponse.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      // Ohne Token muss sich der Nutzer einmal anmelden. Das Frontend kann
      // darauf reagieren, statt ihn in eine halbe Sitzung laufen zu lassen.
      signedIn: Boolean(token),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registrierung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
