import type { WooProduct } from "@/lib/types";

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
