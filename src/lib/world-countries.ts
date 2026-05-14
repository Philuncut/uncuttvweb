import { BLOCKED_COUNTRY_CODES } from "./blocked-countries";
import { ISO_3166_1_ALPHA2_CODES } from "./iso-3166-1-alpha2-codes";

const PRIORITY_COUNTRIES = ["AT", "DE", "CH"];

/** Keine typischen Lieferziele (Antarktis / unbewohnte Gebiete) — aus Dropdown. */
const DROPDOWN_EXCLUDED_CODES = new Set<string>(["AQ", "BV", "HM", "TF", "UM"]);

export function getWorldCountriesForDropdown(): { code: string; name: string }[] {
  const displayNames = new Intl.DisplayNames(["de"], { type: "region" });

  const allCountries = [...ISO_3166_1_ALPHA2_CODES]
    .filter((code) => !BLOCKED_COUNTRY_CODES.has(code))
    .filter((code) => !DROPDOWN_EXCLUDED_CODES.has(code))
    .map((code) => ({
      code,
      name: displayNames.of(code) ?? code,
    }));

  const priority = PRIORITY_COUNTRIES.map((c) =>
    allCountries.find((co) => co.code === c)
  ).filter(Boolean) as { code: string; name: string }[];

  const rest = allCountries
    .filter((c) => !PRIORITY_COUNTRIES.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return [...priority, ...rest];
}
