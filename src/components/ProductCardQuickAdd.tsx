"use client";

import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useCart } from "@/lib/CartContext";
import type { WooProduct } from "@/lib/types";

const BUSY_MS = 220;

/**
 * Circular quick-add on product cards. Does not open the cart drawer.
 * Caller must only mount when `productForCart.stock_status !== "outofstock"`.
 */
export function ProductCardQuickAdd({
  productForCart,
  onCardFlash,
}: {
  productForCart: WooProduct;
  onCardFlash?: () => void;
}) {
  const { items, addToCart } = useCart();
  const [busy, setBusy] = useState(false);

  const inCartQty = useMemo(
    () => items.find((i) => i.product.id === productForCart.id)?.quantity ?? 0,
    [items, productForCart.id]
  );

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      setBusy(true);
      addToCart(productForCart);
      onCardFlash?.();
      window.setTimeout(() => setBusy(false), BUSY_MS);
    },
    [addToCart, busy, onCardFlash, productForCart]
  );

  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-20">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label="In den Warenkorb"
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/60 text-white transition-colors duration-200 hover:bg-[#c0392b] hover:border-[#c0392b] disabled:cursor-default disabled:opacity-80"
      >
        {busy ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden
          />
        ) : inCartQty > 0 ? (
          <svg
            className="h-5 w-5 transition-transform duration-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        )}
        {inCartQty > 0 && (
          <span className="pointer-events-none absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded bg-[#c0392b] px-1 text-[9px] font-bold leading-none text-white shadow-sm">
            ✓{inCartQty}
          </span>
        )}
      </button>
    </div>
  );
}
