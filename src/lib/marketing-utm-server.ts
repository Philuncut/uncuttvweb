export type MarketingUtmInput = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

export type MarketingUtmOrderMetaEntry = { key: string; value: unknown };

const MARKETING_UTM_META_KEYS = [
  "_uncuttv_mkt_utm_source",
  "_uncuttv_mkt_utm_medium",
  "_uncuttv_mkt_utm_campaign",
  "_uncuttv_mkt_utm_content",
] as const;

const INPUT_TO_META: ReadonlyArray<{
  field: keyof MarketingUtmInput;
  metaKey: (typeof MARKETING_UTM_META_KEYS)[number];
}> = [
  { field: "source", metaKey: "_uncuttv_mkt_utm_source" },
  { field: "medium", metaKey: "_uncuttv_mkt_utm_medium" },
  { field: "campaign", metaKey: "_uncuttv_mkt_utm_campaign" },
  { field: "content", metaKey: "_uncuttv_mkt_utm_content" },
];

function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Order meta rows for present marketing UTM fields only. */
export function buildMarketingUtmOrderMeta(
  utm: MarketingUtmInput | null | undefined
): MarketingUtmOrderMetaEntry[] {
  if (!utm) return [];

  const entries: MarketingUtmOrderMetaEntry[] = [];
  for (const { field, metaKey } of INPUT_TO_META) {
    const value = asTrimmedString(utm[field]);
    if (value) entries.push({ key: metaKey, value });
  }
  return entries;
}

export function mergeMarketingUtmIntoMeta(
  existing: MarketingUtmOrderMetaEntry[] | undefined,
  utmMeta: MarketingUtmOrderMetaEntry[]
): MarketingUtmOrderMetaEntry[] | undefined {
  if (utmMeta.length === 0) return existing;
  const base = [...(existing ?? [])].filter(
    (m) =>
      !MARKETING_UTM_META_KEYS.includes(
        m.key as (typeof MARKETING_UTM_META_KEYS)[number]
      )
  );
  return [...base, ...utmMeta];
}
