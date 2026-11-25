/**
 * GET /api/cron/zahlung-ohne-bestellung  (Vercel Cron, alle 5 Minuten)
 *
 * Sucht erfolgreiche Stripe-Zahlungen der Kasse, die seit mindestens zehn
 * Minuten bezahlt sind und zu denen es in WooCommerce keine Bestellung gibt,
 * und meldet jede genau einmal per Mail ans Büro (Betrag, Zeit,
 * PaymentIntent, E-Mail des Kunden, Warenkorb aus den Metadaten).
 *
 * Gesucht wird dicht über WordPress (docs/wordpress/uncuttv-kasse.php).
 * Ist die Suche nicht möglich, wird nichts gemeldet und der Lauf antwortet
 * mit 503; die Zahlungen kommen beim nächsten Lauf wieder dran.
 *
 * "Nur einmal": Nach der Mail bekommt der PaymentIntent bei Stripe das
 * Metadaten-Feld uncuttv_gemeldet. Gelingt die Mail nicht, bleibt das Feld
 * leer und der nächste Lauf versucht es erneut. Zahlungen mit Bestellung
 * bekommen uncuttv_bestellung (die Bestellnummer) und werden danach
 * übersprungen.
 *
 * Nachgeholt wird die Bestellung hier nicht (Phase 2b).
 *
 * Auth wie die anderen Crons: Authorization: Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { stripe } from "@/lib/stripe";
import {
  BESTELLUNG_META,
  GEMELDET_META,
  istPruefkandidat,
  mailZuZahlungOhneBestellung,
  RUECKBLICK_STUNDEN,
} from "@/lib/zahlung-ohne-bestellung";
import {
  SperreNichtVerfuegbarFehler,
  sperreAbgeschaltet,
  sucheBestellungZurZahlung,
} from "@/lib/zahlung-sperre";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ABSENDER = "UncutTV <office@uncuttv.at>";
const OFFICE_TO = "office@uncuttv.at";
/** Obergrenze je Lauf, damit ein Ausfall keine Mailflut auslöst. */
const MAX_MELDUNGEN_PRO_LAUF = 20;
/** Obergrenze der Suchen je Lauf; der Rest kommt fünf Minuten später dran. */
const MAX_SUCHEN_PRO_LAUF = 80;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (sperreAbgeschaltet()) {
    // Ohne die dichte Suche wäre jede Zahlung "ohne Bestellung".
    return NextResponse.json({ ok: false, error: "suche_abgeschaltet" }, { status: 503 });
  }
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey || resendKey === "your_resend_api_key") {
    return NextResponse.json({ ok: false, error: "resend_fehlt" }, { status: 503 });
  }
  const resend = new Resend(resendKey);

  const jetzt = Math.floor(Date.now() / 1000);
  const ergebnis = {
    geprueft: 0,
    mitBestellung: 0,
    gemeldet: 0,
    mailFehler: 0,
    details: [] as string[],
  };

  try {
    const liste = stripe.paymentIntents.list({
      created: { gte: jetzt - RUECKBLICK_STUNDEN * 3600 },
      limit: 100,
      expand: ["data.latest_charge"],
    });
    for await (const pi of liste) {
      if (!istPruefkandidat(pi, jetzt)) continue;
      if (ergebnis.geprueft >= MAX_SUCHEN_PRO_LAUF) break;
      ergebnis.geprueft++;

      const vorhanden = await sucheBestellungZurZahlung([pi.id]);
      if (vorhanden) {
        ergebnis.mitBestellung++;
        // Merken, damit diese Zahlung nicht bei jedem Lauf neu gesucht wird.
        try {
          await stripe.paymentIntents.update(pi.id, {
            metadata: { [BESTELLUNG_META]: vorhanden.orderNumber },
          });
        } catch (err) {
          console.warn(
            `[zahlung-ohne-bestellung] ${pi.id}: Merken fehlgeschlagen:`,
            err instanceof Error ? err.message : err
          );
        }
        continue;
      }
      if (ergebnis.gemeldet >= MAX_MELDUNGEN_PRO_LAUF) {
        ergebnis.details.push(`${pi.id}: Obergrenze erreicht, nächster Lauf`);
        continue;
      }

      const mail = mailZuZahlungOhneBestellung(pi);
      const gesendet = await resend.emails.send({
        from: ABSENDER,
        to: [OFFICE_TO],
        subject: mail.subject,
        html: mail.html,
      });
      if (gesendet.error) {
        ergebnis.mailFehler++;
        ergebnis.details.push(`${pi.id}: Mail fehlgeschlagen (${gesendet.error.message})`);
        continue;
      }
      // Erst nach der Mail markieren. Scheitert das Markieren, kommt die Mail
      // beim nächsten Lauf noch einmal; lieber doppelt als gar nicht.
      await stripe.paymentIntents.update(pi.id, {
        metadata: { [GEMELDET_META]: new Date().toISOString() },
      });
      ergebnis.gemeldet++;
      ergebnis.details.push(`${pi.id}: gemeldet`);
    }
  } catch (err) {
    const suche = err instanceof SperreNichtVerfuegbarFehler;
    console.error("[zahlung-ohne-bestellung] Lauf abgebrochen:", err);
    return NextResponse.json(
      {
        ok: false,
        error: suche ? "suche_nicht_moeglich" : "lauf_fehlgeschlagen",
        message: err instanceof Error ? err.message : String(err),
        ...ergebnis,
      },
      { status: suche ? 503 : 500 }
    );
  }

  console.log("[zahlung-ohne-bestellung]", JSON.stringify(ergebnis));
  return NextResponse.json({ ok: true, ...ergebnis });
}
