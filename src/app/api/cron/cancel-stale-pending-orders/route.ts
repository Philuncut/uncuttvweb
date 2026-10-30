/**
 * GET /api/cron/cancel-stale-pending-orders  (Vercel Cron, alle 15 Minuten)
 *
 * Seit die Woo-Bestellung VOR der Zahlung als "pending" entsteht, bleiben
 * Bestellungen liegen, wenn der Kunde die Kasse verlaesst oder die Zahlung
 * scheitert. Diese Route storniert unbezahlte Stripe- und PayPal-Bestellungen,
 * die aelter als 60 Minuten sind, damit sie nicht in Auswertung und Versand
 * landen. WooCommerce bucht beim Stornieren reduzierten Lagerbestand zurueck.
 *
 * Vorher wird die Zahlung ein letztes Mal serverseitig geprueft: Hat Stripe
 * den PaymentIntent doch auf succeeded, oder PayPal eine COMPLETED-Capture,
 * wird die Bestellung bezahlt statt storniert (verpasster Webhook). Nur
 * Bestellungen mit payment_method stripe oder paypal werden angefasst;
 * Vorkasse (bacs) bleibt pending, bis das Geld eingeht.
 *
 * Stripe-PaymentIntents stornierter Bestellungen werden mitstorniert, damit
 * ein liegen gebliebener Browser-Tab nicht nach Stunden noch gegen eine
 * stornierte Bestellung zahlt. Die Kasse legt beim naechsten Laden einen
 * neuen PaymentIntent an.
 *
 * Warum nicht WooCommerce "Lagerbestand halten (Minuten)"? Das storniert
 * ALLE pending-Bestellungen, auch die Vorkasse-Bestellungen dieses Shops.
 *
 * Auth wie die anderen Crons: Authorization: Bearer CRON_SECRET (setzt Vercel
 * bei Cron-Aufrufen automatisch).
 */

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { wooFetch } from "@/lib/woocommerce";
import {
  aendereWooBestellung,
  bestellnotiz,
  META_PAYPAL_ORDER_ID,
  META_STRIPE_PI_ID,
  META_ZAHLUNGSREFERENZ,
  metaWert,
  nachZahlungseingang,
  type WooBestellung,
} from "@/lib/bestellung-zahlung";
import { verbucheStripeZahlung } from "@/lib/stripe-zahlung";
import { erfassePayPalZahlung } from "@/lib/paypal-zahlung";
import { paypalKonfiguriert } from "@/lib/paypal-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WARTEZEIT_MINUTEN = 60;
const MAX_BESTELLUNGEN_PRO_LAUF = 40;

