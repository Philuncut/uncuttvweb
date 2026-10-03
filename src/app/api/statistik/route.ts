import { cookies } from "next/headers";
import { getSession } from "@/lib/auth-session";
import { parsePageView, recordPageView } from "@/lib/visitor-stats";

/**
 * POST /api/statistik — ein Seitenaufruf für die cookiefreie
 * Besucherzählung (siehe lib/visitor-stats.ts). Aufgerufen vom Baustein
 * VisitorCounter im Wurzellayout, bei jedem Seitenwechsel.
 *
 * Antwortet immer mit 204 und ohne Inhalt: Der Aufrufer hat mit dem
 * Ergebnis nichts zu tun, und wer die Route von Hand beschießt, erfährt
 * nicht, was gezählt wurde. Die Ratenbegrenzung (40 je Besucher und
 * Minute) und der Bot-Filter sitzen in der Datenbank.
 */

const empty = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  // Nur von der eigenen Seite. Ein Browser schickt bei POST den Origin mit;
  // weicht er vom Host ab, kommt die Anfrage von woanders.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host")) return empty();
    } catch {
      return empty();
    }
  }

  const view = parsePageView(await request.json().catch(() => null));
  if (!view) return empty();

  // Die Sitzung nur prüfen, wenn überhaupt ein Token mitkommt — ein
  // anonymer Besucher soll keinen Weg nach WordPress auslösen. Mit Token
  // ist die Antwort eine Minute zwischengespeichert (wp-identity).
  let wpUserId: number | null = null;
  try {
    const cookieStore = await cookies();
    if (cookieStore.has("woo_token") || cookieStore.has("haendler_token")) {
      wpUserId = (await getSession())?.wpUserId ?? null;
    }
  } catch {
    wpUserId = null;
  }

  await recordPageView(request.headers, view, wpUserId);
  return empty();
}
