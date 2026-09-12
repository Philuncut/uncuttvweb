import { WHOLESALE_ROLE } from "@/lib/auth-constants";
import type { IdentityResult } from "@/lib/wp-identity";

/**
 * Die Entscheidung selbst, ohne Next.
 *
 * Hier steht, was aus einem oder zwei Tokens folgt. Cookies und
 * HTTP-Antworten kommen erst in auth-session.ts dazu. Die Trennung ist
 * kein Selbstzweck: `next/headers` lässt sich außerhalb eines Next-Builds
 * nicht laden, und genau diese Regeln sollen sich testen lassen.
 */

export type SessionSource = "haendler" | "customer";

export type VerifiedSession = {
  /** WordPress-Benutzernummer, zugleich die WooCommerce-Kundennummer. */
  wpUserId: number;
  customerId: number;
  email: string;
  roles: string[];
  isWholesale: boolean;
  /** Über welches Cookie das Token kam. Nur für die Anzeige relevant. */
  source: SessionSource;
  /** Das geprüfte Token, für weitere Aufrufe im Namen des Nutzers. */
  token: string;
};

export type SessionResult =
  | { status: "ok"; session: VerifiedSession }
  /** Kein Token vorhanden. */
  | { status: "anonymous" }
  /** Token vorhanden, aber gefälscht oder abgelaufen. */
  | { status: "invalid" }
  /** WordPress antwortet nicht. Keine Aussage möglich. */
  | { status: "unavailable" };

export type TokenCandidate = { token: string; source: SessionSource };

/**
 * Zugang zum Händlerportal.
 *
 * Administratoren und Shop-Manager dürfen hinein, gelten aber weiterhin
 * nicht als Händler — sonst würden sie im normalen Shop umgeleitet.
 */
const PORTAL_ROLES = new Set([WHOLESALE_ROLE, "administrator", "shop_manager"]);

export function mayEnterHaendlerPortal(session: VerifiedSession): boolean {
  return session.roles.some((role) => PORTAL_ROLES.has(role));
}

/**
 * Die Absage, die aus einem Ergebnis folgt. null heißt: durchlassen.
 *
 * Bewusst hier und nicht erst in der HTTP-Schicht, damit sich die
 * Statuscodes und das Aufräumen der Cookies ohne laufendes Next prüfen
 * lassen.
 */
export type Denial = {
  status: 401 | 403 | 503;
  error: string;
  /** Nur bei einem ungültigen Token. Ein Ausfall löscht nichts. */
  clearCookies: boolean;
};

export function denialForSession(result: SessionResult): Denial | null {
  if (result.status === "ok") return null;

  if (result.status === "unavailable") {
    // Das Token ist womöglich tadellos, wir können es gerade nur nicht
    // prüfen. Wer hier seine Cookies verlöre, wäre nach einem kurzen
    // WordPress-Ausfall dauerhaft abgemeldet.
    return {
      status: 503,
      error: "Anmeldung derzeit nicht prüfbar.",
      clearCookies: false,
    };
  }

  return {
    status: 401,
    error: "Nicht angemeldet.",
    // Abgelaufen oder gefälscht: Die Cookies halten dreißig Tage, das Token
    // sieben. Ohne Aufräumen liefe der Nutzer wochenlang in 401 nach 401.
    clearCookies: result.status === "invalid",
  };
}

export function denialForPortal(session: VerifiedSession): Denial | null {
  return mayEnterHaendlerPortal(session)
    ? null
    : { status: 403, error: "Zugriff verweigert.", clearCookies: false };
}

export function denialForWholesale(session: VerifiedSession): Denial | null {
  return session.isWholesale
    ? null
    : { status: 403, error: "Zugriff verweigert.", clearCookies: false };
}

export type OrderCustomerReason =
  /** Geprüfte Sitzung, Nummer stammt aus dem Token. */
  | "verified"
  /** Niemand angemeldet. Der Normalfall einer Gastbestellung. */
  | "anonymous"
  /** Token gefälscht oder abgelaufen. Etwaige Nummern-Cookies ignoriert. */
  | "invalid-token"
  /** WordPress antwortet nicht. Die Bestellung darf daran nicht scheitern. */
  | "wordpress-unavailable"
  /** Kein Anfragekontext, etwa aus einem Webhook heraus. */
  | "no-request-context";

export type OrderCustomer = {
  /** 0 bedeutet Gastbestellung. */
  customerId: number;
  reason: OrderCustomerReason;
};

/**
 * Wem wird eine Bestellung zugeordnet?
 *
 * Geprüfte Sitzung: die Nummer aus dem Token. Sonst immer Gastbestellung,
 * auch bei einem ungültigen Token und auch, wenn WordPress gerade nicht
 * antwortet. Eine bezahlte Bestellung darf daran nicht scheitern, und ein
 * Cookie mit einer Kundennummer wird ignoriert statt geglaubt.
 */
export function orderCustomerFor(result: SessionResult): OrderCustomer {
  switch (result.status) {
    case "ok":
      return { customerId: result.session.customerId, reason: "verified" };
    case "unavailable":
      return { customerId: 0, reason: "wordpress-unavailable" };
    case "invalid":
      return { customerId: 0, reason: "invalid-token" };
    default:
      return { customerId: 0, reason: "anonymous" };
  }
}

/** Sammelt die Tokens aus den Cookies, ohne Doppelte. */
export function collectCandidates(
  haendlerToken: string | undefined,
  customerToken: string | undefined
): TokenCandidate[] {
  const candidates: TokenCandidate[] = [];

  // Dieselbe Reihenfolge wie bisher: Wer im Händlerportal angemeldet ist,
  // wird auch als solcher behandelt.
  const haendler = haendlerToken?.trim();
  if (haendler) candidates.push({ token: haendler, source: "haendler" });

  const customer = customerToken?.trim();
  if (customer && customer !== haendler) {
    candidates.push({ token: customer, source: "customer" });
  }

  return candidates;
}

/**
 * Vom Token zur Sitzung.
 *
 * Ein Ausfall wird nicht zu "abgelehnt" verkürzt: Wer wegen eines
 * WordPress-Ausfalls abgewiesen wird, soll nicht auch noch seine Cookies
 * verlieren.
 */
export async function resolveSession(
  candidates: TokenCandidate[],
  resolve: (token: string) => Promise<IdentityResult>
): Promise<SessionResult> {
  if (candidates.length === 0) return { status: "anonymous" };

  let sawUnavailable = false;

  for (const candidate of candidates) {
    const result = await resolve(candidate.token);

    if (result.status === "ok") {
      const { identity } = result;
      return {
        status: "ok",
        session: {
          wpUserId: identity.wpUserId,
          customerId: identity.wpUserId,
          email: identity.email,
          roles: identity.roles,
          isWholesale: identity.roles.includes(WHOLESALE_ROLE),
          source: candidate.source,
          token: candidate.token,
        },
      };
    }

    if (result.status === "unavailable") sawUnavailable = true;
  }

  return sawUnavailable ? { status: "unavailable" } : { status: "invalid" };
}
