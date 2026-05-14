export function parsePrice(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw).trim().replace(",", ".");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Fixed-amount coupon display from validate-coupon: `−24,90 €` or legacy `−€24.90`. */
export function parseFixedDiscountEuros(display: string): number | null {
  const de = display.match(/[\u2212-]\s*([\d.,]+)\s*€/);
  if (de) return parsePrice(de[1]);
  const legacy = display.match(/[\u2212-]\s*€\s*([\d.,]+)/);
  if (legacy) return parsePrice(legacy[1]);
  return null;
}
