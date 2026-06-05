import { parsePrice } from "@/lib/parse-price";
import { wooFetch } from "@/lib/woocommerce";
import {
  buildMetaContents,
  totalMetaNumItems,
  type MetaLineItem,
} from "@/lib/meta-capi-contents";
import { normalizePhoneForMeta } from "@/lib/meta-capi-phone";
import {
  sendCapiEvent,
  type CapiCustomData,
  type CapiUserData,
} from "@/lib/meta-capi";

export const CAPI_PURCHASE_SENT_META_KEY = "_capi_purchase_sent";

const PURCHASE_STATUSES = new Set(["processing", "completed"]);

type WooMeta = { key?: string; value?: unknown };

export type WooOrderForCapiPurchase = {
  id: number;
  number?: string;
  status?: string;
  total?: string;
  currency?: string;
  customer_id?: number;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    city?: string;
    postcode?: string;
    country?: string;
    state?: string;
  };
  line_items?: Array<{
    product_id?: number;
    quantity?: number;
    total?: string;
  }>;
  meta_data?: WooMeta[];
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

export function metaValue(
  meta: WooMeta[] | undefined,
  key: string
): string {
  const entry = meta?.find((m) => m.key === key);
  if (entry?.value == null) return "";
  return asString(entry.value);
}

export function isCapiPurchaseAlreadySent(
  order: WooOrderForCapiPurchase
): boolean {
  return metaValue(order.meta_data, CAPI_PURCHASE_SENT_META_KEY) === "yes";
}

export function isEligibleCapiPurchaseStatus(status: string | undefined): boolean {
  return PURCHASE_STATUSES.has((status ?? "").toLowerCase());
}

export function mapWooLineItemsForMeta(
  order: WooOrderForCapiPurchase
): MetaLineItem[] {
  return (order.line_items ?? []).map((li) => {
    const qty = Math.max(1, Number(li.quantity) || 1);
    const lineTotal = parsePrice(String(li.total ?? "0"));
    return {
      product_id: String(li.product_id ?? 0),
      quantity: qty,
      price: lineTotal / qty,
    };
  });
}

export function buildPurchaseUserDataFromWooOrder(
  order: WooOrderForCapiPurchase,
  extras?: Pick<CapiUserData, "clientIpAddress" | "clientUserAgent" | "fbc" | "fbp">
): CapiUserData {
  const billing = order.billing ?? {};
  const email = asString(billing.email);
  const country = asString(billing.country).toUpperCase();
  const phone = asString(billing.phone);

  return {
    email: email || undefined,
    phone: phone ? normalizePhoneForMeta(phone, country) : undefined,
    firstName: asString(billing.first_name) || undefined,
    lastName: asString(billing.last_name) || undefined,
    city: asString(billing.city) || undefined,
    zip: asString(billing.postcode) || undefined,
    state: asString(billing.state) || undefined,
    country: country || undefined,
    externalId:
      order.customer_id && order.customer_id > 0
        ? String(order.customer_id)
        : email || undefined,
    ...extras,
  };
}

export function buildPurchaseCustomDataFromWooOrder(
  order: WooOrderForCapiPurchase
): CapiCustomData {
  const lineItems = mapWooLineItemsForMeta(order);
  return {
    value: parsePrice(String(order.total ?? "0")),
    currency: (asString(order.currency) || "EUR").toUpperCase(),
    content_ids: lineItems.map((li) => li.product_id),
    content_type: "product",
    num_items: totalMetaNumItems(lineItems),
    contents: buildMetaContents(lineItems),
    order_id: String(order.id),
  };
}

export async function fetchWooOrderForCapiPurchase(
  orderId: number
): Promise<WooOrderForCapiPurchase | null> {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;
  try {
    return await wooFetch<WooOrderForCapiPurchase>(
      `/orders/${orderId}`,
      {},
      { cache: "no-store" }
    );
  } catch (err) {
    console.error("[CAPI purchase] fetch order failed:", orderId, err);
    return null;
  }
}

export async function markCapiPurchaseSent(orderId: number): Promise<boolean> {
  const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL;
  const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY;
  const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET;
  if (!WOOCOMMERCE_URL || !WOOCOMMERCE_KEY || !WOOCOMMERCE_SECRET) {
    console.warn("[CAPI purchase] Woo credentials missing, cannot set meta flag");
    return false;
  }

  const auth =
    "Basic " +
    Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString("base64");

  const res = await fetch(
    `${WOOCOMMERCE_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders/${orderId}`,
    {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta_data: [{ key: CAPI_PURCHASE_SENT_META_KEY, value: "yes" }],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[CAPI purchase] meta flag failed order=${orderId} status=${res.status}`,
      text.slice(0, 200)
    );
    return false;
  }
  return true;
}

export type SendCapiPurchaseResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
};

export async function sendCapiPurchaseFromWooOrder(
  order: WooOrderForCapiPurchase,
  opts?: {
    eventSourceUrl?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbc?: string;
    fbp?: string;
  }
): Promise<SendCapiPurchaseResult> {
  const orderId = Number(order.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return { sent: false, skipped: true, reason: "invalid_order_id" };
  }

  if (!isEligibleCapiPurchaseStatus(order.status)) {
    return { sent: false, skipped: true, reason: `status_${order.status ?? "unknown"}` };
  }

  if (isCapiPurchaseAlreadySent(order)) {
    return { sent: false, skipped: true, reason: "already_sent" };
  }

  const eventId = String(orderId);
  const success = await sendCapiEvent({
    event_name: "Purchase",
    event_id: eventId,
    event_source_url: opts?.eventSourceUrl,
    user_data: buildPurchaseUserDataFromWooOrder(order, {
      clientIpAddress: opts?.clientIpAddress,
      clientUserAgent: opts?.clientUserAgent,
      fbc: opts?.fbc,
      fbp: opts?.fbp,
    }),
    custom_data: buildPurchaseCustomDataFromWooOrder(order),
  });

  if (!success) {
    return { sent: false, skipped: false, reason: "capi_failed" };
  }

  await markCapiPurchaseSent(orderId);
  return { sent: true, skipped: false };
}
