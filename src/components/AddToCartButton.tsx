"use client";

import { useState, useCallback } from "react";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import type { ProductVariant, WooProduct } from "@/lib/types";

/**
 * Der Kaufknopf der Produktseite.
 *
 * `disabled` mit `disabledLabel`: Ausverkauft, "Ab 31.10.", "Nicht mehr
 * erhältlich". `needsSize`: variables Produkt ohne gewählte Größe -- der
 * Knopf sagt "Größe wählen" und legt nichts ein. `variant`: die gewählte
 * Größe, geht mit ins Einlegen (eigene Position je Größe).
 */
export default function AddToCartButton({
  disabled,
  disabledLabel,
  needsSize = false,
  product,
  variant,
}: {
  disabled: boolean;
  disabledLabel?: string;
  needsSize?: boolean;
  product: WooProduct;
  variant?: ProductVariant | null;
}) {
  const { addToCart, openDrawer } = useCart();
  const { language } = useLanguage();
  const t = createT(language);
  const [added, setAdded] = useState(false);

  const handleClick = useCallback(() => {
    if (needsSize) return;
    addToCart(product, variant ?? undefined);
    openDrawer();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }, [addToCart, openDrawer, product, variant, needsSize]);

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full bg-white/10 py-4 text-sm font-bold tracking-[0.2em] text-white/30"
      >
        {disabledLabel ?? t("AUSVERKAUFT")}
      </button>
    );
  }

  if (needsSize) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full border border-[#c0392b]/50 bg-transparent py-4 text-sm font-bold tracking-[0.2em] text-[#c0392b]/70"
      >
        {t("GROESSE_WAEHLEN")}
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
