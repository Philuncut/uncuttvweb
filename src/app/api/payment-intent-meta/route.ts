import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

type Body = {
  paymentIntentId?: string;
  isReverseCharge?: boolean;
};

/**
 * Attach Reverse Charge flag to a PaymentIntent before confirmation
 * (so sync-order can recover it from Stripe after redirect-only flows).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const id = body.paymentIntentId?.trim();
    if (!id || !id.startsWith("pi_")) {
      return NextResponse.json({ error: "Ungültige paymentIntentId." }, { status: 400 });
    }

    const isRc = body.isReverseCharge === true;

    await stripe.paymentIntents.update(id, {
      metadata: {
        is_reverse_charge: isRc ? "true" : "false",
        vies_audit: "",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[payment-intent-meta]", e);
    const message =
      e instanceof Error ? e.message : "PaymentIntent-Update fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
