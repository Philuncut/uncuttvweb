/**
 * Standard-USt-Sätze EU (Verbrauchsteuer), als ganze Prozent bzw. FI mit 25,5.
 * Basis für B2C-Woo-Splits: Brutto bleibt AT-Katalogpreis, Steueranteil = Zielland.
 */

const EU_VAT_RATES_PERCENT: Record<string, number> = {
  AT: 20,
  BE: 21,
  BG: 20,
  CY: 19,
  CZ: 21,
  DE: 19,
  DK: 25,
  EE: 22,
  ES: 21,
  FI: 25.5,
  FR: 20,
  GR: 24,
  HR: 25,
  HU: 27,
  IE: 23,
  IT: 22,
  LT: 21,
  LU: 17,
  LV: 21,
  MT: 18,
  NL: 21,
  PL: 23,
  PT: 23,
  RO: 19,
  SE: 25,
  SI: 22,
  SK: 23,
};

export function getVatRateForCountry(countryIso2: string): number | undefined {
  const c = (countryIso2 || "").trim().toUpperCase();
  return EU_VAT_RATES_PERCENT[c];
}

/**
 * WooCommerce `taxes[].id` for standard country rates (Versand + EU-B2C-Splits).
 * Source: GET /wc/v3/taxes — class=standard, shipping=true (WP Admin → Steuer → Standardsätze).
 * Update manually when rates are recreated in WooCommerce.
 */
export const WOO_STANDARD_TAX_RATE_ID_BY_COUNTRY: Readonly<Record<string, number>> =
  {
    AT: 1,
    BE: 2,
    BG: 3,
    HR: 4,
    CY: 5,
    CZ: 6,
    DK: 7,
    EE: 8,
    FI: 9,
    FR: 10,
    DE: 11,
    GR: 12,
    HU: 13,
    IE: 14,
    IT: 15,
    LV: 16,
    LT: 17,
    LU: 18,
    MT: 19,
    NL: 20,
    PL: 21,
    PT: 22,
    RO: 23,
    SK: 24,
    SI: 25,
    ES: 26,
    SE: 27,
  };

/** WC tax rate id for standard VAT class in a country, if configured. */
export function getWooStandardTaxRateId(countryIso2: string): number | undefined {
  const c = (countryIso2 || "").trim().toUpperCase();
  return WOO_STANDARD_TAX_RATE_ID_BY_COUNTRY[c];
}

/**
 * EU-B2C außer AT: feste Bruttopreise (AT-Katalog) mit Steueranteil fürs Zielland,
 * damit WooCommerce nicht aus dem Katalog auf Zielland-MwSt umrechnet.
 */
export function shouldSendExplicitEuB2cLineAmounts(countryIso2: string): boolean {
  const c = (countryIso2 || "").trim().toUpperCase();
  if (c === "AT") return false;
  return getVatRateForCountry(c) !== undefined;
}

/**
 * B2C Drittland (nicht AT, nicht EU-USt-Katalog): Checkout-Brutto (= AT-Katalog)
 * explizit an Woo senden, damit kein AT-MwSt.-Abzug auf „Netto Ausfuhr“ erfolgt.
 */
export function shouldSendExplicitNonEuLineAmounts(countryIso2: string): boolean {
  const c = (countryIso2 || "").trim().toUpperCase();
  if (!c) return false;
  if (c === "AT") return false;
  return getVatRateForCountry(c) === undefined;
}
