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
import type { WooProduct } from "@/lib/types";
import { parsePrice } from "@/lib/parse-price";
import { mergeCartItems } from "@/lib/persisted-cart";

export interface CartItem {
  product: WooProduct;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  /** Increments on every `addToCart` — Navbar badge pulse, etc. */
  cartChangeKey: number;
  addToCart: (product: WooProduct) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "uncuttv_cart";
const PERSIST_DEBOUNCE_MS = 1500;

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CartItem =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as CartItem).quantity === "number" &&
        typeof (entry as CartItem).product?.id === "number"
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

async function fetchSessionLoggedIn(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { isLoggedIn?: boolean };
    return data.isLoggedIn === true;
  } catch {
    return false;
  }
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartChangeKey, setCartChangeKey] = useState(0);

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

  const addToCart = useCallback((product: WooProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setCartChangeKey((k) => k + 1);
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    cancelPendingPersist();
    setItems([]);
    saveCart([]);
    if (persistEnabledRef.current) {
      void deleteServerCart();
    }
  }, [cancelPendingPersist]);

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
