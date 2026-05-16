/** Max parallel WooCommerce product searches per video title. */
export const WOO_SEARCH_CONCURRENCY = 3;

/** Max videos processed in parallel per cron batch. */
export const VIDEO_SYNC_BATCH_SIZE = 3;

export async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  mapper: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(chunk.map(mapper));
    results.push(...settled);
  }
  return results;
}

export type BatchHandlerResult =
  | { outcome: "created" | "updated" | "skipped" }
  | { outcome: "error"; message: string };

export async function forEachBatch<T>(
  items: T[],
  batchSize: number,
  label: string,
  handler: (item: T) => Promise<BatchHandlerResult>
): Promise<BatchHandlerResult[]> {
  const outcomes: BatchHandlerResult[] = [];
  const totalBatches = Math.max(1, Math.ceil(items.length / batchSize));
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`[${label}] Processing batch ${batchNum}/${totalBatches}`);
    const results = await Promise.allSettled(batch.map(handler));
    for (const result of results) {
      if (result.status === "fulfilled") {
        outcomes.push(result.value);
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        console.error(`[${label}] batch item rejected`, message);
        outcomes.push({ outcome: "error", message });
      }
    }
  }
  return outcomes;
}
