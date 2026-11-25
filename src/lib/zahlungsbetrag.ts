/**
 * Erwarteter Zahlbetrag einer Bestellung, serverseitig gerechnet.
 *
 * Bis November 2026 legte /api/sync-order eine bezahlte Bestellung an, ohne
 * den Betrag der Zahlung mit dem Warenkorb zu vergleichen. Bei PayPal wurde
 * die Zahlung gar nicht geprüft (jede Zeichenkette "paypal_…" genügte), bei
 * Stripe nur der Status. Hier steht die Rechnung, gegen die beide Wege
 * jetzt prüfen.
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

/**
 * Reicht die Zahlung für die Bestellung? Zu viel bezahlt geht durch (kein
 * Schaden für den Shop, wird protokolliert); zu wenig nur innerhalb der
 * Rundungstoleranz.
 */
export function zahlungReicht(
  erwartetCent: number,
  bezahltCent: number,
  toleranzCent = BETRAG_TOLERANZ_CENT
): boolean {
  if (!Number.isFinite(erwartetCent) || !Number.isFinite(bezahltCent)) {
    return false;
  }
  return bezahltCent >= erwartetCent - toleranzCent;
}

/** Zahlung passt nicht zur Bestellung (zu wenig bezahlt oder falsche Währung). */
export class ZahlungPasstNichtFehler extends Error {
  readonly code = "payment_mismatch";

  constructor(
    public readonly grund: "betrag" | "waehrung",
    public readonly erwartetCent: number,
    public readonly bezahltCent: number,
    public readonly waehrung: string
  ) {
    super(
      grund === "waehrung"
        ? `Zahlung in ${waehrung.toUpperCase()} statt EUR`
        : `Zahlung ${(bezahltCent / 100).toFixed(2)} EUR, Bestellung ${(erwartetCent / 100).toFixed(2)} EUR`
    );
    this.name = "ZahlungPasstNichtFehler";
  }
}

/** Wirft ZahlungPasstNichtFehler, wenn Währung oder Betrag nicht passen. */
export function pruefeZahlungGegenBestellung(
  erwartetCent: number,
  bezahltCent: number,
  waehrung: string
): void {
  const w = (waehrung || "").trim().toLowerCase();
  if (w !== "eur") {
    throw new ZahlungPasstNichtFehler("waehrung", erwartetCent, bezahltCent, w);
  }
  if (!zahlungReicht(erwartetCent, bezahltCent)) {
    throw new ZahlungPasstNichtFehler("betrag", erwartetCent, bezahltCent, w);
  }
}
