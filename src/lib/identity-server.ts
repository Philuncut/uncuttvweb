import { NextResponse } from "next/server";

/**
 * Serverseitiger Zugriff auf den Identitätsdienst unter id.uncuttv.at.
 *
 * Der Shop meldet über den Dienst an statt direkt gegen WordPress. Damit
 * gibt es genau eine Stelle, an der Zugangsdaten geprüft und Passwörter
 * gesetzt werden. Was der Shop vom Dienst braucht, ist das WordPress-JWT:
 * Profil, Adressen und der Händlerkatalog laufen weiter über die
 * WooCommerce-API, und die Sitzung des Shops hängt an genau diesem Token.
 *
 * Serverseitig und nicht aus dem Browser, weil das Token httpOnly bleiben
 * soll. Damit kommen alle Anmeldungen des Shops beim Dienst von den
 * Ausgangsadressen von Vercel an. Damit sie sich dort nicht eine Grenze je
 * Adresse teilen, gibt der Shop die Adresse des Endnutzers weiter: Mit dem
 * gemeinsamen Geheimnis aus IDENTITY_CALLER_SECRET weist er sich als
 * vertrauenswürdiger Aufrufer aus, und der Dienst zählt dann gegen die
 * mitgeschickte Adresse. Fehlt das Geheimnis, zählt er wie bisher gegen die
 * Adresse von Vercel. Eine 429 wird in beiden Fällen sauber gemeldet, nicht
 * als Fehler verschluckt.
 *
 * Bewusst ohne Rückfall auf jwt-auth/v1/token. Ein solcher Rückfall wäre
 * genau die zweite Stelle, die es nicht mehr geben soll.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export type IdentityFailure =
  /** Mailadresse oder Passwort stimmen nicht. */
  | { kind: "rejected" }
  /**
   * Supabase hat angenommen, WordPress nicht: Die Passwörter sind
   * auseinandergelaufen. Der Nutzer muss sein Passwort einmalig neu setzen,
   * erst das gleicht beide Seiten wieder an.
   */
  | { kind: "out-of-sync" }
  /** Der Dienst bremst. */
  | { kind: "rate-limited" }
  /** Eingabe abgelehnt, etwa ein zu kurzes neues Passwort. */
  | { kind: "invalid"; message?: string }
  /** Dienst oder WordPress nicht erreichbar, oder nicht konfiguriert. */
  | { kind: "unavailable" };

export type IdentityLoginResult =
  | {
      ok: true;
      wordpressToken: string;
      email: string;
      displayName: string;
    }
  | { ok: false; failure: IdentityFailure };

export type IdentityChangePasswordResult =
  | { ok: true; wordpressToken: string | null }
  | { ok: false; failure: IdentityFailure };

