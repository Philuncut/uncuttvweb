import { NextResponse } from "next/server";
import { getCartPersistAuth } from "@/lib/cart-persist-auth";
import { requestNewsletterSignup } from "@/lib/newsletter";
import { setNewsletterSubscribedCustomerMeta } from "@/lib/newsletter-customer-meta";

/**
 * POST /api/newsletter/subscribe -- Body {"email", "website"}.
 *
 * Löst bei Ghost die Bestätigungsmail aus (Double-Opt-in, lib/newsletter.ts).
 * Legt kein Mitglied mehr an und verschickt keine Willkommensmail; beides
 * passiert erst nach dem Klick auf den Bestätigungslink (Ghost bzw.
 * api/newsletter/ghost-webhook).
 *
 * Antwort: { success: true, pending: true } heißt "Bestätigungsmail ist
 * unterwegs". Die Aufrufer (Newsletter-Block, Handy-Banner, Warenkorb,
 * Kasse) lesen weiterhin "success". { success: false, error } sonst.
 * alreadySubscribed gibt es nicht mehr: für eine schon eingetragene Adresse
 * schickt Ghost eine Anmeldelink-Mail, ohne das zu verraten.
 *
 * "website" ist das Honeypot-Feld: unsichtbar im Formular, Menschen lassen
 * es leer. Steht etwas drin, tun wir so, als wäre alles gut, und rufen
 * Ghost gar nicht erst.
 *
 * Grenze je IP: ein kleiner Zähler im Speicher der Instanz.
 */
const LIMIT = 5;
const WINDOW_MS = 10 * 60_000;
const counts = new Map<string, { n: number; until: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = counts.get(ip);
  if (!entry || entry.until < now) {
    counts.set(ip, { n: 1, until: now + WINDOW_MS });
    return false;
  }
  entry.n += 1;
  return entry.n > LIMIT;
}

/**
 * Angemeldete Kunden: Vermerk am WooCommerce-Konto, damit der Shop den
 * Newsletter-Hinweis nicht mehr zeigt. Er wird wie bisher beim Absenden
 * gesetzt, nicht erst nach der Bestätigung: der Webhook kennt nur die
 * Ghost-Adresse und kein WooCommerce-Konto.
 */
async function markNewsletterSubscribedForLoggedInCustomer(): Promise<void> {
  try {
    const auth = await getCartPersistAuth();
    if (!auth) return;
    await setNewsletterSubscribedCustomerMeta(auth.customerId);
  } catch (err) {
    console.error("[Newsletter] WooCommerce meta write failed:", err);
  }
}

export async function POST(request: Request) {
  try {
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    if (rateLimited(ip ?? "unbekannt")) {
      return NextResponse.json(
        { success: false, error: "Zu viele Versuche. Bitte später noch einmal." },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      website?: unknown;
    } | null;

    if (typeof body?.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ success: true, pending: true });
    }

    const outcome = await requestNewsletterSignup(body?.email, ip);

    if (outcome === "sent") {
      await markNewsletterSubscribedForLoggedInCustomer();
      return NextResponse.json({ success: true, pending: true });
    }
    if (outcome === "invalid") {
      return NextResponse.json(
        { success: false, error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }
    if (outcome === "not_configured") {
      console.error("[Newsletter] GHOST_API_URL fehlt");
    }
    return NextResponse.json(
      { success: false, error: "Anmeldung fehlgeschlagen." },
      { status: 503 }
    );
  } catch (error) {
    console.error("[Newsletter] Error:", error);
    return NextResponse.json(
      { success: false, error: "Anmeldung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
