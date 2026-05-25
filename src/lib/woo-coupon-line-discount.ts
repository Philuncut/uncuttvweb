import { getVatRateForCountry, shouldSendExplicitNonEuLineAmounts } from "@/lib/eu-vat-rates";
import { parsePrice } from "@/lib/parse-price";
import type { CartMeta } from "@/lib/wc-order-from-payment";

export type WooCouponLine = {
  code: string;
  discount?: string;
  discount_tax?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split gross coupon discount (€) into WC REST `discount` (net) + `discount_tax`.
 * Uses destination-country VAT % (same basis as splitGrossForWooRest line items).
 */
export function splitCouponDiscountGrossForWooRest(
  discountGrossEur: number,
  countryIso2: string
): { discount: string; discount_tax: string } {
  const gross = Math.max(0, discountGrossEur);
  const vatPercent = getVatRateForCountry(countryIso2) ?? 20;
  const discountTax = round2((gross * vatPercent) / (100 + vatPercent));
  const discountNet = round2(gross - discountTax);
  return {
    discount: discountNet.toFixed(2),
    discount_tax: discountTax.toFixed(2),
  };
}

/**
 * WooCommerce coupon_lines for REST order create.
 * EU/Non-EU B2C: explicit net + tax on full line_items (Option B).
 * Reverse charge: code only — line totals already reduced in the RC builder.
 */
export function buildWooCouponLines(
  code: string | undefined,
  discountCents: number,
  taxCountry: string,
  opts?: { isReverseCharge?: boolean }
): WooCouponLine[] | undefined {
  const normalized = code?.trim().toLowerCase();
  if (!normalized || discountCents <= 0) return undefined;

  if (opts?.isReverseCharge) {
    return [{ code: normalized }];
  }

  const gross = discountCents / 100;

  if (shouldSendExplicitNonEuLineAmounts(taxCountry)) {
    return [
      {
        code: normalized,
        discount: gross.toFixed(2),
        discount_tax: "0.00",
      },
    ];
  }

  const vatPercent = getVatRateForCountry(taxCountry);
  if (vatPercent !== undefined) {
    const { discount, discount_tax } = splitCouponDiscountGrossForWooRest(
      gross,
      taxCountry
    );
    return [{ code: normalized, discount, discount_tax }];
  }

  return [{ code: normalized }];
}

/** Spread subtotal-only discount (cents) across cart lines (largest lines first). Used for RC line totals. */
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
