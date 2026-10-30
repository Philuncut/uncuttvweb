/**
 * Stripe-Webhook: die verbindliche Quelle fuer "bezahlt".
 *
 * Bis Oktober 2026 hat diese Route nur geloggt ("Phase 1"); den Status
 * "processing" setzte das Frontend ueber /api/sync-order mit set_paid beim
 * Anlegen. Jetzt gilt: Eine Bestellung wird bezahlt, wenn Stripe
 * `payment_intent.succeeded` meldet und der Server den PaymentIntent selbst
 * nachgeladen hat (stripe-zahlung.ts). Betrag und Bestellnummer werden dort
 * geprueft; bei Abweichung landet die Bestellung auf on-hold mit Notiz.
 *
 * Robustheit, weil bei Vorverkaeufen viele Events gleichzeitig kommen:
 * - Signatur wird geprueft, alles andere wird abgewiesen.
 * - 2xx nur, wenn das Event endgueltig erledigt ist (verbucht, Duplikat,
 *   oder dauerhaft unbrauchbar). Jeder vorlaeufige Fehler (Woo nicht
 *   erreichbar, Stripe-Timeout) antwortet 500, damit Stripe das Event
 *   erneut zustellt (bis zu 3 Tage mit wachsendem Abstand).
 * - Doppelte Zustellung ist unschaedlich: markiereBestellungBezahlt prueft
 *   Status und Event-ID der Bestellung, bevor sie etwas aendert.
 * - Bestaetigungsmail und Haendler-Benachrichtigung laufen nach der
 *   Antwort (after), damit Stripe nicht auf den PDF-Abruf warten muss.
 *
 * Im Stripe-Dashboard muessen fuer den Endpunkt die Events
 * payment_intent.succeeded und payment_intent.payment_failed aktiv sein
 * (docs/stripe-webhook-setup.md).
 */

import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  BestellungOhneArtikelFehler,
  verbucheStripeZahlung,
} from "@/lib/stripe-zahlung";
import { bestellnotiz, nachZahlungseingang } from "@/lib/bestellung-zahlung";
import { findeBestellungZurSitzung } from "@/lib/offene-bestellung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function logPaymentIntentEvent(eventType: string, pi: Stripe.PaymentIntent): void {
  const amountEur =
    typeof pi.amount === "number" ? (pi.amount / 100).toFixed(2) : String(pi.amount);
  console.log(
    `[stripe-webhook] ${eventType} pi=${pi.id} amount=${amountEur} ${pi.currency ?? "eur"} status=${pi.status} woo_order_id=${pi.metadata?.woo_order_id ?? "-"}`
  );
}

async function zahlungFehlgeschlagenNotieren(
  pi: Stripe.PaymentIntent
): Promise<void> {
  const hinweis = pi.metadata?.woo_order_id
    ? parseInt(pi.metadata.woo_order_id, 10)
    : undefined;
  const order = await findeBestellungZurSitzung("", pi.id, [hinweis]);
  if (!order) return;
  const grund =
    pi.last_payment_error?.message ??
    pi.last_payment_error?.code ??
    "unbekannt";
  await bestellnotiz(
    order.id,
    `Stripe: Zahlungsversuch fehlgeschlagen (${pi.id}): ${grund}. Bestellung bleibt offen; ohne Zahlung wird sie nach 60 Minuten automatisch storniert.`
  );
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET ist auf diesem Deployment nicht gesetzt"
    );
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_stripe_signature" }, { status: 400 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.warn(
      "[stripe-webhook] Signatur ungueltig:",
      err instanceof Error ? err.message : "constructEvent failed"
    );
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    logPaymentIntentEvent(event.type, pi);
    try {
      const ergebnis = await verbucheStripeZahlung({
        paymentIntentId: pi.id,
        quelle: `Stripe-Webhook ${event.id}`,
        belegId: event.id,
      });
      console.log(
        `[stripe-webhook] ${event.id}: Bestellung #${ergebnis.orderNumber} -> ${ergebnis.status}`
      );
      if (ergebnis.status === "paid") {
        after(() => nachZahlungseingang(ergebnis.orderId, "stripe"));
      }
      return NextResponse.json(
        { received: true, orderId: ergebnis.orderId, status: ergebnis.status },
        { status: 200 }
      );
    } catch (err) {
      if (err instanceof BestellungOhneArtikelFehler) {
        // Dauerhaft: Zu diesem PI gibt es weder Bestellung noch Warenkorb-
        // Schnappschuss. Wiederholen hilft nicht; laut melden und quittieren.
        console.error(
          `[stripe-webhook] ${event.id}: Zahlung ${pi.id} ohne Bestellung und ohne cart_snapshot. Manuell pruefen.`,
          err.message
        );
        return NextResponse.json(
          { received: true, unresolved: "no_order_no_cart" },
          { status: 200 }
        );
      }
      console.error(
        `[stripe-webhook] ${event.id}: Verbuchung fehlgeschlagen, Stripe soll wiederholen:`,
        err instanceof Error ? err.message : err
      );
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    logPaymentIntentEvent(event.type, pi);
    try {
      await zahlungFehlgeschlagenNotieren(pi);
    } catch (err) {
      // Nur eine Notiz; kein Grund fuer eine Wiederholung durch Stripe.
      console.warn("[stripe-webhook] Notiz zu fehlgeschlagener Zahlung:", err);
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log(`[stripe-webhook] Ignoriert: ${event.type} (${event.id})`);
  return NextResponse.json({ received: true }, { status: 200 });
}
