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