/** Adresse des Dienstes, ohne Schrägstrich am Ende. Aus der Umgebung. */
function baseUrl(): string | null {
  const raw = process.env.IDENTITY_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

type Antwort = { status: number; body: Record<string, unknown> | null };

/**
 * Die Adresse des Endnutzers aus den Kopfzeilen der eingehenden Anfrage.
 *
 * Auf Vercel steht sie in x-real-ip. Ersatzweise der erste Eintrag von
 * x-forwarded-for, das ist der Anfang der Kette und damit der Nutzer.
 * Lässt sie sich nicht bestimmen, null; ein leerer Wert wird nie geliefert.
 */
export function clientIpFrom(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

/**
 * Die Kopfzeilen, mit denen sich der Shop beim Dienst als
 * vertrauenswürdiger Aufrufer ausweist und die Adresse des Endnutzers
 * weitergibt.
 *
 * Ohne Geheimnis in der Umgebung gar keine: Eine Adresse ohne Ausweis
 * würde der Dienst ohnehin verwerfen, und der Shop soll dann zählen wie
 * bisher. Ohne bestimmbare Adresse nur das Geheimnis; ein leerer
 * Adresskopf wäre schlechter als keiner.
 */
function callerHeaders(requestHeaders: Headers | undefined): Record<string, string> {
  const secret = process.env.IDENTITY_CALLER_SECRET?.trim();
  if (!secret) return {};

  const headers: Record<string, string> = {
    "X-UncutTV-Caller-Secret": secret,
  };
  const ip = requestHeaders ? clientIpFrom(requestHeaders) : null;
  if (ip) headers["X-UncutTV-Client-IP"] = ip;
  return headers;
}

async function post(
  path: string,
  payload: unknown,
  requestHeaders?: Headers
): Promise<Antwort | null> {
  const base = baseUrl();
  if (!base) {
    console.error(
      "[identity] IDENTITY_URL ist nicht gesetzt, Anmeldung nicht möglich"
    );
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...callerHeaders(requestHeaders),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[identity] Aufruf fehlgeschlagen:", err);
    return null;
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // Kein Rumpf. Der Status genügt.
  }

  return { status: response.status, body };
}

function failureFor(antwort: Antwort | null): IdentityFailure {
  if (!antwort) return { kind: "unavailable" };
  if (antwort.status === 401) return { kind: "rejected" };
  if (antwort.status === 429) return { kind: "rate-limited" };
  if (antwort.status === 400) {
    const message =
      typeof antwort.body?.message === "string"
        ? antwort.body.message
        : undefined;
    return { kind: "invalid", message };
  }
  return { kind: "unavailable" };
}

/** Das Feld `wordpress` aus einer Antwort des Dienstes. */
function wordpressField(
  body: Record<string, unknown> | null
): { status: string; token: string | null } | null {
  const raw = body?.wordpress;
  if (!raw || typeof raw !== "object") return null;
  const field = raw as { status?: unknown; token?: unknown };
  if (typeof field.status !== "string") return null;
  return {
    status: field.status,
    token: typeof field.token === "string" && field.token ? field.token : null,
  };
}

/**
 * Anmeldung mit WordPress-Token.
 *
 * Aus der Supabase-Sitzung in der Antwort nimmt der Shop nur Mailadresse
 * und Anzeigename. Die Tokens der Sitzung legt er nicht ab: Nichts im Shop
 * benutzt sie, und unbenutzte Tokens in Cookies sind nur Angriffsfläche.
 *
 * `requestHeaders` sind die Kopfzeilen der Anfrage des Endnutzers an den
 * Shop; daraus geht dessen Adresse an den Dienst, damit er gegen sie zählt
 * statt gegen Vercel.
 */
export async function identityLogin(
  email: string,
  password: string,
  requestHeaders?: Headers
): Promise<IdentityLoginResult> {
  const antwort = await post(
    "/auth/login",
    {
      email,
      password,
      wordpressToken: true,
    },
    requestHeaders
  );

  if (!antwort || antwort.status !== 200) {
    return { ok: false, failure: failureFor(antwort) };
  }

  const wordpress = wordpressField(antwort.body);

  if (!wordpress) {
    console.error("[identity] Antwort ohne wordpress-Feld");
    return { ok: false, failure: { kind: "unavailable" } };
  }

  if (wordpress.status === "rejected") {
    return { ok: false, failure: { kind: "out-of-sync" } };
  }

  if (wordpress.status !== "ok" || !wordpress.token) {
    // 'unavailable' oder ein Status, den wir nicht kennen: Ohne Token gibt
    // es keine Shop-Sitzung, also ist es aus Sicht des Shops ein Ausfall.
    return { ok: false, failure: { kind: "unavailable" } };
  }

  const user =
    antwort.body?.user && typeof antwort.body.user === "object"
      ? (antwort.body.user as { email?: unknown; display_name?: unknown })
      : {};

  return {
    ok: true,
    wordpressToken: wordpress.token,
    email:
      typeof user.email === "string" && user.email.trim()
        ? user.email.trim()
        : email,
    displayName:
      typeof user.display_name === "string" ? user.display_name.trim() : "",
  };
}

/**
 * Passwortwechsel an beiden Stellen, WordPress und Supabase.
 *
 * Der Dienst prüft das aktuelle Passwort selbst. Kommt ein WordPress-Token
 * zurück, ist es mit dem neuen Passwort ausgestellt und kann die Sitzung
 * des Shops fortsetzen. Kommt keines, ist das Passwort trotzdem gesetzt;
 * nur das Token fehlt, etwa weil WordPress gerade nicht antwortet.
 *
 * `requestHeaders` wie bei identityLogin: Die Adresse des Endnutzers geht
 * an den Dienst, der Wechsel zählt gegen sie.
 */
export async function identityChangePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
  requestHeaders?: Headers
): Promise<IdentityChangePasswordResult> {
  const antwort = await post(
    "/auth/change-password",
    {
      email,
      currentPassword,
      newPassword,
      wordpressToken: true,
    },
    requestHeaders
  );

  if (!antwort || antwort.status !== 200) {
    return { ok: false, failure: failureFor(antwort) };
  }

  const wordpress = wordpressField(antwort.body);
  return {
    ok: true,
    wordpressToken: wordpress?.status === "ok" ? wordpress.token : null,
  };
}

/**
 * Die HTTP-Antwort zu einem Fehler des Dienstes.
 *
 * Jeder Fall bekommt seinen eigenen Status und eine Meldung, mit der der
 * Nutzer etwas anfangen kann. Ein Ausfall darf nicht wie ein falsches
 * Passwort aussehen, sonst ändert jemand ein Passwort, das stimmt.
 */
export function identityFailureResponse(failure: IdentityFailure): NextResponse {
  switch (failure.kind) {
    case "rejected":
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    case "out-of-sync":
      return NextResponse.json(
        {
          error:
            "Dein Passwort muss einmalig neu gesetzt werden, damit Shop und Konto wieder zusammenpassen.",
          code: "password_out_of_sync",
        },
        { status: 409 }
      );
    case "rate-limited":
      return NextResponse.json(
        { error: "Zu viele Versuche. Bitte warte einen Moment." },
        { status: 429 }
      );
    case "invalid":
      return NextResponse.json(
        { error: failure.message ?? "Ungültige Eingabe." },
        { status: 400 }
      );
    default:
      return NextResponse.json(
        {
          error:
            "Anmeldung derzeit nicht möglich. Bitte versuch es in ein paar Minuten erneut.",
        },
        { status: 503 }
      );
  }
}
