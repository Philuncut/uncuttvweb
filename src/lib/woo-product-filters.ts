import type { WooProduct } from "@/lib/types";
import { productHasOutOfPrintCategory } from "@/lib/haendler-filter";

export const OUT_OF_PRINT_CATEGORY_SLUG = "outofprint";

/** Products eligible for video auto-match and shop recommendations. */
export function isRecommendableProduct(product: WooProduct): boolean {
  if (product.stock_status !== "instock") return false;
  const categories = product.categories ?? [];
  return !categories.some((c) => c.slug === OUT_OF_PRINT_CATEGORY_SLUG);
}

export function filterRecommendableProducts(
  products: WooProduct[]
): WooProduct[] {
  return products.filter(isRecommendableProduct);
}

/**
 * PDP "Ähnliche Produkte": purchasable / convertible only (B2C + wholesale).
 * Keeps vorverkauf and sale; drops out-of-stock, OOP, and zero-quantity items.
 */
export function isPurchasableRelatedProduct(product: WooProduct): boolean {
  if (product.stock_status === "outofstock") return false;
  if (productHasOutOfPrintCategory(product)) return false;
  if (
    typeof product.stock_quantity === "number" &&
    product.stock_quantity === 0
  ) {
    return false;
  }
  const slugs = (product.categories ?? []).map((c) =>
    String(c.slug ?? "").toLowerCase()
  );
  if (
    slugs.some(
      (s) => s.includes("outofprint") || s.includes("out-of-print")
    )
  ) {
    return false;
  }
  return true;
}

export function filterPurchasableRelatedProducts(
  products: WooProduct[]
): WooProduct[] {
  return products.filter(isPurchasableRelatedProduct);
}
