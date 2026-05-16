import type { CartItem } from "@/lib/CartContext";
import {
  PERSISTED_CART_META_KEY,
  PERSISTED_CART_UPDATED_META_KEY,
  ABANDONED_CART_SENT_1H_KEY,
  ABANDONED_CART_SENT_24H_KEY,
  ABANDONED_CART_SENT_72H_KEY,
  parsePersistedCartPayload,
  metaValueToString,
} from "@/lib/persisted-cart";
import {
  type AbandonedCartEmailData,
  type AbandonedCartLocale,
  ABANDONED_CART_CHECKOUT_URL,
  ABANDONED_CART_SHOP_URL,
  buildCartItemsBlockHtml,
  cartTotalFromItems,
  moreProductsHint,
} from "@/lib/abandoned-cart-templates";
import { formatPrice } from "@/lib/format-price";
import { updateWooCustomerMeta } from "@/lib/woo-customer-api";

export const ABANDONED_CART_EXPIRE_HOURS = 168;

export interface WooCustomerRow {
  id: number;
  email?: string;
  role?: string;
  roles?: string[];
  billing?: { email?: string; first_name?: string };
  meta_data?: Array<{ key?: string; value?: unknown }>;
}

export function metaValue(
  meta: Array<{ key?: string; value?: unknown }> | undefined,
  key: string
): string {
  const row = meta?.find((m) => m?.key === key);
  return metaValueToString(row?.value);
}

export function hasMetaYes(
  meta: Array<{ key?: string; value?: unknown }> | undefined,
  key: string
): boolean {
  return metaValue(meta, key).toLowerCase() === "yes";
}

/**
 * B2C default role `customer` is never skipped — only wholesale/dealer/admin roles.
 */
export function customerIsWholesale(c: WooCustomerRow): boolean {
  const roles: string[] = [];
  if (typeof c.role === "string" && c.role.trim()) {
    roles.push(c.role.trim().toLowerCase());
  }
  if (Array.isArray(c.roles)) {
    for (const r of c.roles) {
      if (typeof r === "string" && r.trim()) roles.push(r.trim().toLowerCase());
    }
  }
  return roles.some(
    (r) =>
      r === "wholesale" ||
      r === "haendler" ||
      r === "administrator" ||
      r === "shop_manager"
  );
}

export function isAbandonedCartInitializeMode(): boolean {
  return (
    process.env.ABANDONED_CART_INITIALIZE?.trim().toLowerCase() === "true"
  );
}

/** One-time init: mark all sequence flags sent so no legacy carts trigger a mail burst. */
export async function setAllAbandonedCartSentFlags(
  customer: WooCustomerRow
): Promise<void> {
  const flagKeys = [
    ABANDONED_CART_SENT_1H_KEY,
    ABANDONED_CART_SENT_24H_KEY,
    ABANDONED_CART_SENT_72H_KEY,
  ] as const;

  const next = (customer.meta_data ?? [])
    .filter((row) => row?.key)
    .map((row) => ({
      key: String(row.key),
      value: metaValueToString(row.value),
    }));

  for (const key of flagKeys) {
    const idx = next.findIndex((row) => row.key === key);
    if (idx >= 0) next[idx] = { key, value: "yes" };
    else next.push({ key, value: "yes" });
  }

  await updateWooCustomerMeta(String(customer.id), next);
  customer.meta_data = next.map((r) => ({ key: r.key, value: r.value }));
}

export function parseCartUpdatedAt(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const hasTz =
    /Z$/i.test(trimmed) ||
    /[+-]\d{2}:?\d{2}$/.test(trimmed) ||
    /[+-]\d{2}$/.test(trimmed.slice(-6));
  const normalized = hasTz ? trimmed : `${trimmed}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hoursSince(date: Date, now = new Date()): number {
  return (now.getTime() - date.getTime()) / (60 * 60 * 1000);
}

export function extractPersistedCart(customer: WooCustomerRow): {
  cart: CartItem[];
  updated_at: string | null;
} {
  const rawCart = metaValue(customer.meta_data, PERSISTED_CART_META_KEY);
  const updated_at =
    metaValue(customer.meta_data, PERSISTED_CART_UPDATED_META_KEY) || null;
  if (!rawCart.trim()) return { cart: [], updated_at };
  try {
    const parsed = JSON.parse(rawCart) as unknown;
    return { cart: parsePersistedCartPayload(parsed), updated_at };
  } catch {
    return { cart: [], updated_at };
  }
}

export function customerEmail(c: WooCustomerRow): string {
  const billing =
    typeof c.billing?.email === "string" ? c.billing.email.trim() : "";
  const primary = typeof c.email === "string" ? c.email.trim() : "";
  return (billing || primary).toLowerCase();
}

export function customerFirstName(c: WooCustomerRow, email: string): string {
  const fn =
    typeof c.billing?.first_name === "string"
      ? c.billing.first_name.trim()
      : "";
  if (fn) return fn;
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "there";
  return local.replace(/[._]+/g, " ").trim() || "there";
}

export function customerLocale(c: WooCustomerRow): AbandonedCartLocale {
  const loc = metaValue(c.meta_data, "_uncuttv_locale").toLowerCase();
  return loc === "en" ? "en" : "de";
}

export function buildAbandonedCartEmailData(
  cart: CartItem[],
  customer: WooCustomerRow,
  options: {
    ctaUrl: string;
    couponCode?: string;
    expiryDate?: string;
  }
): AbandonedCartEmailData {
  const email = customerEmail(customer);
  const locale = customerLocale(customer);
  const total = cartTotalFromItems(cart);
  const discounted = total * 0.9;

  return {
    firstName: customerFirstName(customer, email),
    productName: cart[0]!.product.name,
    moreProductsHint: moreProductsHint(cart.length, locale),
    cartItemsBlock: buildCartItemsBlockHtml(cart),
    cartTotal: formatPrice(total),
    cartTotalWithDiscount: formatPrice(discounted),
    couponCode: options.couponCode,
    expiryDate: options.expiryDate,
    ctaUrl: options.ctaUrl,
  };
}

export async function setAbandonedCartMetaFlag(
  customer: WooCustomerRow,
  key: string,
  value: string
): Promise<boolean> {
  const next = (customer.meta_data ?? [])
    .filter((row) => row?.key)
    .map((row) => ({
      key: String(row.key),
      value: metaValueToString(row.value),
    }));

  const idx = next.findIndex((row) => row.key === key);
  if (idx >= 0) next[idx] = { key, value };
  else next.push({ key, value });

  await updateWooCustomerMeta(String(customer.id), next);

  const row = next.find((r) => r.key === key);
  if (row) row.value = value;
  customer.meta_data = next.map((r) => ({ key: r.key, value: r.value }));
  return true;
}

export function shopCtaUrl(): string {
  return ABANDONED_CART_SHOP_URL;
}

export function checkoutCtaUrl(couponCode?: string): string {
  if (!couponCode) return ABANDONED_CART_CHECKOUT_URL;
  return `${ABANDONED_CART_CHECKOUT_URL}?coupon=${encodeURIComponent(couponCode)}`;
}
