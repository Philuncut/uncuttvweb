import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";
import { WOO_SEARCH_CONCURRENCY } from "@/lib/async-chunks";
import { filterRecommendableProducts } from "@/lib/woo-product-filters";

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "the",
  "a",
  "and",
  "with",
  "vs",
  "vs.",
  "review",
  "review:",
  "uncut",
  "tv",
  "uncuttv",
]);

type WooProductForMatch = WooProduct & {
  total_sales?: number;
  date_modified?: string;
};

type ProductMatchMeta = {
  score: number;
  total_sales: number;
  date_modified: string;
};

export function extractTitleKeywords(title: string): string[] {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(normalized)];
}

function parseTotalSales(product: WooProductForMatch): number {
  const raw = product.total_sales;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseDateModified(product: WooProductForMatch): string {
  return typeof product.date_modified === "string"
    ? product.date_modified
    : "";
}

function compareMatchMeta(a: ProductMatchMeta, b: ProductMatchMeta): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.total_sales !== a.total_sales) return b.total_sales - a.total_sales;
  return b.date_modified.localeCompare(a.date_modified);
}

async function searchProductsByKeyword(keyword: string): Promise<WooProduct[]> {
  const products = await wooFetch<WooProduct[]>(
    "/products",
    { search: keyword, per_page: "10" },
    { cache: "no-store" }
  );
  if (!Array.isArray(products)) return [];
  return filterRecommendableProducts(products);
}

async function fetchCategoryId(slug: string): Promise<number | null> {
  const cats = await wooFetch<Array<{ id: number }>>(
    "/products/categories",
    { slug },
    { cache: "no-store" }
  );
  if (!Array.isArray(cats) || cats.length === 0) return null;
  return cats[0].id;
}

/** Fetches top 3 instock products from "sale" and "vorverkauf" categories, sorted by date_modified. */
async function fetchFallbackProductIds(): Promise<number[]> {
  const slugs = ["sale", "vorverkauf"];
  const catIdResults = await Promise.allSettled(slugs.map(fetchCategoryId));
  const catIds = catIdResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((id): id is number => id !== null);

  if (catIds.length === 0) return [];

  const productResults = await Promise.allSettled(
    catIds.map((catId) =>
      wooFetch<WooProductForMatch[]>(
        "/products",
        { category: String(catId), per_page: "5", orderby: "modified", order: "desc" },
        { cache: "no-store" }
      )
    )
  );

  const seen = new Set<number>();
  const candidates: WooProductForMatch[] = [];
  for (const result of productResults) {
    if (result.status === "rejected" || !Array.isArray(result.value)) continue;
    for (const p of filterRecommendableProducts(result.value) as WooProductForMatch[]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        candidates.push(p);
      }
    }
  }

  candidates.sort((a, b) =>
    parseDateModified(b).localeCompare(parseDateModified(a))
  );

  return candidates.slice(0, 3).map((p) => p.id);
}

export async function autoMatchProductIds(title: string): Promise<number[]> {
  const keywords = extractTitleKeywords(title);
  if (keywords.length === 0) return [];

  const metaById = new Map<number, ProductMatchMeta>();

  for (let i = 0; i < keywords.length; i += WOO_SEARCH_CONCURRENCY) {
    const chunk = keywords.slice(i, i + WOO_SEARCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (keyword) => {
        const products = await searchProductsByKeyword(keyword);
        return { keyword, products };
      })
    );

    for (const result of settled) {
      if (result.status === "rejected") {
        console.warn("[video-product-matcher] Woo search failed", {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        continue;
      }
      const { products } = result.value;
      for (const product of products) {
        const p = product as WooProductForMatch;
        const nameLower = product.name.toLowerCase();
        const matchedCount = keywords.filter((k) => nameLower.includes(k)).length;
        if (matchedCount <= 0) continue;

        const existing = metaById.get(product.id);
        metaById.set(product.id, {
          score: Math.max(existing?.score ?? 0, matchedCount),
          total_sales: parseTotalSales(p),
          date_modified: parseDateModified(p),
        });
      }
    }
  }

  return [...metaById.entries()]
    .sort((a, b) => compareMatchMeta(a[1], b[1]))
    .slice(0, 3)
    .map(([id]) => id);
}

/**
 * Resolves product IDs for sync. Tries keyword match first; falls back to
 * "sale" + "vorverkauf" categories if no specific match found.
 */
export async function resolveProductIdsForSync(title: string): Promise<{
  ids: number[];
  matchType: "auto" | "featured";
}> {
  const autoIds = await autoMatchProductIds(title);
  if (autoIds.length > 0) return { ids: autoIds, matchType: "auto" };

  const fallbackIds = await fetchFallbackProductIds();
  return { ids: fallbackIds, matchType: "featured" };
}
