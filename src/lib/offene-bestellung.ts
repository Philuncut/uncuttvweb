/**
 * Genau eine offene Woo-Bestellung pro Kassen-Sitzung.
 *
 * Warum: Am 18./19.10.2026 entstanden zu einer PayPal-Zahlung drei
 * Bestellungen, weil jeder erneute Aufruf (Wiederanlauf nach Verbindungs-
 * abbruch, Reload) eine neue Bestellung anlegte. Jetzt wird vor dem
 * Anlegen gesucht:
 *
 * 1. Hinweise auf eine Bestellnummer (aus sessionStorage des Browsers oder
 *    aus den Metadaten des Stripe-PaymentIntents). Ein Hinweis zaehlt nur,
 *    wenn die Bestellung denselben Checkout-Key oder dieselbe Zahlungs-
 *    referenz traegt; der Browser kann also keine fremde Bestellung
 *    "uebernehmen".
 * 2. Suche ueber die Zahlungsreferenz in WooCommerce (meta_key / search;
 *    auf IONOS nicht immer verlaesslich, deshalb nur als zweiter Weg).
 *
 * Gefundene Bestellung: bezahlt -> zurueckgeben, nichts anlegen.
 * Offen (pending) mit gleichem Fingerabdruck (Warenkorb, Adresse, Versand,
 * Gutschein, Zahlungsweg) -> wiederverwenden. Offen mit anderem Fingerabdruck
 * -> alte stornieren (Woo bucht ggf. Lager zurueck) und neue anlegen; so hat
 * ein Kunde nie zwei offene Bestellungen. Storniert/fehlgeschlagen -> neue.
 *
 * Woo bietet dafuer keine Transaktion; zwei exakt gleichzeitige Aufrufe
 * koennen weiterhin zwei offene Bestellungen erzeugen. Der Bezahlen-Knopf
 * ist waehrend der Verarbeitung gesperrt, und unbezahlte Reste raeumt der
 * Cron cancel-stale-pending-orders nach 60 Minuten ab.
 */

import { createHash } from "node:crypto";
import {
  istBezahltStatus,
  ladeWooBestellung,
  META_CHECKOUT_FINGERABDRUCK,
  META_CHECKOUT_KEY,
  META_STRIPE_PI_ID,
  META_ZAHLUNGSREFERENZ,
  metaWert,
  storniereUnbezahlteBestellung,
  type WooBestellung,
  type Zahlungsart,
} from "@/lib/bestellung-zahlung";
import {
  createWooOrderFromCheckoutSync,
  findWooOrderByPaymentReference,
  type CreateWooOrderFromCheckoutSyncInput,
} from "@/lib/wc-order-from-payment";

export type BestellungEingaben = Omit<
  CreateWooOrderFromCheckoutSyncInput,
  "transactionId" | "zahlungsart" | "checkoutKey" | "fingerabdruck"
>;

export type OffeneBestellungEingabe = {
  zahlungsart: Zahlungsart;
  checkoutKey?: string;
  /** `pi_...` oder `paypal_...`; bei PayPal vor dem Anlegen der PayPal-Order leer. */
  zahlungsreferenz?: string;
  /** Moegliche Bestellnummern aus Browser oder PI-Metadaten; werden geprueft. */
  orderIdHinweise?: Array<number | undefined | null>;
  /**
   * Bestelleingaben, direkt oder als Funktion. Die Funktion darf werfen
   * (z. B. keine Artikel im PaymentIntent); existiert dann bereits eine
   * offene oder bezahlte Bestellung, wird sie trotzdem zurueckgegeben.
   */
  bestellung: BestellungEingaben | (() => BestellungEingaben);
};

