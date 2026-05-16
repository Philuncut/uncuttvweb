import type { SupabaseClient } from "@supabase/supabase-js";
import { forEachBatch, VIDEO_SYNC_BATCH_SIZE } from "@/lib/async-chunks";
import { resolveProductIdsForSync } from "@/lib/video-product-matcher";
import type { ShopVideoRow } from "@/lib/video-blog-types";

export type ShopVideoTable = "shop_youtube_videos" | "shop_vimeo_videos";

type VideoUpsertRow = Omit<
  ShopVideoRow,
  "featured_products" | "auto_matched_products" | "match_type"
> & {
  featured_products?: number[] | null;
  updated_at?: string;
};

/**
 * Upserts video metadata and always overwrites auto_matched_products +
 * match_type (including empty arrays) to prevent stale OOP entries.
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

  const fullRow = {
    ...row,
    auto_matched_products,
    match_type,
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
    .update({ auto_matched_products, match_type, updated_at })
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
    .select("video_id, title");

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
        const updated_at = new Date().toISOString();
        const { error: updateError } = await supabase
          .from(table)
          .update({ auto_matched_products, match_type, updated_at })
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
