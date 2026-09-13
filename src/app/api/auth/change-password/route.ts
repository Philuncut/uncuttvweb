import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession } from "@/lib/auth-session";
import {
  identityChangePassword,
  identityFailureResponse,
} from "@/lib/identity-server";
import { resetIdentityCache } from "@/lib/wp-identity";

interface Body {
  email?: string;
  currentPassword: string;
  newPassword: string;
}

export const dynamic = "force-dynamic";

/**
 * Passwortwechsel über den Identitätsdienst, der beide Seiten setzt,
 * WordPress und Supabase. Der Shop prüft und setzt selbst nichts mehr.
 *
 * Zwei Wege hinein:
 *
 * - Mit Sitzung, aus dem Konto heraus. Die Mailadresse kommt aus der
 *   geprüften Sitzung; eine mitgeschickte wird ignoriert.
 * - Ohne Sitzung, aus dem Abgleichschritt der Anmeldung heraus. Dort gibt
 *   es noch keine Shop-Sitzung, weil ohne WordPress-Token keine entstehen
 *   kann. Dann muss die Mailadresse im Rumpf stehen. Geschützt ist der Weg
 *   durch das aktuelle Passwort, das der Dienst prüft, und dessen
 *   Ratenbegrenzung — dieselbe Hürde wie beim Login.
 */
export async function POST(request: Request) {
  const result = await readSession();

  if (result.status === "unavailable") {
    return NextResponse.json(
      { error: "Anmeldung derzeit nicht prüfbar." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

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

  const hasSession = result.status === "ok";
  const email = hasSession
    ? result.session.email
    : (typeof body.email === "string" ? body.email.trim().toLowerCase() : "");

  if (!email) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const changed = await identityChangePassword(
    email,
    currentPassword,
    newPassword,
    request.headers
  );

  if (!changed.ok) {
    // Beim Wechsel bedeutet eine Ablehnung: das aktuelle Passwort stimmt
    // nicht. Die allgemeine Login-Meldung wäre hier irreführend.
    if (changed.failure.kind === "rejected") {
      return NextResponse.json(
        { error: "Aktuelles Passwort ist falsch." },
        { status: 401 }
      );
    }
    return identityFailureResponse(changed.failure);
  }

  // Ohne Sitzung gibt es keine Cookies fortzusetzen. Das Formular meldet
  // sich danach von sich aus mit dem neuen Passwort an.
  if (!hasSession) {
    return NextResponse.json({ success: true });
  }

  // Mit Sitzung: das frische Token übernehmen, damit der Nutzer angemeldet
  // bleibt. Kommt keines, gilt das bisherige Token weiter; das JWT hängt
  // nicht am Passwort.
  if (changed.wordpressToken) {
    const cookieStore = await cookies();
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    } as const;

    cookieStore.set("woo_token", changed.wordpressToken, opts);
    // Händler tragen dasselbe Token in ihrem Portal-Cookie.
    if (cookieStore.get("haendler_token")) {
      cookieStore.set("haendler_token", changed.wordpressToken, opts);
    }

    // Der Zwischenspeicher kennt noch das alte Token.
    resetIdentityCache();
  }

  return NextResponse.json({ success: true });
}
