export interface WooImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

/** Ein Attribut am Produkt, etwa "Größe" (pa_groesse) mit den Optionen XS … 5XL. */
export interface WooAttribute {
  id: number;
  name: string;
  slug?: string;
  variation?: boolean;
  visible?: boolean;
  options: string[];
}

/**
 * Eine Variante eines variablen Produkts (eine Größe), zugeschnitten auf
 * das, was Karte, Produktseite und Warenkorb brauchen. Abgeleitet in
 * varianten.ts aus GET /products/{id}/variations.
 */
export interface ProductVariant {
  id: number;
  /** Die Option des Attributs Größe, z. B. "L". */
  size: string;
  /** Slug des Begriffs ("l", "3xl"): Wert des Positions-Metas pa_groesse. */
  size_slug: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  manage_stock: boolean;
  /** WooCommerce-Feld `purchasable` (schließt den Verkaufszeitraum ein). */
  purchasable: boolean;
  status?: string;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  /** Woo post status — e.g. "publish", "draft", "private". */
  status: string;
  /** WooCommerce-Produkttyp: "simple", "variable", … Fehlt bei alten Zeilen: simple. */
  type?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  /** WooCommerce `purchasable`; der Verkaufszeitraum-Filter in WordPress wirkt hier hinein. */
  purchasable?: boolean;
  /** "visible" | "catalog" | "search" | "hidden" — hidden bleibt aus dem Katalog. */
  catalog_visibility?: string;
  stock_status: "instock" | "outofstock" | "onbackorder";
  /** Present when Woo “Manage stock” is enabled — used for scarcity + wholesale qty. */
  stock_quantity?: number | null;
  sku: string;
  images: WooImage[];
  categories: WooCategory[];
  attributes?: WooAttribute[];
  short_description: string;
  description: string;
  related_ids: number[];
  meta_data?: Array<{ key: string; value: unknown }>;
}

/**
 * Die Felder, die das Shop-Raster (ShopContent) und die Warenkorbkette
 * (CartContext, CartDrawer, CheckoutForm, Persistenz) tatsächlich lesen.
 * Die Shopseite holt nur diese von WooCommerce (`_fields`) und reicht nur
 * diese an den Client weiter; Beschreibungen, Meta-Daten und `_links`
 * bleiben auf dem Server. Ein volles `WooProduct` erfüllt den Typ.
 */
export const SHOP_LIST_FIELDS = [
  "id",
  "name",
  "slug",
  "type",
  "price",
  "regular_price",
  "sale_price",
  "purchasable",
  "catalog_visibility",
  "stock_status",
  "stock_quantity",
  "images",
  "categories",
  "attributes",
] as const;

export type ShopListProduct = Pick<
  WooProduct,
  (typeof SHOP_LIST_FIELDS)[number]
> & {
  /**
   * Aus dem Meta-Feld uncuttv_angaben des Steuerpults, auf dem Server
   * abgeleitet (shop-catalog.ts): der Filmtitel ohne Verpackung und Cover,
   * und die Verpackung. Fehlen bei Produkten aus dem alten Dashboard; die
   * Gruppierung fällt dann auf den Namen zurück. Das Meta-Feld selbst geht
   * nicht an den Client.
   */
  film_titel?: string | null;
  verpackung?: string | null;
  /**
   * Nur bei variablen Produkten (Merch): die Größen in der Reihenfolge des
   * Attributs, auf dem Server aus GET /products/{id}/variations geholt.
   */
  variants?: ProductVariant[];
  /** Verkaufszeitraum aus uncuttv_verkauf_von / _bis (UTC, ISO 8601). */
  verkauf_von?: string | null;
  verkauf_bis?: string | null;
};
