/** Woo free GLS threshold (DE/AT B2C) — keep in sync with WooCommerce zones. */
export const FREE_SHIPPING_THRESHOLD_EUR = 100;

export const SUGGESTION_COUNTRIES = new Set(["DE", "AT"]);

/** Max unit price (gross) for filler suggestions (B2C). */
export const MAX_FILLER_PRICE_EUR = 15;

/** How many filler cards to show in the UI. */
export const SUGGESTION_COUNT = 3;

/** Below this cart subtotal the nudge is hidden (avoids discouraging “€70+ to go”). */
export const MIN_CART_FOR_SUGGESTION_EUR = 50;

export function shouldShowFreeShippingSuggestion(
  country: string,
  cartTotalGross: number,
  isWholesale: boolean
): boolean {
  if (isWholesale) return false;
  const c = country.trim().toUpperCase();
  if (!SUGGESTION_COUNTRIES.has(c)) return false;
  if (cartTotalGross < MIN_CART_FOR_SUGGESTION_EUR) return false;
  if (cartTotalGross >= FREE_SHIPPING_THRESHOLD_EUR) return false;
  return true;
}

export function getRemainingAmount(cartTotalGross: number): number {
  return Math.max(
    0,
    FREE_SHIPPING_THRESHOLD_EUR - cartTotalGross
  );
}

export function getProgressPercent(cartTotalGross: number): number {
  return Math.min(
    100,
    (cartTotalGross / FREE_SHIPPING_THRESHOLD_EUR) * 100
  );
}
