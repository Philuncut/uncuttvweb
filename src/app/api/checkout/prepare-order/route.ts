/**
 * POST /api/checkout/prepare-order
 *
 * Legt VOR der Stripe-Zahlung (Karte, Klarna, EPS, Apple/Google Pay) die
 * WooCommerce-Bestellung als "pending" an oder findet die bereits offene
 * Bestellung dieser Kassen-Sitzung (offene-bestellung.ts). Die Bestellnummer
 * wird in die PaymentIntent-Metadaten geschrieben, damit der Webhook die
 * Zahlung ohne Woo-Suche zuordnen kann.
 *
 * Der Browser schickt dieselben Angaben wie frueher an /api/sync-order
 * (Adresse, Artikel, Firma, UID, Versand, UTM) plus paymentIntentId,
 * checkoutKey und den Hinweis auf die zuletzt angelegte Bestellung.
 *
 * Antwort: { orderId, orderNumber, totalCents, state } mit state
 * "pending" | "reused" | "paid". "paid" heisst: Zu diesem PaymentIntent ist
 * die Bestellung schon bezahlt (Doppelklick nach Erfolg); der Browser geht
 * direkt zur Erfolgsseite.
 */

import { NextResponse } from "next/server";
import { normalizeCartMetaItems } from "@/lib/cart-items-from-context";
import {
  bereiteBestellungZuPaymentIntentVor,
  BestellungOhneArtikelFehler,
  PaymentIntentStorniertFehler,
} from "@/lib/stripe-zahlung";
import type {
  CartMeta,
  CheckoutShippingInput,
  CustomerInfo,
} from "@/lib/wc-order-from-payment";
import type { OrderMetaEntry, VideoUtmInput } from "@/lib/video-utm-server";
import type { MarketingUtmInput } from "@/lib/marketing-utm-server";

export const dynamic = "force-dynamic";

type Body = {
  paymentIntentId?: string;
  checkoutKey?: string;
  orderIdHint?: number;
  customer?: CustomerInfo;
  items?: CartMeta[];
  billing?: Record<string, string>;
  meta_data?: OrderMetaEntry[];
  checkoutShipping?: CheckoutShippingInput;
  isReverseCharge?: boolean;
  isWholesale?: boolean;
  videoUtm?: VideoUtmInput;
  marketingUtm?: MarketingUtmInput;
};

function fehlerCode(err: unknown): string | undefined {
  return err instanceof Error
    ? (err as Error & { code?: string }).code
    : undefined;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const piId = body.paymentIntentId?.trim() ?? "";
  if (!piId.startsWith("pi_")) {
    return NextResponse.json(
      { error: "invalid_payment_intent", message: "Ungültige Payment Intent ID." },
      { status: 400 }
    );
  }
  const checkoutKey =
    typeof body.checkoutKey === "string" && /^[a-f0-9]{16,64}$/.test(body.checkoutKey)
      ? body.checkoutKey
      : undefined;
  const orderIdHint =
    typeof body.orderIdHint === "number" && Number.isFinite(body.orderIdHint) && body.orderIdHint > 0
      ? body.orderIdHint
      : undefined;

  try {
    const ergebnis = await bereiteBestellungZuPaymentIntentVor({
      paymentIntentId: piId,
      checkoutKey,
      orderIdHinweis: orderIdHint,
      syncContext: {
        customer: body.customer,
        items: normalizeCartMetaItems(body.items),
        billing: body.billing,
        meta_data: body.meta_data,
        checkoutShipping: body.checkoutShipping,
        isReverseCharge: body.isReverseCharge,
        isWholesale: body.isWholesale,
        videoUtm: body.videoUtm,
        marketingUtm: body.marketingUtm,
      },
    });

    const state =
      ergebnis.zustand === "bereits_bezahlt"
        ? "paid"
        : ergebnis.zustand === "wiederverwendet"
          ? "reused"
          : "pending";
    console.log(
      `[prepare-order] pi=${piId} -> #${ergebnis.orderNumber} (${state}, ${ergebnis.totalCents} Cent)`
    );
    return NextResponse.json({
      success: true,
      orderId: ergebnis.orderId,
      orderNumber: ergebnis.orderNumber,
      totalCents: ergebnis.totalCents,
      state,
    });
  } catch (err) {
    if (err instanceof PaymentIntentStorniertFehler) {
      return NextResponse.json(
        {
          error: "payment_intent_canceled",
          message: "Diese Zahlung ist abgelaufen. Bitte die Kasse neu laden.",
        },
        { status: 409 }
      );
    }
    if (err instanceof BestellungOhneArtikelFehler) {
      return NextResponse.json(
        { error: "no_cart_items", message: "Keine Artikel für die Bestellung." },
        { status: 400 }
      );
    }
    const code = fehlerCode(err);
    if (code === "country_blocked" || code === "wholesale_eu_only") {
      return NextResponse.json(
        { error: code, message: err instanceof Error ? err.message : code },
        { status: 403 }
      );
    }
    console.error(`[prepare-order] FAILED pi=${piId}:`, err);
    return NextResponse.json(
      {
        error: "prepare_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
