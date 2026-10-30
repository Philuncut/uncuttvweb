/**
 * Stripe-Zahlungen mit WooCommerce-Bestellungen zusammenfuehren.
 *
 * Zwei Einstiege, ein Weg:
 *
 * - `bereiteBestellungZuPaymentIntentVor` legt vor der Zahlung die offene
 *   Bestellung an (oder findet die bestehende) und schreibt die Bestell-
 *   nummer in die Metadaten des PaymentIntents (`woo_order_id`). Damit kennt
 *   Stripe die Bestellung, und der Webhook braucht keine Woo-Suche.
 *
 * - `verbucheStripeZahlung` ist der einzige Weg, auf dem eine Stripe-Zahlung
 *   eine Bestellung auf "processing" bringt. Der PaymentIntent wird immer
 *   frisch bei Stripe geladen (nie dem Browser geglaubt); nur bei Status
 *   `succeeded` und passendem Betrag wird markiereBestellungBezahlt
 *   gerufen. Aufrufer: der Stripe-Webhook (payment_intent.succeeded) und,
 *   als Abgleich fuer die Erfolgsseite, /api/sync-order. Beide duerfen sich
 *   ueberholen oder wiederholen; das Ergebnis bleibt eine bezahlte
 *   Bestellung.
 *
 * Fehlt zur Zahlung eine Bestellung (alter Browser-Stand, Vorbereitung
 * fehlgeschlagen), wird sie aus dem cart_snapshot der PI-Metadaten
 * angelegt, wie es createWooOrderFromPayment vorher tat, nur ohne set_paid.
 */

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  getCartItemsForSync,
} from "@/lib/cart-items-from-context";
import {
  markiereBestellungBezahlt,
  META_STRIPE_CHARGE_ID,
  type WooBestellung,
} from "@/lib/bestellung-zahlung";
import {
  sichereOffeneBestellung,
  type BestellungEingaben,
  type OffeneBestellungErgebnis,
} from "@/lib/offene-bestellung";
import {
  resolveCheckoutShippingFromPi,
  resolveCustomerFromPaymentIntent,
  type CreateWooOrderResult,
  type WooOrderSyncContext,
} from "@/lib/wc-order-from-payment";

export class BestellungOhneArtikelFehler extends Error {
  readonly code = "no_cart_items";
  constructor(message: string) {
    super(message);
    this.name = "BestellungOhneArtikelFehler";
  }
}

export class PaymentIntentStorniertFehler extends Error {
  readonly code = "payment_intent_canceled";
  constructor(public readonly paymentIntentId: string) {
    super(`PaymentIntent ${paymentIntentId} ist storniert`);
    this.name = "PaymentIntentStorniertFehler";
  }
}

function orderIdAusPi(pi: Stripe.PaymentIntent): number | undefined {
  const raw = pi.metadata?.woo_order_id;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function ladePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
}

function chargeIdAusPi(pi: Stripe.PaymentIntent): string | undefined {
  const c = pi.latest_charge;
  if (!c) return undefined;
  return typeof c === "string" ? c : c.id;
}

/** Bestelleingaben aus PaymentIntent und (falls vorhanden) Checkout-Daten. */
function bestellEingabenAusPi(
  pi: Stripe.PaymentIntent,
  syncContext: WooOrderSyncContext | undefined
): BestellungEingaben {
  let cartItems;
  try {
    cartItems = getCartItemsForSync(
      syncContext,
      pi.metadata as Record<string, string> | undefined
    );
  } catch (err) {
    throw new BestellungOhneArtikelFehler(
      err instanceof Error ? err.message : "Keine Artikel verfuegbar"
    );
  }

  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object"
      ? pi.latest_charge
      : null;
  const { billing, shipping } = resolveCustomerFromPaymentIntent(
    pi,
    charge,
    syncContext
  );

  const couponFromMeta =
    (typeof pi.metadata?.coupon_code === "string" &&
      pi.metadata.coupon_code.trim()) ||
    undefined;
  const discountRaw = pi.metadata?.discount_amount_cents;
  const discountCents = parseInt(typeof discountRaw === "string" ? discountRaw : "", 10);

  return {
    cartItems,
    billing,
    shipping,
    isReverseCharge:
      syncContext?.isReverseCharge === true ||
      pi.metadata?.is_reverse_charge === "true",
    isWholesaleCheckout:
      syncContext?.isWholesale === true || pi.metadata?.is_wholesale === "true",
    billingOverrides: syncContext?.billing,
    meta_data: syncContext?.meta_data,
    checkoutShipping: resolveCheckoutShippingFromPi(pi, syncContext),
    videoUtm: syncContext?.videoUtm ?? {
      source: pi.metadata?.utm_source,
      videoId: pi.metadata?.utm_video_id,
    },
    marketingUtm: syncContext?.marketingUtm,
    stripePiId: pi.id,
    stripeChargeId: chargeIdAusPi(pi),
    couponCode: couponFromMeta,
    stripeAmountCents: typeof pi.amount === "number" ? pi.amount : undefined,
    stripeDiscountCents:
      Number.isFinite(discountCents) && discountCents > 0 ? discountCents : 0,
  };
}

