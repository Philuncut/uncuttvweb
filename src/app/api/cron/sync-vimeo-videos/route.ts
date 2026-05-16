import { getSupabaseAdmin } from "@/lib/supabase-server";
import { autoMatchProductIds } from "@/lib/video-product-matcher";
import { forEachBatch, VIDEO_SYNC_BATCH_SIZE } from "@/lib/async-chunks";
import {
  formatSyncDurationMs,
  sendVideoSyncSummaryEmail,
  verifyVideoSyncCronAuth,
} from "@/lib/video-sync-helpers";
import type { ShopVideoRow } from "@/lib/video-blog-types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type VimeoVideo = {
  uri?: string;
  name?: string;
  description?: string | null;
  release_time?: string;
  duration?: number;
  pictures?: { sizes?: Array<{ width?: number; link?: string }> };
  stats?: { plays?: number };
};

function vimeoIdFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const parts = uri.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

function vimeoThumbnail(video: VimeoVideo): string | null {
  const sizes = video.pictures?.sizes;
  if (!sizes?.length) return null;
  const best = [...sizes].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  )[0];
  return best?.link ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();

  if (!verifyVideoSyncCronAuth(request)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = process.env.VIMEO_API_TOKEN?.trim();
  const userId = process.env.VIMEO_USER_ID?.trim();
  const supabase = getSupabaseAdmin();

  if (!token) {
    const summary = "[Vimeo-Sync] Vimeo not configured, skipped";
    console.log(summary);
    await sendVideoSyncSummaryEmail("[Vimeo-Sync] skipped", summary);
    return Response.json({ ok: true, skipped: true, reason: "no_token" });
  }

  let checked = 0;
  let updated = 0;
  let created = 0;
  let errors = 0;
  const errorNotes: string[] = [];

  if (!supabase) {
    const msg = "[Vimeo-Sync] Supabase not configured";
    console.error(msg);
    await sendVideoSyncSummaryEmail("[Vimeo-Sync] failed", msg);
    return Response.json({ ok: false, error: "missing_supabase" });
  }

  if (!userId) {
    const msg = "[Vimeo-Sync] VIMEO_USER_ID missing";
    console.error(msg);
    await sendVideoSyncSummaryEmail("[Vimeo-Sync] skipped", msg);
    return Response.json({ ok: false, error: "missing_vimeo_user" });
  }

  try {
    const url = new URL(`https://api.vimeo.com/users/${userId}/videos`);
    url.searchParams.set("per_page", "50");
    url.searchParams.set("sort", "date");
    url.searchParams.set("direction", "desc");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Vimeo API ${res.status}`);
    }

    const json = (await res.json()) as { data?: VimeoVideo[] };
    const videos = json.data ?? [];
    checked = videos.length;

    const outcomes = await forEachBatch(
      videos,
      VIDEO_SYNC_BATCH_SIZE,
      "Vimeo-Sync",
      async (video) => {
        const videoId = vimeoIdFromUri(video.uri);
        const title = video.name?.trim();
        if (!videoId || !title) return { outcome: "skipped" as const };

        try {
          const { data: existing } = await supabase
            .from("shop_vimeo_videos")
            .select("video_id")
            .eq("video_id", videoId)
            .maybeSingle();

          const auto_matched_products = await autoMatchProductIds(title);
          const row: Omit<ShopVideoRow, "featured_products"> & {
            featured_products?: number[] | null;
            updated_at?: string;
          } = {
            video_id: videoId,
            title,
            description:
              typeof video.description === "string" ? video.description : null,
            thumbnail_url: vimeoThumbnail(video),
            view_count: video.stats?.plays ?? 0,
            duration_seconds:
              typeof video.duration === "number" ? video.duration : 0,
            published_at: video.release_time ?? null,
            auto_matched_products,
            updated_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from("shop_vimeo_videos")
            .upsert(row, { onConflict: "video_id" });

          if (upsertError) throw new Error(upsertError.message);

          return existing?.video_id
            ? ({ outcome: "updated" as const })
            : ({ outcome: "created" as const });
        } catch (err) {
          const note = `${videoId}: ${err instanceof Error ? err.message : String(err)}`;
          console.error("[Vimeo-Sync] video error", note);
          return { outcome: "error" as const, message: note };
        }
      }
    );

    for (const result of outcomes) {
      if (result.outcome === "created") created += 1;
      else if (result.outcome === "updated") updated += 1;
      else if (result.outcome === "error") {
        errors += 1;
        errorNotes.push(result.message);
      }
    }
  } catch (err) {
    errors += 1;
    const note = err instanceof Error ? err.message : String(err);
    errorNotes.push(note);
    console.error("[Vimeo-Sync] fatal", note);
  }

  const duration = formatSyncDurationMs(startedAt);
  const summary = `[Vimeo-Sync] ${checked} videos checked, ${updated} updated, ${created} new, ${errors} errors, duration ${duration}`;
  console.log(summary, errorNotes.length ? errorNotes : "");
  await sendVideoSyncSummaryEmail("[Vimeo-Sync] daily summary", summary);

  return Response.json({
    ok: true,
    checked,
    updated,
    created,
    errors,
    durationMs: Date.now() - startedAt,
  });
}
