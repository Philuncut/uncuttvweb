/**
 * PayPal-Zahlungen mit WooCommerce-Bestellungen zusammenfuehren.
 *
 * Ablauf (ersetzt das reine Browser-Verfahren, siehe paypal-server.ts):
 *
 * 1. `legePayPalOrderZurBestellungAn`: offene Woo-Bestellung sicherstellen
 *    (pending, Idempotenz ueber checkoutKey), dann PayPal-Order mit dem
 *    Betrag DIESER Bestellung anlegen; custom_id = Woo-Bestellnummer. Die
 *    PayPal-Order-ID wird auf der Bestellung vermerkt (`_paypal_order_id`,
 *    `_uncuttv_payment_ref` = paypal_<id>). Gibt es zur offenen Bestellung
 *    schon eine PayPal-Order mit gleichem Betrag, die noch nicht gecaptured
 *    ist, wird sie wiederverwendet.
 *
 * 2. `erfassePayPalZahlung`: Capture serverseitig ausfuehren (oder bei
 *    Wiederholung die vorhandene Capture laden), Bestellnummer aus
 *    custom_id gegen die Bestellung pruefen, Betrag vergleichen und erst
 *    dann markiereBestellungBezahlt. Mehrfachaufrufe sind unschaedlich.
 *
 * `verbucheAltePayPalZahlung` bedient Browser mit altem Code, die nach
 * Browser-Capture noch /api/sync-order mit paypal_<id> aufrufen: Die Order
 * wird bei PayPal geladen, nur eine COMPLETED-Capture zaehlt, und vor dem
 * Anlegen wird nach einer bestehenden Bestellung zur Referenz gesucht.
 */

import {
  aendereWooBestellung,
  istBezahltStatus,
  markiereBestellungBezahlt,
  META_PAYPAL_CAPTURE_ID,
  META_PAYPAL_ORDER_ID,
  META_ZAHLUNGSREFERENZ,
  metaWert,
  type WooBestellung,
} from "@/lib/bestellung-zahlung";
import {
  findeBestellungZurSitzung,
  sichereOffeneBestellung,
  type BestellungEingaben,
} from "@/lib/offene-bestellung";
import {
  abgeschlosseneCapture,
  paypalBetragInCent,
  paypalOrderAnlegen,
  paypalOrderErfassen,
  paypalOrderLaden,
  PayPalFehler,
  wooOrderIdAusPayPalOrder,
  type PayPalOrder,
} from "@/lib/paypal-server";
import type { CreateWooOrderResult } from "@/lib/wc-order-from-payment";

export class PayPalZuordnungFehler extends Error {
  readonly code = "paypal_order_mismatch";
  constructor(message: string) {
    super(message);
    this.name = "PayPalZuordnungFehler";
  }
}

export function paypalReferenz(paypalOrderId: string): string {
  return `paypal_${paypalOrderId}`;
}

export type PayPalAnlegenEingabe = {
  checkoutKey?: string;
  orderIdHinweis?: number;
  beschreibung: string;
  bestellung: BestellungEingaben;
};

export type PayPalAnlegenErgebnis = {
  paypalOrderId: string;
  orderId: number;
  orderNumber: string;
  totalCents: number;
  /** true, wenn die Woo-Bestellung bereits bezahlt war; dann keine neue PayPal-Order. */
  bereitsBezahlt: boolean;
};

async function vorhandenePayPalOrderPruefen(
  order: WooBestellung,
  totalCents: number
): Promise<string | null> {
  const bisher = metaWert(order, META_PAYPAL_ORDER_ID);
  if (!bisher) return null;
  try {
    const pp = await paypalOrderLaden(bisher);
    const betrag = paypalBetragInCent(pp.purchase_units?.[0]?.amount);
    if (
      (pp.status === "CREATED" || pp.status === "APPROVED" || pp.status === "PAYER_ACTION_REQUIRED") &&
      betrag === totalCents
    ) {
      return pp.id;
    }
  } catch (err) {
    console.warn(
      `[paypal-zahlung] Vorhandene PayPal-Order ${bisher} nicht pruefbar:`,
      err instanceof Error ? err.message : err
    );
  }
  return null;
}

