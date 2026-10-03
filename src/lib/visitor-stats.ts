import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Cookiefreie Besucherzählung über alle drei UncutTV-Auftritte (Shop,
 * Videoplattform, Streaming). Dieser Auftritt ist "shop".
 *
 * Gezählt wird in der gemeinsamen Datenbank, Schema statistik (Steuerpult,
 * sql/55_statistik.sql). Diese Datei reicht nur weiter, was die Anfrage
 * mitbringt — Pfad, Verweis, Land, IP, User-Agent, Kampagnenparameter
 * und, falls angemeldet, die WordPress-Benutzernummer — an
 * public.statistik_erfasse(). Dort entsteht aus IP und User-Agent ein
 * Tages-Hash; gespeichert wird beides nicht. Bots, Ratenbegrenzung und die
 * Einordnung von Gerät und Herkunft liegen ebenfalls dort, damit alle drei
 * Auftritte gleich zählen.
 *
 * Die Datenbank übersetzt die WordPress-Benutzernummer über die Zuordnung
 * des Identitätsdienstes (public.uncuttv_id_wp_konten) in die
 * Supabase-Nutzer-ID, an der sich ein Konto über die drei Auftritte hinweg
 * erkennen lässt.
 *
 * Kein Cookie, kein localStorage, nichts im Browser. Unabhängig von GA4
 * und Meta Pixel, die weiterhin nur nach Zustimmung laufen.
 */

const SITE = "shop";

export type PageView = {
  path: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** Liest den Rumpf der Zählanfrage. null, wenn er nicht brauchbar ist. */
export function parsePageView(body: unknown): PageView | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const path = text(b.p, 300);
  if (!path || !path.startsWith("/")) return null;
  return {
    path,
    referrer: text(b.r, 500),
    utmSource: text(b.us, 150),
    utmMedium: text(b.um, 150),
    utmCampaign: text(b.uc, 150),
  };
}

function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return first || null;
}

/**
 * Schreibt einen Seitenaufruf. Wirft nie: Die Statistik darf keine Seite
 * stören. Zurück kommt die Antwort der Datenbank ("ok", "bot", "rate",
 * "ungueltig", "fehler") oder "fehler", wenn sie nicht erreichbar war.
 */
export async function recordPageView(
  headers: Headers,
  view: PageView,
  wpUserId: number | null
): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return "fehler";

    const { data, error } = await supabase.rpc("statistik_erfasse", {
      p_seite: SITE,
      p_pfad: view.path,
      p_referrer: view.referrer,
      // Vom Hoster gesetzt, vom Besucher nicht fälschbar.
      p_land: headers.get("x-vercel-ip-country"),
      p_ip: clientIp(headers),
      p_user_agent: headers.get("user-agent"),
      p_utm_source: view.utmSource,
      p_utm_medium: view.utmMedium,
      p_utm_campaign: view.utmCampaign,
      p_user_id: null,
      p_wp_user_id: wpUserId,
    });
    if (error) {
      console.error("[visitor-stats] Seitenaufruf zählen:", error.message);
      return "fehler";
    }
    return typeof data === "string" ? data : "fehler";
  } catch (err) {
    console.error("[visitor-stats] Seitenaufruf zählen fehlgeschlagen:", err);
    return "fehler";
  }
}
