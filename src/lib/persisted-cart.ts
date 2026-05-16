import type { CartItem } from "@/lib/CartContext";
import type { WooProduct } from "@/lib/types";

export const PERSISTED_CART_META_KEY = "_uncuttv_persisted_cart";
export const PERSISTED_CART_UPDATED_META_KEY = "_uncuttv_persisted_cart_updated_at";

export const MAX_PERSISTED_CART_ITEMS = 100;

export type PersistedCartItem = CartItem;

export function mergeCartItems(
  local: CartItem[],
  server: CartItem[]
): CartItem[] {
  const byId = new Map<number, CartItem>();

  const upsert = (item: CartItem) => {
    const id = item.product?.id;
    if (typeof id !== "number" || !Number.isFinite(id)) return;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { product: item.product, quantity: item.quantity });
      return;
    }
    byId.set(id, {
      product: existing.product,
      quantity: Math.max(existing.quantity, item.quantity),
    });
  };

  for (const item of local) upsert(item);
  for (const item of server) upsert(item);

  return Array.from(byId.values());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWooProduct(value: unknown): WooProduct | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  const name = typeof value.name === "string" ? value.name : "";
  const price = typeof value.price === "string" ? value.price : "0";
  const regular_price =
    typeof value.regular_price === "string" ? value.regular_price : price;
  const sale_price =
    typeof value.sale_price === "string" ? value.sale_price : "";
  const stock_status =
    value.stock_status === "instock" ||
    value.stock_status === "outofstock" ||
    value.stock_status === "onbackorder"
      ? value.stock_status
      : "instock";
  const images = Array.isArray(value.images)
    ? value.images
        .filter(isRecord)
        .map((img) => ({
          id: typeof img.id === "number" ? img.id : 0,
          src: typeof img.src === "string" ? img.src : "",
          name: typeof img.name === "string" ? img.name : "",
          alt: typeof img.alt === "string" ? img.alt : "",
        }))
    : [];
  const categories = Array.isArray(value.categories)
    ? value.categories
        .filter(isRecord)
        .map((cat) => ({
          id: typeof cat.id === "number" ? cat.id : 0,
          name: typeof cat.name === "string" ? cat.name : "",
          slug: typeof cat.slug === "string" ? cat.slug : "",
        }))
    : [];

  return {
    id,
    name,
    slug: typeof value.slug === "string" ? value.slug : "",
    price,
    regular_price,
    sale_price,
    on_sale: Boolean(value.on_sale),
    stock_status,
    sku: typeof value.sku === "string" ? value.sku : "",
    images,
    categories,
    short_description:
      typeof value.short_description === "string"
        ? value.short_description
        : "",
    description: typeof value.description === "string" ? value.description : "",
    related_ids: Array.isArray(value.related_ids)
      ? value.related_ids.filter((n): n is number => typeof n === "number")
      : [],
  };
}

export function parsePersistedCartPayload(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];

  const items: CartItem[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const product = parseWooProduct(entry.product);
    const quantity = entry.quantity;
    if (!product) continue;
    if (typeof quantity !== "number" || !Number.isFinite(quantity)) continue;
    const qty = Math.max(1, Math.floor(quantity));
    items.push({ product, quantity: qty });
    if (items.length >= MAX_PERSISTED_CART_ITEMS) break;
  }
  return items;
}

export function serializePersistedCart(cart: CartItem[]): string {
  return JSON.stringify(cart);
}

export function metaValueToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function mergeCartMeta(
  existingMeta: Array<{ key?: string; value?: unknown }> | undefined,
  cartJson: string,
  updatedAt: string
): Array<{ key: string; value: string }> {
  const next = (existingMeta ?? [])
    .filter((row) => row?.key)
    .map((row) => ({
      key: String(row.key),
      value: metaValueToString(row.value),
    }));

  const setKey = (key: string, value: string) => {
    const idx = next.findIndex((row) => row.key === key);
    if (idx >= 0) next[idx] = { key, value };
    else next.push({ key, value });
  };

  setKey(PERSISTED_CART_META_KEY, cartJson);
  setKey(PERSISTED_CART_UPDATED_META_KEY, updatedAt);
  return next;
}

export function clearCartMeta(
  existingMeta: Array<{ key?: string; value?: unknown }> | undefined
): Array<{ key: string; value: string }> {
  const next = (existingMeta ?? [])
    .filter((row) => row?.key)
    .map((row) => ({
      key: String(row.key),
      value: metaValueToString(row.value),
    }));

  const setKey = (key: string, value: string) => {
    const idx = next.findIndex((row) => row.key === key);
    if (idx >= 0) next[idx] = { key, value };
    else next.push({ key, value });
  };

  setKey(PERSISTED_CART_META_KEY, "");
  setKey(PERSISTED_CART_UPDATED_META_KEY, "");
  return next;
}
