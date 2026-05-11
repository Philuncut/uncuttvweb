"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, translateDetailLabel } from "@/lib/translations";
import ProductGallery from "@/components/ProductGallery";
import CinematicLoader from "@/components/CinematicLoader";
import type { WooProduct } from "@/lib/types";

interface HaendlerProductData extends WooProduct {
  haendler_preis: string;
  sales_kit_url?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
  stock_quantity?: number | null;
}

interface DetailEntry {
  label: string;
  value: string;
}

function parseDetails(html: string): DetailEntry[] {
  const entries: DetailEntry[] = [];
  const gridRegex = /<section class="info-grid">([\s\S]*?)<\/section>/g;
  let gridMatch;
  while ((gridMatch = gridRegex.exec(html)) !== null) {
    const block = gridMatch[1];
    const pairRegex = /<strong>([^<]+?):<\/strong>\s*(.+?)(?:<\/p>|$)/g;
    let pairMatch;
    while ((pairMatch = pairRegex.exec(block)) !== null) {
      const label = pairMatch[1].trim();
      const value = pairMatch[2].replace(/<[^>]*>/g, "").trim();
      if (label && value) {
        entries.push({ label, value });
      }
    }
    const castRegex =
      /<h4>Cast<\/h4>\s*(?:<p>)?(?!<strong>)([\s\S]*?)(?:<\/p>|<\/div>)/g;
    let castMatch;
    while ((castMatch = castRegex.exec(block)) !== null) {
      const castVal = castMatch[1].replace(/<[^>]*>/g, "").trim();
      if (castVal && !entries.some((e) => e.label === "Cast")) {
        entries.push({ label: "Cast", value: castVal });
      }
    }
  }
  return entries;
}

function stripInfoGrids(html: string): string {
  return html.replace(/<section class="info-grid">[\s\S]*?<\/section>/g, "");
}

