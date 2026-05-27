import { NextResponse } from "next/server";
import {
  estimateOrphanAmountEur,
  notifyPayPalOrphanAdmin,
  persistPayPalOrphan,
  type PayPalOrphanAlertPayload,
} from "@/lib/paypal-orphan-order";
import type { CartMeta } from "@/lib/wc-order-from-payment";

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function isValidPayPalOrderId(id: string): boolean {
  return /^[A-Z0-9]{10,20}$/i.test(id);
}

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as PayPalOrphanAlertPayload;
    const paypalOrderId = asString(data.paypalOrderId);

    if (!paypalOrderId || !isValidPayPalOrderId(paypalOrderId)) {
      return NextResponse.json(
        { error: "invalid_paypal_order_id" },
        { status: 400 }
      );
    }

    const reason = asString(data.reason) || "unknown";
    const cartItems = Array.isArray(data.cartItems)
      ? (data.cartItems as CartMeta[])
      : undefined;
    const amountParsed = data.amount ? parseFloat(data.amount) : NaN;
    const amountEur = Number.isFinite(amountParsed)
      ? amountParsed
      : estimateOrphanAmountEur({
          items: cartItems,
          checkoutShipping:
            data.rawBody &&
            typeof data.rawBody === "object" &&
            "checkoutShipping" in (data.rawBody as object)
              ? (data.rawBody as { checkoutShipping?: { rate?: number } })
                  .checkoutShipping
              : undefined,
        });

    await persistPayPalOrphan({
      paypal_order_id: paypalOrderId,
      capture_id: asString(data.captureId) || null,
      amount_eur: amountEur,
      customer_email:
        asString(data.email) ||
        asString(data.payerEmail) ||
        asString(data.formEmail) ||
        null,
      raw_body: data.rawBody ?? data,
      error_reason: reason,
      error_details: {
        syncStatus: data.syncStatus,
        syncError: data.syncError,
        payerEmail: data.payerEmail,
        formEmail: data.formEmail,
      },
    });

    const alerted = await notifyPayPalOrphanAdmin(data);

    return NextResponse.json({ alerted, persisted: true });
  } catch (err) {
    console.error(
      "[admin-alert] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      {
        alerted: false,
        error: err instanceof Error ? err.message : "alert_failed",
      },
      { status: 500 }
    );
  }
}
