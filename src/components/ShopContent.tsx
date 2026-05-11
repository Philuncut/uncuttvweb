"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { WooProduct, WooCategory } from "@/lib/types";
import SearchInput from "@/components/SearchInput";
import MobileBanner from "@/components/MobileBanner";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, translateCategoryName } from "@/lib/translations";

/* ── FilterPill ── */
const pillGlow =
  "0 0 8px rgba(192,57,43,0.8), 0 0 20px rgba(192,57,43,0.4)";
const pillActiveGlow =
  "0 0 12px rgba(192,57,43,0.6), 0 0 30px rgba(192,57,43,0.3)";

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  const style: React.CSSProperties = active
    ? {
        background: "#c0392b",
        border: "1px solid #c0392b",
        color: "#fff",
        letterSpacing: "0.2em",
        boxShadow: pillActiveGlow,
        transition: "all 0.3s ease",
      }
    : {
        background: "transparent",
        border: `1px solid ${hovered ? "#c0392b" : "#333"}`,
        color: hovered ? "#fff" : "#888",
        letterSpacing: hovered ? "0.25em" : "0.15em",
        textShadow: hovered ? pillGlow : "none",
        boxShadow: "none",
        transition: "all 0.3s ease",
      };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="shrink-0 cursor-pointer px-5 text-xs font-bold uppercase"
      style={{ height: 36, ...style }}
    >
      {children}
    </button>
  );
}

/* ── Constants ── */
const VORVERKAUF_SLUG = "vorverkauf";
const BRANDNEU_SLUG = "brandneu";
const INSTOCK_SLUG = "instock";
const OOP_SLUG = "outofprint";

/* ── Helpers ── */
function sortProducts(products: WooProduct[]): WooProduct[] {
  return [...products].sort((a, b) => {
    if (a.stock_status === "instock" && b.stock_status !== "instock") return -1;
    if (a.stock_status !== "instock" && b.stock_status === "instock") return 1;
    return 0;
  });
}

function getBadge(product: WooProduct): string | null {
  if (product.stock_status === "outofstock") return "AUSVERKAUFT";
  if (product.categories.some((c) => c.slug.includes("vorverkauf")))
    return "VORVERKAUF";
  return null;
}

function hasCatSlug(product: WooProduct, slug: string): boolean {
  return product.categories.some((c) => c.slug === slug);
}

/* ── ProductCard ── */
function ProductCard({
  product,
  muted,
}: {
  product: WooProduct;
  muted?: boolean;
}) {
  const badge = muted ? "AUSVERKAUFT" : getBadge(product);
  const image = product.images[0]?.src;

  return (
    <Link href={`/shop/${product.slug}`} className="group block">
      <div
        className={`relative aspect-square overflow-hidden bg-[#111] transition-shadow duration-300 group-hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] ${
          muted ? "grayscale opacity-60" : ""
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              !muted && product.stock_status === "outofstock" ? "opacity-50" : ""
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            NO IMAGE
          </div>
        )}
        {badge && (
          <span
            className={`absolute top-3 left-3 px-3 py-1 text-[10px] font-bold tracking-wider ${
              badge === "AUSVERKAUFT"
                ? "bg-white/10 text-white/50"
                : "bg-[#c0392b] text-white"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="mt-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white/90">
          {product.name}
        </h3>
        <p className="mt-1 text-sm font-bold text-[#c0392b]">
          {product.sale_price ? (
            <>
              <span className="mr-2 text-white/30 line-through">
                €{product.regular_price}
              </span>
              €{product.sale_price}
            </>
          ) : (
            <>€{product.price}</>
          )}
        </p>
      </div>
    </Link>
  );
}

/* ── SectionTitle ── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-l-4 border-[#c0392b] pl-4 text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
      {children}
    </h2>
  );
}

/* ── ExpandableSection ── */
function ExpandableSection({
  title,
  products,
  defaultRows,
  muted,
  id,
}: {
  title: string;
  products: WooProduct[];
  defaultRows: number;
  muted?: boolean;
  id?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const t = createT(language);
  const [contentHeight, setContentHeight] = useState<number | undefined>(
    undefined
  );

  // cols: 2 on mobile, 4 on lg+
  const colsDesktop = 4;
  const colsMobile = 2;
  const defaultCountDesktop = defaultRows * colsDesktop;
  const defaultCountMobile = defaultRows * colsMobile;
  // Use the larger count so all cards render in DOM; CSS grid handles visible rows
  const defaultCount = Math.max(defaultCountDesktop, defaultCountMobile);

  const visibleProducts = expanded ? products : products.slice(0, defaultCount);
  const canExpand = products.length > defaultCount;

  const measureHeight = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, []);

  useEffect(() => {
    measureHeight();
  }, [expanded, measureHeight]);

  // Remeasure on resize
  useEffect(() => {
    window.addEventListener("resize", measureHeight);
    return () => window.removeEventListener("resize", measureHeight);
  }, [measureHeight]);

  if (products.length === 0) return null;

  return (
    <section id={id}>
      <SectionTitle>{title}</SectionTitle>
      <div
        style={{
          height: contentHeight !== undefined ? contentHeight : "auto",
          transition: "height 0.4s ease",
          overflow: "hidden",
        }}
      >
        <div ref={contentRef}>
          <div className="mt-6 grid grid-cols-2 gap-4 px-3 sm:gap-6 sm:px-5 lg:grid-cols-4 lg:px-6">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} muted={muted} />
            ))}
          </div>
        </div>
      </div>

      {canExpand && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="cursor-pointer border border-[#c0392b] bg-transparent px-8 py-3 text-xs font-bold tracking-wider text-[#c0392b] transition-colors duration-200 hover:bg-[#c0392b] hover:text-white"
          >
            {expanded ? t("WENIGER_ANZEIGEN") : t("MEHR_ANSEHEN")}
          </button>
        </div>
      )}
    </section>
  );
}

