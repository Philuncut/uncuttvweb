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
 * EU-B2C außer AT: feste Bruttopreise (AT-Katalog) mit Steueranteil fürs Zielland,
 * damit WooCommerce nicht aus dem Katalog auf Zielland-MwSt umrechnet.
 */
export function shouldSendExplicitEuB2cLineAmounts(countryIso2: string): boolean {
  const c = (countryIso2 || "").trim().toUpperCase();
  if (c === "AT") return false;
  return getVatRateForCountry(c) !== undefined;
}
