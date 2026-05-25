import {
  getVatRateForCountry,
  shouldSendExplicitEuB2cLineAmounts,
  shouldSendExplicitNonEuLineAmounts,
} from "@/lib/eu-vat-rates";
import { parsePrice } from "@/lib/parse-price";
import { splitGrossForWooRest } from "@/lib/woo-vat-split";
import type { CartMeta } from "@/lib/wc-order-from-payment";

export type WooCouponLine = {
  code: string;
  discount?: string;
  discount_tax?: string;
};

/**
 * Split gross coupon discount (€) into WC REST `discount` (net) + `discount_tax`.
 * Same rounding as splitGrossForWooRest (tax first, net = gross − tax).
 */
export function splitCouponDiscountGrossForWooRest(
  discountGrossEur: number,
  countryIso2: string
): { discount: string; discount_tax: string } {
  const { net, tax } = splitGrossForWooRest(discountGrossEur, countryIso2);
  return { discount: net, discount_tax: tax };
}

/**
 * WooCommerce coupon_lines for REST order create.
 *
 * EU-B2C (non-AT): full line_items (subtotal = total) + coupon_lines **code only**.
 * Explicit discount/discount_tax on coupon_lines makes WC also reduce line totals → double deduction.
 *
 * Non-EU B2C: full lines + explicit discount on coupon_lines (0 % tax).
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

  if (shouldSendExplicitEuB2cLineAmounts(taxCountry)) {
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
