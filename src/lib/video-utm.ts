/** Client sessionStorage keys for video → shop attribution. */
export const VIDEO_UTM_SOURCE_KEY = "uncuttv_utm_source";
export const VIDEO_UTM_VIDEO_ID_KEY = "uncuttv_utm_video_id";

export type VideoUtmClientPayload = {
  source: string;
  videoId: string;
};

export function persistVideoUtmFromSearchParams(
  searchParams: URLSearchParams
): void {
  if (typeof window === "undefined") return;
  const source = searchParams.get("source");
  const videoId = searchParams.get("video_id");
  if (source === "video" && videoId?.trim()) {
    try {
      sessionStorage.setItem(VIDEO_UTM_SOURCE_KEY, "video");
      sessionStorage.setItem(VIDEO_UTM_VIDEO_ID_KEY, videoId.trim());
    } catch {
      /* quota / private mode */
    }
  }
}

export function readVideoUtmForCheckout(): VideoUtmClientPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const source = sessionStorage.getItem(VIDEO_UTM_SOURCE_KEY);
    const videoId = sessionStorage.getItem(VIDEO_UTM_VIDEO_ID_KEY);
    if (source === "video" && videoId?.trim()) {
      return { source: "video", videoId: videoId.trim() };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function videoUtmRequestField(): { videoUtm?: VideoUtmClientPayload } {
  const utm = readVideoUtmForCheckout();
  return utm ? { videoUtm: utm } : {};
}

export function clearVideoUtmStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(VIDEO_UTM_SOURCE_KEY);
    sessionStorage.removeItem(VIDEO_UTM_VIDEO_ID_KEY);
  } catch {
    /* ignore */
  }
}
