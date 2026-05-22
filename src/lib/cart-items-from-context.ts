import type { CartMeta, WooOrderSyncContext } from "@/lib/wc-order-from-payment";

/**
 * Resolve cart line items for Woo sync from request context (preferred) or an optional fallback.
 * Replaces reading {@code pi.metadata.cart_items} at call sites.
 */
export function getCartItemsForSync(
  syncContext: WooOrderSyncContext | undefined,
  fallback?: CartMeta[]
): CartMeta[] {
  const fromContext = syncContext?.items?.filter(
    (i) => i && (i.qty > 0 || i.name)
  );
  if (fromContext && fromContext.length > 0) {
    return fromContext;
  }
  if (fallback && fallback.length > 0) {
    return fallback;
  }
  throw new Error("Keine Items verfügbar");
}
