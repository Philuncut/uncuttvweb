import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type { ViesValidated } from "@/lib/vies-types";

type Body = {
  paymentIntentId?: string;
  isReverseCharge?: boolean;
  viesResult?: Pick<
    ViesValidated,
    "requestDate" | "consultationNumber" | "name"
  > | null;
};

/**
 * Attach Reverse Charge + VIES audit metadata to a PaymentIntent before confirmation
 * (so sync-order can recover flags from Stripe after redirect-only flows).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const id = body.paymentIntentId?.trim();
    if (!id || !id.startsWith("pi_")) {
      return NextResponse.json({ error: "Ungültige paymentIntentId." }, { status: 400 });
    }

    const isRc = body.isReverseCharge === true;
    const v = body.viesResult;
    const audit =
      v && (v.requestDate || v.consultationNumber)
        ? JSON.stringify({
            requestDate: v.requestDate ?? "",
            consultationNumber: v.consultationNumber ?? "",
            name: v.name ?? "",
          }).slice(0, 450)
        : "";

    await stripe.paymentIntents.update(id, {
      metadata: {
        is_reverse_charge: isRc ? "true" : "false",
        vies_audit: audit,
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