export async function legePayPalOrderZurBestellungAn(
  eingabe: PayPalAnlegenEingabe
): Promise<PayPalAnlegenErgebnis> {
  const offen = await sichereOffeneBestellung({
    zahlungsart: "paypal",
    checkoutKey: eingabe.checkoutKey,
    orderIdHinweise: [eingabe.orderIdHinweis],
    bestellung: eingabe.bestellung,
  });

  if (offen.zustand === "bereits_bezahlt") {
    return {
      paypalOrderId: metaWert(offen.bestellung, META_PAYPAL_ORDER_ID),
      orderId: offen.orderId,
      orderNumber: offen.orderNumber,
      totalCents: offen.totalCents,
      bereitsBezahlt: true,
    };
  }

  if (offen.zustand === "wiederverwendet") {
    const wieder = await vorhandenePayPalOrderPruefen(offen.bestellung, offen.totalCents);
    if (wieder) {
      return {
        paypalOrderId: wieder,
        orderId: offen.orderId,
        orderNumber: offen.orderNumber,
        totalCents: offen.totalCents,
        bereitsBezahlt: false,
      };
    }
  }

  const requestId = `${eingabe.checkoutKey ?? "nokey"}-${offen.orderId}-${offen.totalCents}`;
  const pp = await paypalOrderAnlegen({
    betrag: (offen.totalCents / 100).toFixed(2),
    waehrung: "EUR",
    wooOrderId: offen.orderId,
    beschreibung: `${eingabe.beschreibung} #${offen.orderNumber}`,
    requestId,
  });

  await aendereWooBestellung(offen.orderId, {
    meta_data: [
      { key: META_PAYPAL_ORDER_ID, value: pp.id },
      { key: META_ZAHLUNGSREFERENZ, value: paypalReferenz(pp.id) },
    ],
  });
  console.log(
    `[paypal-zahlung] PayPal-Order ${pp.id} fuer #${offen.orderNumber} (${offen.totalCents} Cent) angelegt`
  );

  return {
    paypalOrderId: pp.id,
    orderId: offen.orderId,
    orderNumber: offen.orderNumber,
    totalCents: offen.totalCents,
    bereitsBezahlt: false,
  };
}

export type PayPalErfassenErgebnis = CreateWooOrderResult & {
  paypalOrderId: string;
  captureId?: string;
  /** PayPal-Capture nicht COMPLETED (z. B. PENDING bei Pruefung durch PayPal). */
  paypalStatus: string;
};

async function bestellungZurPayPalOrder(
  pp: PayPalOrder,
  orderIdHinweis?: number
): Promise<WooBestellung> {
  const ausCustomId = wooOrderIdAusPayPalOrder(pp);
  const order = await findeBestellungZurSitzung("", paypalReferenz(pp.id), [
    ausCustomId || undefined,
    orderIdHinweis,
  ]);
  if (!order) {
    throw new PayPalZuordnungFehler(
      `Zur PayPal-Order ${pp.id} gibt es keine passende Bestellung (custom_id=${ausCustomId || "-"})`
    );
  }
  if (ausCustomId && order.id !== ausCustomId) {
    throw new PayPalZuordnungFehler(
      `PayPal-Order ${pp.id} nennt Bestellung #${ausCustomId}, gefunden wurde #${order.id}`
    );
  }
  const vermerkt = metaWert(order, META_PAYPAL_ORDER_ID);
  if (vermerkt && vermerkt !== pp.id) {
    throw new PayPalZuordnungFehler(
      `Bestellung #${order.id} gehoert zu PayPal-Order ${vermerkt}, nicht ${pp.id}`
    );
  }
  return order;
}

function ergebnisAus(
  order: WooBestellung,
  pp: PayPalOrder,
  status: CreateWooOrderResult["status"],
  captureId?: string
): PayPalErfassenErgebnis {
  return {
    orderId: order.id,
    orderNumber: String(order.number ?? order.id),
    status,
    totalCents: Math.round(parseFloat(String(order.total ?? "0")) * 100),
    wooOrder: order,
    paypalOrderId: pp.id,
    captureId,
    paypalStatus: pp.status,
  };
}

/**
 * Capture ausfuehren und Bestellung verbuchen. Wiederholbar.
 */
