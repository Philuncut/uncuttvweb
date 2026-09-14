import { redirectWholesaleToPortal } from "@/lib/wholesale-gate";
import { wooFetchAll, wooFetch } from "@/lib/woocommerce";
import {
  SHOP_LIST_FIELDS,
  type ShopListProduct,
  type WooCategory,
} from "@/lib/types";
import ShopPage from "./ShopPage";

// Kein force-dynamic mehr: Das würde laut Next-Doku jedes fetch() der
// Seite auf no-store zwingen und den 60-s-Data-Cache in woocommerce.ts
// aushebeln. Die Sitzungsprüfung liest Cookies und hält die Seite ohnehin
// bei jedem Aufruf dynamisch; die Produktabfragen kommen jetzt aus dem
// Cache und gehen nur einmal pro Minute nach WordPress.

export const metadata = {
  title: "Shop — UNCUTTV",
  description: "UNCUTTV Shop — Mediabooks, Blu-rays und mehr.",
};

/**
 * Auf die Felder aus SHOP_LIST_FIELDS zuschneiden. WooCommerce liefert mit
 * `_fields` zwar schon nur diese, aber innerhalb von `images` weiterhin
 * alle Bildattribute; und sollte `_fields` einmal ignoriert werden, darf
 * trotzdem nichts Überflüssiges ins HTML wandern.
 */
function toShopListProduct(product: ShopListProduct): ShopListProduct {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    stock_status: product.stock_status,
    stock_quantity: product.stock_quantity ?? null,
    images: (product.images ?? []).map((img) => ({
      id: img.id,
      src: img.src,
      name: img.name,
      alt: img.alt,
    })),
    categories: (product.categories ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    })),
  };
}

export default async function Page() {
  // Haendler sehen das Portal, nicht den B2C-Shop. Frueher stand diese
  // Umleitung in der middleware.ts und las die Rolle aus einem Cookie.
  await redirectWholesaleToPortal();

  const [rawProducts, categories] = await Promise.all([
    wooFetchAll<ShopListProduct>("/products", {
      per_page: "100",
      _fields: SHOP_LIST_FIELDS.join(","),
    }),
    wooFetch<WooCategory[]>("/products/categories", {
      per_page: "100",
      hide_empty: "true",
    }),
  ]);

  const products = rawProducts.map(toShopListProduct);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ShopPage products={products} categories={categories} />
    </div>
  );
}
