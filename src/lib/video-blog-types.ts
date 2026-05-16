export type VideoPlatform = "youtube" | "vimeo";

export type ShopVideoRow = {
  video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  duration_seconds: number | null;
  published_at: string | null;
  featured_products: number[] | null;
  auto_matched_products: number[] | null;
};

export type BlogProductCard = {
  id: number;
  name: string;
  slug: string;
  price: string;
  image?: string;
};

export type BlogVideoItem = ShopVideoRow & {
  products: BlogProductCard[];
};
