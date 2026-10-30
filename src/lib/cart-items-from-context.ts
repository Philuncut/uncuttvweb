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

function positiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
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
  const meta: CartMeta = { id, name, qty, price };
  // Variante (Merch mit Größen): variation_id / size / size_slug, kompakt v / s / ss.
  const variationId = positiveInt(row.variation_id ?? row.vid ?? row.v);
  if (variationId) {
    meta.variation_id = variationId;
    const size = String(row.size ?? row.s ?? "").trim();
    const sizeSlug = String(row.size_slug ?? row.ss ?? "").trim();
    if (size) meta.size = size;
    if (sizeSlug) meta.size_slug = sizeSlug;
  }
  return meta;
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

/** Warenkorbzeile des Browsers (CartItem) → Zeile für die Bestellanlage. */
export function cartItemToCartMeta(item: CartItem): CartMeta {
  const meta: CartMeta = {
    id: Number(item.product.id),
    name: String(item.product.name ?? ""),
    qty: Math.max(1, item.quantity),
    price: String(item.product.price ?? "0"),
  };
  if (item.variant && item.variant.id > 0) {
    meta.variation_id = item.variant.id;
    meta.size = item.variant.size;
    meta.size_slug = item.variant.size_slug;
  }
  return meta;
}

export function cartItemsToCartMeta(items: CartItem[]): CartMeta[] {
  return items.map(cartItemToCartMeta);
}

/**
 * Die frischen Preise (und Größen) aus der Serverprüfung auf die Zeilen des
 * Browsers übertragen; alles andere am Produkt bleibt. Zeilen werden über
 * Produkt plus Variante zugeordnet.
 */
export function applyFreshPricesToCartItems(
  items: CartItem[],
  fresh: CartMeta[]
): CartItem[] {
  const byKey = new Map(
    fresh.map((f) => [
      `${f.id}:${f.variation_id && f.variation_id > 0 ? f.variation_id : 0}`,
      f,
    ])
  );
  return items.map((item) => {
    const key = `${item.product.id}:${item.variant?.id ?? 0}`;
    const f = byKey.get(key);
    if (!f) return item;
    const next: CartItem = {
      ...item,
      product: { ...item.product, price: f.price },
    };
    if (item.variant && (f.size || f.size_slug)) {
      next.variant = {
        ...item.variant,
        size: f.size || item.variant.size,
        size_slug: f.size_slug || item.variant.size_slug,
      };
    }
    return next;
  });
}

/** Compact cart lines for Stripe PI metadata (survives Phase-3 cart_items removal). */
export function buildCartSnapshotMetadata(
  items: CartItem[]
): Record<string, string> {
  if (!items.length) return {};
  type Line = { id: number; q: number; p: string; n: string; v?: number; s?: string; ss?: string };
  const lines: Line[] = [];
  for (const item of items) {
    const line: Line = {
      id: Number(item.product.id),
      q: Math.max(1, item.quantity),
      p: String(item.product.price ?? "0"),
      n: String(item.product.name ?? "").slice(0, 120),
    };
    if (item.variant && item.variant.id > 0) {
      line.v = item.variant.id;
      line.s = item.variant.size.slice(0, 20);
      line.ss = item.variant.size_slug.slice(0, 20);
    }
    lines.push(line);
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
              v: r.v,
              variation_id: r.variation_id,
              s: r.s,
              size: r.size,
              ss: r.ss,
              size_slug: r.size_slug,
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
          variation_id: r.variation_id,
          size: r.size,
          size_slug: r.size_slug,
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
