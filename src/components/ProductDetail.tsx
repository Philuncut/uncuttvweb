"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, translateDetailLabel } from "@/lib/translations";
import type { WooProduct } from "@/lib/types";
import ProductGallery from "@/components/ProductGallery";
import AddToCartButton from "@/components/AddToCartButton";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import { trackViewContent } from "@/lib/meta-pixel";

interface DetailEntry {
  label: string;
  value: string;
}

interface ProductDetailProps {
  product: WooProduct;
  details: DetailEntry[];
  descriptionHtml: string;
  related: WooProduct[];
  badge: { label: string; className: string };
  /** Full raw description including info-grids (for re-parsing after translation) */
  rawDescription: string;
}

/* ── Parsing helpers (same as server-side) ── */

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
      if (label && value) entries.push({ label, value });
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

/* ── Translate helper ── */

async function translateText(text: string, label?: string): Promise<string> {
  if (!text.trim()) return text;
  console.log(`[Translation] Translating ${label || "text"}, length: ${text.length}`);
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang: "en" }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[Translation] ${label || "text"} translated, result length: ${data.translated?.length || 0}`);
      return data.translated || text;
    }
    console.log(`[Translation] ${label || "text"} API returned non-ok:`, res.status);
  } catch (e) {
    console.error(`[Translation] ${label || "text"} error:`, e);
  }
  return text;
}

export default function ProductDetail({
  product,
  details: originalDetails,
  descriptionHtml: originalDescHtml,
  related,
  badge,
  rawDescription,
}: ProductDetailProps) {
  const { language } = useLanguage();
  const t = createT(language);
  const isOutOfStock = product.stock_status === "outofstock";

  const [translatedName, setTranslatedName] = useState(product.name);
  const [translatedRawDesc, setTranslatedRawDesc] = useState(rawDescription);
  const [translatedShort, setTranslatedShort] = useState(
    product.short_description
  );

  // Re-parse details and stripped description from (possibly translated) raw HTML
  const activeDetails = useMemo(
    () => parseDetails(translatedRawDesc),
    [translatedRawDesc]
  );
  const activeDescHtml = useMemo(
    () => stripInfoGrids(translatedRawDesc),
    [translatedRawDesc]
  );

  const badgeLabelKey =
    badge.label === "AUSVERKAUFT"
      ? "AUSVERKAUFT"
      : badge.label === "VORVERKAUF"
        ? "VORVERKAUF"
        : badge.label === "AUF LAGER"
          ? "AUF_LAGER"
          : "";
  const translatedBadge = badgeLabelKey ? t(badgeLabelKey) : badge.label;

  useEffect(() => {
    console.log("[ProductDetail] language changed to:", language);
    console.log("[ProductDetail] rawDescription length:", rawDescription?.length);
    console.log("[ProductDetail] product.name:", product.name);

    if (language === "de") {
      console.log("[ProductDetail] Resetting to German originals");
      setTranslatedName(product.name);
      setTranslatedRawDesc(rawDescription);
      setTranslatedShort(product.short_description);
      return;
    }

    // Translate to English
    console.log("[ProductDetail] Starting EN translations...");

    console.log("[ProductDetail] Calling translateText for name...");
    translateText(product.name, "product name").then((result) => {
      console.log("[ProductDetail] Name translated:", result);
      setTranslatedName(result);
    });

    const rawTextContent = rawDescription?.replace(/<[^>]*>/g, "").trim();
    console.log("[ProductDetail] Raw description text content length:", rawTextContent?.length);

    if (rawTextContent) {
      console.log("[ProductDetail] Calling translateText for raw description...");
      translateText(rawDescription, "raw description").then((result) => {
        console.log("[ProductDetail] Raw description translated, result length:", result.length);
        setTranslatedRawDesc(result);
      });
    } else {
      console.log("[ProductDetail] Skipping description translation — no text content");
    }

    if (product.short_description) {
      console.log("[ProductDetail] Calling translateText for short description...");
      translateText(product.short_description, "short description").then((result) => {
        console.log("[ProductDetail] Short description translated");
        setTranslatedShort(result);
      });
    }
  }, [language, product.name, rawDescription, product.short_description]);

  useEffect(() => {
    trackViewContent(
      product.id.toString(),
      product.name,
      parsePrice(product.price || "0")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        {/* Left — Image Gallery */}
        <ProductGallery images={product.images} />

        {/* Right — Product Info */}
        <div>
          <h1 className="text-2xl font-black tracking-[0.1em] text-white sm:text-3xl">
            {translatedName.toUpperCase()}
          </h1>

          {/* Price */}
          <div className="mt-4">
            {product.on_sale && product.sale_price ? (
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-white/30 line-through">
                  {formatPrice(parsePrice(product.regular_price))}
                </span>
                <span className="text-3xl font-black text-[#c0392b]">
                  {formatPrice(parsePrice(product.sale_price))}
                </span>
              </div>
            ) : (
              <span className="text-3xl font-black text-[#c0392b]">
                {formatPrice(parsePrice(product.price))}
              </span>
            )}
          </div>

          {/* Stock badge */}
          <div className="mt-4">
            <span
              className={`inline-block px-4 py-1.5 text-[11px] font-bold tracking-[0.2em] ${badge.className}`}
            >
              {translatedBadge}
            </span>
          </div>

          {/* Short description */}
          {translatedShort && (
            <div
              className="mt-6 text-sm leading-relaxed text-white/60"
              dangerouslySetInnerHTML={{ __html: translatedShort }}
            />
          )}

          {/* Add to cart */}
          <div className="mt-8">
            <AddToCartButton disabled={isOutOfStock} product={product} />
          </div>

          {/* Film details — re-parsed from translated HTML */}
          {activeDetails.length > 0 && (
            <div className="mt-8 border-t border-[#222] pt-6">
              <h3 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
                {t("DETAILS")}
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                {activeDetails.map((d, i) => (
                  <div key={i}>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#888]">
                      {translateDetailLabel(d.label, language)}
                    </dt>
                    <dd className="mt-0.5 text-sm text-white">{d.value}</dd>
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
                  <dt className="font-bold tracking-wider text-white/60">
                    {t("KATEGORIE")}
                  </dt>
                  <dd>
                    {product.categories.map((c) => c.name).join(", ")}
                  </dd>
                </div>
              )}
              {product.sku && (
                <div className="flex gap-2">
                  <dt className="font-bold tracking-wider text-white/60">
                    SKU:
                  </dt>
                  <dd>{product.sku}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Product description — stripped of info-grids */}
      {activeDescHtml.replace(/<[^>]*>/g, "").trim() && (
        <section className="mt-16 border-t border-[#222] pt-10">
          <h2 className="border-l-4 border-[#c0392b] pl-4 text-xl font-black tracking-[0.15em] text-white sm:text-2xl">
            {t("BESCHREIBUNG")}
          </h2>
          <div
            className="product-description mt-6 text-sm leading-relaxed text-white/70"
            dangerouslySetInnerHTML={{ __html: activeDescHtml }}
          />
        </section>
      )}

      {/* Related products */}
      {related.length > 0 && (
        <section className="mt-16 border-t border-[#222] pt-10">
          <h2 className="border-l-4 border-[#c0392b] pl-4 text-xl font-black tracking-[0.15em] text-white sm:text-2xl">
            {t("AEHNLICHE_PRODUKTE")}
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {related.map((rp) => {
              const rpImage = rp.images[0]?.src;
              const rpOutOfStock = rp.stock_status === "outofstock";
              return (
                <Link
                  key={rp.id}
                  href={`/shop/${rp.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-square overflow-hidden bg-[#111] transition-shadow duration-300 group-hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]">
                    {rpImage ? (
                      <img
                        src={rpImage}
                        alt={rp.name}
                        className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                          rpOutOfStock ? "opacity-50" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/20">
                        NO IMAGE
                      </div>
                    )}
                    {rpOutOfStock && (
                      <span className="absolute top-3 left-3 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-wider text-white/50">
                        {t("AUSVERKAUFT")}
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white/90">
                      {rp.name}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-[#c0392b]">
                      {rp.on_sale && rp.sale_price ? (
                        <>
                          <span className="mr-2 text-white/30 line-through">
                            {formatPrice(parsePrice(rp.regular_price))}
                          </span>
                          {formatPrice(parsePrice(rp.sale_price))}
                        </>
                      ) : (
                        <>{formatPrice(parsePrice(rp.price))}</>
                      )}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
