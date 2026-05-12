import type { ViesValidated } from "@/lib/vies-types";

/** EU member states (ISO 3166-1 alpha-2) excluding AT (seller). Used for Reverse Charge eligibility. */
export const EU_REVERSE_CHARGE_COUNTRIES = [
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
] as const;

/** EU + AT + GB/XI for VIES countryCode (EC checkVat). */
export const VIES_SUPPORTED_PREFIXES = new Set<string>([
  ...EU_REVERSE_CHARGE_COUNTRIES,
  "AT",
  "EL",
  "GB",
  "XI",
]);

export type ReverseChargeContext = {
  isWholesale: boolean;
  vat: string;
  shippingCountry: string;
  viesResult: ViesValidated | null;
};

export function isReverseChargeEligible(ctx: ReverseChargeContext): boolean {
  if (!ctx.isWholesale) return false;
  if (!ctx.vat?.trim()) return false;
  if (!ctx.shippingCountry?.trim()) return false;
  const ship = ctx.shippingCountry.trim().toUpperCase();
  if (ship === "AT") return false;
  if (!EU_REVERSE_CHARGE_COUNTRIES.includes(ship as (typeof EU_REVERSE_CHARGE_COUNTRIES)[number])) {
    return false;
  }
  const vatNorm = ctx.vat.trim().toUpperCase().replace(/\s+/g, "");
  const countryMatchesVat =
    ship === "GR"
      ? vatNorm.startsWith("EL")
      : vatNorm.startsWith(ship);
  if (!countryMatchesVat) return false;
  if (!ctx.viesResult || ctx.viesResult.valid !== true) return false;
  return true;
}
