import { getSupabaseAdmin } from "@/lib/supabase-server";
import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";
import type {
  BlogProductCard,
  BlogVideoItem,
  ShopVideoRow,
  VideoPlatform,
} from "@/lib/video-blog-types";

function productIdsForVideo(row: ShopVideoRow): number[] {
  const featured = row.featured_products?.filter((id) => id > 0) ?? [];
  if (featured.length > 0) return featured;
  return row.auto_matched_products?.filter((id) => id > 0) ?? [];
}

async function fetchProductCards(ids: number[]): Promise<Map<number, BlogProductCard>> {
  const unique = [...new Set(ids)].filter((id) => id > 0);
  const map = new Map<number, BlogProductCard>();
  if (unique.length === 0) return map;

  try {
    const products = await wooFetch<WooProduct[]>(
      "/products",
      {
        include: unique.join(","),
        per_page: String(Math.min(unique.length, 100)),
      },
      { revalidate: 300 }
    );
    if (!Array.isArray(products)) return map;
    for (const p of products) {
      const image = p.images?.[0]?.src;
      map.set(p.id, {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price || p.regular_price || "",
        ...(image ? { image } : {}),
      });
    }
  } catch (err) {
    console.warn("[blog-data] Woo product fetch failed", err);
  }
  return map;
}

function attachProducts(
  rows: ShopVideoRow[],
  cardMap: Map<number, BlogProductCard>
): BlogVideoItem[] {
  return rows.map((row) => {
    const ids = productIdsForVideo(row);
    const products = ids
      .map((id) => cardMap.get(id))
      .filter((p): p is BlogProductCard => !!p);
    return { ...row, products };
  });
}

export async function fetchBlogVideos(
  platform: VideoPlatform
): Promise<BlogVideoItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const table =
    platform === "youtube" ? "shop_youtube_videos" : "shop_vimeo_videos";

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(`[blog-data] Supabase ${table} error`, error.message);
    return [];
  }

  const rows = (Array.isArray(data) ? data : []) as ShopVideoRow[];
  const allProductIds = rows.flatMap((r) => productIdsForVideo(r));
  const cardMap = await fetchProductCards(allProductIds);
  return attachProducts(rows, cardMap);
}

export function isVimeoConfigured(): boolean {
  return !!process.env.VIMEO_API_TOKEN?.trim();
}

export async function fetchYouTubeSubscriberCount(): Promise<string> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!apiKey || !channelId) return "5.000+";

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", channelId);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return "5.000+";
    const json = (await res.json()) as {
      items?: Array<{ statistics?: { subscriberCount?: string } }>;
    };
    const raw = json.items?.[0]?.statistics?.subscriberCount;
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n) || n <= 0) return "5.000+";
    return new Intl.NumberFormat("de-DE").format(n);
  } catch {
    return "5.000+";
  }
}

export function youtubeSubscribeUrl(): string {
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (channelId) {
    return `https://www.youtube.com/channel/${channelId}?sub_confirmation=1`;
  }
  return "https://www.youtube.com/?sub_confirmation=1";
}
