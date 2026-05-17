import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AboutClient from "@/components/about/AboutClient";
import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Über uns – UncutTV",
  description:
    "Wie aus einem kleinen Slipcase-Projekt eines der wenigen unabhängigen Filmlabel im deutschsprachigen Raum wurde.",
};

export default async function AboutPage() {
  let newestProducts: WooProduct[] = [];
  try {
    newestProducts = await wooFetch<WooProduct[]>("/products", {
      per_page: "3",
      orderby: "date",
      order: "desc",
      status: "publish",
    });
  } catch (err) {
    console.error("[about] WooCommerce product fetch failed", err);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <main>
        <AboutClient newestProducts={newestProducts} />
      </main>
      <Footer />
    </div>
  );
}
