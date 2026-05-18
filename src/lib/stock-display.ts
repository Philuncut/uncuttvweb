import type { WooCategory } from "@/lib/types";

export type StockDisplayVariant = {
  /** Detail page line (sentence form) */
  text: string;
  type: "wholesale" | "scarcity";
  /** B2C grid corner badge (compact, uppercase-oriented) */
  gridLabel?: string;
};

/** Same rule as ShopContent / shop slug page: preorder when category slug contains `vorverkauf`. */
export function productHasPreOrderCategory(
  categories: WooCategory[] | undefined
): boolean {
  return (categories ?? []).some((c) =>
    c.slug.toLowerCase().includes("vorverkauf")
  );
}

type GetStockDisplayOptions = {
  /** Pre-order listings: suppress B2C scarcity (woo “Limitierung” is separate UX). */
  suppressB2CScarcity?: boolean;
};

/**
 * Detail page stock callout — not used for plain `outofstock` (caller keeps Sold-out UI).
 *
 * @param wholesaleSession `true` = wholesale customer (exact qty UI). `false` = retail/guest (scarcity). `null` = session not loaded yet — suppress BOTH special rows to avoid flashes.
 */
export function getStockDisplay(
  stockQuantity: number | null | undefined,
  stockStatus: string | undefined,
  wholesaleSession: boolean | null,
  language: "de" | "en",
  options?: GetStockDisplayOptions
): StockDisplayVariant | null {
  if (stockStatus === "outofstock") return null;

  const suppressScarcity = options?.suppressB2CScarcity === true;

  if (wholesaleSession === true && typeof stockQuantity === "number") {
    return {
      type: "wholesale",
      text:
        language === "de"
          ? `AUF LAGER · ${stockQuantity} STÜCK`
          : `IN STOCK · ${stockQuantity} UNITS`,
    };
  }

  if (
    wholesaleSession === false &&
    !suppressScarcity &&
    typeof stockQuantity === "number" &&
    stockQuantity > 0 &&
    stockQuantity <= 9
  ) {
    return {
      type: "scarcity",
      text:
        language === "de"
          ? `Nur noch ${stockQuantity} Stück verfügbar`
          : `Only ${stockQuantity} left in stock`,
      gridLabel:
        language === "de"
          ? `NUR NOCH ${stockQuantity}`
          : `ONLY ${stockQuantity} LEFT`,
    };
  }

  return null;
}
