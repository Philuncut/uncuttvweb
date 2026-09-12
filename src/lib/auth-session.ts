import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  collectCandidates,
  type Denial,
  denialForPortal,
  denialForSession,
  denialForWholesale,
  mayEnterHaendlerPortal,
  resolveSession,
  type SessionResult,
  type SessionSource,
  type VerifiedSession,
} from "@/lib/session-core";
import { resolveIdentity } from "@/lib/wp-identity";

/**
 * Die eine Stelle, die entscheidet, wer eine Anfrage stellt.
 *
 * Jede geschützte Route und jede geschützte Seite fragt hier und sonst
 * nirgends. Vorher prüfte jede Stelle für sich, ob irgendein Cookie da
 * ist; die Cookies sind httpOnly, aber nicht signiert, und ein selbst
 * gesetztes genügte. Jetzt zählt allein das Token, und Nummer, Mailadresse
 * und Rollen stammen aus WordPress.
 *
 * Die Cookies bleiben als Transportmittel für das Token bestehen. Was in
 * ihnen sonst noch steht, wird nicht mehr geglaubt.
 */

const CUSTOMER_TOKEN_COOKIE = "woo_token";
const HAENDLER_TOKEN_COOKIE = "haendler_token";

/** Alles, was beim Abmelden und bei einem ungültigen Token verschwindet. */
export const SESSION_COOKIES = [
  "woo_customer_id",
  "woo_customer_email",
  "woo_customer_role",
  "woo_token",
  "woo_customer_name",
  "haendler_token",
  "haendler_id",
  "haendler_email",
  "haendler_role",
  "haendler_name",
] as const;

export { mayEnterHaendlerPortal };
export type { SessionResult, SessionSource, VerifiedSession };

/**
 * Liest die Sitzung, ohne etwas zu verändern.
 *
 * Auch in Server-Komponenten benutzbar. Cookies löschen kann sie nicht,
 * das geht laut Next nur in Route Handlers und Server Functions.
 */
export async function readSession(): Promise<SessionResult> {
  const cookieStore = await cookies();

  return resolveSession(
    collectCandidates(
      cookieStore.get(HAENDLER_TOKEN_COOKIE)?.value,
      cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value
    ),
    resolveIdentity
  );
}

/** Die Sitzung oder null. Für Seiten, die nur unterscheiden müssen. */
export async function getSession(): Promise<VerifiedSession | null> {
  const result = await readSession();
  return result.status === "ok" ? result.session : null;
}

/** Löscht alle Sitzungs-Cookies. Nur in Route Handlers aufrufbar. */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  for (const name of SESSION_COOKIES) {
    cookieStore.delete({ name, path: "/" });
  }
}

export type RouteAuth =
  | { session: VerifiedSession; response?: undefined }
  | { session?: undefined; response: NextResponse };

/** Macht aus einer Absage die HTTP-Antwort und raeumt gegebenenfalls auf. */
async function deny(denial: Denial): Promise<RouteAuth> {
  if (denial.clearCookies) await clearSessionCookies();
  return {
    response: NextResponse.json(
      { error: denial.error },
      { status: denial.status }
    ),
  };
}

/**
 * Für Route Handlers: entweder die geprüfte Sitzung oder die fertige
 * Absage. Welche Absage aus welchem Ergebnis folgt, steht in
 * session-core.ts und ist dort ohne laufendes Next prüfbar.
 */
export async function requireSession(): Promise<RouteAuth> {
  const result = await readSession();

  const denial = denialForSession(result);
  if (denial) return deny(denial);

  return { session: (result as { status: "ok"; session: VerifiedSession }).session };
}

/** Wie requireSession, verlangt zusätzlich die Händlerrolle. */
export async function requireWholesaleSession(): Promise<RouteAuth> {
  const auth = await requireSession();
  if (auth.response) return auth;

  const denial = denialForWholesale(auth.session);
  return denial ? deny(denial) : auth;
}

/** Wie requireSession, verlangt zusätzlich Zugang zum Händlerportal. */
export async function requirePortalSession(): Promise<RouteAuth> {
  const auth = await requireSession();
  if (auth.response) return auth;

  const denial = denialForPortal(auth.session);
  return denial ? deny(denial) : auth;
}
