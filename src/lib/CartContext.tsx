"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { ProductVariant, ShopListProduct, WooProduct } from "@/lib/types";
import { parsePrice } from "@/lib/parse-price";
import { cartItemKey, mergeCartItems } from "@/lib/persisted-cart";
import { loadAuthSession } from "@/lib/session-client";
import { trackAddToCart } from "@/lib/meta-pixel";
import { toHaendlerCartProduct } from "@/lib/haendler-to-cart-product";
import { lineKey } from "@/lib/varianten";

/**
 * Die gewählte Größe einer Warenkorbposition. Preis, Lager und Aktion der
 * Variante stehen in `product` (beim Einlegen übernommen), damit alles,
 * was bisher `item.product.price` las, ohne Änderung weiter stimmt.
 */
export type CartVariant = {
  id: number;
  size: string;
  size_slug: string;
};

export interface CartItem {
  /** Nur die Felder, die der Warenkorb liest; ein volles WooProduct passt ebenfalls. */
  product: ShopListProduct;
  quantity: number;
  /** Nur bei variablen Produkten (Merch): die Größe. Fehlt bei einfachen Produkten. */
  variant?: CartVariant;
}

export type WholesaleRepriceRemovedItem = {
  id: number;
  name: string;
  price: string;
};

export type WholesaleRepriceResult = {
  repricedCount: number;
  removedCount: number;
  removedItems: WholesaleRepriceRemovedItem[];
};

/** Frischer Preis einer Zeile vom Server (bestellpruefung.ts). */
export type ServerPriceUpdate = {
  id: number;
  variation_id?: number;
  price: string;
};

interface CartContextValue {
  items: CartItem[];
  /** Increments on every `addToCart` — Navbar badge pulse, etc. */
  cartChangeKey: number;
  /** Einfaches Produkt: nur `product`. Variables Produkt: dazu die gewählte Größe. */
  addToCart: (product: ShopListProduct, variant?: ProductVariant) => void;
  removeFromCart: (productId: number, variationId?: number) => void;
  updateQuantity: (
    productId: number,
    quantity: number,
    variationId?: number
  ) => void;
  clearCart: () => void;
  /**
   * Fetches Woo wholesale line prices per cart SKU; keeps rows with haendler_preis &gt; 0,
   * drops the rest (B2C-only catalog items).
   */
  repriceCartForWholesale: () => Promise<WholesaleRepriceResult>;
  /** Preise aus der Serverprüfung übernehmen (alter Warenkorb, geänderter Preis). */
  applyServerPrices: (updates: ServerPriceUpdate[]) => void;
  totalItems: number;
  totalPrice: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "uncuttv_cart";
const PERSIST_DEBOUNCE_MS = 1500;

function isCartVariant(value: unknown): value is CartVariant {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<CartVariant>;
  return typeof v.id === "number" && v.id > 0;
}

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is CartItem =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as CartItem).quantity === "number" &&
          typeof (entry as CartItem).product?.id === "number"
      )
      .map((entry) =>
        isCartVariant(entry.variant)
          ? {
              product: entry.product,
              quantity: entry.quantity,
              variant: {
                id: entry.variant.id,
                size: String(entry.variant.size ?? ""),
                size_slug: String(entry.variant.size_slug ?? ""),
              },
            }
          : { product: entry.product, quantity: entry.quantity }
      );
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full or unavailable
  }
}

/** Über session-client: eine Anfrage je Seitenaufbau für alle Aufrufer. */
async function fetchSessionLoggedIn(): Promise<boolean> {
  const session = await loadAuthSession();
  return session.isLoggedIn;
}

async function fetchServerCart(): Promise<CartItem[]> {
  const res = await fetch("/api/cart/persist", { cache: "no-store" });
  const data = (await res.json()) as {
    ok?: boolean;
    cart?: CartItem[];
    reason?: string;
  };
  if (!data.ok || data.reason === "not_logged_in") return [];
  if (!Array.isArray(data.cart)) return [];
  return data.cart.filter(
    (entry) =>
      entry &&
      typeof entry.quantity === "number" &&
      typeof entry.product?.id === "number"
  );
}

async function putServerCart(cart: CartItem[]): Promise<void> {
  await fetch("/api/cart/persist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cart }),
  });
}

async function deleteServerCart(): Promise<void> {
  await fetch("/api/cart/persist", { method: "DELETE" });
}

