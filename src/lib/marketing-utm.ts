/** Client sessionStorage keys for marketing UTM attribution (same-session, first-touch). */
export const MARKETING_UTM_SOURCE_KEY = "uncuttv_mkt_utm_source";
export const MARKETING_UTM_MEDIUM_KEY = "uncuttv_mkt_utm_medium";
export const MARKETING_UTM_CAMPAIGN_KEY = "uncuttv_mkt_utm_campaign";
export const MARKETING_UTM_CONTENT_KEY = "uncuttv_mkt_utm_content";

export type MarketingUtmClientPayload = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

const QUERY_TO_STORAGE: ReadonlyArray<{
  query: string;
  storageKey: string;
  field: keyof MarketingUtmClientPayload;
}> = [
  { query: "utm_source", storageKey: MARKETING_UTM_SOURCE_KEY, field: "source" },
  { query: "utm_medium", storageKey: MARKETING_UTM_MEDIUM_KEY, field: "medium" },
  {
    query: "utm_campaign",
    storageKey: MARKETING_UTM_CAMPAIGN_KEY,
    field: "campaign",
  },
  {
    query: "utm_content",
    storageKey: MARKETING_UTM_CONTENT_KEY,
    field: "content",
  },
];

function setSessionIfAbsent(storageKey: string, value: string): void {
  if (sessionStorage.getItem(storageKey)) return;
  sessionStorage.setItem(storageKey, value);
}

/**
 * Reads standard marketing UTM query params and persists them in sessionStorage.
 * First-touch per field: an existing value is never overwritten.
 */
export function persistMarketingUtmFromSearchParams(
  searchParams: URLSearchParams
): void {
  if (typeof window === "undefined") return;

  try {
    for (const { query, storageKey } of QUERY_TO_STORAGE) {
      const raw = searchParams.get(query);
      if (!raw?.trim()) continue;
      setSessionIfAbsent(storageKey, raw.trim());
    }
  } catch {
    /* quota / private mode */
  }
}

export function readMarketingUtmFromSession(): MarketingUtmClientPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const payload: MarketingUtmClientPayload = {};
    for (const { storageKey, field } of QUERY_TO_STORAGE) {
      const value = sessionStorage.getItem(storageKey)?.trim();
      if (value) payload[field] = value;
    }
    return Object.keys(payload).length > 0 ? payload : null;
  } catch {
    /* ignore */
  }
  return null;
}

export function marketingUtmRequestField(): {
  marketingUtm?: MarketingUtmClientPayload;
} {
  const utm = readMarketingUtmFromSession();
  return utm ? { marketingUtm: utm } : {};
}

export function clearMarketingUtmStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const { storageKey } of QUERY_TO_STORAGE) {
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    /* ignore */
  }
}
