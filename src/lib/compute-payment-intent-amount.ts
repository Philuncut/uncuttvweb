import type { CartItem } from "@/lib/CartContext";
import { getVatRateForCountry } from "@/lib/eu-vat-rates";
import { parsePrice } from "@/lib/parse-price";
import {
  applyCouponToSubtotalCents,
  type CouponPiMetadata,
} from "@/lib/coupon-helpers";

/** Client sends this to explicitly clear coupon metadata on the PI. */
export const COUPON_REMOVE_SENTINEL = "__REMOVE__";

export type ComputePiAmountInput = {
  items: CartItem[];
  couponCode?: string;
  /** Existing PI metadata — used when the client omits couponCode (stale parallel update). */
  fallbackCouponCode?: string;
  customerEmail?: string;
  shippingCents?: number;
  isWholesale?: boolean;
  isReverseCharge?: boolean;
  taxCountry?: string;
};

export type PiAmountBreakdown = {
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  couponMeta: CouponPiMetadata | Record<string, never>;
  couponCodeApplied: string | null;
};

function sumCartSubtotalCents(
  items: CartItem[],
  wholesaleNetPricing: boolean,
  wholesaleVatFraction: number
): number {
  if (wholesaleNetPricing) {
    return items.reduce((sum, item) => {
      const lineNet =
        Math.max(0, parsePrice(item.product.price)) *
        Math.max(1, item.quantity);
      return sum + Math.round(lineNet * (1 + wholesaleVatFraction) * 100);
    }, 0);
  }
  return items.reduce((sum, item) => {
    return (
      sum +
      Math.round(parsePrice(item.product.price) * 100) * item.quantity
    );
  }, 0);
}

/**
 * Single source of truth for Stripe PI amount (matches PayPal: discount on subtotal, then + shipping).
 */
export async function computePaymentIntentAmount(
  input: ComputePiAmountInput
): Promise<PiAmountBreakdown> {
  const wholesaleNetPricing =
    input.isWholesale === true &&
    input.isReverseCharge !== true &&
    Boolean(input.taxCountry?.trim());

  const wholesaleVatFraction = (() => {
    const pct = getVatRateForCountry(input.taxCountry ?? "") ?? 20;
    return pct / 100;
  })();

  const subtotalCents = sumCartSubtotalCents(
    input.items,
    wholesaleNetPricing,
    wholesaleVatFraction
  );

  let discountCents = 0;
  let couponMeta: CouponPiMetadata | Record<string, never> = {};
  const explicitRemove = input.couponCode === COUPON_REMOVE_SENTINEL;
  const resolvedCoupon = explicitRemove
    ? ""
    : input.couponCode?.trim()
      ? input.couponCode.trim()
      : (input.fallbackCouponCode?.trim() ?? "");

  let couponCodeApplied: string | null = null;

  if (resolvedCoupon && input.isWholesale !== true) {
    const applied = await applyCouponToSubtotalCents(
      resolvedCoupon,
      subtotalCents,
      input.items,
      input.customerEmail?.trim()
    );
    if (!applied.ok) {
      throw new Error(applied.error);
    }
    discountCents = applied.discountCents;
    couponMeta = applied.metadata;
    couponCodeApplied = applied.metadata.coupon_code;
  }

  let totalCents = Math.max(0, subtotalCents - discountCents);

  const ship =
    typeof input.shippingCents === "number" &&
    Number.isFinite(input.shippingCents) &&
    input.shippingCents >= 0
      ? Math.round(input.shippingCents)
      : 0;

  if (wholesaleNetPricing) {
    const shipNetEuro = ship / 100;
    totalCents += Math.round(shipNetEuro * (1 + wholesaleVatFraction) * 100);
  } else {
    totalCents += ship;
  }

  return {
    subtotalCents,
    shippingCents: ship,
    discountCents,
    totalCents,
    couponMeta,
    couponCodeApplied,
  };
}

/** True when Stripe PI coupon metadata matches the checkout UI coupon state. */
export function piCouponMatchesUi(
  uiCouponCode: string | null,
  applied: string | null | undefined,
  removePending: boolean
): boolean {
  const appliedNorm = (applied ?? "").trim().toLowerCase();
  if (removePending) return appliedNorm === "";
  return (uiCouponCode ?? "").trim().toLowerCase() === appliedNorm;
}

export function formatPiAmountLog(
  action: "Created" | "Updated",
  id: string,
  breakdown: PiAmountBreakdown,
  itemCount: number,
  piUpdateSeq?: number
): string {
  const coupon =
    breakdown.couponCodeApplied ??
    ("coupon_code" in breakdown.couponMeta
      ? breakdown.couponMeta.coupon_code
      : "") ??
    "none";
  const seqPart =
    piUpdateSeq != null ? `, seq=${piUpdateSeq}` : "";
  const discountPart =
    breakdown.discountCents > 0
      ? `, discount=-${breakdown.discountCents}`
      : "";
  return (
    `[PI] ${action} ${id}, amount=${breakdown.totalCents} ` +
    `(subtotal=${breakdown.subtotalCents}, shipping=${breakdown.shippingCents}${discountPart}), ` +
    `items=${itemCount}, coupon=${coupon}${seqPart}`
  );
}
