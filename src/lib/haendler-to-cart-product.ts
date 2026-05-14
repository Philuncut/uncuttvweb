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

/** Volles Woo-Produkt (z. B. Händler-Detail) → Cart-Zeile mit Händlerpreis in `price`. */
export function toHaendlerCartProduct(
  product: WooProduct & { haendler_preis?: string }
): WooProduct {
  return {
    ...product,
    price: resolveHaendlerLinePrice(product.haendler_preis, product.price),
  };
}

/** Dashboard-Karten-Payload (Subset) → WooProduct für CartContext. */
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

function normalizeImages(
  images: HaendlerDashboardProductRow["images"]
): WooImage[] {
  return images.map((img, idx) => ({
    id: idx,
    src: img.src,
    name: "",
    alt: img.alt ?? "",
  }));
}

export function haendlerDashboardRowToCartProduct(
  product: HaendlerDashboardProductRow
): WooProduct {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: resolveHaendlerLinePrice(product.haendler_preis, product.price),
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    on_sale: false,
    stock_status: product.stock_status as WooProduct["stock_status"],
    sku: "",
    images: normalizeImages(product.images),
    categories: product.categories,
    short_description: "",
    description: "",
    related_ids: [],
  };
}
