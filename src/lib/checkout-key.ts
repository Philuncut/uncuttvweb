/**
 * Zufallskennung eines Kassenvorgangs im Browser (je Tab).
 *
 * Sie geht mit dem Auftrag an /api/sync-order. Der Server bildet daraus
 * zusammen mit E-Mail und Warenkorb den Schlüssel des Kassenvorgangs
 * (zahlung-sperre.ts): Zu einem Kassenvorgang entsteht höchstens eine
 * Bestellung, auch wenn der Kunde nach einer Fehlermeldung ein zweites Mal
 * oder auf anderem Weg bezahlt. Nach einer abgeschlossenen Bestellung wird
 * die Kennung gelöscht; der nächste Einkauf bekommt eine neue.
 */

const SPEICHER = "uncuttv_checkout_key";
const RESERVIERUNG_SPEICHER = "uncuttv_reservierung";

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
    const vorhanden = sessionStorage.getItem(SPEICHER);
    if (vorhanden && /^[a-f0-9]{32}$/.test(vorhanden)) return vorhanden;
    const neu = zufallsKennung();
    sessionStorage.setItem(SPEICHER, neu);
    return neu;
  } catch {
    // Ohne Speicher gibt es keine verlässliche Kennung; dann lieber keine
    // (der Schutz über die Zahlungsreferenz bleibt).
    return "";
  }
}

/** Nach abgeschlossener Bestellung: Der nächste Einkauf bekommt eine neue Kennung. */
export function loescheCheckoutKey(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SPEICHER);
    sessionStorage.removeItem(RESERVIERUNG_SPEICHER);
  } catch {
    /* ignorieren */
  }
}

/**
 * Merkt, dass dieser Tab Einzelstücke reserviert hat (PaymentIntent-ID bei
 * Stripe, "paypal" bei PayPal). Kommt der Kunde nach einer abgebrochenen
 * Zahlung wieder in die Kasse, gibt sie die Reservierung zurück; sonst
 * stünde ihm sein eigener Artikel 15 Minuten lang als ausverkauft im Weg.
 */
export function merkeReservierung(paymentIntentId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RESERVIERUNG_SPEICHER, paymentIntentId || "paypal");
  } catch {
    /* ignorieren */
  }
}

/** undefined = nichts gemerkt; null = PayPal; sonst die PaymentIntent-ID. */
export function leseGemerkteReservierung(): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const wert = sessionStorage.getItem(RESERVIERUNG_SPEICHER);
    if (!wert) return undefined;
    return wert === "paypal" ? null : wert;
  } catch {
    return undefined;
  }
}

export function vergissReservierung(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RESERVIERUNG_SPEICHER);
  } catch {
    /* ignorieren */
  }
}
