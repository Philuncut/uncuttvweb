/** ISO2 → country calling code (no +), for Meta ph normalization. */
const DIAL_CODE_BY_COUNTRY: Record<string, string> = {
  AT: "43",
  DE: "49",
  CH: "41",
  LI: "423",
  IT: "39",
  FR: "33",
  NL: "31",
  BE: "32",
  LU: "352",
  ES: "34",
  PT: "351",
  GB: "44",
  IE: "353",
  PL: "48",
  CZ: "420",
  SK: "421",
  HU: "36",
  SI: "386",
  HR: "385",
  RO: "40",
  BG: "359",
  GR: "30",
  DK: "45",
  SE: "46",
  NO: "47",
  FI: "358",
  US: "1",
  CA: "1",
  AU: "61",
};

/**
 * Meta CAPI: digits only, country code included, no leading zeros.
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */
export function normalizePhoneForMeta(
  phone: string,
  countryIso2?: string
): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  let digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  const country = (countryIso2 ?? "").trim().toUpperCase();
  const dial = country ? DIAL_CODE_BY_COUNTRY[country] : undefined;

  if (dial) {
    if (digits.startsWith(dial)) {
      return digits.replace(/^0+/, "");
    }
    const local = digits.replace(/^0+/, "");
    if (local) return `${dial}${local}`;
  }

  return digits.replace(/^0+/, "");
}
