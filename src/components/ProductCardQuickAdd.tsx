"use client";

import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { flyToCart } from "@/lib/flyToCart";
import type { WooProduct } from "@/lib/types";

const BUSY_MS = 220;
const PRODUCT_IMAGE_SELECTOR = "[data-product-image]";

type QuickAddControlProps = {
  inCart: boolean;
  inCartQty: number;
  busy: boolean;
  ariaLabel: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
};

function BusySpinner() {
  return (
    <span
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
      aria-hidden
    />
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

function InCartLabel({ qty }: { qty: number }) {
  return (
    <span className="flex items-center gap-1.5 text-white">
      <CheckIcon />
      <span className="text-[11px] font-bold tracking-[0.12em]">{qty}</span>
    </span>
  );
}

function HoverBarPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={3}
      strokeLinecap="square"
      className="h-3 w-3 shrink-0"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HoverBar({
  inCart,
  inCartQty,
  busy,
  ariaLabel,
  onClick,
}: QuickAddControlProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      className={[
        "quick-add-hover-bar",
        "absolute inset-x-0 bottom-0 z-20",
        "h-9 cursor-pointer items-center justify-center gap-1.5",
        "bg-black/90 text-white",
        "translate-y-full pointer-events-none",
        !inCart && "group-hover:translate-y-0 group-hover:pointer-events-auto",
        inCart && "quick-add-hover-bar--in-cart hover:bg-black/80",
      ].join(" ")}
    >
      {busy ? (
        <BusySpinner />
      ) : inCart ? (
        <InCartLabel qty={inCartQty} />
      ) : (
        <>
          <HoverBarPlusIcon />
          <span className="text-[11px] font-bold tracking-[0.2em]">ADD</span>
        </>
      )}
    </button>
  );
}

function RoundPillPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2.5}
      strokeLinecap="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function RoundPill({
  inCart,
  inCartQty,
  busy,
  ariaLabel,
  onClick,
  layout,
}: QuickAddControlProps & { layout: "card" | "inline" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      className={[
        "quick-add-pill",
        layout === "card"
          ? "absolute bottom-2 right-2 z-20"
          : "relative z-10",
        "flex cursor-pointer items-center justify-center",
        "rounded-full border-[1.5px] border-white/85",
        "bg-black/50 backdrop-blur-[4px]",
        "transition-all duration-200",
        inCart ? "h-8 min-w-8 px-2" : "h-8 w-8",
      ].join(" ")}
    >
      {busy ? (
        <BusySpinner />
      ) : inCart ? (
        <InCartLabel qty={inCartQty} />
      ) : (
        <RoundPillPlusIcon />
      )}
    </button>
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
  /** `card`: hover bar (desktop) + round pill (mobile). `inline`: round pill only. */
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
  const ariaLabel = inCart ? ariaMore : ariaAdd;

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

  const controlProps: QuickAddControlProps = {
    inCart,
    inCartQty,
    busy,
    ariaLabel,
    onClick: handleClick,
  };

  if (variant === "inline") {
    return (
      <div className="pointer-events-auto flex shrink-0 justify-end">
        <RoundPill {...controlProps} layout="inline" />
      </div>
    );
  }

  return (
    <>
      <HoverBar {...controlProps} />
      <RoundPill {...controlProps} layout="card" />
    </>
  );
}
