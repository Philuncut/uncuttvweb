/**
 * Zahlungsstatus einer WooCommerce-Bestellung, serverseitig und idempotent.
 *
 * Warum es diese Datei gibt
 * -------------------------
 * Bis Oktober 2026 legte der Shop die Woo-Bestellung erst NACH der Zahlung
 * an, mit `status: "processing"` und `set_paid: true` im selben POST. Der
 * Aufruf kam aus dem Browser (sync-order), der Server pruefte die Zahlung
 * nicht und erkannte Wiederholungen nicht. Ergebnis am 18./19.10.2026:
 * drei Bestellungen (#6390, #6391, #6392) zu EINER PayPal-Zahlung, alle
 * "In Bearbeitung".
 *
 * Neue Regel
 * ----------
 * 1. Die Bestellung wird VOR der Zahlung als `pending` angelegt
 *    (siehe offene-bestellung.ts). Kein set_paid, kein transaction_id.
 * 2. Auf `processing` geht sie nur hier, in `markiereBestellungBezahlt`,
 *    und nur mit einem Beleg, den der Server selbst bei Stripe oder PayPal
 *    geholt hat: PaymentIntent `succeeded` (Webhook oder Abruf) bzw.
 *    PayPal-Capture `COMPLETED`. Bestellnummer und Betrag werden gegen
 *    diesen Beleg geprueft.
 * 3. Jeder Aufruf ist wiederholbar: Ist die Bestellung schon bezahlt,
 *    passiert nichts. Stimmt der Betrag nicht, geht sie auf `on-hold`
 *    mit Notiz statt auf `processing`.
 *
 * Woo-Mechanik: `PUT /orders/{id}` mit `set_paid: true` ruft in WooCommerce
 * `payment_complete()` auf, wenn `needs_payment()` wahr ist (Status pending
 * oder failed). Das setzt date_paid, transaction_id, reduziert den
 * Lagerbestand und wechselt auf processing (bzw. completed bei rein
 * virtuellen Artikeln). Eine stornierte Bestellung (z. B. vom 60-Minuten-
 * Aufraeumer) wird vorher auf pending zurueckgesetzt, damit eine spaete
 * Zahlung trotzdem korrekt verbucht wird.
 */

import { parsePrice } from "@/lib/parse-price";
import {
  enqueueWholesaleOfficeNotification,
} from "@/lib/notify-wholesale-order";
import {
  fetchOrder,
  resolveIsWholesaleOrder,
} from "@/lib/order-confirmation-email";
import {
  sendOrderConfirmationWithPdf,
  type OrderPaymentType,
} from "@/lib/send-order-confirmation-with-pdf";

export type Zahlungsart = "stripe" | "paypal";

/** Rundungsdifferenz, die zwischen Zahlungsbeleg und Woo-Summe noch durchgeht. */
export const BETRAG_TOLERANZ_CENT = 5;

/** Meta-Schluessel, die der Shop auf Bestellungen schreibt. */
export const META_ZAHLUNGSREFERENZ = "_uncuttv_payment_ref";
export const META_CHECKOUT_KEY = "_uncuttv_checkout_key";
export const META_CHECKOUT_FINGERABDRUCK = "_uncuttv_checkout_fingerprint";
export const META_ZAHLUNG_QUELLE = "_uncuttv_paid_source";
export const META_ZAHLUNG_EVENT = "_uncuttv_paid_event";
export const META_PAYPAL_ORDER_ID = "_paypal_order_id";
export const META_PAYPAL_CAPTURE_ID = "_paypal_capture_id";
export const META_STRIPE_PI_ID = "_stripe_pi_id";
export const META_STRIPE_CHARGE_ID = "_stripe_charge_id";

/** Status, in denen eine Bestellung als bezahlt gilt und nicht mehr angefasst wird. */
const BEZAHLT_STATUS = new Set(["processing", "completed", "refunded"]);

/** Status, aus denen Woo `set_paid` nicht annimmt; vorher auf pending zuruecksetzen. */
const ZURUECKSETZEN_VOR_ZAHLUNG = new Set(["cancelled", "on-hold"]);

