/**
 * Kennung einer Kassen-Sitzung im Browser.
 *
 * Pro Warenkorb und Browser-Tab gibt es genau einen Schluessel. Er wandert
 * mit jeder Anfrage an den Server (PaymentIntent anlegen, Bestellung
 * vorbereiten, PayPal-Order anlegen) und sorgt dort fuer Idempotenz:
 * Stripe bekommt ihn als Idempotency-Key, WooCommerce als Meta
 * `_uncuttv_checkout_key`, PayPal als PayPal-Request-Id. Ein zweiter
 * Klick, ein Reload oder ein Wiederanlauf nach Verbindungsabbruch findet
 * damit die bestehende offene Bestellung statt eine neue anzulegen.
 *
 * Der Schluessel lebt in sessionStorage (Tab-gebunden) und wird nach einer
 * abgeschlossenen Bestellung geloescht. Daneben merkt sich der Tab die
 * Nummer der offenen Woo-Bestellung als Hinweis fuer den Server; der
 * Server prueft den Hinweis gegen den Schluessel und vertraut ihm nicht
 * blind.
 */

const KEY_SPEICHER = "uncuttv_checkout_key";
const BESTELLUNG_SPEICHER = "uncuttv_checkout_pending_order";

function zufallsKennung(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    /* unten weiter */
  }
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function holeOderErzeugeCheckoutKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const vorhanden = sessionStorage.getItem(KEY_SPEICHER);
    if (vorhanden && /^[a-f0-9]{32}$/.test(vorhanden)) return vorhanden;
    const neu = zufallsKennung();
    sessionStorage.setItem(KEY_SPEICHER, neu);
    return neu;
  } catch {
    return zufallsKennung();
  }
}

/** Nach erfolgreicher Bestellung: naechster Einkauf bekommt einen neuen Schluessel. */
export function loescheCheckoutKey(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_SPEICHER);
    sessionStorage.removeItem(BESTELLUNG_SPEICHER);
  } catch {
    /* ignorieren */
  }
}

export function merkeOffeneBestellung(orderId: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BESTELLUNG_SPEICHER, String(orderId));
  } catch {
    /* ignorieren */
  }
}

export function leseOffeneBestellung(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(BESTELLUNG_SPEICHER);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}
