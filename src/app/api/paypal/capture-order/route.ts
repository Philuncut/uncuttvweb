/**
 * POST /api/paypal/capture-order
 *
 * Nach der Bestaetigung im PayPal-Fenster (onApprove) fuehrt der SERVER die
 * Capture aus, prueft Bestellnummer (custom_id) und Betrag gegen die
 * WooCommerce-Bestellung und setzt sie erst dann auf bezahlt
 * (paypal-zahlung.ts). Der Aufruf ist wiederholbar: Ein zweiter Aufruf fuer
 * dieselbe PayPal-Order (Doppelklick, Wiederanlauf nach Verbindungsabbruch,
 * Reload der Erfolgsseite) findet die Capture bzw. die bezahlte Bestellung
 * und antwortet mit demselben Ergebnis. Genau das fehlte, als #6390 bis
 * #6392 entstanden.
 *
 * Antwort: { success, orderId, orderNumber, status, paypalOrderId }.
 * 402 mit issue INSTRUMENT_DECLINED: Browser soll actions.restart() rufen.
 */

import { NextResponse, after } from "next/server";
import { nachZahlungseingang } from "@/lib/bestellung-zahlung";
import {
  erfassePayPalZahlung,
  PayPalZuordnungFehler,
} from "@/lib/paypal-zahlung";
import { PayPalFehler, paypalKonfiguriert } from "@/lib/paypal-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  paypalOrderId?: string;
  orderIdHint?: number;
};

export async function POST(request: Request) {
  if (!paypalKonfiguriert()) {
    return NextResponse.json({ error: "paypal_not_configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const paypalOrderId = body.paypalOrderId?.trim() ?? "";
  if (!/^[A-Z0-9]{10,32}$/i.test(paypalOrderId)) {
    return NextResponse.json(
      { error: "invalid_paypal_order_id", message: "Ungültige PayPal-Order-ID." },
      { status: 400 }
    );
  }
  const orderIdHint =
    typeof body.orderIdHint === "number" && Number.isFinite(body.orderIdHint) && body.orderIdHint > 0
      ? body.orderIdHint
      : undefined;

  try {
    const ergebnis = await erfassePayPalZahlung(paypalOrderId, orderIdHint);
    console.log(
      `[paypal/capture-order] ${paypalOrderId} -> #${ergebnis.orderNumber} ${ergebnis.status} (capture ${ergebnis.captureId ?? "-"})`
    );
    if (ergebnis.status === "paid") {
      after(() => nachZahlungseingang(ergebnis.orderId, "paypal"));
    }
    return NextResponse.json({
      success: ergebnis.status === "paid" || ergebnis.status === "already_paid",
      pending: ergebnis.status === "pending",
      amountMismatch: ergebnis.status === "amount_mismatch",
      orderId: ergebnis.orderId,
      orderNumber: ergebnis.orderNumber,
      status: ergebnis.status,
      paypalOrderId,
      paymentIntentId: `paypal_${paypalOrderId}`,
    });
  } catch (err) {
    if (err instanceof PayPalZuordnungFehler) {
      console.error(`[paypal/capture-order] ${err.message}`);
      return NextResponse.json(
        { error: "paypal_order_mismatch", message: err.message },
        { status: 409 }
      );
    }
    if (err instanceof PayPalFehler) {
      console.error(
        `[paypal/capture-order] PayPal ${paypalOrderId}: ${err.message} (debug ${err.debugId})`
      );
      const status =
        err.issue === "INSTRUMENT_DECLINED" || err.issue === "PAYER_ACTION_REQUIRED"
          ? 402
          : err.httpStatus >= 400 && err.httpStatus < 500
            ? 409
            : 502;
      return NextResponse.json(
        { error: "paypal_error", issue: err.issue, message: err.message },
        { status }
      );
    }
    console.error(`[paypal/capture-order] FAILED ${paypalOrderId}:`, err);
    return NextResponse.json(
      { error: "capture_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
