/**
 * Erwarteter Zahlbetrag einer Bestellung, serverseitig gerechnet.
 *
 * Bis November 2026 legte /api/sync-order eine bezahlte Bestellung an, ohne
 * den Betrag der Zahlung mit dem Warenkorb zu vergleichen. Bei PayPal wurde
 * die Zahlung gar nicht geprüft (jede Zeichenkette "paypal_…" genügte), bei
 * Stripe nur der Status. Hier steht die Rechnung, gegen die beide Wege
 * jetzt prüfen.
 *
 * Was daraus folgt:
 *   - Fremde Währung: abgewiesen (FalscheWaehrungFehler).
 *   - Betrag weicht ab: Die Bestellung entsteht trotzdem, denn der Kunde hat
 *     bezahlt, aber auf "on-hold" mit Notiz und Mail ans Büro
 *     (betragsabweichung-melden.ts).
 *
 * Die Formel ist dieselbe wie in compute-payment-intent-amount.ts (Betrag
 * des PaymentIntents) und wie im Browser für PayPal: Rabatt auf die
 * Zwischensumme, dann Versand. Händler ohne Reverse Charge zahlen Netto
 * plus Umsatzsteuer des Landes, je Zeile gerundet.
 */

import { getVatRateForCountry } from "@/lib/eu-vat-rates";
import { parsePrice } from "@/lib/parse-price";

/** Rundungsdifferenz, die zwischen Zahlung und Rechnung noch durchgeht. */
export const BETRAG_TOLERANZ_CENT = 5;

export type BetragPosition = { qty: number; price: string };

export type ErwarteterBetragEingabe = {
  items: BetragPosition[];
  /** Gutscheinrabatt auf die Zwischensumme, in Cent. */
  discountCents?: number;
  /** Versand in Cent; bei Händlern ohne Reverse Charge netto. */
  shippingCents?: number;
  isWholesale?: boolean;
  isReverseCharge?: boolean;
  /** ISO2; bestimmt bei Händlern ohne Reverse Charge den Steuersatz. */
  taxCountry?: string;
};

function nichtNegativ(wert: number | undefined): number {
  return typeof wert === "number" && Number.isFinite(wert) && wert > 0
    ? Math.round(wert)
    : 0;
}

export function erwarteterBetragCent(e: ErwarteterBetragEingabe): number {
  const haendlerNetto =
    e.isWholesale === true &&
    e.isReverseCharge !== true &&
    Boolean(e.taxCountry?.trim());
  const satz = (getVatRateForCountry(e.taxCountry ?? "") ?? 20) / 100;

  let zwischensumme = 0;
  for (const item of e.items) {
    const menge = Math.max(1, Number(item.qty) || 1);
    if (haendlerNetto) {
      const zeileNetto = Math.max(0, parsePrice(item.price)) * menge;
      zwischensumme += Math.round(zeileNetto * (1 + satz) * 100);
    } else {
      zwischensumme += Math.round(parsePrice(item.price) * 100) * menge;
    }
  }

  let summe = Math.max(0, zwischensumme - nichtNegativ(e.discountCents));
  const versand = nichtNegativ(e.shippingCents);
  summe += haendlerNetto
    ? Math.round((versand / 100) * (1 + satz) * 100)
    : versand;
  return summe;
}

/** Zahlung und Rechnung passen, wenn sie höchstens um die Toleranz abweichen. */
export function betragStimmt(
  erwartetCent: number,
  bezahltCent: number,
  toleranzCent = BETRAG_TOLERANZ_CENT
): boolean {
  if (!Number.isFinite(erwartetCent) || !Number.isFinite(bezahltCent)) {
    return false;
  }
  return Math.abs(erwartetCent - bezahltCent) <= toleranzCent;
}

/** Bezahlt, aber mit anderem Betrag, als der Warenkorb ergibt. */
export type Betragsabweichung = { erwartetCent: number; bezahltCent: number };

/** null, wenn der Betrag passt; sonst die beiden Beträge für Notiz und Mail. */
export function ermittleBetragsabweichung(
  erwartetCent: number,
  bezahltCent: number
): Betragsabweichung | null {
  return betragStimmt(erwartetCent, bezahltCent)
    ? null
    : { erwartetCent, bezahltCent };
}

/**
 * Zahlung in fremder Währung. Der Shop rechnet nur in Euro; ein Betrag in
 * anderer Währung lässt sich nicht mit dem Warenkorb vergleichen.
 */
export class FalscheWaehrungFehler extends Error {
  readonly code = "payment_currency";

  constructor(public readonly waehrung: string) {
    super(
      `Zahlung in ${waehrung ? waehrung.toUpperCase() : "unbekannter Währung"} statt EUR`
    );
    this.name = "FalscheWaehrungFehler";
  }
}

export function pruefeWaehrung(waehrung: string | null | undefined): void {
  const w = (waehrung || "").trim().toLowerCase();
  if (w !== "eur") throw new FalscheWaehrungFehler(w);
}
