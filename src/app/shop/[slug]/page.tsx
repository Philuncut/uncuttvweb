import { Suspense } from "react";
import { notFound } from "next/navigation";
import VideoUtmCapture from "@/components/blog/VideoUtmCapture";
import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";
import {
  buildProductJsonLd,
  buildProductMetadata,
  type WooProductSeo,
} from "@/lib/product-seo";
import { filterPurchasableRelatedProducts } from "@/lib/woo-product-filters";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductDetail from "@/components/ProductDetail";
import {
  parseDetails,
  stripInfoGrids,
} from "@/lib/parse-product-details";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function getStockBadge(product: WooProduct) {
  if (product.stock_status === "outofstock")
    return { label: "AUSVERKAUFT", className: "bg-white/10 text-white/50" };
  if (product.categories.some((c) => c.slug.includes("vorverkauf")))
    return {
      label: "VORVERKAUF",
      className:
        "bg-[#c0392b] text-white shadow-[0_0_12px_rgba(192,57,43,0.6)]",
    };
  return {
    label: "AUF LAGER",
    className: "bg-green-900/40 text-green-400 border border-green-800/50",
  };
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const products = await wooFetch<WooProductSeo[]>("/products", { slug });
  const product = products[0];
  if (!product || product.status !== "publish") {
    return { title: "Nicht gefunden — UncutTV" };
  }
  return buildProductMetadata(product);
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const products = await wooFetch<WooProductSeo[]>("/products", { slug });
  const product = products[0];
  if (!product || product.status !== "publish") notFound();

  const productJsonLd = buildProductJsonLd(product);
  const badge = getStockBadge(product);
  const details = parseDetails(product.description);
  const descriptionHtml = stripInfoGrids(product.description);

  let related: WooProduct[] = [];
  if (product.related_ids && product.related_ids.length > 0) {
    const ids = product.related_ids.slice(0, 4).join(",");
    const fetched = await wooFetch<WooProduct[]>("/products", {
      include: ids,
      per_page: "4",
    });
    related = filterPurchasableRelatedProducts(fetched);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* og:type product — hoisted to <head>; see product-seo.ts */}
      <meta property="og:type" content="product" />
      <Suspense fallback={null}>
        <VideoUtmCapture />
      </Suspense>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productJsonLd),
          }}
        />
        <ProductDetail
          product={product}
          details={details}
          descriptionHtml={descriptionHtml}
          rawDescription={product.description}
          related={related}
          badge={badge}
        />
      </main>
      <Footer />
    </div>
  );
}
