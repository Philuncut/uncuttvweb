import { createHash } from "crypto";
import jwt from "jsonwebtoken";

/**
 * Vom JWT zur belastbaren Identität.
 *
 * Vorher entschied allein die Anwesenheit eines Cookies darüber, wer jemand
 * ist. Ab hier entscheidet das Token: Wer keines mit gültiger Signatur hat,
 * ist niemand, und wer eines hat, ist genau der Nutzer, den WordPress dazu
 * nennt. Mailadresse und Rollen kommen deshalb aus WordPress und nie mehr
 * aus einem Cookie, das der Browser mitschickt.
 *
 * Ein einziger Aufruf beantwortet alle drei Fragen: `/wp/v2/users/me` mit
 * dem Token als Bearer sagt, ob das Token gilt, wem es gehört und welche
 * Rollen der Nutzer hat. `jwt-auth/v1/token/validate` bräuchte für die
 * letzten beiden Punkte einen zweiten Aufruf.
 */

const WOO_URL = process.env.WOOCOMMERCE_URL ?? "";

/**
 * Der Signaturschlüssel des JWT-Plugins, falls hinterlegt.
 *
 * Optional mit Absicht: Ohne ihn läuft alles, nur eben mit einem Aufruf
 * nach WordPress je Token und Minute. Ist er gesetzt, fliegen gefälschte
 * und abgelaufene Tokens schon hier raus, ohne das Netz zu berühren. Der
 * Wert ist JWT_AUTH_SECRET_KEY aus der wp-config.php.
 */
const JWT_SECRET = process.env.WP_JWT_SECRET?.trim() || "";

/** Wie lange eine geprüfte Identität gilt, bevor erneut gefragt wird. */
const CACHE_TTL_MS = 60_000;

/** Obergrenze für den Zwischenspeicher, damit er nicht unbegrenzt wächst. */
const CACHE_MAX = 5_000;

const REQUEST_TIMEOUT_MS = 8_000;

export type WpIdentity = {
  /** WordPress-Benutzernummer. WooCommerce führt Kunden unter derselben. */
  wpUserId: number;
  email: string;
  roles: string[];
};

export type IdentityResult =
  /** Token gültig, Identität steht fest. */
  | { status: "ok"; identity: WpIdentity }
  /** Token fehlt, ist gefälscht oder abgelaufen. Der Nutzer ist abgemeldet. */
  | { status: "invalid" }
  /** WordPress antwortet nicht. Keine Aussage möglich, also kein Zugriff. */
  | { status: "unavailable" };

type CacheEntry = { at: number; result: IdentityResult };

const cache = new Map<string, CacheEntry>();

function cacheKey(token: string): string {
  // Das Token selbst ist ein Geheimnis und beliebig lang. Als Schlüssel
  // genügt sein Abdruck.
  return createHash("sha256").update(token).digest("hex");
}

function readCache(key: string): IdentityResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(key: string, result: IdentityResult): void {
  if (cache.size >= CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.at > CACHE_TTL_MS) cache.delete(k);
    }
    // Immer noch voll: Der älteste Eintrag geht, damit ein Ansturm den
    // Speicher nicht sprengt.
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  }
  cache.set(key, { at: Date.now(), result });
}

/** Nur für Tests: setzt den Zwischenspeicher zurück. */
export function resetIdentityCache(): void {
  cache.clear();
}

/**
 * Prüft, was sich ohne Netz prüfen lässt.
 *
 * Mit Schlüssel ist das die vollständige Prüfung von Signatur und Ablauf.
 * Ohne Schlüssel wird nur das Ablaufdatum gelesen. Das ist keine
 * Sicherheitsprüfung, denn die Nutzlast ist ungeprüft — es spart nur den
 * Gang nach WordPress bei einem Token, das ohnehin abgelaufen ist. Ein
 * gefälschtes Ablaufdatum bringt niemanden weiter, WordPress lehnt es
 * gleich danach ab.
 */
function checkLocally(token: string): "ok" | "invalid" {
  if (JWT_SECRET) {
    try {
      jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
      return "ok";
    } catch {
      return "invalid";
    }
  }

  try {
    const payload = jwt.decode(token);
    if (payload && typeof payload === "object") {
      const exp = (payload as { exp?: unknown }).exp;
      if (typeof exp === "number" && exp * 1000 <= Date.now()) {
        return "invalid";
      }
    }
  } catch {
    // Nicht lesbar. Dann entscheidet WordPress.
  }
  return "ok";
}

function parseIdentity(payload: unknown): WpIdentity | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;

  const wpUserId = Number(raw.id);
  if (!Number.isInteger(wpUserId) || wpUserId <= 0) return null;

  const email = typeof raw.email === "string" ? raw.email.trim() : "";

  const roles = Array.isArray(raw.roles)
    ? raw.roles
        .filter((role): role is string => typeof role === "string")
        .map((role) => role.toLowerCase())
    : [];

  return { wpUserId, email, roles };
}

/**
 * Löst ein Token in eine Identität auf.
 *
 * Das Ergebnis wird kurz zwischengespeichert, damit ein Seitenaufruf mit
 * mehreren Anfragen nur einen Gang nach WordPress auslöst. Ein Ausfall
 * wird bewusst nicht gespeichert, sonst bliebe eine Minute lang niemand
 * angemeldet, nachdem WordPress wieder da ist.
 */
export async function resolveIdentity(token: string): Promise<IdentityResult> {
  const trimmed = token.trim();
  if (!trimmed) return { status: "invalid" };

  const key = cacheKey(trimmed);
  const cached = readCache(key);
  if (cached) return cached;

  if (checkLocally(trimmed) === "invalid") {
    const result: IdentityResult = { status: "invalid" };
    writeCache(key, result);
    return result;
  }

  if (!WOO_URL) return { status: "unavailable" };

  let response: Response;
  try {
    response = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me?context=edit`, {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { status: "unavailable" };
  }

  if (response.status === 401 || response.status === 403) {
    const result: IdentityResult = { status: "invalid" };
    writeCache(key, result);
    return result;
  }

  if (!response.ok) return { status: "unavailable" };

  let identity: WpIdentity | null;
  try {
    identity = parseIdentity(await response.json());
  } catch {
    return { status: "unavailable" };
  }

  if (!identity) return { status: "unavailable" };

  const result: IdentityResult = { status: "ok", identity };
  writeCache(key, result);
  return result;
}
