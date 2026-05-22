/**
 * Manually create a WooCommerce order for a succeeded Stripe PaymentIntent.
 *
 * Usage:
 *   npx tsx src/scripts/resync-stripe-pi-order.ts pi_3Ta0HJEgrfNcewX31v0iOcer \
 *     --items='[{"id":123,"name":"Product Name","qty":1,"price":"32.90"}]'
 *
 * Optional: --customer-json='{"email":"...","firstName":"...","lastName":"...","street":"...","zip":"...","city":"...","country":"AT"}'
 * Optional: --shipping-json='{"rate":4.8,"label":"GLS","method_id":"flat_rate"}'
 *
 * Requires .env.local: STRIPE_SECRET_KEY, WOOCOMMERCE_URL, WOOCOMMERCE_KEY, WOOCOMMERCE_SECRET
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeCartMetaItems,
  parseCartItemsFromPiMetadata,
} from "@/lib/cart-items-from-context";
import { createWooOrderFromPayment } from "@/lib/wc-order-from-payment";
import type { CartMeta, CheckoutShippingInput, CustomerInfo } from "@/lib/wc-order-from-payment";
import Stripe from "stripe";

function loadEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const piId = process.argv[2]?.trim();
  if (!piId?.startsWith("pi_")) {
    console.error("Usage: npx tsx src/scripts/resync-stripe-pi-order.ts <pi_id> --items='[...]'");
    process.exit(1);
  }

  const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
  const stripeKey = env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    console.error("Missing STRIPE_SECRET_KEY in .env.local");
    process.exit(1);
  }

  const itemsRaw = argValue("--items");
  let items: CartMeta[] = [];
  if (itemsRaw) {
    try {
      items = normalizeCartMetaItems(JSON.parse(itemsRaw) as CartMeta[]);
    } catch {
      console.error("Invalid --items JSON");
      process.exit(1);
    }
  }
  const stripe = new Stripe(stripeKey);
  const pi = await stripe.paymentIntents.retrieve(piId, {
    expand: ["latest_charge"],
  });

  if (items.length === 0) {
    items = parseCartItemsFromPiMetadata(pi.metadata ?? undefined);
  }

  console.log("PI status:", pi.status, "amount:", pi.amount, "metadata:", pi.metadata);

  if (items.length === 0) {
    console.error(
      "No cart items (no --items and no cart_snapshot in PI metadata). Pass --items JSON."
    );
    process.exit(1);
  }

  if (pi.status !== "succeeded") {
    console.error("PaymentIntent is not succeeded — aborting.");
    process.exit(1);
  }

  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object"
      ? pi.latest_charge
      : null;
  const bill = charge?.billing_details;

  let customer: CustomerInfo | undefined;
  const customerJson = argValue("--customer-json");
  if (customerJson) {
    customer = JSON.parse(customerJson) as CustomerInfo;
  } else if (bill?.address) {
    const nameParts = (bill.name ?? "").trim().split(/\s+/);
    customer = {
      email: bill.email ?? "",
      firstName: nameParts[0] ?? "",
      lastName: nameParts.slice(1).join(" ") || (nameParts[0] ?? ""),
      street: bill.address.line1 ?? "",
      zip: bill.address.postal_code ?? "",
      city: bill.address.city ?? "",
      country: (bill.address.country ?? "AT").toUpperCase(),
      ...(bill.address.state ? { state: bill.address.state } : {}),
    };
  }

  let checkoutShipping: CheckoutShippingInput | undefined;
  const shippingJson = argValue("--shipping-json");
  if (shippingJson) {
    checkoutShipping = JSON.parse(shippingJson) as CheckoutShippingInput;
  } else {
    const shipCents = parseInt(pi.metadata?.shipping_cents ?? "", 10);
    if (Number.isFinite(shipCents) && shipCents >= 0) {
      checkoutShipping = {
        rate: shipCents / 100,
        label: pi.metadata?.shipping_method_title?.trim() || "Versand",
        method_id: "flat_rate",
      };
    }
  }

  const result = await createWooOrderFromPayment({
    paymentIntentId: piId,
    syncContext: {
      customer,
      items,
      checkoutShipping,
      isReverseCharge: pi.metadata?.is_reverse_charge === "true",
      isWholesale: pi.metadata?.is_wholesale === "true",
    },
  });

  console.log("Woo order result:", {
    status: result.status,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
  });
}

main().catch((err) => {
  console.error("resync failed:", err);
  process.exit(1);
});