function autorisiert(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function stripePiAus(order: WooBestellung): string {
  const ref = metaWert(order, META_ZAHLUNGSREFERENZ);
  if (ref.startsWith("pi_")) return ref;
  const pi = metaWert(order, META_STRIPE_PI_ID);
  if (pi.startsWith("pi_")) return pi;
  const tx = String(order.transaction_id ?? "");
  return tx.startsWith("pi_") ? tx : "";
}

function paypalOrderAus(order: WooBestellung): string {
  const direkt = metaWert(order, META_PAYPAL_ORDER_ID);
  if (direkt) return direkt;
  const ref = metaWert(order, META_ZAHLUNGSREFERENZ);
  if (ref.startsWith("paypal_")) return ref.slice("paypal_".length);
  const tx = String(order.transaction_id ?? "");
  return tx.startsWith("paypal_") ? tx.slice("paypal_".length) : "";
}

type Ergebnis = {
  geprueft: number;
  storniert: number;
  nachtraeglichBezahlt: number;
  uebersprungen: number;
  fehler: number;
  details: string[];
};

export async function GET(request: Request): Promise<Response> {
  if (!autorisiert(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const stichtag = new Date(Date.now() - WARTEZEIT_MINUTEN * 60_000).toISOString();
  const ergebnis: Ergebnis = {
    geprueft: 0,
    storniert: 0,
    nachtraeglichBezahlt: 0,
    uebersprungen: 0,
    fehler: 0,
    details: [],
  };

  let offene: WooBestellung[];
  try {
    offene = await wooFetch<WooBestellung[]>(
      "/orders",
      {
        status: "pending",
        before: stichtag,
        per_page: String(MAX_BESTELLUNGEN_PRO_LAUF),
        orderby: "date",
        order: "asc",
      },
      { cache: "no-store" }
    );
  } catch (err) {
    console.error("[cancel-stale-pending-orders] Woo-Abfrage fehlgeschlagen:", err);
    return NextResponse.json({ ok: false, error: "woo_unavailable" }, { status: 502 });
  }

  for (const order of offene) {
    ergebnis.geprueft++;
    const nummer = String(order.number ?? order.id);
    const zahlungsart = String(order.payment_method ?? "").toLowerCase();

    if (zahlungsart !== "stripe" && zahlungsart !== "paypal") {
      ergebnis.uebersprungen++;
      continue;
    }

    try {
      if (zahlungsart === "stripe") {
        const piId = stripePiAus(order);
        if (piId) {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status === "succeeded") {
            const verbucht = await verbucheStripeZahlung({
              paymentIntentId: piId,
              quelle: "Cron cancel-stale-pending-orders (verpasster Webhook)",
            });
            if (verbucht.status === "paid") {
              await nachZahlungseingang(verbucht.orderId, "stripe");
            }
            ergebnis.nachtraeglichBezahlt++;
            ergebnis.details.push(`#${nummer}: Stripe succeeded, nachtraeglich bezahlt`);
            continue;
          }
          if (pi.status === "processing") {
            // Zahlung bei Stripe noch in Arbeit (z. B. SEPA/Klarna): liegen lassen.
            ergebnis.uebersprungen++;
            ergebnis.details.push(`#${nummer}: Stripe processing, bleibt offen`);
            continue;
          }
          if (pi.status !== "canceled") {
            try {
              await stripe.paymentIntents.cancel(piId, {
                cancellation_reason: "abandoned",
              });
            } catch (err) {
              console.warn(
                `[cancel-stale-pending-orders] PI ${piId} nicht stornierbar:`,
                err instanceof Error ? err.message : err
              );
            }
          }
        }
      } else {
        const paypalOrderId = paypalOrderAus(order);
        if (paypalOrderId && paypalKonfiguriert()) {
          try {
            const verbucht = await erfassePayPalZahlung(paypalOrderId, order.id);
            if (verbucht.status === "paid" || verbucht.status === "already_paid") {
              if (verbucht.status === "paid") {
                await nachZahlungseingang(verbucht.orderId, "paypal");
              }
              ergebnis.nachtraeglichBezahlt++;
              ergebnis.details.push(`#${nummer}: PayPal Capture vorhanden, nachtraeglich bezahlt`);
              continue;
            }
            if (verbucht.status === "pending" && verbucht.paypalStatus === "COMPLETED") {
              // Capture PENDING bei PayPal (Pruefung): liegen lassen.
              ergebnis.uebersprungen++;
              continue;
            }
          } catch (err) {
            // Nicht gecaptured (CREATED/VOIDED/EXPIRED) oder Zuordnung unklar:
            // weiter zum Stornieren, der Fehler ist der Normalfall hier.
            console.log(
              `[cancel-stale-pending-orders] #${nummer}: PayPal ${paypalOrderId} nicht bezahlt (${err instanceof Error ? err.message : err})`
            );
          }
        }
      }

      await aendereWooBestellung(order.id, { status: "cancelled" });
      await bestellnotiz(
        order.id,
        `Automatisch storniert: ${WARTEZEIT_MINUTEN} Minuten ohne bestaetigte Zahlung (${zahlungsart}).`
      );
      ergebnis.storniert++;
      ergebnis.details.push(`#${nummer}: storniert (${zahlungsart})`);
    } catch (err) {
      ergebnis.fehler++;
      ergebnis.details.push(
        `#${nummer}: Fehler ${err instanceof Error ? err.message : String(err)}`
      );
      console.error(`[cancel-stale-pending-orders] #${nummer}:`, err);
    }
  }

  console.log("[cancel-stale-pending-orders]", JSON.stringify(ergebnis));
  return NextResponse.json({ ok: true, ...ergebnis });
}
