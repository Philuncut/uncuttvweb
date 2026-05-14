import type { WooCategory } from "@/lib/types";
import { parsePrice } from "@/lib/parse-price";

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
  /** WooCommerce: instock | outofstock | onbackorder */
  stock_status?: string;
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

/** `haendler_preis` + `sales_kit_url` aus Woo-`meta_data` (wie API-Route). */
export function enrichHaendlerProductFromWoo<
  T extends HaendlerProductLike & {
    meta_data?: Array<{ key: string; value: unknown }>;
  }
>(p: T): T & { haendler_preis: string; sales_kit_url: string } {
  const haendler_preis = extractHaendlerPreisFromMeta(p.meta_data);
  const meta = p.meta_data ?? [];
  const salesKitMeta = meta.find(
    (m) => m.key === "sales_kit_url" || m.key === "_sales_kit_url"
  );
  const sk = salesKitMeta?.value;
  const sales_kit_url =
    typeof sk === "string"
      ? sk.trim()
      : sk != null
        ? String(sk).trim()
        : "";
  return { ...p, haendler_preis, sales_kit_url };
}

export function hasPositiveHaendlerPreis(haendlerPreis: string): boolean {
  const n = parsePrice(haendlerPreis);
  return n > 0;
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

/** Exakte Übereinstimmung auf `category.slug` (case-insensitive). */
export function productHasExactCategorySlug(
  product: HaendlerProductLike,
  slug: string
): boolean {
  const target = slug.toLowerCase();
  return (product.categories ?? []).some(
    (c) => String(c.slug ?? "").toLowerCase() === target
  );
}

export function productHasAnyExactCategorySlug(
  product: HaendlerProductLike,
  slugs: readonly string[]
): boolean {
  return slugs.some((s) => productHasExactCategorySlug(product, s));
}

/** Out-of-Print — vgl. ShopContent.tsx (outofprint / out-of-print). */
export const HAENDLER_OUT_OF_PRINT_CATEGORY_SLUGS = [
  "outofprint",
  "out-of-print",
] as const;

/** „Jetzt erhältlich“-Sparte im Dashboard (vgl. ShopContent INSTOCK + Filter-Pill). */
export const HAENDLER_ALLE_FILME_CATEGORY_SLUGS = [
  "instock",
  "jetzt-erhaeltlich",
] as const;

export function productHasOutOfPrintCategory(product: HaendlerProductLike): boolean {
  return productHasAnyExactCategorySlug(
    product,
    HAENDLER_OUT_OF_PRINT_CATEGORY_SLUGS
  );
}

/** Ausverkaufte Woo-Artikel ausblenden; `onbackorder` und fehlender Status bleiben sichtbar. */
export function isProductInStockForHaendler(product: HaendlerProductLike): boolean {
  return product.stock_status !== "outofstock";
}

/** UND: erlaubte Kategorie + haendler_preis > 0 + nicht outofstock */
export function isProductVisibleForHaendler(
  product: HaendlerProductLike,
  haendlerPreis?: string
): boolean {
  const preis =
    haendlerPreis ?? extractHaendlerPreisFromMeta(product.meta_data);
  return (
    productHasHaendlerCategory(product.categories) &&
    hasPositiveHaendlerPreis(preis) &&
    isProductInStockForHaendler(product)
  );
}