export default function HaendlerProduct({ slug }: { slug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dealerCookie, setDealerCookie] = useState(false);

  useEffect(() => {
    setDealerCookie(/(?:^|;\s*)haendler_token=/.test(document.cookie));
  }, [pathname]);

  const isB2B =
    (pathname ?? "").startsWith("/haendler") || dealerCookie;

  const { addToCart, openDrawer } = useCart();
  const [product, setProduct] = useState<HaendlerProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const { language } = useLanguage();
  const t = createT(language);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/haendler/products");
      if (!res.ok) {
        router.push("/haendler");
        return;
      }
      const products: HaendlerProductData[] = await res.json();
      const found = products.find((p) => p.slug === slug);
      if (found) {
        setProduct(found);
      }
      setLoading(false);
    }
    load();
  }, [slug, router]);

  const details = useMemo(
    () => (product?.description ? parseDetails(product.description) : []),
    [product?.description]
  );

  const descriptionHtml = useMemo(
    () => (product?.description ? stripInfoGrids(product.description) : ""),
    [product?.description]
  );

  const hasDescription = descriptionHtml.replace(/<[^>]*>/g, "").trim().length > 0;

  const salesKitHref = useMemo(() => {
    if (!product) return "";
    const fromMeta = product.meta_data?.find(
      (m) => m.key === "sales_kit_url" || m.key === "_sales_kit_url"
    )?.value;
    if (fromMeta != null) {
      const s = String(fromMeta).trim();
      if (s) return s;
    }
    if (typeof product.sales_kit_url === "string") {
      const s = product.sales_kit_url.trim();
      if (s) return s;
    }
    return "";
  }, [product]);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    const cartProduct = {
      ...product,
      price: product.haendler_preis || product.price,
    };
    addToCart(cartProduct);
    openDrawer();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }, [product, addToCart, openDrawer]);

  if (loading) return <CinematicLoader show />;

  if (!product) {
    return (
      <div className="py-20 text-center">
        <p className="text-white/50">Produkt nicht gefunden.</p>
      </div>
    );
  }

  const isOutOfStock = product.stock_status === "outofstock";
  const hasHaendlerPreis = !!product.haendler_preis;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        {/* Left — Gallery */}
        <ProductGallery images={product.images} />

        {/* Right — Info */}
        <div>
          <div className="inline-block bg-[#c0392b]/10 px-3 py-1 text-[10px] font-bold tracking-wider text-[#c0392b]">
            {t("HAENDLERPREIS")}
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white sm:text-3xl">
            {product.name.toUpperCase()}
          </h1>

          {/* Price */}
          <div className="mt-4">
            {hasHaendlerPreis ? (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-[#c0392b]">
                  €{product.haendler_preis}
                </span>
                <span className="text-lg text-white/30 line-through">
                  €{product.price}
                </span>
              </div>
            ) : (
              <p className="text-lg text-white/40">Preis auf Anfrage</p>
            )}
          </div>

          {/* Stock */}
          <div className="mt-4">
            {isOutOfStock ? (
              <span className="inline-block bg-white/10 px-4 py-1.5 text-[11px] font-bold tracking-[0.2em] text-white/50">
                {t("AUSVERKAUFT")}
              </span>
            ) : (
              <span className="inline-block bg-green-900/40 px-4 py-1.5 text-[11px] font-bold tracking-[0.2em] text-green-400 border border-green-800/50">
                {typeof product.stock_quantity === "number" &&
                product.stock_quantity > 0
                  ? `${t("AUF_LAGER")} · ${product.stock_quantity} STÜCK`
                  : t("AUF_LAGER")}
              </span>
            )}
          </div>

          {/* Short description */}
          {product.short_description && (
            <div
              className="mt-6 text-sm leading-relaxed text-white/60"
              dangerouslySetInnerHTML={{ __html: product.short_description }}
            />
          )}

          {/* Add to cart */}
          <div className="mt-8">
            {isOutOfStock ? (
              <button
                type="button"
                disabled
                className="w-full bg-white/10 py-4 text-sm font-bold tracking-[0.2em] text-white/30"
              >
                {t("AUSVERKAUFT")}
              </button>
            ) : !hasHaendlerPreis ? (
              <a
                href={`mailto:office@uncuttv.at?subject=Händlerpreis Anfrage: ${product.name}`}
                className="block w-full bg-[#c0392b] py-4 text-center text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
              >
                {t("PREIS_ANFRAGEN")}
              </a>
            ) : (
              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full cursor-pointer bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
              >
                {added ? t("HINZUGEFUEGT") : t("IN_DEN_WARENKORB")}
              </button>
            )}

            {isB2B && salesKitHref ? (
              <button
                type="button"
                onClick={() => window.open(salesKitHref, "_blank")}
                className="mt-4 w-full cursor-pointer border border-[#c0392b] bg-transparent py-3 text-xs font-bold tracking-[0.15em] text-[#c0392b] transition-colors hover:bg-[#c0392b]/10 hover:text-white sm:py-4 sm:text-sm sm:tracking-[0.2em]"
              >
                VERKAUFSMATERIAL HERUNTERLADEN
              </button>
            ) : null}
          </div>

          {/* Film details */}
          {details.length > 0 && (
            <div className="mt-8 border-t border-[#222] pt-6">
              <h3 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
                {t("DETAILS")}
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                {details.map((d, i) => (
                  <div key={i}>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#888]">
                      {translateDetailLabel(d.label, language)}
                    </dt>
                    <dd className="mt-0.5 text-sm text-white">
                      {d.value}
                    </dd>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category + SKU meta */}
          <div className="mt-6 border-t border-[#222] pt-6">
            <dl className="space-y-2 text-xs text-white/40">
              {product.categories.length > 0 && (
                <div className="flex gap-2">
                  <dt className="font-bold tracking-wider text-white/60">{t("KATEGORIE")}</dt>
                  <dd>{product.categories.map((c) => c.name).join(", ")}</dd>
                </div>
              )}
              {product.sku && (
                <div className="flex gap-2">
                  <dt className="font-bold tracking-wider text-white/60">SKU:</dt>
                  <dd>{product.sku}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Product description — full width, stripped of info-grids */}
      {hasDescription && (
        <section className="mt-16 border-t border-[#222] pt-10">
          <h2 className="border-l-4 border-[#c0392b] pl-4 text-xl font-black tracking-[0.15em] text-white sm:text-2xl">
            {t("BESCHREIBUNG")}
          </h2>
          <div
            className="product-description mt-6 text-sm leading-relaxed text-white/70"
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        </section>
      )}
    </>
  );
}
