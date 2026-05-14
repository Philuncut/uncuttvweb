/**
 * Checkout (DE/AT): Wenn eine kostenlose GLS-Option existiert, bezahlte
 * GLS-Optionen ausblenden — Post & andere bleiben.
 *
 * Erkennung über `name` (Woo Store API / PublicShippingRate), case-insensitive.
 */
export type ShippingRateWithName = { name: string };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function filterDeAtShippingRatesForDisplay<T extends ShippingRateWithName>(
  rates: T[],
  country: string
): T[] {
  const cc = country.trim().toUpperCase();
  if (cc !== "AT" && cc !== "DE") return rates;
  if (rates.length <= 1) return rates;

  const hasFreeGls = rates.some((r) => {
    const n = norm(r.name);
    return n.includes("kostenlos") && n.includes("gls");
  });
  if (!hasFreeGls) return rates;

  return rates.filter((r) => {
    const n = norm(r.name);
    if (n.includes("kostenlos")) return true;
    if (n.includes("gls")) return false;
    return true;
  });
}
