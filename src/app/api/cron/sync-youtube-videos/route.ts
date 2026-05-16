import { getSupabaseAdmin } from "@/lib/supabase-server";
import { autoMatchProductIds } from "@/lib/video-product-matcher";
import { forEachBatch, VIDEO_SYNC_BATCH_SIZE } from "@/lib/async-chunks";
import {
  formatSyncDurationMs,
  parseIso8601Duration,
  sendVideoSyncSummaryEmail,
  verifyVideoSyncCronAuth,
} from "@/lib/video-sync-helpers";
import type { ShopVideoRow } from "@/lib/video-blog-types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type YouTubePlaylistItem = {
  snippet?: {
    resourceId?: { videoId?: string };
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: { maxres?: { url?: string }; high?: { url?: string } };
  };
};

type YouTubeVideoDetails = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: { maxres?: { url?: string }; high?: { url?: string } };
  };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
};

async function fetchUploadPlaylistId(
  channelId: string,
  apiKey: string
): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", channelId);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`channels.list failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };
  return json.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

async function fetchRecentYouTubeVideos(
  playlistId: string,
  apiKey: string
): Promise<YouTubeVideoDetails[]> {
  const itemsUrl = new URL(
    "https://www.googleapis.com/youtube/v3/playlistItems"
  );
  itemsUrl.searchParams.set("part", "snippet,contentDetails");
  itemsUrl.searchParams.set("playlistId", playlistId);
  itemsUrl.searchParams.set("maxResults", "50");
  itemsUrl.searchParams.set("key", apiKey);
  const itemsRes = await fetch(itemsUrl.toString(), { cache: "no-store" });
  if (!itemsRes.ok) {
    throw new Error(`playlistItems.list failed: ${itemsRes.status}`);
  }
  const itemsJson = (await itemsRes.json()) as { items?: YouTubePlaylistItem[] };
  const videoIds = (itemsJson.items ?? [])
    .map((i) => i.snippet?.resourceId?.videoId)
    .filter((id): id is string => !!id);
  if (videoIds.length === 0) return [];

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,statistics,contentDetails");
  videosUrl.searchParams.set("id", videoIds.join(","));
  videosUrl.searchParams.set("key", apiKey);
  const videosRes = await fetch(videosUrl.toString(), { cache: "no-store" });
  if (!videosRes.ok) {
    throw new Error(`videos.list failed: ${videosRes.status}`);
  }
  const videosJson = (await videosRes.json()) as { items?: YouTubeVideoDetails[] };
  return videosJson.items ?? [];
}

function thumbnailFromSnippet(
  snippet: YouTubeVideoDetails["snippet"]
): string | null {
  return (
    snippet?.thumbnails?.maxres?.url ??
    snippet?.thumbnails?.high?.url ??
    null
  );
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();

  if (!verifyVideoSyncCronAuth(request)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  const supabase = getSupabaseAdmin();

  let checked = 0;
  let updated = 0;
  let created = 0;
  let errors = 0;
  const errorNotes: string[] = [];

  if (!supabase) {
    const msg = "[YouTube-Sync] Supabase not configured";
    console.error(msg);
    await sendVideoSyncSummaryEmail(
      "[YouTube-Sync] failed",
      `${msg}\n0 videos checked.`
    );
    return Response.json({ ok: false, error: "missing_supabase" });
  }

  if (!apiKey || !channelId) {
    const msg = "[YouTube-Sync] YouTube API env missing";
    console.error(msg);
    await sendVideoSyncSummaryEmail("[YouTube-Sync] skipped", msg);
    return Response.json({ ok: false, error: "missing_youtube_env" });
  }

  try {
    const playlistId = await fetchUploadPlaylistId(channelId, apiKey);
    if (!playlistId) {
      throw new Error("uploads playlist not found");
    }
    const videos = await fetchRecentYouTubeVideos(playlistId, apiKey);
    checked = videos.length;

    const outcomes = await forEachBatch(
      videos,
      VIDEO_SYNC_BATCH_SIZE,
      "YouTube-Sync",
      async (video) => {
        const videoId = video.id;
        const title = video.snippet?.title?.trim();
        if (!videoId || !title) return { outcome: "skipped" as const };

        try {
          const { data: existing } = await supabase
            .from("shop_youtube_videos")
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
            description: video.snippet?.description ?? null,
            thumbnail_url: thumbnailFromSnippet(video.snippet),
            view_count: video.statistics?.viewCount
              ? parseInt(video.statistics.viewCount, 10)
              : 0,
            duration_seconds: parseIso8601Duration(
              video.contentDetails?.duration
            ),
            published_at: video.snippet?.publishedAt ?? null,
            auto_matched_products,
            updated_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from("shop_youtube_videos")
            .upsert(row, { onConflict: "video_id" });

          if (upsertError) throw new Error(upsertError.message);

          return existing?.video_id
            ? ({ outcome: "updated" as const })
            : ({ outcome: "created" as const });
        } catch (err) {
          const note = `${videoId}: ${err instanceof Error ? err.message : String(err)}`;
          console.error("[YouTube-Sync] video error", note);
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
    console.error("[YouTube-Sync] fatal", note);
  }

  const duration = formatSyncDurationMs(startedAt);
  const summary = `[YouTube-Sync] ${checked} videos checked, ${updated} updated, ${created} new, ${errors} errors, duration ${duration}`;
  console.log(summary, errorNotes.length ? errorNotes : "");
  await sendVideoSyncSummaryEmail("[YouTube-Sync] daily summary", summary);

  return Response.json({
    ok: true,
    checked,
    updated,
    created,
    errors,
    durationMs: Date.now() - startedAt,
  });
}