/**
 * Das Produkt, wie es in der Zeile liegt: bei einer Variante mit deren
 * Preis, Aktion und Lager, damit Summen, Kasse und Zahlung die Größe
 * rechnen und nicht das Elternprodukt. Varianten-Liste und Attribute
 * bleiben draußen (zu groß für localStorage und Kunden-Meta).
 */
function productForLine(
  product: ShopListProduct,
  variant?: ProductVariant
): ShopListProduct {
  const rest = { ...product };
  delete rest.variants;
  delete rest.attributes;
  if (!variant) return rest;
  return {
    ...rest,
    price: variant.price,
    regular_price: variant.regular_price,
    sale_price: variant.on_sale ? variant.sale_price : "",
    stock_status: variant.stock_status,
    stock_quantity: variant.manage_stock ? variant.stock_quantity : null,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartChangeKey, setCartChangeKey] = useState(0);

  /** Latest cart snapshot — used by repricing outside React commit timing. */
  const itemsRef = useRef<CartItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const persistEnabledRef = useRef(false);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPersistRef = useRef(false);

  const cancelPendingPersist = useCallback(() => {
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = null;
    }
  }, []);

  const persistCartNow = useCallback(async (cart: CartItem[]) => {
    if (!persistEnabledRef.current) return;
    try {
      await putServerCart(cart);
    } catch {
      // non-blocking
    }
  }, []);

  const schedulePersist = useCallback(
    (cart: CartItem[]) => {
      if (!persistEnabledRef.current) return;
      cancelPendingPersist();
      persistDebounceRef.current = setTimeout(() => {
        persistDebounceRef.current = null;
        if (!persistEnabledRef.current) return;
        void persistCartNow(cart);
      }, PERSIST_DEBOUNCE_MS);
    },
    [cancelPendingPersist, persistCartNow]
  );

  const applyCartState = useCallback(
    (next: CartItem[], options?: { persistImmediately?: boolean }) => {
      skipNextPersistRef.current = true;
      setItems(next);
      saveCart(next);
      if (options?.persistImmediately && persistEnabledRef.current) {
        cancelPendingPersist();
        void persistCartNow(next);
      }
    },
    [cancelPendingPersist, persistCartNow]
  );

  const syncCartWithServer = useCallback(
    async (localCart: CartItem[]) => {
      if (!persistEnabledRef.current) return;
      try {
        const serverCart = await fetchServerCart();
        const merged = mergeCartItems(localCart, serverCart);
        applyCartState(merged, { persistImmediately: true });
      } catch {
        // keep local cart on failure
      }
    },
    [applyCartState]
  );

  const refreshSessionAndSync = useCallback(async () => {
    const wasLoggedIn = persistEnabledRef.current;
    const isLoggedIn = await fetchSessionLoggedIn();
    persistEnabledRef.current = isLoggedIn;

    if (!isLoggedIn) {
      cancelPendingPersist();
      return;
    }

    if (!wasLoggedIn) {
      await syncCartWithServer(loadCart());
    }
  }, [cancelPendingPersist, syncCartWithServer]);

  // Initial load: localStorage first, then optional server merge (async)
  useEffect(() => {
    let cancelled = false;

    const local = loadCart();
    setItems(local);
    setLoaded(true);

    (async () => {
      const isLoggedIn = await fetchSessionLoggedIn();
      if (cancelled) return;
      persistEnabledRef.current = isLoggedIn;
      if (isLoggedIn) {
        await syncCartWithServer(local);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syncCartWithServer]);

  // Login / logout: re-check session and sync cart after login
  useEffect(() => {
    const onSessionChanged = () => {
      void refreshSessionAndSync();
    };
    window.addEventListener("uncuttv:session-changed", onSessionChanged);
    return () => {
      window.removeEventListener("uncuttv:session-changed", onSessionChanged);
    };
  }, [refreshSessionAndSync]);

  useEffect(() => {
    return () => {
      cancelPendingPersist();
    };
  }, [cancelPendingPersist]);

  // Persist localStorage + debounced server PUT on cart changes
  useEffect(() => {
    if (!loaded) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    saveCart(items);
    schedulePersist(items);
  }, [items, loaded, schedulePersist]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const addToCart = useCallback(
    (product: ShopListProduct, variant?: ProductVariant) => {
      const lineProduct = productForLine(product, variant);
      const cartVariant: CartVariant | undefined = variant
        ? { id: variant.id, size: variant.size, size_slug: variant.size_slug }
        : undefined;
      const key = lineKey(product.id, cartVariant?.id);
      const unitPrice = parsePrice(lineProduct.price || "0");
      setItems((prev) => {
        const existing = prev.find((i) => cartItemKey(i) === key);
        if (existing) {
          return prev.map((i) =>
            cartItemKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [
          ...prev,
          {
            product: lineProduct,
            quantity: 1,
            ...(cartVariant ? { variant: cartVariant } : {}),
          },
        ];
      });
      setCartChangeKey((k) => k + 1);
      // Meta: content_ids auf die Variante, wenn eine gewählt ist.
      void trackAddToCart(
        String(cartVariant?.id ?? product.id),
        cartVariant ? `${product.name} – ${cartVariant.size}` : product.name,
        unitPrice,
        1
      );
    },
    []
  );

  const removeFromCart = useCallback(
    (productId: number, variationId?: number) => {
      const key = lineKey(productId, variationId);
      setItems((prev) => prev.filter((i) => cartItemKey(i) !== key));
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: number, quantity: number, variationId?: number) => {
      if (quantity < 1) return;
      const key = lineKey(productId, variationId);
      setItems((prev) =>
        prev.map((i) => (cartItemKey(i) === key ? { ...i, quantity } : i))
      );
    },
    []
  );

  const applyServerPrices = useCallback((updates: ServerPriceUpdate[]) => {
    if (!updates.length) return;
    const byKey = new Map(
      updates.map((u) => [lineKey(u.id, u.variation_id), u.price] as const)
    );
    setItems((prev) => {
      let changed = false;
      const next = prev.map((i) => {
        const price = byKey.get(cartItemKey(i));
        if (price === undefined || price === i.product.price) return i;
        changed = true;
        return { ...i, product: { ...i.product, price } };
      });
      return changed ? next : prev;
    });
  }, []);

  const clearCart = useCallback(() => {
    cancelPendingPersist();
    setItems([]);
    saveCart([]);
    if (persistEnabledRef.current) {
      void deleteServerCart();
    }
  }, [cancelPendingPersist]);

  const repriceCartForWholesale = useCallback(async (): Promise<WholesaleRepriceResult> => {
    const snapshot = itemsRef.current;
    if (!snapshot.length) {
      return { repricedCount: 0, removedCount: 0, removedItems: [] };
    }

    try {
      const uniqueIds = [...new Set(snapshot.map((i) => i.product.id))];
      const res = await fetch("/api/cart/reprice-wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds }),
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        eligible?: Record<string, unknown>;
      };

      if (!res.ok || !data.ok || !data.eligible) {
        return { repricedCount: 0, removedCount: 0, removedItems: [] };
      }

      const nextItems: CartItem[] = [];
      const removedItems: WholesaleRepriceRemovedItem[] = [];
      let repricedCount = 0;

      for (const row of snapshot) {
        const rawEligible = data.eligible[String(row.product.id)];
        if (rawEligible && typeof rawEligible === "object" && rawEligible !== null) {
          const cartProduct = toHaendlerCartProduct(
            rawEligible as WooProduct & { haendler_preis?: string }
          );
          nextItems.push({
            product: cartProduct,
            quantity: row.quantity,
            ...(row.variant ? { variant: row.variant } : {}),
          });
          repricedCount += 1;
        } else {
          removedItems.push({
            id: row.product.id,
            name: row.variant
              ? `${row.product.name ?? ""} – ${row.variant.size}`
              : (row.product.name ?? ""),
            price: row.product.price ?? "0",
          });
        }
      }

      const loggedIn = await fetchSessionLoggedIn();
      persistEnabledRef.current = loggedIn;
      applyCartState(nextItems, { persistImmediately: loggedIn });
      setCartChangeKey((k) => k + 1);

      return {
        repricedCount,
        removedCount: removedItems.length,
        removedItems,
      };
    } catch {
      return { repricedCount: 0, removedCount: 0, removedItems: [] };
    }
  }, [applyCartState]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + parsePrice(i.product.price || "0") * i.quantity,
    0
  );

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <CartContext.Provider
      value={{
        items,
        cartChangeKey,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        repriceCartForWholesale,
        applyServerPrices,
        totalItems,
        totalPrice,
        drawerOpen,
        openDrawer,
        closeDrawer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
