import type { WooCategory } from "@/lib/types";

/**
 * WooCommerce-Kategorie-Slugs für Händler-"Main-Titel".
 * `instock` entspricht `INSTOCK_SLUG` in ShopContent.tsx (Sektion „Jetzt erhältlich“);
 * `jetzt-erhaeltlich` ist der Slug aus der Shop-Filterleiste (gleiche Sparte, falls Woo so taggt).
 */
export const HAENDLER_ALLOWED_CATEGORY_SLUGS = [
  "vorverkauf",
  "brandneu",
  "jetzt-erhaeltlich",
  "instock",
] as const;

export type HaendlerProductLike = {
  categories?: WooCategory[];
  meta_data?: Array<{ key: string; value: unknown }>;
};

export function extractHaendlerPreisFromMeta(
  meta: Array<{ key: string; value: unknown }> | undefined
): string {
  const haendlerMeta = meta?.find(
    (m) =>
      m.key === "haendler_preis" ||
      m.key === "_haendler_preis" ||
      m.key === "wholesale_price" ||
      m.key === "_wholesale_price"
  );
  const v = haendlerMeta?.value;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v != null) return String(v).trim();
  return "";
}

export function hasPositiveHaendlerPreis(haendlerPreis: string): boolean {
  const n = parseFloat(String(haendlerPreis).replace(",", ".").trim());
  return !Number.isNaN(n) && n > 0;
}

export function productHasHaendlerCategory(
  categories: WooCategory[] | undefined
): boolean {
  const slugSet = new Set(
    (categories ?? []).map((c) => String(c.slug ?? "").toLowerCase())
  );
  return HAENDLER_ALLOWED_CATEGORY_SLUGS.some((allowed) =>
    slugSet.has(allowed)
  );
}

/** Beide Bedingungen (UND): erlaubte Kategorie + haendler_preis > 0 */
export function isProductVisibleForHaendler(
  product: HaendlerProductLike,
  haendlerPreis?: string
): boolean {
  const preis =
    haendlerPreis ?? extractHaendlerPreisFromMeta(product.meta_data);
  return (
    productHasHaendlerCategory(product.categories) &&
    hasPositiveHaendlerPreis(preis)
  );
}
