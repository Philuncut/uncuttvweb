/**
 * EU-Sanktionsliste (Stand: Mai 2026) + USA (Geschäftsentscheidung).
 * Diese Liste muss bei Änderungen der EU-Sanktionsliste manuell
 * aktualisiert werden.
 * Referenz: https://www.sanctionsmap.eu/
 */
export const BLOCKED_COUNTRY_CODES = new Set<string>([
  // EU-sanktionierte Länder
  "AF",
  "BY",
  "BI",
  "CF",
  "CD",
  "CU",
  "ER",
  "GW",
  "HT",
  "IR",
  "IQ",
  "LB",
  "LY",
  "ML",
  "MM",
  "NI",
  "KP",
  "RU",
  "SO",
  "SS",
  "SD",
  "SY",
  "VE",
  "YE",
  "ZW",

  // Geschäftsentscheidung
  "US",
]);

export function isCountryBlocked(countryCode: string): boolean {
  if (!countryCode) return false;
  return BLOCKED_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}
