import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Footer from "@/components/Footer";
import HaendlerProduct from "@/components/HaendlerProduct";
import Navbar from "@/components/Navbar";
import { isProductVisibleForHaendler } from "@/lib/haendler-filter";
import type { WooProduct } from "@/lib/types";
import { wooFetch } from "@/lib/woocommerce";

export const metadata = {
  title: "Produkt — Händlerportal UNCUTTV",
};

type WooProductWithMeta = WooProduct & {
  meta_data?: Array<{ key: string; value: unknown }>;
};

export default async function HaendlerProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("haendler_token")?.value;

  if (!token) {
    redirect("/haendler");
  }

  const { slug } = await params;

  const products = await wooFetch<WooProductWithMeta[]>("/products", {
    slug,
  });
  const product = products[0];
  if (!product || !isProductVisibleForHaendler(product)) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <HaendlerProduct slug={slug} />
      </main>
      <Footer />
    </div>
  );
}
