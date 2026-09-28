import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  identityChangePasswordWithRecovery,
  identityFailureResponse,
} from "@/lib/identity-server";
import { resetIdentityCache } from "@/lib/wp-identity";

interface Body {
  accessToken?: unknown;
  newPassword?: unknown;
}

export const dynamic = "force-dynamic";

/**
 * Neues Passwort nach dem Reset-Link, ohne altes Passwort.
 *
 * Das access_token stammt aus dem Fragment der Adresse, auf die die
 * Passwortmail führt (/passwort-vergessen/neu). Es ist eine Supabase-
 * Wiederherstellungssitzung; der Dienst prüft am Token selbst, dass sie
 * frisch ist (höchstens 15 Minuten), und setzt das neue Passwort an beiden
 * Stellen, WordPress und Supabase. Der Shop prüft und setzt selbst nichts.
 *
 * Kommt ein WordPress-Token zurück, wird der Nutzer damit angemeldet und
 * landet gleich im Konto. Ohne Token ist das Passwort trotzdem gesetzt; er
 * meldet sich dann gewöhnlich an.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (!accessToken) {
    return NextResponse.json(
      { error: "Der Link ist ungültig oder abgelaufen.", code: "recovery_expired" },
      { status: 401 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Das neue Passwort muss mindestens 8 Zeichen lang sein." },
      { status: 400 }
    );
  }

  const changed = await identityChangePasswordWithRecovery(
    accessToken,
    newPassword,
    request.headers
  );

  if (!changed.ok) {
    if (changed.failure.kind === "rejected") {
      // Beim Recovery-Weg heisst 401: die Sitzung ist keine frische
      // Wiederherstellung mehr. Die Login-Meldung wäre irreführend.
      return NextResponse.json(
        {
          error:
            "Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an.",
          code: "recovery_expired",
        },
        { status: 401 }
      );
    }
    return identityFailureResponse(changed.failure);
  }

  if (changed.wordpressToken) {
    const cookieStore = await cookies();
    cookieStore.set("woo_token", changed.wordpressToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    resetIdentityCache();
  }

  return NextResponse.json({
    success: true,
    signedIn: Boolean(changed.wordpressToken),
  });
}
