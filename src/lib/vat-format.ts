/**
 * Client-side EU VAT number format checks (no VIES).
 * Uppercase, spaces stripped before matching.
 */

function normalizeVat(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Country-specific patterns (pragmatic; VAT Guard may still reject server-side). */
const VAT_PATTERNS: Array<{ prefix: string; pattern: RegExp }> = [
  { prefix: "CHE", pattern: /^CHE\d{9}(MWST|TVA|IVA)?$/ },
  { prefix: "AT", pattern: /^ATU\d{8}$/ },
  { prefix: "DE", pattern: /^DE\d{9}$/ },
  { prefix: "IT", pattern: /^IT\d{11}$/ },
  { prefix: "FR", pattern: /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/ },
  { prefix: "NL", pattern: /^NL\d{9}B\d{2}$/ },
  { prefix: "BE", pattern: /^BE0?\d{9}$/ },
  { prefix: "ES", pattern: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/ },
];

export function validateEuVatFormat(raw: string): boolean {
  const v = normalizeVat(raw);
  if (!v) return false;
  for (const { prefix, pattern } of VAT_PATTERNS) {
    if (v.startsWith(prefix) && pattern.test(v)) return true;
  }
  return false;
}