async function schreibeBestellungInPi(
  pi: Stripe.PaymentIntent,
  orderId: number,
  orderNumber: string
): Promise<void> {
  if (pi.metadata?.woo_order_id === String(orderId)) return;
  try {
    await stripe.paymentIntents.update(pi.id, {
      metadata: {
        ...(pi.metadata ?? {}),
        woo_order_id: String(orderId),
        woo_order_number: orderNumber,
      },
    });
  } catch (err) {
    // Nicht fatal: der Webhook findet die Bestellung dann ueber _stripe_pi_id.
    console.warn(
      `[stripe-zahlung] woo_order_id konnte nicht in ${pi.id} geschrieben werden:`,
      err instanceof Error ? err.message : err
    );
  }
}

export type VorbereitenEingabe = {
  paymentIntentId: string;
  checkoutKey?: string;
  orderIdHinweis?: number;
  syncContext?: WooOrderSyncContext;
};

export type VorbereitenErgebnis = OffeneBestellungErgebnis & {
  pi: Stripe.PaymentIntent;
};

/**
 * Offene Bestellung zum PaymentIntent sicherstellen (vor der Zahlung).
 * Wirft PaymentIntentStorniertFehler, wenn der PI nicht mehr bezahlbar ist.
 */
export async function bereiteBestellungZuPaymentIntentVor(
  eingabe: VorbereitenEingabe
): Promise<VorbereitenErgebnis> {
  const pi = await ladePaymentIntent(eingabe.paymentIntentId.trim());
  if (pi.status === "canceled") {
    throw new PaymentIntentStorniertFehler(pi.id);
  }

  const ergebnis = await sichereOffeneBestellung({
    zahlungsart: "stripe",
    checkoutKey: eingabe.checkoutKey,
    zahlungsreferenz: pi.id,
    orderIdHinweise: [eingabe.orderIdHinweis, orderIdAusPi(pi)],
    bestellung: () => bestellEingabenAusPi(pi, eingabe.syncContext),
  });

  await schreibeBestellungInPi(pi, ergebnis.orderId, ergebnis.orderNumber);

  if (
    typeof pi.amount === "number" &&
    Math.abs(pi.amount - ergebnis.totalCents) > 0
  ) {
    console.warn(
      `[stripe-zahlung] Betrag PI ${pi.id}=${pi.amount} vs. Woo #${ergebnis.orderNumber}=${ergebnis.totalCents} (Differenz ${pi.amount - ergebnis.totalCents} Cent)`
    );
  }

  return { ...ergebnis, pi };
}

export type VerbuchenEingabe = {
  paymentIntentId: string;
  /** Herkunft fuer die Bestellnotiz, z. B. "Stripe-Webhook evt_..." oder "sync-order". */
  quelle: string;
  /** Stripe-Event-ID; verhindert doppelte Verbuchung desselben Events. */
  belegId?: string;
  /** Checkout-Daten, falls der Browser sie mitschickt (Adresse, Firma, UID). */
  syncContext?: WooOrderSyncContext;
  checkoutKey?: string;
  orderIdHinweis?: number;
};

/**
 * Zahlung eines PaymentIntents serverseitig pruefen und verbuchen.
 * Liefert immer eine Bestellung (legt sie notfalls an) und den Zustand.
 */
export async function verbucheStripeZahlung(
  eingabe: VerbuchenEingabe
): Promise<CreateWooOrderResult & { zahlungsart: "stripe"; order: WooBestellung }> {
  const pi = await ladePaymentIntent(eingabe.paymentIntentId.trim());

  const offen = await sichereOffeneBestellung({
    zahlungsart: "stripe",
    checkoutKey: eingabe.checkoutKey,
    zahlungsreferenz: pi.id,
    orderIdHinweise: [eingabe.orderIdHinweis, orderIdAusPi(pi)],
    bestellung: () => bestellEingabenAusPi(pi, eingabe.syncContext),
  });
  await schreibeBestellungInPi(pi, offen.orderId, offen.orderNumber);

  if (offen.zustand === "bereits_bezahlt") {
    return {
      orderId: offen.orderId,
      orderNumber: offen.orderNumber,
      status: "already_paid",
      totalCents: offen.totalCents,
      wooOrder: offen.bestellung,
      zahlungsart: "stripe",
      order: offen.bestellung,
    };
  }

  if (pi.status !== "succeeded") {
    return {
      orderId: offen.orderId,
      orderNumber: offen.orderNumber,
      status: "pending",
      totalCents: offen.totalCents,
      wooOrder: offen.bestellung,
      zahlungsart: "stripe",
      order: offen.bestellung,
    };
  }

  const chargeId = chargeIdAusPi(pi);
  const bezahlt = await markiereBestellungBezahlt({
    orderId: offen.orderId,
    zahlungsart: "stripe",
    transactionId: pi.id,
    bezahltCent:
      typeof pi.amount_received === "number" && pi.amount_received > 0
        ? pi.amount_received
        : pi.amount,
    waehrung: pi.currency ?? "eur",
    quelle: eingabe.quelle,
    belegId: eingabe.belegId,
    meta: chargeId ? [{ key: META_STRIPE_CHARGE_ID, value: chargeId }] : [],
    bestellung: offen.zustand === "neu" ? null : offen.bestellung,
  });

  const status: CreateWooOrderResult["status"] =
    bezahlt.ergebnis === "bezahlt"
      ? "paid"
      : bezahlt.ergebnis === "bereits_bezahlt"
        ? "already_paid"
        : "amount_mismatch";

  return {
    orderId: offen.orderId,
    orderNumber: offen.orderNumber,
    status,
    totalCents: offen.totalCents,
    wooOrder: offen.bestellung,
    zahlungsart: "stripe",
    order: offen.bestellung,
  };
}
