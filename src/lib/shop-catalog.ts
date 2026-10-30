import { unstable_cache } from "next/cache";
import { wooFetchAll, wooFetch } from "@/lib/woocommerce";
import {
  SHOP_LIST_FIELDS,
  type ProductVariant,
  type ShopListProduct,
  type WooCategory,
} from "@/lib/types";
import { angabenAus, packungName, type MetaZeile } from "@/lib/verpackung";
import {
  GROESSE_ATTRIBUT_SLUG,
  VARIANTEN_FELDER,
  istVariabel,
  sortiereVarianten,
  verkaufszeitraumAus,
  zuProductVariant,
  type VarianteRoh,
} from "@/lib/varianten";

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
 *
 * Variable Produkte (Merch mit Größen): je Produkt ein zweiter Aufruf nach
 * den Varianten, damit die Karte "ab"-Preis und "Ausverkauft" (erst, wenn
 * keine Größe mehr bestellbar ist) richtig zeigt. Der Preis und der
 * Bestand für die Zahlung kommen NICHT von hier, sondern frisch aus
 * WooCommerce (bestellpruefung.ts).
 */

const SHOP_CATALOG_TAG = "shop-catalog";
const SHOP_CATALOG_REVALIDATE_SECONDS = 60;

/**
 * Auf die Felder aus SHOP_LIST_FIELDS zuschneiden. WooCommerce liefert mit
 * `_fields` zwar schon nur diese, aber innerhalb von `images` weiterhin
 * alle Bildattribute; und sollte `_fields` einmal ignoriert werden, darf
 * trotzdem nichts Überflüssiges ins HTML wandern.
 */
type RohProdukt = ShopListProduct & { meta_data?: MetaZeile[] };

function toShopListProduct(
  product: RohProdukt,
  variants: ProductVariant[] | undefined
): ShopListProduct {
  // Aus den Angaben des Steuerpults nur zwei kurze Felder; das Meta-Feld
  // mit der ganzen Beschreibung als JSON bleibt hier auf dem Server.
  const angaben = angabenAus(product.meta_data);
  const zeitraum = verkaufszeitraumAus(product.meta_data);
  const groessen = (product.attributes ?? []).find(
    (a) => a.slug === GROESSE_ATTRIBUT_SLUG || a.name === "Größe"
  );
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    type: product.type ?? "simple",
    price: product.price,
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    purchasable: product.purchasable,
    catalog_visibility: product.catalog_visibility,
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
    // Nur das Attribut Größe, nur mit seinen Optionen (die Reihenfolge).
    attributes: groessen
      ? [
          {
            id: groessen.id,
            name: groessen.name,
            slug: groessen.slug,
            variation: groessen.variation,
            options: [...(groessen.options ?? [])],
          },
        ]
      : [],
    film_titel: angaben?.produktname ?? null,
    verpackung: angaben ? packungName(angaben) : null,
    ...(variants
      ? { variants: sortiereVarianten(variants, groessen?.options) }
      : {}),
    verkauf_von: zeitraum.verkauf_von,
    verkauf_bis: zeitraum.verkauf_bis,
  };
}

/** Was von WooCommerce geholt wird: die Listenfelder plus das Meta-Feld, das hier abgeleitet wird. */
const KATALOG_FELDER = [...SHOP_LIST_FIELDS, "meta_data"].join(",");

/** Die veröffentlichten Varianten eines variablen Produkts; leer bei Fehler. */
export async function ladeVarianten(
  productId: number,
  options?: { noStore?: boolean }
): Promise<ProductVariant[]> {
  try {
    const roh = await wooFetchAll<VarianteRoh>(
      `/products/${productId}/variations`,
      { per_page: "100", status: "publish", _fields: VARIANTEN_FELDER },
      options?.noStore ? { cache: "no-store" } : undefined
    );
    return roh
      .map(zuProductVariant)
      .filter((v): v is ProductVariant => v !== null);
  } catch (err) {
    console.warn(
      `[shop-catalog] Varianten von Produkt ${productId} nicht lesbar:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/** Mehrere Produkte, höchstens `parallel` Aufrufe gleichzeitig (IONOS mag keine Anfrage-Stürme). */
async function ladeVariantenFuer(
  ids: number[],
  parallel = 3
): Promise<Map<number, ProductVariant[]>> {
  const ergebnis = new Map<number, ProductVariant[]>();
  for (let i = 0; i < ids.length; i += parallel) {
    const teil = ids.slice(i, i + parallel);
    const geladen = await Promise.all(teil.map((id) => ladeVarianten(id)));
    teil.forEach((id, idx) => ergebnis.set(id, geladen[idx]));
  }
  return ergebnis;
}

export type ShopCatalog = {
  /** In der Reihenfolge von WooCommerce: neueste zuerst. */
  products: ShopListProduct[];
  categories: WooCategory[];
};

export const getShopCatalog = unstable_cache(
  async (): Promise<ShopCatalog> => {
    const [rawProducts, categories] = await Promise.all([
      wooFetchAll<RohProdukt>("/products", {
        per_page: "100",
        _fields: KATALOG_FELDER,
      }),
      wooFetch<WooCategory[]>("/products/categories", {
        per_page: "100",
        hide_empty: "true",
      }),
    ]);

    // "Versteckt" (catalog_visibility hidden) bleibt aus Raster, Suche und
    // Filter; die Produktseite ist weiter über ihre Adresse erreichbar.
    const sichtbar = rawProducts.filter(
      (p) => p.catalog_visibility !== "hidden"
    );

    const variabel = sichtbar.filter((p) => istVariabel(p)).map((p) => p.id);
    const varianten = await ladeVariantenFuer(variabel);

    return {
      products: sichtbar.map((p) =>
        toShopListProduct(p, istVariabel(p) ? varianten.get(p.id) ?? [] : undefined)
      ),
      categories,
    };
  },
  ["shop-catalog", KATALOG_FELDER, "film_titel", "varianten"],
  { revalidate: SHOP_CATALOG_REVALIDATE_SECONDS, tags: [SHOP_CATALOG_TAG] }
);
