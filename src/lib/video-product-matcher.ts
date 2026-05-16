import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";
import { WOO_SEARCH_CONCURRENCY } from "@/lib/async-chunks";

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

export function extractTitleKeywords(title: string): string[] {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(normalized)];
}

async function searchProductsByKeyword(
  keyword: string
): Promise<WooProduct[]> {
  const products = await wooFetch<WooProduct[]>(
    "/products",
    { search: keyword, per_page: "10" },
    { cache: "no-store" }
  );
  return Array.isArray(products) ? products : [];
}

export async function autoMatchProductIds(title: string): Promise<number[]> {
  const keywords = extractTitleKeywords(title);
  if (keywords.length === 0) return [];

  const scores = new Map<number, number>();

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
        const nameLower = product.name.toLowerCase();
        const matchedCount = keywords.filter((k) => nameLower.includes(k)).length;
        if (matchedCount > 0) {
          scores.set(product.id, (scores.get(product.id) ?? 0) + matchedCount);
        }
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
}
