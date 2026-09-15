import { unstable_cache } from "next/cache";
import { wooFetchAll, wooFetch } from "@/lib/woocommerce";
import {
  SHOP_LIST_FIELDS,
  type ShopListProduct,
  type WooCategory,
} from "@/lib/types";

/**
 * Der gecachte Katalog des Shops: Produkte und Kategorien in einem Eintrag.
 *
 * Stand bis September 2026 in src/app/shop/page.tsx (Seitenmodule dürfen
 * nur die Next-Felder exportieren, deshalb war die Funktion dort nicht
 * erreichbar). Seit die Weiche unter /start die neuesten Produkte zeigt,
 * liegt er hier: beide Seiten lesen denselben Cache-Eintrag, es gibt keine
 * zweite Abfrage nach WordPress.
 *
 * Der Fetch-Cache (`next: { revalidate: 60 }` in woocommerce.ts) greift in
 * der Produktion nicht: Nach `cookies()` und mit Authorization-Header
 * behandelt Next die Abfragen als nicht cachebar, gemessen an fünf Aufrufen
 * innerhalb von 20 s mit je 2,7 bis 3,1 s. Deshalb liegt der ganze Katalog
 * in unstable_cache, das von der Dynamik der Route unabhängig ist: Einmal
 * pro Minute nach WordPress, sonst aus dem Cache.
 *
 * Kein Zugriff auf Cookies oder Kopfzeilen hier drin, das verlangt
 * unstable_cache; die Sitzungsprüfung läuft davor in der Seite.
 */

const SHOP_CATALOG_TAG = "shop-catalog";
const SHOP_CATALOG_REVALIDATE_SECONDS = 60;

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

export type ShopCatalog = {
  /** In der Reihenfolge von WooCommerce: neueste zuerst. */
  products: ShopListProduct[];
  categories: WooCategory[];
};

export const getShopCatalog = unstable_cache(
  async (): Promise<ShopCatalog> => {
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
    return { products: rawProducts.map(toShopListProduct), categories };
  },
  ["shop-catalog", SHOP_LIST_FIELDS.join(",")],
  { revalidate: SHOP_CATALOG_REVALIDATE_SECONDS, tags: [SHOP_CATALOG_TAG] }
);
