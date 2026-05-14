/** EU-27 — Wholesale nur innerhalb dieser Länder (kein CH/LI/UK etc.). */
export const WHOLESALE_ALLOWED_COUNTRY_CODES = new Set<string>([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

export function isWholesaleCountryAllowed(countryCode: string): boolean {
  if (!countryCode) return false;
  return WHOLESALE_ALLOWED_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}
