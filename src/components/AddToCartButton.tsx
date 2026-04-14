"use client";

import { useState, useCallback } from "react";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import type { WooProduct } from "@/lib/types";

export default function AddToCartButton({
  disabled,
  product,
}: {
  disabled: boolean;
  product: WooProduct;
}) {
  const { addToCart, openDrawer } = useCart();
  const { language } = useLanguage();
  const t = createT(language);
  const [added, setAdded] = useState(false);

  const handleClick = useCallback(() => {
    addToCart(product);
    openDrawer();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }, [addToCart, openDrawer, product]);

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full bg-white/10 py-4 text-sm font-bold tracking-[0.2em] text-white/30"
      >
        {t("AUSVERKAUFT")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full cursor-pointer bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
    >
      {added ? t("HINZUGEFUEGT") : t("IN_DEN_WARENKORB")}
    </button>
  );
}
