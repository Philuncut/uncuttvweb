import type { CartItem } from "@/lib/CartContext";
import type { CartMeta, WooOrderSyncContext } from "@/lib/wc-order-from-payment";

const STRIPE_META_VALUE_MAX = 500;

type LooseCartRow = Record<string, unknown>;

/** Stripe.Metadata → plain string record (serverless-safe). */
export function coerceStripeMetadata(
  metadata: Record<string, string> | null | undefined
): Record<string, string> {
  if (!metadata) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function rowToCartMeta(row: LooseCartRow): CartMeta | null {
  const id = Number(row.id ?? row.product_id);
  const qty = Math.max(
    1,
    Math.round(Number(row.qty ?? row.quantity ?? row.q) || 0)
  );
  const name = String(row.name ?? row.n ?? "").trim();
  const price = String(row.price ?? row.p ?? "0").trim();
  if (!Number.isFinite(id) || id <= 0 || !name) return null;
  return { id, name, qty, price };
}

/** Normalize checkout cart lines for Woo sync (client JSON may send strings or alternate keys). */
export function normalizeCartMetaItems(
  raw: CartMeta[] | undefined | null
): CartMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: CartMeta[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const mapped = rowToCartMeta(row as LooseCartRow);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Compact cart lines for Stripe PI metadata (survives Phase-3 cart_items removal). */
export function buildCartSnapshotMetadata(
  items: CartItem[]
): Record<string, string> {
  if (!items.length) return {};
  const lines: { id: number; q: number; p: string; n: string }[] = [];
  for (const item of items) {
    lines.push({
      id: Number(item.product.id),
      q: Math.max(1, item.quantity),
      p: String(item.product.price ?? "0"),
      n: String(item.product.name ?? "").slice(0, 120),
    });
  }
  let json = JSON.stringify(lines);
  while (json.length > STRIPE_META_VALUE_MAX && lines.length > 1) {
    lines.pop();
    json = JSON.stringify(lines);
  }
  if (json.length > STRIPE_META_VALUE_MAX) {
    return {};
  }
  return { cart_snapshot: json };
}

/** PI metadata cart_snapshot (compact) or legacy cart_items JSON. */
export function parseCartItemsFromPiMetadata(
  metadata: Record<string, string> | null | undefined
): CartMeta[] {
  const meta = coerceStripeMetadata(metadata);
  const snapshotRaw = meta.cart_snapshot?.trim();
  if (snapshotRaw) {
    try {
      const parsed = JSON.parse(snapshotRaw) as unknown;
      if (Array.isArray(parsed)) {
        const mapped = parsed
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const r = row as LooseCartRow;
            return rowToCartMeta({
              id: r.id,
              product_id: r.id,
              q: r.q,
              qty: r.qty,
              quantity: r.quantity,
              p: r.p,
              price: r.price,
              n: r.n,
              name: r.name,
            });
          })
          .filter((x): x is CartMeta => x != null);
        if (mapped.length > 0) return mapped;
      }
      console.warn(
        "[cart-items] cart_snapshot JSON is not a non-empty array:",
        snapshotRaw.slice(0, 200)
      );
    } catch (err) {
      console.error(
        "[cart-items] cart_snapshot JSON.parse failed:",
        err instanceof Error ? err.message : err,
        snapshotRaw.slice(0, 200)
      );
    }
  }

  const raw = meta.cart_items?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeCartMetaItems(
      parsed.map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as LooseCartRow;
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

  const fromPi = parseCartItemsFromPiMetadata(
    coerceStripeMetadata(piMetadata ?? undefined)
  );
  if (fromPi.length > 0) {
    return fromPi;
  }

  const meta = coerceStripeMetadata(piMetadata);
  const countRaw = meta.cart_items_count?.trim();
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  throw new Error(
    count > 0
      ? `Keine Items verfügbar (PI meldet ${count} Artikel, weder Body noch cart_snapshot).`
      : "Keine Items verfügbar"
  );
}
