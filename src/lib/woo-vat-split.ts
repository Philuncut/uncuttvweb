/**
 * WooCommerce REST order payloads treat line/shipping `total` as tax-exclusive
 * in many paths even when `prices_include_tax: true` on the order — so gross
 * amounts must be split into net `total` + `total_tax`.
 *
 * EU-Sätze: `src/lib/eu-vat-rates.ts` (getVatRateForCountry). Unbekanntes Land → 20 %.
 *
 * Varianten (Merch mit Größen): jede Position trägt neben product_id auch
 * variation_id und das Positions-Meta pa_groesse. Damit zeigt WooCommerce
 * "Größe: L" in der Position, in den Mails und auf der PDF-Rechnung und
 * bucht den Bestand genau dieser Größe ab. Alle Zeilenbauer hier gehen
 * über `wooLineItemBase`, damit kein Steuerweg die Variante verliert.
 */
import {
  getVatRateForCountry,
  getWooStandardTaxRateId,
} from "./eu-vat-rates";
import { parsePrice } from "./parse-price";
import { GROESSE_ATTRIBUT_SLUG } from "./varianten";

/** Eine Warenkorbzeile, wie sie die Bestellanlage bekommt (CartMeta passt). */
export type WooLineInput = {
  id: number;
  price: string;
  qty: number;
  variation_id?: number;
  size?: string;
  size_slug?: string;
};

export type WooLineItemBase = {
  product_id: number;
  quantity: number;
  variation_id?: number;
  meta_data?: Array<{ key: string; value: string }>;
};

/**
 * product_id, quantity und -- bei einer Variante -- variation_id plus das
 * Attribut-Meta. WooCommerce löst den Begriff über den Slug auf und zeigt
 * den Namen ("Größe: L"); fehlt der Slug, steht der Name selbst drin.
 */
export function wooLineItemBase(item: WooLineInput): WooLineItemBase {
  const base: WooLineItemBase = {
    product_id: Number(item.id),
    quantity: item.qty,
  };
  const variationId = Number(item.variation_id);
  if (Number.isFinite(variationId) && variationId > 0) {
    base.variation_id = variationId;
    const wert = (item.size_slug ?? "").trim() || (item.size ?? "").trim();
    if (wert) {
      base.meta_data = [{ key: GROESSE_ATTRIBUT_SLUG, value: wert }];
    }
  }
  return base;
}

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
  item: WooLineInput,
  countryIso2: string
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitNet = Math.max(0, parseFloat(item.price) || 0);
  const lineNet = unitNet * qty;
  const { net, tax } = addTaxToNet(lineNet, countryIso2);
  return {
    ...wooLineItemBase(item),
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
  item: WooLineInput,
  countryIso2: string
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parseFloat(item.price) || 0);
  const lineGross = unitGross * qty;
  const { net, tax } = splitGrossForWooRest(lineGross, countryIso2);
  return {
    ...wooLineItemBase(item),
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
  item: WooLineInput,
  countryIso2: string,
  itemDiscountGrossEur: number
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parseFloat(item.price) || 0);
  const lineGross = unitGross * qty;
  const lineGrossAfterDiscount = Math.max(
    0,
    lineGross - Math.max(0, itemDiscountGrossEur)
  );

  // subtotal must equal total — WC treats subtotal − total as discount_total (double deduction).
  const { net, tax } = splitGrossForWooRest(lineGrossAfterDiscount, countryIso2);

  return {
    ...wooLineItemBase(item),
    subtotal: net,
    subtotal_tax: tax,
    total: net,
    total_tax: tax,
  };
}

/** Non-EU B2C with coupon baked into line totals (same WC double-deduction issue). */
export function buildNonEuB2cLineItemWithBakedDiscount(
  item: WooLineInput,
  itemDiscountGrossEur: number
) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parsePrice(item.price));
  const lineGross = unitGross * qty;
  const lineGrossAfterDiscount = Math.max(
    0,
    lineGross - Math.max(0, itemDiscountGrossEur)
  );

  const { net, tax } = splitGrossForNonEu(lineGrossAfterDiscount);

  return {
    ...wooLineItemBase(item),
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

export function buildNonEuB2cLineItem(item: WooLineInput) {
  const qty = Math.max(1, Number(item.qty) || 1);
  const unitGross = Math.max(0, parsePrice(item.price));
  const lineGross = unitGross * qty;
  const { net, tax } = splitGrossForNonEu(lineGross);
  return {
    ...wooLineItemBase(item),
    subtotal: net,
    subtotal_tax: tax,
    total: net,
    total_tax: tax,
    taxes: [] as unknown[],
  };
}

/** Reverse Charge (EU-B2B): Brutto = Netto, 0 % USt, Rabatt schon abgezogen. */
export function buildReverseChargeLineItem(
  item: WooLineInput,
  lineDiscountEur = 0
) {
  const lineGross = Math.max(
    0,
    parsePrice(item.price) * item.qty - Math.max(0, lineDiscountEur)
  );
  const lineTotal = lineGross.toFixed(2);
  return {
    ...wooLineItemBase(item),
    subtotal: lineTotal,
    total: lineTotal,
    subtotal_tax: "0.00",
    total_tax: "0.00",
    taxes: [] as unknown[],
  };
}

/** AT-B2C: WooCommerce rechnet selbst; nur Produkt, Variante und Menge. */
export function buildImplicitLineItem(item: WooLineInput) {
  return wooLineItemBase(item);
}
