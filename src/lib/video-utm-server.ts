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

export async function buildVideoUtmOrderMeta(
  utm: VideoUtmInput | null | undefined
): Promise<OrderMetaEntry[]> {
  if (!utm?.videoId?.trim() || utm.source !== "video") return [];

  const videoId = utm.videoId.trim();

  // Der Titel kam frueher aus den Tabellen der alten Videoseite; die gibt es
  // nicht mehr. An der Bestellung stehen Quelle und Videokennung.
  return [
    { key: "_uncuttv_utm_source", value: "video" },
    { key: "_uncuttv_utm_video_id", value: videoId },
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
