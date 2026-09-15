import { redirectWholesaleToPortal } from "@/lib/wholesale-gate";
import { getShopCatalog } from "@/lib/shop-catalog";
import ShopPage from "./ShopPage";

// Kein force-dynamic: Die Sitzungsprüfung liest Cookies und hält die
// Seite ohnehin bei jedem Aufruf dynamisch.
//
// Der Katalog kommt aus src/lib/shop-catalog.ts (unstable_cache, einmal pro
// Minute nach WordPress). Er liegt dort und nicht hier, weil die Weiche
// unter /start denselben Eintrag liest — Seitenmodule dürfen nur die
// Next-Felder exportieren.

export const metadata = {
  title: "Shop — UNCUTTV",
  description: "UNCUTTV Shop — Mediabooks, Blu-rays und mehr.",
};

export default async function Page() {
  // Haendler sehen das Portal, nicht den B2C-Shop. Frueher stand diese
  // Umleitung in der middleware.ts und las die Rolle aus einem Cookie.
  await redirectWholesaleToPortal();

  const { products, categories } = await getShopCatalog();

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ShopPage products={products} categories={categories} />
    </div>
  );
}