export async function erfassePayPalZahlung(
  paypalOrderId: string,
  orderIdHinweis?: number
): Promise<PayPalErfassenErgebnis> {
  const vorher = await paypalOrderLaden(paypalOrderId);
  const order = await bestellungZurPayPalOrder(vorher, orderIdHinweis);

  if (istBezahltStatus(order.status)) {
    return ergebnisAus(order, vorher, "already_paid", metaWert(order, META_PAYPAL_CAPTURE_ID) || undefined);
  }

  let pp = vorher;
  if (!abgeschlosseneCapture(pp)) {
    if (pp.status !== "APPROVED") {
      // CREATED: Kunde hat bei PayPal nicht bestaetigt. COMPLETED ohne
      // Capture gibt es nicht. Alles andere kann nicht gecaptured werden.
      throw new PayPalFehler(
        `PayPal-Order ${pp.id} ist im Status ${pp.status} und kann nicht gecaptured werden`,
        409,
        `ORDER_STATUS_${pp.status}`,
        ""
      );
    }
    pp = await paypalOrderErfassen(pp.id, `capture-${pp.id}`);
  }

  const capture = abgeschlosseneCapture(pp);
  if (!capture) {
    const offenerStatus = pp.purchase_units?.[0]?.payments?.captures?.[0]?.status ?? pp.status;
    console.warn(
      `[paypal-zahlung] Capture fuer ${pp.id} nicht abgeschlossen (${offenerStatus}); Bestellung #${order.id} bleibt offen`
    );
    return ergebnisAus(order, pp, "pending");
  }

  const bezahlt = await markiereBestellungBezahlt({
    orderId: order.id,
    zahlungsart: "paypal",
    transactionId: capture.id,
    bezahltCent: paypalBetragInCent(capture.amount),
    waehrung: capture.amount?.currency_code ?? "EUR",
    quelle: `PayPal-Capture ${capture.id}`,
    belegId: capture.id,
    meta: [
      { key: META_PAYPAL_ORDER_ID, value: pp.id },
      { key: META_PAYPAL_CAPTURE_ID, value: capture.id },
      { key: META_ZAHLUNGSREFERENZ, value: paypalReferenz(pp.id) },
    ],
    bestellung: order,
  });

  const status: CreateWooOrderResult["status"] =
    bezahlt.ergebnis === "bezahlt"
      ? "paid"
      : bezahlt.ergebnis === "bereits_bezahlt"
        ? "already_paid"
        : "amount_mismatch";
  return ergebnisAus(order, pp, status, capture.id);
}

/**
 * Alte Browser: Capture ist im Browser passiert, der Server bekommt nur
 * paypal_<id> und die Bestelldaten. Zahlung wird bei PayPal geprueft,
 * Bestellung idempotent angelegt und nur mit COMPLETED-Capture verbucht.
 */
export async function verbucheAltePayPalZahlung(
  paypalOrderId: string,
  bestellung: BestellungEingaben
): Promise<PayPalErfassenErgebnis> {
  const pp = await paypalOrderLaden(paypalOrderId);
  const capture = abgeschlosseneCapture(pp);
  if (!capture) {
    throw new PayPalFehler(
      `PayPal-Order ${paypalOrderId} hat keine abgeschlossene Capture (Status ${pp.status})`,
      402,
      "NOT_CAPTURED",
      ""
    );
  }

  const offen = await sichereOffeneBestellung({
    zahlungsart: "paypal",
    zahlungsreferenz: paypalReferenz(pp.id),
    orderIdHinweise: [wooOrderIdAusPayPalOrder(pp) || undefined],
    bestellung,
  });
  if (offen.zustand === "bereits_bezahlt") {
    return ergebnisAus(offen.bestellung, pp, "already_paid", capture.id);
  }

  const bezahlt = await markiereBestellungBezahlt({
    orderId: offen.orderId,
    zahlungsart: "paypal",
    transactionId: capture.id,
    bezahltCent: paypalBetragInCent(capture.amount),
    waehrung: capture.amount?.currency_code ?? "EUR",
    quelle: `PayPal-Capture ${capture.id} (Browser-Capture, alter Client)`,
    belegId: capture.id,
    meta: [
      { key: META_PAYPAL_ORDER_ID, value: pp.id },
      { key: META_PAYPAL_CAPTURE_ID, value: capture.id },
    ],
    bestellung: offen.zustand === "neu" ? null : offen.bestellung,
  });
  const status: CreateWooOrderResult["status"] =
    bezahlt.ergebnis === "bezahlt"
      ? "paid"
      : bezahlt.ergebnis === "bereits_bezahlt"
        ? "already_paid"
        : "amount_mismatch";
  return ergebnisAus(offen.bestellung, pp, status, capture.id);
}