/* ── ShopContent ── */
interface ShopContentProps {
  products: WooProduct[];
  categories: WooCategory[];
}

export default function ShopContent({
  products,
  categories,
}: ShopContentProps) {
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [flatVisible, setFlatVisible] = useState(8);
  const { language } = useLanguage();
  const t = createT(language);

  // Read ?kategorie= from URL on mount and pre-select the matching filter
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("kategorie");
    if (!slug) return;
    const match = categories.find(
      (c) =>
        c.slug === slug ||
        c.slug === slug.replace(/-/g, "") ||
        c.name.toLowerCase() === slug.replace(/-/g, " ")
    );
    if (match) {
      setActiveCategory(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vorverkauf = useMemo(
    () => sortProducts(products.filter((p) => hasCatSlug(p, VORVERKAUF_SLUG))),
    [products]
  );

  const brandneu = useMemo(
    () => sortProducts(products.filter((p) => hasCatSlug(p, BRANDNEU_SLUG))),
    [products]
  );

  const inStock = useMemo(
    () =>
      sortProducts(
        products.filter(
          (p) => hasCatSlug(p, INSTOCK_SLUG) && !hasCatSlug(p, OOP_SLUG)
        )
      ),
    [products]
  );

  const filteredFlat = useMemo(() => {
    if (activeCategory === null) return null;
    return sortProducts(
      products.filter((p) =>
        p.categories.some((c) => c.id === activeCategory)
      )
    );
  }, [products, activeCategory]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return sortProducts(
      products.filter((p) => p.name.toLowerCase().includes(q))
    );
  }, [products, search]);

  const showFlat = searchResults !== null || filteredFlat !== null;
  const flatProducts = searchResults ?? filteredFlat ?? [];

  return (
    <>
      {/* Search */}
      <div className="border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <SearchInput value={search} onChange={setSearch} />
      </div>

      {/* Mobile banner — between search and category bar */}
      <MobileBanner />

      {/* Sticky category bar */}
      <div className="relative sticky top-[60px] z-30 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-sm">
        {/* Right fade to indicate scrollability */}
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-[#0a0a0a] to-transparent" />
        <div
          className="flex gap-2 overflow-x-scroll px-4 py-3 scrollbar-none sm:px-6"
          style={{ paddingRight: 48 }}
        >
          <FilterPill
            active={activeCategory === null}
            onClick={() => { setActiveCategory(null); setFlatVisible(8); }}
          >
            {t("ALLE")}
          </FilterPill>
          {(() => {
            const order = [
              "vorverkauf",
              "brandneu",
              "sale",
              "jetzt-erhaeltlich",
              "underground-collection",
              "outofprint",
            ];
            const matchKey = (cat: WooCategory) => {
              const slug = cat.slug.toLowerCase();
              const name = cat.name.toLowerCase();
              if (slug === "vorverkauf" || name === "vorverkauf") return "vorverkauf";
              if (slug === "brandneu" || name === "brandneu") return "brandneu";
              if (slug === "sale" || name === "im angebot und bundles") return "sale";
              if (slug === "jetzt-erhaeltlich" || slug === "instock" || name.startsWith("jetzt erh")) return "jetzt-erhaeltlich";
              if (slug === "underground-collection" || name === "underground collection") return "underground-collection";
              if (slug === "outofprint" || slug === "out-of-print" || name === "out of print") return "outofprint";
              return null;
            };
            return categories
              .map((cat) => ({ cat, key: matchKey(cat) }))
              .filter((entry): entry is { cat: WooCategory; key: string } => entry.key !== null)
              .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
              .map(({ cat }) => (
                <FilterPill
                  key={cat.id}
                  active={activeCategory === cat.id}
                  onClick={() => { setActiveCategory(cat.id); setFlatVisible(8); }}
                >
                  {translateCategoryName(cat.name, language).toUpperCase()}
                </FilterPill>
              ));
          })()}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {showFlat ? (
          <>
            <div className="mt-10 grid grid-cols-2 gap-4 px-3 sm:gap-6 sm:px-5 lg:grid-cols-4 lg:px-6">
              {flatProducts.slice(0, flatVisible).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {flatProducts.length > flatVisible && (
              <div className="flex flex-col items-center gap-2 py-8">
                <p className="text-[11px] text-white/30">
                  {flatVisible} von {flatProducts.length} Produkten
                </p>
                <button
                  type="button"
                  onClick={() => setFlatVisible((v) => v + 8)}
                  className="cursor-pointer border border-[#c0392b] bg-transparent px-8 py-3 text-xs font-bold tracking-wider text-[#c0392b] transition-colors duration-200 hover:bg-[#c0392b] hover:text-white"
                >
                  MEHR LADEN
                </button>
              </div>
            )}
            {flatProducts.length === 0 && (
              <p className="py-20 text-center text-sm text-white/30">
                {search ? t("KEINE_ERGEBNISSE") : t("KEINE_PRODUKTE")}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-16 py-10 pb-16">
            <ExpandableSection
              title={t("JETZT_VORBESTELLEN")}
              products={vorverkauf}
              defaultRows={1}
              id="vorbestellen"
            />
            <ExpandableSection
              title={t("NEU")}
              products={brandneu}
              defaultRows={1}
            />
            <ExpandableSection
              title={t("JETZT_ERHAELTLICH")}
              products={inStock}
              defaultRows={3}
            />
          </div>
        )}
      </main>
    </>
  );
}
