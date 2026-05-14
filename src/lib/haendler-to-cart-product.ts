import type { WooProduct, WooCategory, WooImage } from "@/lib/types";

/** Single source for Händler-Zeilenpreis im Warenkorb (wie bisher HaendlerProduct.tsx). */
export function resolveHaendlerLinePrice(
  haendler_preis: string | undefined,
  fallbackPrice: string
): string {
  if (haendler_preis != null && String(haendler_preis).trim() !== "") {
    return String(haendler_preis).trim();
  }
  return fallbackPrice;
}

/** Dashboard-Karten-Payload (Subset) — gleiche Felder wie API für Händler-Grid. */
export type HaendlerDashboardProductRow = {
  id: number;
  name: string;
  slug: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  images: Array<{ src: string; alt?: string }>;
  categories: WooCategory[];
  haendler_preis: string;
};

function normalizeDashboardImages(
  images: HaendlerDashboardProductRow["images"]
): WooImage[] {
  return images.map((img, idx) => ({
    id: idx,
    src: img.src,
    name: "",
    alt: img.alt ?? "",
  }));
}

function isFullWooWithHaendler(
  product: (WooProduct & { haendler_preis?: string }) | HaendlerDashboardProductRow
): product is WooProduct & { haendler_preis?: string } {
  return (
    "related_ids" in product &&
    Array.isArray((product as WooProduct).related_ids)
  );
}

function dashboardRowToCartProduct(row: HaendlerDashboardProductRow): WooProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: resolveHaendlerLinePrice(row.haendler_preis, row.price),
    regular_price: row.regular_price,
    sale_price: row.sale_price,
    on_sale: false,
    stock_status: row.stock_status as WooProduct["stock_status"],
    sku: "",
    images: normalizeDashboardImages(row.images),
    categories: row.categories,
    short_description: "",
    description: "",
    related_ids: [],
  };
}

/**
 * Ein Einstieg für alle Händler-Cart-Zeilen: volles Woo-Produkt (Detail-API)
 * oder Dashboard-Zeile → `WooProduct` mit `price` = Händlerpreis falls gesetzt.
 */
export function toHaendlerCartProduct(
  product: (WooProduct & { haendler_preis?: string }) | HaendlerDashboardProductRow
): WooProduct {
  if (isFullWooWithHaendler(product)) {
    return {
      ...product,
      price: resolveHaendlerLinePrice(product.haendler_preis, product.price),
    };
  }
  return dashboardRowToCartProduct(product);
}
