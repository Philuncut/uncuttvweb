/**
 * Debug sync-order failure for a PI. Usage:
 * npx tsx src/scripts/debug-pi-sync.ts pi_3Ta0htEgrfNcewX313xhRDke
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import Stripe from "stripe";
import { getCartItemsForSync, normalizeCartMetaItems } from "@/lib/cart-items-from-context";
import { createWooOrderFromPayment } from "@/lib/wc-order-from-payment";

function loadEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function main() {
  const piId = process.argv[2]?.trim();
  if (!piId?.startsWith("pi_")) {
    console.error("Usage: npx tsx src/scripts/debug-pi-sync.ts <pi_id>");
    process.exit(1);
  }

  const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
  const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? "");
  const pi = await stripe.paymentIntents.retrieve(piId, {
    expand: ["latest_charge"],
  });

  console.log("PI", {
    id: pi.id,
    status: pi.status,
    amount: pi.amount,
    metadata: pi.metadata,
  });

  const emptyNorm = normalizeCartMetaItems([]);
  console.log("normalizeCartMetaItems([]):", emptyNorm.length);

  try {
    getCartItemsForSync({ items: [] }, pi.metadata ?? undefined);
    console.log("getCartItemsForSync empty body: OK (unexpected)");
  } catch (e) {
    console.log(
      "getCartItemsForSync empty body ERROR:",
      e instanceof Error ? e.message : e
    );
  }

  const sampleWithBadId = normalizeCartMetaItems([
    { id: NaN, name: "Test", qty: 1, price: "10" } as never,
  ]);
  console.log("normalize bad id:", sampleWithBadId);

  try {
    const result = await createWooOrderFromPayment({
      paymentIntentId: piId,
      syncContext: { items: [] },
    });
    console.log("createWooOrderFromPayment:", result);
  } catch (e) {
    console.log(
      "createWooOrderFromPayment ERROR:",
      e instanceof Error ? e.message : e
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