export type WooBestellung = {
  id: number;
  number?: string;
  status?: string;
  currency?: string;
  total?: string;
  payment_method?: string;
  payment_method_title?: string;
  transaction_id?: string;
  customer_id?: number;
  date_created_gmt?: string;
  created_via?: string;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  line_items?: Array<{
    product_id?: number;
    name?: string;
    quantity?: number;
    total?: string;
  }>;
  shipping_lines?: Array<{
    method_id?: string;
    method_title?: string;
    total?: string;
  }>;
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

export type BezahltErgebnis =
  | { ergebnis: "bezahlt"; orderId: number; orderNumber: string }
  | { ergebnis: "bereits_bezahlt"; orderId: number; orderNumber: string }
  | {
      ergebnis: "betrag_abweichend";
      orderId: number;
      orderNumber: string;
      erwartetCent: number;
      bezahltCent: number;
    };

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

export function metaWert(
  order: { meta_data?: Array<{ key?: string; value?: unknown }> } | null | undefined,
  key: string
): string {
  const entry = order?.meta_data?.find((m) => m?.key === key);
  return asString(entry?.value);
}

/** "61.80" -> 6180. Woo liefert Betraege als Zeichenkette mit Punkt. */
export function betragInCent(total: string | number | null | undefined): number {
  if (total == null) return 0;
  return Math.round(parsePrice(String(total)) * 100);
}

/** Zahlungsbeleg und Bestellsumme passen, wenn sie hoechstens um die Toleranz abweichen. */
export function betragStimmt(
  erwartetCent: number,
  bezahltCent: number,
  toleranzCent = BETRAG_TOLERANZ_CENT
): boolean {
  if (!Number.isFinite(erwartetCent) || !Number.isFinite(bezahltCent)) return false;
  return Math.abs(erwartetCent - bezahltCent) <= toleranzCent;
}

export function istBezahltStatus(status: string | undefined): boolean {
  return BEZAHLT_STATUS.has((status ?? "").trim().toLowerCase());
}

function wooBasis(): string {
  return (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
}

function wooAuth(): string {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.WOOCOMMERCE_KEY}:${process.env.WOOCOMMERCE_SECRET}`
    ).toString("base64")
  );
}

export async function ladeWooBestellung(orderId: number): Promise<WooBestellung | null> {
  const res = await fetch(`${wooBasis()}/wp-json/wc/v3/orders/${orderId}`, {
    headers: { Authorization: wooAuth() },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Woo GET /orders/${orderId}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as WooBestellung;
}

export async function aendereWooBestellung(
  orderId: number,
  body: Record<string, unknown>
): Promise<WooBestellung> {
  const res = await fetch(`${wooBasis()}/wp-json/wc/v3/orders/${orderId}`, {
    method: "PUT",
    headers: { Authorization: wooAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Woo PUT /orders/${orderId}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as WooBestellung;
}

/** Interne Bestellnotiz (nicht fuer den Kunden sichtbar). Fehler werden nur geloggt. */
export async function bestellnotiz(orderId: number, text: string): Promise<void> {
  try {
    const res = await fetch(
      `${wooBasis()}/wp-json/wc/v3/orders/${orderId}/notes`,
      {
        method: "POST",
        headers: { Authorization: wooAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ note: text, customer_note: false }),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      console.warn(`[bestellung-zahlung] Notiz an #${orderId} fehlgeschlagen: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[bestellung-zahlung] Notiz an #${orderId} fehlgeschlagen:`, err);
  }
}

function zahlungsartTitel(zahlungsart: Zahlungsart): string {
  return zahlungsart === "paypal" ? "PayPal" : "Stripe";
}

export type BezahltEingabe = {
  orderId: number;
  zahlungsart: Zahlungsart;
  /** Stripe: PaymentIntent-ID. PayPal: Capture-ID. Landet in Woo `transaction_id`. */
  transactionId: string;
  /** Betrag laut Zahlungsbeleg (Stripe amount_received, PayPal capture.amount). */
  bezahltCent: number;
  /** Waehrung laut Beleg, z. B. "eur". */
  waehrung: string;
  /** Herkunft des Belegs fuer die Bestellnotiz, z. B. "Stripe-Webhook evt_...". */
  quelle: string;
  /** Eindeutige Kennung des Belegs (Event-ID, Capture-ID) gegen doppelte Verarbeitung. */
  belegId?: string;
  /** Zusaetzliche Meta-Eintraege (Charge-ID, PayPal-IDs). */
  meta?: Array<{ key: string; value: string }>;
  /** Bereits geladene Bestellung, spart einen GET. */
  bestellung?: WooBestellung | null;
};