export type OffeneBestellungErgebnis = {
  orderId: number;
  orderNumber: string;
  totalCents: number;
  zustand: "neu" | "wiederverwendet" | "bereits_bezahlt";
  bestellung: WooBestellung;
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function adressfelder(
  adresse: Record<string, string> | undefined
): Record<string, string> {
  const felder = [
    "email",
    "first_name",
    "last_name",
    "company",
    "address_1",
    "address_2",
    "postcode",
    "city",
    "state",
    "country",
  ];
  const out: Record<string, string> = {};
  for (const f of felder) {
    const v = asString(adresse?.[f]).toLowerCase();
    if (v) out[f] = v;
  }
  return out;
}

/**
 * Fingerabdruck der Bestelleingaben. Gleicher Fingerabdruck = gleiche
 * Bestellung, die offene Bestellung darf wiederverwendet werden.
 */
export function checkoutFingerabdruck(
  zahlungsart: Zahlungsart,
  b: BestellungEingaben
): string {
  const items = [...b.cartItems]
    .map((i) => ({ id: Number(i.id), qty: Math.max(1, Number(i.qty) || 1), price: asString(i.price) }))
    .sort((x, y) => x.id - y.id);
  const vat = asString(
    b.meta_data?.find((m) => m.key === "_billing_vat" || m.key === "billing_vat")?.value
  ).toUpperCase();
  const grundlage = {
    zahlungsart,
    items,
    coupon: asString(b.couponCode).toLowerCase(),
    discountCents: b.stripeDiscountCents ?? 0,
    shipping: b.checkoutShipping
      ? {
          rate: Number(b.checkoutShipping.rate) || 0,
          method_id: asString(b.checkoutShipping.method_id),
          label: asString(b.checkoutShipping.label),
        }
      : null,
    billing: adressfelder({ ...b.billing, ...(b.billingOverrides ?? {}) }),
    shippingAddr: adressfelder(b.shipping),
    vat,
    rc: b.isReverseCharge === true,
    wholesale: b.isWholesaleCheckout === true,
  };
  return createHash("sha256").update(JSON.stringify(grundlage)).digest("hex").slice(0, 32);
}

function passtZurSitzung(
  order: WooBestellung,
  checkoutKey: string,
  zahlungsreferenz: string
): boolean {
  if (checkoutKey && metaWert(order, META_CHECKOUT_KEY) === checkoutKey) return true;
  if (zahlungsreferenz) {
    if (metaWert(order, META_ZAHLUNGSREFERENZ) === zahlungsreferenz) return true;
    if (metaWert(order, META_STRIPE_PI_ID) === zahlungsreferenz) return true;
    if (asString(order.transaction_id) === zahlungsreferenz) return true;
  }
  return false;
}

/** Sucht die zur Sitzung gehoerende Bestellung; null, wenn es keine gibt. */
export async function findeBestellungZurSitzung(
  checkoutKey: string,
  zahlungsreferenz: string,
  orderIdHinweise: Array<number | undefined | null> = []
): Promise<WooBestellung | null> {
  const gesehen = new Set<number>();
  for (const hinweis of orderIdHinweise) {
    const id = Number(hinweis);
    if (!Number.isFinite(id) || id <= 0 || gesehen.has(id)) continue;
    gesehen.add(id);
    const order = await ladeWooBestellung(id);
    if (order && passtZurSitzung(order, checkoutKey, zahlungsreferenz)) {
      return order;
    }
  }
  if (zahlungsreferenz) {
    const row = await findWooOrderByPaymentReference(zahlungsreferenz);
    if (row?.id && !gesehen.has(Number(row.id))) {
      const order = await ladeWooBestellung(Number(row.id));
      if (order && passtZurSitzung(order, checkoutKey, zahlungsreferenz)) {
        return order;
      }
    }
  }
  return null;
}

export async function sichereOffeneBestellung(
  eingabe: OffeneBestellungEingabe
): Promise<OffeneBestellungErgebnis> {
  const checkoutKey = asString(eingabe.checkoutKey);
  const zahlungsreferenz = asString(eingabe.zahlungsreferenz);

  let eingaben: BestellungEingaben | null = null;
  let eingabenFehler: unknown = null;
  try {
    eingaben =
      typeof eingabe.bestellung === "function"
        ? eingabe.bestellung()
        : eingabe.bestellung;
  } catch (err) {
    eingabenFehler = err;
  }
  const fingerabdruck = eingaben
    ? checkoutFingerabdruck(eingabe.zahlungsart, eingaben)
    : "";

  const vorhanden = await findeBestellungZurSitzung(
    checkoutKey,
    zahlungsreferenz,
    eingabe.orderIdHinweise ?? []
  );

  if (vorhanden) {
    const orderNumber = asString(vorhanden.number) || String(vorhanden.id);
    const totalCents = Math.round(parseFloat(asString(vorhanden.total) || "0") * 100);

    if (istBezahltStatus(vorhanden.status)) {
      return {
        orderId: vorhanden.id,
        orderNumber,
        totalCents,
        zustand: "bereits_bezahlt",
        bestellung: vorhanden,
      };
    }

    const status = asString(vorhanden.status).toLowerCase();
    if (status === "pending") {
      // Ohne Eingaben (Artikel nicht rekonstruierbar) bleibt die offene
      // Bestellung, wie sie ist; stornieren waere schlimmer als behalten.
      if (
        !eingaben ||
        metaWert(vorhanden, META_CHECKOUT_FINGERABDRUCK) === fingerabdruck
      ) {
        return {
          orderId: vorhanden.id,
          orderNumber,
          totalCents,
          zustand: "wiederverwendet",
          bestellung: vorhanden,
        };
      }
      await storniereUnbezahlteBestellung(
        vorhanden.id,
        "Automatisch storniert: Kunde hat Warenkorb, Adresse oder Zahlungsweg geaendert; es wurde eine neue offene Bestellung angelegt."
      );
      console.log(
        `[offene-bestellung] #${orderNumber} storniert (Fingerabdruck geaendert), neue Bestellung folgt`
      );
    }
    // on-hold / cancelled / failed: neue Bestellung anlegen.
  }

  if (!eingaben) {
    throw eingabenFehler instanceof Error
      ? eingabenFehler
      : new Error("Bestelleingaben fehlen");
  }

  const neu = await createWooOrderFromCheckoutSync({
    ...eingaben,
    transactionId: zahlungsreferenz,
    zahlungsart: eingabe.zahlungsart,
    checkoutKey: checkoutKey || undefined,
    fingerabdruck,
  });
  return {
    orderId: neu.orderId,
    orderNumber: neu.orderNumber,
    totalCents: neu.totalCents,
    zustand: "neu",
    bestellung: neu.wooOrder as WooBestellung,
  };
}
