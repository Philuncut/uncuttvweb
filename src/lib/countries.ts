import { getWorldCountriesForDropdown } from "@/lib/world-countries";

export type CountryOption = {
  code: string;
  label: string;
};

/** Profil + Checkout — gleiche Quelle wie `getWorldCountriesForDropdown()`. */
export const ACCOUNT_COUNTRIES: CountryOption[] =
  getWorldCountriesForDropdown().map(({ code, name }) => ({
    code,
    label: name,
  }));
