import type { ValidateVatResponse } from "@/lib/vies-types";

/** Only cache definitive VIES outcomes (not outages / timeouts). */
type Cacheable = Extract<ValidateVatResponse, { valid: boolean }>;

const MAX_ENTRIES = 1000;
const TTL_MS = 24 * 60 * 60 * 1000;

const store = new Map<string, { expires: number; value: Cacheable }>();

function evictExpired() {
  const now = Date.now();
  for (const [k, e] of store) {
    if (e.expires <= now) store.delete(k);
  }
}

function evictOldestIfFull() {
  while (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function viesCacheGet(key: string): Cacheable | undefined {
  evictExpired();
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) {
    store.delete(key);
    return undefined;
  }
  store.delete(key);
  store.set(key, e);
  return e.value;
}

export function viesCacheSet(key: string, value: Cacheable) {
  evictExpired();
  evictOldestIfFull();
  store.set(key, { expires: Date.now() + TTL_MS, value });
}
