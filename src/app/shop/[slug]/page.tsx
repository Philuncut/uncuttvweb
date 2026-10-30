import { Suspense } from "react";
import { notFound } from "next/navigation";
import VideoUtmCapture from "@/components/VideoUtmCapture";
import { wooFetch } from "@/lib/woocommerce";
import type { ProductVariant, WooProduct } from "@/lib/types";
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
import { redirectWholesaleToPortal } from "@/lib/wholesale-gate";
import { ladeVarianten } from "@/lib/shop-catalog";
import {
  GROESSE_ATTRIBUT_SLUG,
  istVariabel,
  produktKaufstatus,
  sortiereVarianten,
  verkaufszeitraumAus,
} from "@/lib/varianten";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

type ProduktMitMeta = WooProductSeo & {
  meta_data?: Array<{ key: string; value: unknown }>;
};

function getStockBadge(
  product: WooProduct,
  variants: ProductVariant[],
  verkaufVon: string | null,
  verkaufBis: string | null
) {
  const status = produktKaufstatus({
    type: product.type,
    stock_status: product.stock_status,
    purchasable: product.purchasable,
    variants,
    verkauf_von: verkaufVon,
    verkauf_bis: verkaufBis,
  });
  if (!status.bestellbar) {
    if (status.grund === "kommt") {
      return {
        label: `AB ${status.ab}`,
        className:
          "bg-[#c0392b] text-white shadow-[0_0_12px_rgba(192,57,43,0.6)]",
      };
    }
    if (status.grund === "vorbei") {
      return {
        label: "NICHT MEHR ERHÄLTLICH",
        className: "bg-white/10 text-white/50",
      };
    }
    return { label: "AUSVERKAUFT", className: "bg-white/10 text-white/50" };
  }
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
  await redirectWholesaleToPortal();

  const { slug } = await params;
  const products = await wooFetch<ProduktMitMeta[]>("/products", { slug });
  const product = products[0];
  if (!product || product.status !== "publish") notFound();

  // Variables Produkt (Merch): die Größen frisch (kein Cache), in der
  // Reihenfolge der Attribut-Optionen; Verkaufszeitraum aus dem Meta.
  const variants = istVariabel(product)
    ? sortiereVarianten(
        await ladeVarianten(product.id, { noStore: true }),
        product.attributes?.find(
          (a) => a.slug === GROESSE_ATTRIBUT_SLUG || a.name === "Größe"
        )?.options
      )
    : [];
  const { verkauf_von, verkauf_bis } = verkaufszeitraumAus(product.meta_data);

  const productJsonLd = buildProductJsonLd(product);
  const badge = getStockBadge(product, variants, verkauf_von, verkauf_bis);
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

  // Das Meta-Feld bleibt auf dem Server; die Seite bekommt nur die Felder,
  // die sie zeigt.
  const { meta_data: _meta, ...productForClient } = product;
  void _meta;

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
          product={productForClient}
          details={details}
          descriptionHtml={descriptionHtml}
          rawDescription={product.description}
          related={related}
          badge={badge}
          variants={variants}
          verkaufVon={verkauf_von}
          verkaufBis={verkauf_bis}
        />
      </main>
      <Footer />
    </div>
  );
}
