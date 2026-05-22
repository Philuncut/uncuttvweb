import { stripe } from "@/lib/stripe";
import { parsePrice } from "@/lib/parse-price";
import { wooFetch } from "@/lib/woocommerce";
import {
  findWooOrderByPaymentReference,
  type WooOrderForDetails,
} from "@/lib/wc-order-from-payment";

export type OrderLookupItem = {
  id: number;
  name: string;
  qty: number;
  price: string;
};

export type OrderLookupCouponLine = {
  code: string;
  discount: number;
};

export type OrderLookupResult = {
  wcOrderId: number;
  items: OrderLookupItem[];
  customerEmail: string;
  total: number;
  currency: string;
  coupon_lines?: OrderLookupCouponLine[];
  shipping_total: number;
};

type WooOrderFull = WooOrderForDetails & {
  coupon_lines?: Array<{ code?: string; discount?: string }>;
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function mapWooOrderToLookupResult(order: WooOrderFull): OrderLookupResult {
  const lineItems = order.line_items ?? [];
  const items: OrderLookupItem[] = lineItems.map((li) => {
    const qty = Math.max(1, Number(li.quantity) || 1);
    const lineTotal = parsePrice(String(li.total ?? "0"));
    return {
      id: Number(li.product_id) || 0,
      name: asString(li.name) || "Artikel",
      qty,
      price: (lineTotal / qty).toFixed(2),
    };
  });

  let shipping_total = 0;
  for (const line of order.shipping_lines ?? []) {
    shipping_total += parsePrice(String(line.total ?? "0"));
  }

  const coupon_lines = (order.coupon_lines ?? [])
    .map((c) => ({
      code: asString(c.code),
      discount: parsePrice(String(c.discount ?? "0")),
    }))
    .filter((c) => c.code);

  return {
    wcOrderId: Number(order.id),
    items,
    customerEmail: asString(order.billing?.email),
    total: parsePrice(String(order.total ?? "0")),
    currency: (asString(order.currency) || "EUR").toUpperCase(),
    ...(coupon_lines.length > 0 ? { coupon_lines } : {}),
    shipping_total,
  };
}

async function fetchWooOrderById(orderId: number): Promise<WooOrderFull | null> {
  try {
    return await wooFetch<WooOrderFull>(
      `/orders/${encodeURIComponent(String(orderId))}`,
      {},
      { cache: "no-store" }
    );
  } catch {
    return null;
  }
}

/**
 * Resolve a WooCommerce order by payment reference (Stripe PI, PayPal ref, or legacy Checkout Session).
 * Reuses {@link findWooOrderByPaymentReference} for pi_* / paypal_* idempotency lookup.
 */
export async function lookupOrderByPaymentReference(
  reference: string
): Promise<OrderLookupResult | null> {
  const ref = reference.trim();
  if (!ref) return null;

  console.log("[OrderLookup] lookup:", ref);

  let paymentRef = ref;
  if (ref.startsWith("cs_")) {
    try {
      const session = await stripe.checkout.sessions.retrieve(ref, {
        expand: ["payment_intent"],
      });
      const piField = session.payment_intent;
      paymentRef =
        typeof piField === "string"
          ? piField
          : piField && typeof piField === "object" && "id" in piField
            ? String((piField as { id: string }).id)
            : "";
      if (!paymentRef.startsWith("pi_")) {
        console.log("[OrderLookup] cs_ session has no pi_, miss:", ref);
        return null;
      }
      console.log("[OrderLookup] cs_ resolved to pi:", paymentRef);
    } catch (err) {
      console.log("[OrderLookup] cs_ retrieve failed:", ref, err);
      return null;
    }
  }

  const row = await findWooOrderByPaymentReference(paymentRef);
  if (!row?.id) {
    console.log("[OrderLookup] no WC order for:", paymentRef);
    return null;
  }

  const full = await fetchWooOrderById(Number(row.id));
  if (!full?.id) {
    console.log("[OrderLookup] WC order fetch failed for id:", row.id);
    return null;
  }

  const result = mapWooOrderToLookupResult(full);
  console.log("[OrderLookup] hit wcOrderId:", result.wcOrderId);
  return result;
}
