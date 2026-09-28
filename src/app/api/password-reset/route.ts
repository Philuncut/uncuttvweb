import { NextResponse } from "next/server";
import {
  identityFailureResponse,
  identityRequestPasswordReset,
} from "@/lib/identity-server";
import { SITE_URL } from "@/lib/product-seo";

export const dynamic = "force-dynamic";

/**
 * "Passwort vergessen": die Passwortmail über den Identitätsdienst.
 *
 * Vorher ging diese Route an wp-login.php?action=lostpassword. WordPress
 * schickte seine Mail, der Nutzer setzte auf der WordPress-Seite ein neues
 * Passwort, und Supabase behielt das alte: Shop ja, App und uncuttv.app
 * "E-Mail oder Passwort falsch". Der Dienst gleicht nur von Supabase nach
 * WordPress an, nie umgekehrt, also war der Weg von Anfang an falsch.
 *
 * Jetzt: Der Dienst verschickt die Mail aus Supabase, der Link führt auf
 * /passwort-vergessen/neu mit einer Wiederherstellungssitzung, und dort
 * setzt der Dienst das neue Passwort an beiden Stellen.
 *
 * Antwort: 200 für jede gültige Adresse, ob bekannt oder nicht; das sagt
 * der Dienst selbst so. Ein Ausfall oder ein nicht erlaubtes
 * Rückleitungsziel (ALLOWED_ORIGINS des Dienstes) kommt als Fehler zurück,
 * damit eine Fehlkonfiguration nicht als "Mail ist unterwegs" durchgeht.
 */
export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Ungültige E-Mail-Adresse." },
      { status: 400 }
    );
  }

  const redirectTo = `${SITE_URL}/passwort-vergessen/neu`;
  const result = await identityRequestPasswordReset(
    email,
    redirectTo,
    request.headers
  );

  if (!result.ok) {
    if (result.failure.kind === "invalid") {
      // Meist: das Rückleitungsziel steht beim Dienst nicht in
      // ALLOWED_ORIGINS. Das ist ein Betriebsfehler, kein Nutzerfehler.
      console.error(
        "[PasswordReset] Dienst lehnt ab:",
        result.failure.message ?? "ohne Meldung",
        "redirectTo:",
        redirectTo
      );
      return NextResponse.json(
        {
          error:
            "Passwort zurücksetzen ist derzeit nicht möglich. Bitte versuche es später noch einmal oder melde dich bei office@uncuttv.at.",
        },
        { status: 503 }
      );
    }
    return identityFailureResponse(result.failure);
  }

  return NextResponse.json({ success: true });
}
