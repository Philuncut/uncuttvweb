"use client";

import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { flyToCart } from "@/lib/flyToCart";
import type { WooProduct } from "@/lib/types";

const BUSY_MS = 220;
const PRODUCT_IMAGE_SELECTOR = "[data-product-image]";

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={4}
      strokeLinecap="square"
      className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4"
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

function findProductImage(root: Element | null): HTMLImageElement | null {
  if (!root) return null;
  return root.querySelector<HTMLImageElement>(PRODUCT_IMAGE_SELECTOR);
}

/**
 * Quick-add on product cards (Shop + Händler-Dashboard). Does not open the drawer.
 * Caller must only mount when `productForCart.stock_status !== "outofstock"`.
 */
export function ProductCardQuickAdd({
  productForCart,
  onCardFlash,
  variant = "card",
}: {
  productForCart: WooProduct;
  /** Fallback feedback when fly-to-cart cannot run (no image / no cart target). */
  onCardFlash?: () => void;
  /** `card`: absolute corner on product image. `inline`: filler row / compact strip. */
  variant?: "card" | "inline";
}) {
  const { language } = useLanguage();
  const { items, addToCart } = useCart();
  const [busy, setBusy] = useState(false);

  const inCartQty = useMemo(
    () => items.find((i) => i.product.id === productForCart.id)?.quantity ?? 0,
    [items, productForCart.id]
  );

  const inCart = inCartQty > 0;
  const ariaAdd =
    language === "de" ? "In den Warenkorb legen" : "Add to cart";
  const ariaMore =
    language === "de" ? "Weitere Stückzahl im Warenkorb" : "Add another to cart";

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;

      const root = e.currentTarget.closest("[data-quick-add-root]");
      const img = findProductImage(root);
      let flew = false;
      if (img?.complete && img.naturalWidth > 0) {
        flew = flyToCart(img);
      }

      setBusy(true);
      addToCart(productForCart);
      if (!flew) onCardFlash?.();
      window.setTimeout(() => setBusy(false), BUSY_MS);
    },
    [addToCart, busy, onCardFlash, productForCart]
  );

  const wrapClass =
    variant === "card"
      ? "pointer-events-auto absolute bottom-2 right-2 z-20"
      : "pointer-events-auto relative z-10 flex shrink-0 justify-end";

  const btnClass = inCart
    ? [
        "flex h-8 min-w-[52px] cursor-pointer items-center justify-center gap-1 rounded-none px-2 text-white transition-all duration-200 md:h-9 md:min-w-[56px]",
        "border-[1.5px] border-solid border-[#c0392b] bg-black/85 hover:scale-105 hover:bg-[#a02e22]",
      ].join(" ")
    : [
        "flex h-8 w-8 cursor-pointer items-center justify-center rounded-none border-0 bg-[#c0392b] text-white transition-all duration-200 md:h-9 md:w-9",
        "hover:scale-105 hover:bg-[#a02e22]",
      ].join(" ");

  return (
    <div className={wrapClass}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={inCart ? ariaMore : ariaAdd}
        className={btnClass}
      >
        {busy ? (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden
          />
        ) : inCart ? (
          <span
            key="in-cart"
            className="flex items-center justify-center gap-1 text-white transition-opacity duration-200 ease-out"
          >
            <CheckIcon />
            <span className="text-[11px] font-bold tracking-[0.12em]">
              ✓ {inCartQty}
            </span>
          </span>
        ) : (
          <PlusIcon key="add" />
        )}
      </button>
    </div>
  );
}
