import type { SupabaseClient } from "@supabase/supabase-js";
import { forEachBatch, VIDEO_SYNC_BATCH_SIZE } from "@/lib/async-chunks";
import { resolveProductIdsForSync } from "@/lib/video-product-matcher";
import {
  hashDescription,
  translateDescriptionToEnglish,
} from "@/lib/translate-description";
import type { ShopVideoRow } from "@/lib/video-blog-types";

export type ShopVideoTable = "shop_youtube_videos" | "shop_vimeo_videos";

type VideoUpsertRow = Omit<
  ShopVideoRow,
  | "featured_products"
  | "auto_matched_products"
  | "match_type"
  | "description_en"
  | "description_hash"
> & {
  featured_products?: number[] | null;
  updated_at?: string;
};

/**
 * Resolves the English description for a video, reusing the cached translation
 * if the description hasn't changed (hash match). Falls back to "" on error.
 */
async function resolveDescriptionEn(
  supabase: SupabaseClient,
  table: ShopVideoTable,
  videoId: string,
  description: string | null
): Promise<{ description_en: string; description_hash: string }> {
  const rawDesc = description?.trim() ?? "";
  if (!rawDesc) return { description_en: "", description_hash: "" };

  const newHash = hashDescription(rawDesc);

  // Fetch existing cached translation
  const { data: existing } = await supabase
    .from(table)
    .select("description_hash, description_en")
    .eq("video_id", videoId)
    .maybeSingle();

  if (
    existing?.description_hash === newHash &&
    typeof existing.description_en === "string" &&
    existing.description_en.length > 0
  ) {
    // Hash matches and we have a cached translation — reuse it
    return { description_en: existing.description_en, description_hash: newHash };
  }

  // Description changed or no cache — translate
  const description_en = await translateDescriptionToEnglish(rawDesc);
  return { description_en, description_hash: newHash };
}

/**
 * Upserts video metadata and always overwrites auto_matched_products +
 * match_type (including empty arrays) to prevent stale OOP entries.
 * Also handles description_en caching via hash comparison.
 */
export async function upsertVideoWithAutoMatch(
  supabase: SupabaseClient,
  table: ShopVideoTable,
  row: VideoUpsertRow,
  autoMatchedProductIds: number[],
  matchType: "auto" | "featured"
): Promise<void> {
  const auto_matched_products = autoMatchedProductIds;
  const match_type = matchType;
  const updated_at = row.updated_at ?? new Date().toISOString();

  const { description_en, description_hash } = await resolveDescriptionEn(
    supabase,
    table,
    row.video_id,
    row.description ?? null
  );

  const fullRow = {
    ...row,
    auto_matched_products,
    match_type,
    description_en,
    description_hash,
    updated_at,
  };

  const { error: upsertError } = await supabase
    .from(table)
    .upsert(fullRow, { onConflict: "video_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { error: matchError } = await supabase
    .from(table)
    .update({ auto_matched_products, match_type, description_en, description_hash, updated_at })
    .eq("video_id", row.video_id);

  if (matchError) {
    throw new Error(matchError.message);
  }
}

export async function forceRematchAllShopVideos(
  supabase: SupabaseClient,
  table: ShopVideoTable
): Promise<{ rematched: number; errors: number; errorNotes: string[] }> {
  const { data, error } = await supabase
    .from(table)
    .select("video_id, title, description, description_hash, description_en");

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  let rematched = 0;
  let errors = 0;
  const errorNotes: string[] = [];

  const outcomes = await forEachBatch(
    rows,
    VIDEO_SYNC_BATCH_SIZE,
    `${table}-force-rematch`,
    async (row) => {
      const title = row.title?.trim();
      if (!title) return { outcome: "skipped" as const };

      try {
        const { ids: auto_matched_products, matchType } =
          await resolveProductIdsForSync(title);
        const match_type = matchType;

        // Re-check translation cache; re-translate only if hash changed
        const rawDesc = row.description?.trim() ?? "";
        const newHash = rawDesc ? hashDescription(rawDesc) : "";
        let description_en: string = row.description_en ?? "";
        let description_hash: string = row.description_hash ?? "";

        if (rawDesc && newHash !== row.description_hash) {
          description_en = await translateDescriptionToEnglish(rawDesc);
          description_hash = newHash;
        }

        const updated_at = new Date().toISOString();
        const { error: updateError } = await supabase
          .from(table)
          .update({
            auto_matched_products,
            match_type,
            description_en,
            description_hash,
            updated_at,
          })
          .eq("video_id", row.video_id);

        if (updateError) throw new Error(updateError.message);
        return { outcome: "updated" as const };
      } catch (err) {
        const note = `${row.video_id}: ${err instanceof Error ? err.message : String(err)}`;
        return { outcome: "error" as const, message: note };
      }
    }
  );

  for (const result of outcomes) {
    if (result.outcome === "updated") rematched += 1;
    else if (result.outcome === "error") {
      errors += 1;
      errorNotes.push(result.message);
    }
  }

  return { rematched, errors, errorNotes };
}
