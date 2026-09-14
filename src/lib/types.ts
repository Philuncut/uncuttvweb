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

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  /** Woo post status — e.g. "publish", "draft", "private". */
  status: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  /** Present when Woo “Manage stock” is enabled — used for scarcity + wholesale qty. */
  stock_quantity?: number | null;
  sku: string;
  images: WooImage[];
  categories: WooCategory[];
  short_description: string;
  description: string;
  related_ids: number[];
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
  "price",
  "regular_price",
  "sale_price",
  "stock_status",
  "stock_quantity",
  "images",
  "categories",
] as const;

export type ShopListProduct = Pick<WooProduct, (typeof SHOP_LIST_FIELDS)[number]>;
