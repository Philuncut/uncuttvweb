import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
]);

function metadataSummary(
  metadata: Stripe.PaymentIntent["metadata"] | null | undefined
): Record<string, string> {
  if (!metadata) return {};
  const keys = [
    "coupon",
    "discount",
    "is_wholesale",
    "is_reverse_charge",
    "shipping_country",
    "shipping_method_title",
    "shipping_cents",
    "utm_source",
    "utm_video_id",
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const val = metadata[key];
    if (typeof val === "string" && val.trim()) {
      out[key] = val;
    }
  }
  const cartRaw = metadata.cart_items;
  if (typeof cartRaw === "string" && cartRaw) {
    try {
      const parsed = JSON.parse(cartRaw) as unknown;
      if (Array.isArray(parsed)) {
        out.cart_items_count = String(parsed.length);
      }
    } catch {
      out.cart_items = "(unparseable)";
    }
  }
  return out;
}

function logPaymentIntentEvent(
  eventType: string,
  pi: Stripe.PaymentIntent
): void {
  const amountEur =
    typeof pi.amount === "number"
      ? (pi.amount / 100).toFixed(2)
      : String(pi.amount);

  console.log(`[stripe-webhook] Webhook received: ${eventType}`);
  console.log(`[stripe-webhook] PI: ${pi.id}`);
  console.log(`[stripe-webhook] Amount: ${amountEur} ${pi.currency ?? "eur"}`);
  console.log(`[stripe-webhook] Status: ${pi.status}`);
  console.log("[stripe-webhook] Metadata:", metadataSummary(pi.metadata));
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured on this deployment"
    );
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    console.warn(
      "[stripe-webhook] Invalid signature: missing stripe-signature header"
    );
    return NextResponse.json(
      { error: "missing_stripe_signature" },
      { status: 400 }
    );
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    console.warn("[stripe-webhook] Invalid signature: could not read body");
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const hint =
      err instanceof Error ? err.message : "constructEvent failed";
    console.warn(
      "[stripe-webhook] Invalid signature: webhook signature verification failed.",
      hint
    );
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 400 }
    );
  }

  if (HANDLED_EVENTS.has(event.type)) {
    const pi = event.data.object as Stripe.PaymentIntent;
    logPaymentIntentEvent(event.type, pi);
  } else {
    console.log(
      `[stripe-webhook] Ignored event type: ${event.type} (id: ${event.id})`
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
