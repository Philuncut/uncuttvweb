/**
 * WooCommerce REST order payloads treat line/shipping `total` as tax-exclusive
 * in many paths even when `prices_include_tax: true` on the order — so gross
 * amounts must be split for shipping (product lines use catalog via product_id+qty).
 *
 * Rates are standard VAT (approximate; adjust if your store uses reduced rates).
 */
const STANDARD_VAT: Record<string, number> = {
  AT: 0.2,
  BE: 0.21,
  BG: 0.2,
  HR: 0.25,
  CY: 0.19,
  CZ: 0.21,
  DK: 0.25,
  EE: 0.22,
  FI: 0.24,
  FR: 0.2,
  DE: 0.19,
  GR: 0.24,
  HU: 0.27,
  IE: 0.23,
  IT: 0.22,
  LV: 0.21,
  LT: 0.21,
  LU: 0.17,
  MT: 0.18,
  NL: 0.21,
  PL: 0.23,
  PT: 0.23,
  RO: 0.19,
  SK: 0.2,
  SI: 0.22,
  ES: 0.21,
  SE: 0.25,
};

export function standardVatFraction(countryIso2: string): number {
  const c = (countryIso2 || "").trim().toUpperCase();
  return STANDARD_VAT[c] ?? 0.2;
}

/** Split a tax-inclusive gross amount into WC REST net `total` + `total_tax` strings (B2C shipping). */
export function splitGrossForWooRest(
  gross: number,
  countryIso2: string
): { net: string; tax: string } {
  const g = Math.max(0, gross);
  const r = standardVatFraction(countryIso2);
  const net = g / (1 + r);
  const tax = g - net;
  return { net: net.toFixed(2), tax: tax.toFixed(2) };
}

/** Net line/shipping amount → WC REST net + tax strings (wholesale haendler_preis / wholesale shipping are net). */
export function addTaxToNet(
  netAmount: number,
  countryIso2: string
): { net: string; tax: string } {
  const n = Math.max(0, netAmount);
  const r = standardVatFraction(countryIso2);
  const t = n * r;
  return { net: n.toFixed(2), tax: t.toFixed(2) };
}

/** Woo REST line item: haendler_preis × qty is NET; add VAT for wholesale non-RC. */
export function buildWholesaleNonRcLineItem(
  item: { id: number; price: string; qty: number },
  countryIso2: string
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitNet = Math.max(0, parseFloat(item.price) || 0);
  const lineNet = unitNet * qty;
  const { net, tax } = addTaxToNet(lineNet, countryIso2);
  return {
    product_id: Number(item.id),
    quantity: item.qty,
    subtotal: net,
    subtotal_tax: tax,
    total: net,
    total_tax: tax,
  };
}