/**
 * Setzt eine Bestellung auf bezahlt, aber nur mit serverseitig geprueftem
 * Beleg und nur einmal. Siehe Kopfkommentar.
 */
export async function markiereBestellungBezahlt(
  eingabe: BezahltEingabe
): Promise<BezahltErgebnis> {
  const order =
    eingabe.bestellung ?? (await ladeWooBestellung(eingabe.orderId));
  if (!order) {
    throw new Error(`Bestellung #${eingabe.orderId} nicht gefunden`);
  }
  const orderNumber = asString(order.number) || String(order.id);

  if (istBezahltStatus(order.status)) {
    return { ergebnis: "bereits_bezahlt", orderId: order.id, orderNumber };
  }

  // Derselbe Beleg ein zweites Mal (Webhook-Wiederholung in einer Luecke)?
  if (
    eingabe.belegId &&
    metaWert(order, META_ZAHLUNG_EVENT) === eingabe.belegId
  ) {
    return { ergebnis: "bereits_bezahlt", orderId: order.id, orderNumber };
  }

  const erwartetCent = betragInCent(order.total);
  const orderWaehrung = asString(order.currency).toLowerCase() || "eur";
  const belegWaehrung = asString(eingabe.waehrung).toLowerCase() || "eur";

  if (
    orderWaehrung !== belegWaehrung ||
    !betragStimmt(erwartetCent, eingabe.bezahltCent)
  ) {
    await aendereWooBestellung(order.id, {
      status: "on-hold",
      transaction_id: eingabe.transactionId,
      payment_method: eingabe.zahlungsart,
      payment_method_title: zahlungsartTitel(eingabe.zahlungsart),
      meta_data: [
        { key: META_ZAHLUNG_QUELLE, value: eingabe.quelle },
        ...(eingabe.belegId ? [{ key: META_ZAHLUNG_EVENT, value: eingabe.belegId }] : []),
        ...(eingabe.meta ?? []),
      ],
    });
    await bestellnotiz(
      order.id,
      `Zahlung eingegangen (${eingabe.quelle}), aber der Betrag passt nicht zur Bestellung: ` +
        `bezahlt ${(eingabe.bezahltCent / 100).toFixed(2)} ${belegWaehrung.toUpperCase()}, ` +
        `Bestellung ${(erwartetCent / 100).toFixed(2)} ${orderWaehrung.toUpperCase()}. ` +
        `Transaktion ${eingabe.transactionId}. Bitte manuell pruefen.`
    );
    console.error(
      `[bestellung-zahlung] Betragsabweichung #${orderNumber}: erwartet ${erwartetCent}, bezahlt ${eingabe.bezahltCent} (${eingabe.quelle})`
    );
    return {
      ergebnis: "betrag_abweichend",
      orderId: order.id,
      orderNumber,
      erwartetCent,
      bezahltCent: eingabe.bezahltCent,
    };
  }

  // Woo nimmt set_paid nur aus pending/failed an. Storniert oder on-hold: erst zurueck.
  if (ZURUECKSETZEN_VOR_ZAHLUNG.has(asString(order.status).toLowerCase())) {
    await aendereWooBestellung(order.id, { status: "pending" });
    await bestellnotiz(
      order.id,
      `Zahlung nachtraeglich eingegangen (${eingabe.quelle}); Bestellung aus "${order.status}" wieder geoeffnet.`
    );
  }

  await aendereWooBestellung(order.id, {
    set_paid: true,
    transaction_id: eingabe.transactionId,
    payment_method: eingabe.zahlungsart,
    payment_method_title: zahlungsartTitel(eingabe.zahlungsart),
    meta_data: [
      { key: META_ZAHLUNG_QUELLE, value: eingabe.quelle },
      ...(eingabe.belegId ? [{ key: META_ZAHLUNG_EVENT, value: eingabe.belegId }] : []),
      ...(eingabe.meta ?? []),
    ],
  });
  await bestellnotiz(
    order.id,
    `Zahlung serverseitig bestaetigt (${eingabe.quelle}): ` +
      `${(eingabe.bezahltCent / 100).toFixed(2)} ${belegWaehrung.toUpperCase()}, ` +
      `Transaktion ${eingabe.transactionId}.`
  );
  console.log(
    `[bestellung-zahlung] #${orderNumber} bezahlt (${eingabe.zahlungsart}, ${eingabe.quelle}, ${eingabe.transactionId})`
  );
  return { ergebnis: "bezahlt", orderId: order.id, orderNumber };
}

