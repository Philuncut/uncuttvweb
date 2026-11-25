/**
 * POST /api/checkout/reservierung-freigeben
 *
 * Die Kasse gibt eine Reservierung zurück, wenn die Zahlung nicht zustande
 * kam (Karte abgelehnt, PayPal abgebrochen) oder der Kunde nach einer
 * abgebrochenen Zahlung wieder in die Kasse kommt. Ohne diesen Aufruf
 * läuft die Reservierung nach 15 Minuten von selbst ab.
 *
 * Nicht freigegeben wird, wenn die Stripe-Zahlung schon gelaufen ist oder
 * gerade läuft: Dann gehört der Bestand zu der Bestellung, die gleich
 * entsteht. Gebundene Reservierungen (Bestellung existiert) fasst
 * WordPress ohnehin nicht an.
 *
 * Body: { paymentIntentId?, checkoutKey? }   Antwort immer 200.
 */

import { NextResponse } from "next/server";
import {
  gibReservierungFrei,
  reservierungsSchluessel,
} from "@/lib/reservierung";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** In diesen Zuständen ist Geld geflossen oder unterwegs. */
const ZAHLUNG_LAEUFT = new Set(["succeeded", "processing", "requires_capture"]);

export async function POST(request: Request) {
  let body: { paymentIntentId?: string; checkoutKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: true, frei: false });
  }
  const schluessel = reservierungsSchluessel(
    body.paymentIntentId,
    body.checkoutKey
  );
  if (!schluessel) return NextResponse.json({ ok: true, frei: false });

  if (schluessel.startsWith("pi_")) {
    try {
      const pi = await stripe.paymentIntents.retrieve(schluessel);
      if (ZAHLUNG_LAEUFT.has(pi.status)) {
        return NextResponse.json({ ok: true, frei: false, grund: pi.status });
      }
    } catch (err) {
      // Zustand unbekannt: nicht freigeben, die Reservierung läuft ab.
      console.warn(
        "[reservierung-freigeben] PaymentIntent nicht lesbar:",
        err instanceof Error ? err.message : err
      );
      return NextResponse.json({ ok: true, frei: false });
    }
  }
  await gibReservierungFrei(schluessel);
  return NextResponse.json({ ok: true, frei: true });
}
