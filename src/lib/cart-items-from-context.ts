import type { CartMeta, WooOrderSyncContext } from "@/lib/wc-order-from-payment";

/** Normalize checkout cart lines for Woo sync (client JSON may send strings). */
export function normalizeCartMetaItems(
  raw: CartMeta[] | undefined | null
): CartMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: CartMeta[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = Number((row as CartMeta).id);
    const qty = Math.max(1, Math.round(Number((row as CartMeta).qty) || 0));
    const name = String((row as CartMeta).name ?? "").trim();
    const price = String((row as CartMeta).price ?? "0").trim();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    out.push({ id, name, qty, price });
  }
  return out;
}

/** Legacy PI metadata (pre–Phase-3) stored cart lines as JSON. */
export function parseCartItemsFromPiMetadata(
  metadata: Record<string, string> | null | undefined
): CartMeta[] {
  const raw = metadata?.cart_items?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeCartMetaItems(
      parsed.map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        return {
          id: Number(r.id),
          name: String(r.name ?? ""),
          qty: Number(r.qty ?? r.quantity ?? 1),
          price: String(r.price ?? "0"),
        };
      }) as CartMeta[]
    );
  } catch {
    return [];
  }
}

/**
 * Resolve cart line items for Woo sync from request context (preferred) or PI metadata fallback.
 */
export function getCartItemsForSync(
  syncContext: WooOrderSyncContext | undefined,
  piMetadata?: Record<string, string> | null
): CartMeta[] {
  const fromContext = normalizeCartMetaItems(syncContext?.items);
  if (fromContext.length > 0) {
    return fromContext;
  }

  const fromPi = parseCartItemsFromPiMetadata(piMetadata ?? undefined);
  if (fromPi.length > 0) {
    return fromPi;
  }

  const countRaw = piMetadata?.cart_items_count?.trim();
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  throw new Error(
    count > 0
      ? `Keine Items verfügbar (PI meldet ${count} Artikel, cart_items fehlt in Metadata).`
      : "Keine Items verfügbar"
  );
}