/**
 * Storniert eine unbezahlte Bestellung. Woo bucht dabei den Lagerbestand
 * zurueck, falls er reduziert war. Bezahlte Bestellungen werden nie storniert.
 */
export async function storniereUnbezahlteBestellung(
  orderId: number,
  grund: string
): Promise<boolean> {
  const order = await ladeWooBestellung(orderId);
  if (!order) return false;
  if (istBezahltStatus(order.status)) return false;
  if (asString(order.status).toLowerCase() === "cancelled") return true;
  await aendereWooBestellung(orderId, { status: "cancelled" });
  await bestellnotiz(orderId, grund);
  return true;
}

function adresseAlsText(
  adresse: Record<string, unknown> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(adresse ?? {})) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Alles, was nach einem bestaetigten Zahlungseingang passieren soll:
 * Bestaetigungsmail mit Rechnung (idempotent ueber Meta-Flag) und bei
 * Haendlerbestellungen die Office-Benachrichtigung. Vorher lief beides beim
 * Anlegen der Bestellung, also vor jeder Zahlungspruefung.
 */
export async function nachZahlungseingang(
  orderId: number,
  zahlungsart: Zahlungsart
): Promise<void> {
  const paymentType: OrderPaymentType = zahlungsart;
  try {
    await sendOrderConfirmationWithPdf(orderId, { paymentType });
  } catch (err) {
    console.error(`[bestellung-zahlung] Bestaetigungsmail #${orderId} fehlgeschlagen:`, err);
  }

  try {
    const order = await fetchOrder(orderId);
    const istHaendler = await resolveIsWholesaleOrder(order);
    if (!istHaendler) return;
    if (metaWert(order, "_uncuttv_wholesale_office_notified") === "yes") return;

    const billing = adresseAlsText(order.billing as Record<string, unknown> | undefined);
    const shipping = adresseAlsText(order.shipping as Record<string, unknown> | undefined);
    const items = (order.line_items ?? []).map((li) => {
      const qty = Math.max(1, Number(li.quantity) || 1);
      const lineTotal = parsePrice(String(li.total ?? "0"));
      return {
        id: Number(li.product_id) || 0,
        name: asString(li.name) || "Artikel",
        qty,
        price: (lineTotal / qty).toFixed(2),
      };
    });
    const ship = order.shipping_lines?.[0] as
      | { method_id?: string; method_title?: string; total?: string }
      | undefined;
    const vat = metaWert(order, "_billing_vat");
    const istRc = metaWert(order, "_uncuttv_reverse_charge") === "yes";

    enqueueWholesaleOfficeNotification({
      orderId,
      orderNumber: asString(order.number) || String(orderId),
      billing,
      shipping,
      items,
      checkoutShipping: ship
        ? {
            rate: parsePrice(String(ship.total ?? "0")),
            label: asString(ship.method_title) || "Versand",
            method_id: asString(ship.method_id) || "flat_rate",
          }
        : null,
      taxCountry: billing.country || shipping.country || "",
      isWholesaleCheckout: true,
      isReverseCharge: istRc,
      orderMeta: order.meta_data,
      paymentMethodTitle:
        asString(order.payment_method_title) || zahlungsartTitel(zahlungsart),
      vatNumber: vat || undefined,
      wooCommerceBaseUrl: wooBasis(),
    });
    await aendereWooBestellung(orderId, {
      meta_data: [{ key: "_uncuttv_wholesale_office_notified", value: "yes" }],
    });
  } catch (err) {
    console.error(`[bestellung-zahlung] Haendler-Benachrichtigung #${orderId}:`, err);
  }
}
