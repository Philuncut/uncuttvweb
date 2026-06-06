import { NextRequest, NextResponse } from "next/server";
import {
  isWooWebhookConnectivityPing,
  verifyWooWebhookSignature,
} from "@/lib/meta-capi-auth";
import {
  fetchWooOrderForCapiPurchase,
  isEligibleCapiPurchaseStatus,
  sendCapiPurchaseFromWooOrder,
  type WooOrderForCapiPurchase,
} from "@/lib/meta-capi-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseWooOrderPayload(raw: string): WooOrderForCapiPurchase | null {
  try {
    const data = JSON.parse(raw) as WooOrderForCapiPurchase;
    if (!data?.id) return null;
    return data;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.WOO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[CAPI purchase] WOO_WEBHOOK_SECRET not configured");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-wc-webhook-signature");
  const topic = req.headers.get("x-wc-webhook-topic");

  if (isWooWebhookConnectivityPing(rawBody, signature, topic)) {
    return NextResponse.json({ ok: true, ping: true });
  }

  if (!signature?.trim()) {
    console.warn("[CAPI purchase] missing x-wc-webhook-signature");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!verifyWooWebhookSignature(rawBody, signature, secret)) {
    console.warn("[CAPI purchase] invalid webhook signature");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const webhookOrder = parseWooOrderPayload(rawBody);
  if (!webhookOrder) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const orderId = Number(webhookOrder.id);
  const order =
    (await fetchWooOrderForCapiPurchase(orderId)) ?? webhookOrder;

  if (!isEligibleCapiPurchaseStatus(order.status)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `status_${order.status ?? "unknown"}`,
    });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const eventSourceUrl = siteUrl
    ? `${siteUrl}/bestellung/erfolg`
    : undefined;

  const result = await sendCapiPurchaseFromWooOrder(order, {
    eventSourceUrl,
  });

  return NextResponse.json({
    ok: result.sent || result.skipped,
    sent: result.sent,
    skipped: result.skipped,
    reason: result.reason,
    order_id: orderId,
  });
}
