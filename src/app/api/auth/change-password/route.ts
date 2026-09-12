import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth-session";
import { resetIdentityCache } from "@/lib/wp-identity";

const WOO_URL = process.env.WOOCOMMERCE_URL!;

interface Body {
  currentPassword: string;
  newPassword: string;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Die Mailadresse, gegen die das alte Passwort geprüft wird, stammt aus
  // dem geprüften Token. Vorher kam sie aus einem Cookie, ließ sich also
  // auf ein fremdes Konto umbiegen.
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { session } = auth;

  try {
    const { currentPassword, newPassword } = (await request.json()) as Body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Alle Felder sind erforderlich." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Das neue Passwort muss mindestens 8 Zeichen lang sein." },
        { status: 400 }
      );
    }

    // Altes Passwort gegenprüfen.
    const jwtRes = await fetch(`${WOO_URL}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: session.email,
        password: currentPassword,
      }),
      cache: "no-store",
    });

    if (!jwtRes.ok) {
      return NextResponse.json(
        { error: "Aktuelles Passwort ist falsch." },
        { status: 401 }
      );
    }

    const jwtData = await jwtRes.json();
    const freshToken = jwtData.token || session.token;

    const updateRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
      cache: "no-store",
    });

    if (!updateRes.ok) {
      return NextResponse.json(
        { error: "Passwort konnte nicht geändert werden." },
        { status: 500 }
      );
    }

    // Das alte Token gilt nach dem Wechsel nicht mehr. Ohne ein frisches
    // wäre der Nutzer bis zum nächsten Login ausgesperrt.
    const newJwtRes = await fetch(`${WOO_URL}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: session.email,
        password: newPassword,
      }),
      cache: "no-store",
    });

    if (newJwtRes.ok) {
      const newJwtData = await newJwtRes.json();
      if (newJwtData.token) {
        const cookieStore = await cookies();
        const opts = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        } as const;

        cookieStore.set("woo_token", newJwtData.token, opts);
        // Händler tragen dasselbe Token in ihrem Portal-Cookie. Bliebe es
        // stehen, prüfte die nächste Anfrage ein totes Token.
        if (cookieStore.get("haendler_token")) {
          cookieStore.set("haendler_token", newJwtData.token, opts);
        }
      }
    }

    // Der Zwischenspeicher kennt das alte Token noch als gültig.
    resetIdentityCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Fehler beim Ändern des Passworts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
