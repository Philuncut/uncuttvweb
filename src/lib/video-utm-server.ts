import { getSupabaseAdmin } from "@/lib/supabase-server";

export type VideoUtmInput = {
  source?: string;
  videoId?: string;
};

export type OrderMetaEntry = { key: string; value: unknown };

const UTM_META_KEYS = [
  "_uncuttv_utm_source",
  "_uncuttv_utm_video_id",
  "_uncuttv_utm_video_title",
] as const;

export async function lookupVideoTitle(videoId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "";

  const id = videoId.trim();
  if (!id) return "";

  for (const table of ["shop_youtube_videos", "shop_vimeo_videos"] as const) {
    const { data } = await supabase
      .from(table)
      .select("title")
      .eq("video_id", id)
      .maybeSingle();
    const title =
      data && typeof data === "object" && "title" in data
        ? String((data as { title?: unknown }).title ?? "").trim()
        : "";
    if (title) return title;
  }
  return "";
}

export async function buildVideoUtmOrderMeta(
  utm: VideoUtmInput | null | undefined
): Promise<OrderMetaEntry[]> {
  if (!utm?.videoId?.trim() || utm.source !== "video") return [];

  const videoId = utm.videoId.trim();
  const title = await lookupVideoTitle(videoId);

  return [
    { key: "_uncuttv_utm_source", value: "video" },
    { key: "_uncuttv_utm_video_id", value: videoId },
    ...(title ? [{ key: "_uncuttv_utm_video_title", value: title }] : []),
  ];
}

export function mergeVideoUtmIntoMeta(
  existing: OrderMetaEntry[] | undefined,
  utmMeta: OrderMetaEntry[]
): OrderMetaEntry[] | undefined {
  if (utmMeta.length === 0) return existing;
  const base = [...(existing ?? [])].filter(
    (m) => !UTM_META_KEYS.includes(m.key as (typeof UTM_META_KEYS)[number])
  );
  return [...base, ...utmMeta];
}
