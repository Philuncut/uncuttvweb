import { wooFetchAll, wooFetch } from "@/lib/woocommerce";
import type { WooProduct, WooCategory } from "@/lib/types";
import ShopPage from "./ShopPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop — UNCUTTV",
  description: "UNCUTTV Shop — Mediabooks, Blu-rays und mehr.",
};

export default async function Page() {
  const [products, categories] = await Promise.all([
    wooFetchAll<WooProduct>("/products", { per_page: "100" }),
    wooFetch<WooCategory[]>("/products/categories", {
      per_page: "100",
      hide_empty: "true",
    }),
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <ShopPage products={products} categories={categories} />
    </div>
  );
}
