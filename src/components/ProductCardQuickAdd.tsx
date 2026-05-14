"use client";

import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import type { WooProduct } from "@/lib/types";

const BUSY_MS = 220;

function PlusIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={4}
      strokeLinecap="square"
      className="shrink-0"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className="shrink-0 text-white"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * Quick-add on product cards (Shop + Händler-Dashboard). Does not open the drawer.
 * Caller must only mount when `productForCart.stock_status !== "outofstock"`.
 */
export function ProductCardQuickAdd({
  productForCart,
  onCardFlash,
}: {
  productForCart: WooProduct;
  onCardFlash?: () => void;
}) {
  const { language } = useLanguage();
  const { items, addToCart } = useCart();
  const [busy, setBusy] = useState(false);

  const inCartQty = useMemo(
    () => items.find((i) => i.product.id === productForCart.id)?.quantity ?? 0,
    [items, productForCart.id]
  );

  const inCart = inCartQty > 0;
  const cartLabel = language === "de" ? "ZUM CART" : "TO CART";
  const ariaAdd =
    language === "de" ? "In den Warenkorb legen" : "Add to cart";
  const ariaMore =
    language === "de" ? "Weitere Stückzahl im Warenkorb" : "Add another to cart";

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
    <div className="pointer-events-auto absolute bottom-2 right-2 z-20">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={inCart ? ariaMore : ariaAdd}
        className={[
          "flex h-8 min-w-[148px] cursor-pointer items-center justify-center gap-1.5 px-3.5 text-[11px] font-bold tracking-[0.15em] text-white transition-all duration-200",
          "rounded-none",
          inCart
            ? "border-[1.5px] border-solid border-[#c0392b] bg-black/85 hover:scale-[1.02] hover:bg-[#c0392b]"
            : "border-0 bg-[#c0392b] hover:scale-[1.02] hover:bg-[#a02e22]",
        ].join(" ")}
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
              aria-hidden
            />
            <span className="text-[10px] tracking-[0.12em]">…</span>
          </span>
        ) : inCart ? (
          <span
            key="in-cart"
            className="flex items-center justify-center gap-1.5 text-white transition-opacity duration-200 ease-out"
          >
            <CheckIcon />
            <span className="text-[11px] font-bold tracking-[0.12em]">
              ✓ {inCartQty}
            </span>
          </span>
        ) : (
          <span
            key="add"
            className="flex items-center justify-center gap-1.5 transition-opacity duration-200 ease-out"
          >
            <PlusIcon />
            <span>{cartLabel}</span>
          </span>
        )}
      </button>
    </div>
  );
}
