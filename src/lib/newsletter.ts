/**
 * Newsletter-Anmeldung mit Double-Opt-in. Anbieter ist Ghost
 * (GHOST_API_URL); dieselbe Liste nutzen uncuttv.app und UncutTV Social.
 *
 * Ablauf (Ghost 6.x, geprüft am Quelltext von Ghost 6.68):
 * 1. GET  /members/api/integrity-token/   kurzlebiges Token, das Ghost bei
 *                                         send-magic-link verlangt
 * 2. POST /members/api/send-magic-link/   emailType "signup", Label,
 *                                         integrityToken, redirect
 *    Ghost schickt der Adresse eine Bestätigungsmail mit Link. Erst der
 *    Klick legt das Mitglied an, mit dem Label "shop-subscriber". Ghost
 *    feuert dann den Webhook member.added, der die Willkommensmail mit dem
 *    Rabattcode auslöst (api/newsletter/ghost-webhook).
 * 3. Nach dem Klick leitet Ghost auf "redirect" weiter, aber nur, wenn die
 *    Adresse auf der Ghost-Domain liegt. Deshalb zeigt redirect auf
 *    GHOST_API_URL/weiter/shop/, und eine Weiterleitung in Ghost Admin
 *    (Settings, Advanced, Redirects) bringt die Person von dort auf
 *    /newsletter/bestaetigt. Ist in Ghost unter Portal eine "Redirect after
 *    free signup"-Seite gesetzt, gewinnt die; sie muss leer bleiben.
 *
 * Kein Admin-Key nötig: der Weg ist der öffentliche Members-Anmeldeweg,
 * derselbe, den Ghosts Portal benutzt. Bestehende Mitglieder werden nicht
 * angefasst: für eine Adresse, die es schon gibt, schickt Ghost statt der
 * Anmelde- eine Anmeldelink-Mail und legt nichts neu an; member.added
 * feuert dann nicht, also auch keine zweite Willkommensmail.
 */

export type NewsletterOutcome = "sent" | "invalid" | "unavailable" | "not_configured";

/** Label in Ghost, damit sichtbar bleibt, woher eine Anmeldung kam. */
export const NEWSLETTER_LABEL = "shop-subscriber";
/** Pfad auf der Ghost-Domain, von dem eine Ghost-Weiterleitung hierher führt. */
export const NEWSLETTER_REDIRECT_PATH = "/weiter/shop/";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIMEOUT_MS = 10_000;

async function integrityToken(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/members/api/integrity-token/`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 204 heißt: diese Instanz vergibt keine Token; dann ohne weiter.
    if (res.status === 204) return "";
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

export async function requestNewsletterSignup(
  rawEmail: unknown,
  ip: string | null
): Promise<NewsletterOutcome> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return "invalid";

  const base = process.env.GHOST_API_URL?.replace(/\/+$/, "");
  if (!base) return "not_configured";

  const token = await integrityToken(base);
  if (token === null) {
    console.error("[Newsletter] Ghost gibt kein Integrity-Token");
    return "unavailable";
  }

  let res: Response;
  try {
    res = await fetch(`${base}/members/api/send-magic-link/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Ghost begrenzt Anfragen je Absenderadresse. Ohne diese Zeile zählt
        // jede Anmeldung auf die Adresse unseres Servers.
        ...(ip ? { "X-Forwarded-For": ip } : {}),
      },
      body: JSON.stringify({
        email,
        emailType: "signup",
        labels: [NEWSLETTER_LABEL],
        ...(token ? { integrityToken: token } : {}),
        redirect: `${base}${NEWSLETTER_REDIRECT_PATH}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[Newsletter] Ghost nicht erreichbar:", err instanceof Error ? err.message : err);
    return "unavailable";
  }

  if (res.ok) return "sent";

  const text = await res.text().catch(() => "");
  // Ghost antwortet bei einer unbrauchbaren Adresse (und bei gesperrten
  // Domains) mit 400; alles andere ist eine Störung oder eine Einstellung
  // in Ghost (Anmeldung nur auf Einladung), die ins Log gehört.
  if (res.status === 400 && /email/i.test(text)) return "invalid";
  console.error("[Newsletter] Ghost antwortet", res.status, text.slice(0, 200));
  return "unavailable";
}
