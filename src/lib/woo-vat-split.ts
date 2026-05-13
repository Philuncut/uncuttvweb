/**
 * WooCommerce REST order payloads treat line/shipping `total` as tax-exclusive
 * in many paths even when `prices_include_tax: true` on the order — so gross
 * amounts must be split into net `total` + `total_tax`.
 *
 * EU-Sätze: `src/lib/eu-vat-rates.ts` (getVatRateForCountry). Unbekanntes Land → 20 %.
 */
import { getVatRateForCountry } from "./eu-vat-rates";

export function standardVatFraction(countryIso2: string): number {
  const p = getVatRateForCountry(countryIso2);
  if (p === undefined) return 0.2;
  return p / 100;
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

/**
 * EU-B2C außer AT: Checkout-Brutto (= AT-Katalog) bleibt; Steueranteil nach Zielland-MwSt.
 * tax = brutto * v / (100 + v), netto = brutto − tax (wie splitGrossForWooRest).
 */
export function buildEuB2cNonAtLineItem(
  item: { id: number; price: string; qty: number },
  countryIso2: string
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parseFloat(item.price) || 0);
  const lineGross = unitGross * qty;
  const { net, tax } = splitGrossForWooRest(lineGross, countryIso2);
  return {
    product_id: Number(item.id),
    quantity: item.qty,
    subtotal: net,
    subtotal_tax: tax,
    total: net,
    total_tax: tax,
  };
}
