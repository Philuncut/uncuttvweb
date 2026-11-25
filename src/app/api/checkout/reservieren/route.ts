/**
 * POST /api/checkout/reservieren
 *
 * Die Kasse ruft das beim Klick auf "Jetzt kaufen" (Karte, Klarna, EPS,
 * Apple/Google Pay) und beim Klick auf den PayPal-Knopf, BEVOR die Zahlung
 * bestätigt wird. Einzelstücke im Warenkorb werden in WordPress abgebucht
 * (lib/reservierung.ts). Verliert der Kunde gegen einen anderen Käufer,
 * kommt 409 mit den betroffenen Positionen; die Kasse nimmt sie aus dem
 * Warenkorb und beginnt die Zahlung nicht.
 *
 * Body: { paymentIntentId?, checkoutKey?, items }
 * 200 { ok: true, reserviert }            (0 = kein Einzelstück im Warenkorb)
 * 409 { error: "ausverkauft", message, problems: [{ id, variation_id?, name, message: {de,en} }] }
 * 503 { error: "reservierung_nicht_moeglich", message }
 */

import { NextResponse } from "next/server";
import { normalizeCartMetaItems } from "@/lib/cart-items-from-context";
import {
  ausverkauftMeldung,
  reserviere,
  ReservierungNichtMoeglichFehler,
  reservierungsSchluessel,
} from "@/lib/reservierung";
import type { CartMeta } from "@/lib/wc-order-from-payment";

export const dynamic = "force-dynamic";

type Body = {
  paymentIntentId?: string;
  checkoutKey?: string;
  items?: CartMeta[];
  locale?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const items = normalizeCartMetaItems(body.items);
  const schluessel = reservierungsSchluessel(
    body.paymentIntentId,
    body.checkoutKey
  );
  if (items.length === 0 || !schluessel) {
    // Ohne Schlüssel lässt sich die Reservierung später keiner Bestellung
    // zuordnen; dann lieber wie bisher ohne Reservierung.
    return NextResponse.json({ ok: true, reserviert: 0 });
  }

  try {
    const ergebnis = await reserviere({ schluessel, items });
    if (ergebnis.ok) {
      return NextResponse.json({ ok: true, reserviert: ergebnis.reserviert });
    }
    const en = body.locale === "en";
    const problems = ergebnis.ausverkauft.map((a) => ({
      ...a,
      code: "ausverkauft" as const,
      message: ausverkauftMeldung(a),
    }));
    console.warn(
      `[reservieren] ${schluessel.slice(0, 14)}…: ausverkauft ${problems.map((p) => `#${p.id}`).join(", ")}`
    );
    return NextResponse.json(
      {
        error: "ausverkauft",
        message: problems.map((p) => (en ? p.message.en : p.message.de)).join(" "),
        problems,
      },
      { status: 409 }
    );
  } catch (err) {
    if (err instanceof ReservierungNichtMoeglichFehler) {
      console.error(`[reservieren] ${err.message}`);
      return NextResponse.json(
        {
          error: err.code,
          message:
            body.locale === "en"
              ? "This item cannot be reserved right now. Please try again in a moment."
              : "Dieser Artikel kann gerade nicht reserviert werden. Bitte gleich noch einmal versuchen.",
        },
        { status: 503 }
      );
    }
    throw err;
  }
}
