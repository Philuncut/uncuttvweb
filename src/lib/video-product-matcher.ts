import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";

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

export async function autoMatchProductIds(title: string): Promise<number[]> {
  const keywords = extractTitleKeywords(title);
  if (keywords.length === 0) return [];

  const scores = new Map<number, number>();

  for (const keyword of keywords) {
    try {
      const products = await wooFetch<WooProduct[]>(
        "/products",
        { search: keyword, per_page: "10" },
        { cache: "no-store" }
      );
      if (!Array.isArray(products)) continue;
      for (const product of products) {
        const nameLower = product.name.toLowerCase();
        const matchedCount = keywords.filter((k) => nameLower.includes(k)).length;
        if (matchedCount > 0) {
          scores.set(product.id, (scores.get(product.id) ?? 0) + matchedCount);
        }
      }
    } catch (err) {
      console.warn("[video-product-matcher] Woo search failed", {
        keyword,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
}
