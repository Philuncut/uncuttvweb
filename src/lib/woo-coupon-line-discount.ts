import { parsePrice } from "@/lib/parse-price";
import {
  buildEuB2cNonAtLineItem,
  buildNonEuB2cLineItem,
  splitGrossForNonEu,
  splitGrossForWooRest,
} from "@/lib/woo-vat-split";
import type { CartMeta } from "@/lib/wc-order-from-payment";

/**
 * Reduce explicit WC REST line totals by coupon discount (gross €, subtotal-only),
 * so order total matches Stripe when coupon_lines alone do not recalculate fixed totals.
 */
type WooExplicitLineItem = {
  product_id: number;
  quantity: number;
  subtotal: string;
  subtotal_tax: string;
  total: string;
  total_tax: string;
  taxes?: unknown[];
};

export function buildLineItemWithCouponDiscount(
  item: CartMeta,
  taxCountry: string,
  mode: "eu_b2c" | "non_eu",
  discountGrossEur: number
): WooExplicitLineItem {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parsePrice(item.price));
  const lineGrossBefore = unitGross * qty;
  const lineGrossAfter = Math.max(0, lineGrossBefore - discountGrossEur);

  if (mode === "non_eu") {
    const { net, tax } = splitGrossForNonEu(lineGrossAfter);
    return {
      product_id: Number(item.id),
      quantity: item.qty,
      subtotal: net,
      subtotal_tax: tax,
      total: net,
      total_tax: tax,
      taxes: [] as unknown[],
    };
  }

  const { net, tax } = splitGrossForWooRest(lineGrossAfter, taxCountry);
  return {
    product_id: Number(item.id),
    quantity: item.qty,
    subtotal: net,
    subtotal_tax: tax,
    total: net,
    total_tax: tax,
  };
}

/** Spread subtotal-only discount (cents) across cart lines (largest lines first). */
export function allocateDiscountCentsToLines(
  items: CartMeta[],
  discountCents: number
): Map<number, number> {
  const byLine = new Map<number, number>();
  if (discountCents <= 0 || items.length === 0) return byLine;

  let remaining = discountCents;
  const sorted = [...items].sort((a, b) => {
    const ga =
      Math.round(parsePrice(a.price) * 100) * Math.max(1, a.qty);
    const gb =
      Math.round(parsePrice(b.price) * 100) * Math.max(1, b.qty);
    return gb - ga;
  });

  for (const item of sorted) {
    if (remaining <= 0) break;
    const lineCents =
      Math.round(parsePrice(item.price) * 100) * Math.max(1, item.qty);
    const take = Math.min(remaining, lineCents);
    if (take > 0) {
      byLine.set(item.id, (byLine.get(item.id) ?? 0) + take);
      remaining -= take;
    }
  }

  return byLine;
}
