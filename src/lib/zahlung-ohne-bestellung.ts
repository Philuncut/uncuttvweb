/**
 * Stripe-Zahlungen ohne Bestellung erkennen und ans Büro melden.
 *
 * Die Bestellung entsteht bis zum Umbau (Phase 2b) nur, wenn der Browser
 * nach der Zahlung /api/sync-order erreicht. Schließt der Kunde den Tab
 * oder scheitert der Aufruf, ist bezahlt, aber nichts bestellt (im Herbst
 * 2026 viermal). Der Lauf /api/cron/zahlung-ohne-bestellung findet solche
 * Zahlungen und schickt je Zahlung genau eine Mail. Nachgeholt wird die
 * Bestellung hier nicht; das kommt in Phase 2b.
 *
 * Diese Datei enthält nur die Teile ohne Netz (Auswahl, Mailtext), damit
 * sie testbar sind.
 */

import type Stripe from "stripe";
import { parseCartItemsFromPiMetadata } from "@/lib/cart-items-from-context";

/** So lange hat der Browser Zeit, die Bestellung anzulegen. */
export const WARTEZEIT_MINUTEN = 10;
/** So weit zurück schaut der Lauf. */
export const RUECKBLICK_STUNDEN = 48;
/** Metadaten-Feld am PaymentIntent: Diese Zahlung ist gemeldet. */
export const GEMELDET_META = "uncuttv_gemeldet";
/**
 * Metadaten-Feld am PaymentIntent: Nummer der gefundenen Bestellung. Damit
 * sucht der Lauf zu jeder Zahlung nur einmal in WordPress, nicht alle fünf
 * Minuten wieder.
 */
export const BESTELLUNG_META = "uncuttv_bestellung";

/** Zeitpunkt der Zahlung in Sekunden: die Belastung, sonst der PaymentIntent. */
export function zahlungszeitpunkt(pi: Stripe.PaymentIntent): number {
  const charge = pi.latest_charge;
  if (charge && typeof charge === "object" && typeof charge.created === "number") {
    return charge.created;
  }
  return pi.created;
}

/**
 * Muss diese Zahlung geprüft werden? Nur erfolgreiche Zahlungen der Kasse
 * (erkennbar an den Metadaten, die create-payment-intent schreibt), die
 * alt genug und noch nicht gemeldet sind.
 */
export function istPruefkandidat(
  pi: Stripe.PaymentIntent,
  jetztSekunden: number
): boolean {
  if (pi.status !== "succeeded") return false;
  const meta = pi.metadata ?? {};
  if (meta[GEMELDET_META] || meta[BESTELLUNG_META]) return false;
  const ausDerKasse =
    typeof meta.cart_items_count === "string" ||
    typeof meta.cart_snapshot === "string";
  if (!ausDerKasse) return false;
  return jetztSekunden - zahlungszeitpunkt(pi) >= WARTEZEIT_MINUTEN * 60;
}

export function kundenEmailAusPi(pi: Stripe.PaymentIntent): string {
  const charge = pi.latest_charge;
  const ausCharge =
    charge && typeof charge === "object"
      ? charge.billing_details?.email ?? ""
      : "";
  return (pi.receipt_email || ausCharge || "").trim();
}

function euro(cent: number): string {
  return `${(cent / 100).toFixed(2).replace(".", ",")} €`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wienerZeit(sekunden: number): string {
  return new Date(sekunden * 1000).toLocaleString("de-AT", {
    timeZone: "Europe/Vienna",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export type ZahlungOhneBestellungMail = { subject: string; html: string };

/** Betrag, Zeit, PaymentIntent, E-Mail des Kunden, Warenkorb aus den Metadaten. */
export function mailZuZahlungOhneBestellung(
  pi: Stripe.PaymentIntent
): ZahlungOhneBestellungMail {
  const meta = (pi.metadata ?? {}) as Record<string, string>;
  const betrag = euro(pi.amount_received > 0 ? pi.amount_received : pi.amount);
  const email = kundenEmailAusPi(pi);
  const zeilen = parseCartItemsFromPiMetadata(meta);
  const anzahlLautPi = parseInt(meta.cart_items_count ?? "", 10);
  const unvollstaendig =
    Number.isFinite(anzahlLautPi) && anzahlLautPi > zeilen.length;

  const warenkorb =
    zeilen.length > 0
      ? `<ul>${zeilen
          .map(
            (z) =>
              `<li>${z.qty} × ${escapeHtml(z.name)}${z.size ? ` (Größe ${escapeHtml(z.size)})` : ""} zu ${escapeHtml(z.price)} € <small>(Produkt ${z.id}${z.variation_id ? `, Variante ${z.variation_id}` : ""})</small></li>`
          )
          .join("")}</ul>${
          unvollstaendig
            ? `<p>Der Warenkorb hatte ${anzahlLautPi} Positionen; in den Metadaten stehen nur ${zeilen.length}.</p>`
            : ""
        }`
      : `<p>Kein Warenkorb in den Metadaten.</p>`;

  const versand = parseInt(meta.shipping_cents ?? "", 10);
  const html = `
    <h2>Stripe-Zahlung ohne Bestellung</h2>
    <p>Seit mindestens ${WARTEZEIT_MINUTEN} Minuten bezahlt, in WooCommerce gibt es
       dazu keine Bestellung. Bitte von Hand anlegen.</p>
    <p><strong>Betrag:</strong> ${betrag}<br>
       <strong>Zeit:</strong> ${escapeHtml(wienerZeit(zahlungszeitpunkt(pi)))}<br>
       <strong>PaymentIntent:</strong> ${escapeHtml(pi.id)}<br>
       <strong>Kunde:</strong> ${escapeHtml(email || "keine E-Mail bei Stripe")}</p>
    <h3>Warenkorb</h3>
    ${warenkorb}
    <p><strong>Versand:</strong> ${
      Number.isFinite(versand) ? euro(versand) : "unbekannt"
    }${meta.shipping_method_title ? ` (${escapeHtml(meta.shipping_method_title)})` : ""}${
      meta.shipping_country ? `, ${escapeHtml(meta.shipping_country)}` : ""
    }<br>
       <strong>Gutschein:</strong> ${escapeHtml(meta.coupon_code || "keiner")}<br>
       <strong>Händler:</strong> ${meta.is_wholesale === "true" ? "ja" : "nein"}${
         meta.is_reverse_charge === "true" ? ", Reverse Charge" : ""
       }</p>
    <p>Diese Zahlung wird nur einmal gemeldet.</p>
  `;
  return {
    subject: `Stripe-Zahlung ohne Bestellung: ${betrag}, ${pi.id}`,
    html,
  };
}
