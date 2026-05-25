/**
 * WooCommerce REST order payloads treat line/shipping `total` as tax-exclusive
 * in many paths even when `prices_include_tax: true` on the order — so gross
 * amounts must be split into net `total` + `total_tax`.
 *
 * EU-Sätze: `src/lib/eu-vat-rates.ts` (getVatRateForCountry). Unbekanntes Land → 20 %.
 */
import {
  getVatRateForCountry,
  getWooStandardTaxRateId,
} from "./eu-vat-rates";
import { parsePrice } from "./parse-price";

export function standardVatFraction(countryIso2: string): number {
  const p = getVatRateForCountry(countryIso2);
  if (p === undefined) return 0.2;
  return p / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split tax-inclusive gross into WC REST net + tax strings.
 * Tax is rounded first; net = gross − tax so net + tax always equals gross (no 1¢ drift on PDF).
 */
export function splitGrossForWooRest(
  gross: number,
  countryIso2: string
): { net: string; tax: string } {
  const g = Math.max(0, gross);
  const r = standardVatFraction(countryIso2);
  const tax = round2((g * r) / (1 + r));
  const net = round2(g - tax);
  return { net: net.toFixed(2), tax: tax.toFixed(2) };
}

/**
 * WC REST shipping `taxes[]` (EU-B2C). WC still recalculates tax on create;
 * production fix: WPCode hook `uncuttv_preserve_shipping_tax_from_rest` — see docs/wordpress/.
 */
export function buildEuB2cWooShippingTaxes(
  countryIso2: string,
  tax: string
): { id: number; total: string; subtotal: string }[] | undefined {
  const rateId = getWooStandardTaxRateId(countryIso2);
  if (rateId === undefined) return undefined;
  return [{ id: rateId, total: tax, subtotal: tax }];
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

/**
 * EU-B2C (non-AT) with coupon: discount in line_items only (no coupon_lines).
 * WC auto-applies percent coupons when coupon_lines is set → double deduction.
 */
export function buildEuB2cNonAtLineItemWithBakedDiscount(
  item: { id: number; price: string; qty: number },
  countryIso2: string,
  itemDiscountGrossEur: number
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parseFloat(item.price) || 0);
  const lineGross = unitGross * qty;
  const lineGrossAfterDiscount = Math.max(0, lineGross - Math.max(0, itemDiscountGrossEur));

  // subtotal must equal total — WC treats subtotal − total as discount_total (double deduction).
  const { net, tax } = splitGrossForWooRest(lineGrossAfterDiscount, countryIso2);

  return {
    product_id: Number(item.id),
    quantity: item.qty,
    subtotal: net,
    subtotal_tax: tax,
    total: net,
    total_tax: tax,
  };
}

/** Non-EU B2C with coupon baked into line totals (same WC double-deduction issue). */
export function buildNonEuB2cLineItemWithBakedDiscount(
  item: { id: number; price: string; qty: number },
  itemDiscountGrossEur: number
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parsePrice(item.price));
  const lineGross = unitGross * qty;
  const lineGrossAfterDiscount = Math.max(0, lineGross - Math.max(0, itemDiscountGrossEur));

  const { net, tax } = splitGrossForNonEu(lineGrossAfterDiscount);

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

/** Drittland B2C: Brutto = Endkundenpreis, keine ausgewiesene USt. (Versand analog). */
export function splitGrossForNonEu(grossEur: number): { net: string; tax: string } {
  const g = Math.max(0, grossEur);
  return { net: g.toFixed(2), tax: "0.00" };
}

export function buildNonEuB2cLineItem(item: {
  id: number;
  price: string;
  qty: number;
}) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parsePrice(item.price));
  const lineGross = unitGross * qty;
  const { net, tax } = splitGrossForNonEu(lineGross);
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
