"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import type { WooProduct } from "@/lib/types";
import {
  FREE_SHIPPING_THRESHOLD_EUR,
  MIN_CART_FOR_SUGGESTION_EUR,
  SUGGESTION_COUNT,
  getProgressPercent,
  getRemainingAmount,
  shouldShowFreeShippingSuggestion,
} from "@/lib/free-shipping-suggestion";
import { ProductCardQuickAdd } from "@/components/ProductCardQuickAdd";

type SuccessPhase = "idle" | "success" | "gone";

export type FreeShippingTriggerProps = {
  variant: "drawer" | "checkout";
  /** Drawer: `"AT"` (MVP). Checkout: actual `country` from the form. */
  shippingCountry: string;
  isWholesale: boolean;
  /** Cart drawer: pass `drawerOpen`. Checkout: `true`. */
  observeActive: boolean;
};

function FillerRow({
  product,
  compact,
}: {
  product: WooProduct;
  compact: boolean;
}) {
  const [flash, setFlash] = useState(false);
  const img = product.images[0]?.src;
  const price = parsePrice(product.price || product.regular_price || "0");

  const onFlash = useCallback(() => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 300);
  }, []);

  const showQuick = product.stock_status !== "outofstock";

  return (
    <div
      className={`group flex shrink-0 flex-col border border-[#2a2a2a] bg-[#0d0d0d] transition-shadow duration-300 ${
        flash ? "shadow-[0_0_16px_rgba(192,57,43,0.55)]" : ""
      } ${compact ? "w-[108px]" : "w-[132px]"}`}
    >
      <div
        data-quick-add-root
        className={`relative w-full overflow-hidden bg-[#151515] ${
          compact ? "aspect-square max-h-[72px]" : "aspect-square max-h-[88px]"
        }`}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-product-image
            src={img}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full min-h-[56px] items-center justify-center text-[9px] text-white/25">
            —
          </div>
        )}
        {showQuick && (
          <ProductCardQuickAdd
            variant="card"
            productForCart={product}
            onCardFlash={onFlash}
          />
        )}
      </div>
      <div className={`flex flex-1 flex-col gap-1.5 ${compact ? "p-1.5" : "p-2"}`}>
        <p
          className={`line-clamp-2 font-bold leading-tight text-white/90 ${
            compact ? "text-[9px]" : "text-[10px]"
          }`}
        >
          {product.name}
        </p>
        <p
          className={`font-black text-[#c0392b] ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          {formatPrice(price)}
        </p>
      </div>
    </div>
  );
}

export function FreeShippingTrigger({
  variant,
  shippingCountry,
  isWholesale,
  observeActive,
}: FreeShippingTriggerProps) {
  const { items, totalPrice } = useCart();
  const { language } = useLanguage();

  const eligible = useMemo(
    () =>
      shouldShowFreeShippingSuggestion(
        shippingCountry,
        totalPrice,
        isWholesale
      ),
    [shippingCountry, totalPrice, isWholesale]
  );

  const wasEligibleRef = useRef(false);
  useEffect(() => {
    if (eligible) wasEligibleRef.current = true;
  }, [eligible]);

  useEffect(() => {
    if (totalPrice < MIN_CART_FOR_SUGGESTION_EUR) {
      wasEligibleRef.current = false;
    }
  }, [totalPrice]);

  const [successPhase, setSuccessPhase] = useState<SuccessPhase>("idle");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (totalPrice < FREE_SHIPPING_THRESHOLD_EUR) {
      setSuccessPhase("idle");
      setLeaving(false);
    }
  }, [totalPrice]);

  useEffect(() => {
    if (successPhase !== "idle") return;
    if (!wasEligibleRef.current) return;
    if (totalPrice < FREE_SHIPPING_THRESHOLD_EUR) return;
    setSuccessPhase("success");
  }, [totalPrice, successPhase]);

  useEffect(() => {
    if (successPhase !== "success") return;
    setLeaving(false);
    const leavingT = window.setTimeout(() => setLeaving(true), 1500);
    const goneT = window.setTimeout(() => {
      setSuccessPhase("gone");
      setLeaving(false);
    }, 2000);
    return () => {
      window.clearTimeout(leavingT);
      window.clearTimeout(goneT);
    };
  }, [successPhase]);

  const [products, setProducts] = useState<WooProduct[]>([]);
  const [fetching, setFetching] = useState(false);
  const fetchedOnceRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [intersecting, setIntersecting] = useState(false);

  useEffect(() => {
    if (!observeActive) {
      fetchedOnceRef.current = false;
      setProducts([]);
      setFetching(false);
      setIntersecting(false);
    }
  }, [observeActive]);

  useEffect(() => {
    if (!eligible) {
      setProducts([]);
      fetchedOnceRef.current = false;
    }
  }, [eligible]);

  useEffect(() => {
    if (!observeActive || !eligible) return;
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        setIntersecting(on);
      },
      { threshold: 0.06, rootMargin: "24px 0px 0px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [observeActive, eligible, variant]);

  useEffect(() => {
    if (!intersecting || !eligible || fetchedOnceRef.current || fetching) return;
    fetchedOnceRef.current = true;
    const excludeIds = items.map((i) => i.product.id).join(",");
    setFetching(true);
    const q = excludeIds
      ? `?excludeIds=${encodeURIComponent(excludeIds)}`
      : "";
    fetch(`/api/free-shipping-fillers${q}`)
      .then((r) => r.json())
      .then((d: { products?: WooProduct[] }) =>
        setProducts(Array.isArray(d.products) ? d.products : [])
      )
      .catch(() => setProducts([]))
      .finally(() => setFetching(false));
  }, [intersecting, eligible, fetching, items]);

  const remaining = getRemainingAmount(totalPrice);
  const pct = getProgressPercent(totalPrice);

  const headline = useMemo(() => {
    if (remaining < 10) {
      return language === "de"
        ? `FAST GESCHAFFT — NUR NOCH ${formatPrice(remaining)}`
        : `ALMOST THERE — ONLY ${formatPrice(remaining)} LEFT`;
    }
    return language === "de"
      ? `NUR NOCH ${formatPrice(remaining)} ZU KOSTENLOSEM VERSAND`
      : `ONLY ${formatPrice(remaining)} TO FREE SHIPPING`;
  }, [remaining, language]);

  if (successPhase === "gone") return null;

  if (successPhase === "success") {
    return (
      <div
        className={`border border-[#c0392b]/50 bg-[#0a0a0a] transition-all duration-500 ease-out ${
          leaving ? "scale-95 opacity-0" : "scale-100 opacity-100"
        } ${variant === "drawer" ? "mt-4" : "mt-6"}`}
      >
        <p className="px-3 py-3 text-center text-xs font-bold tracking-[0.15em] text-[#c0392b]">
          {language === "de"
            ? "🎯 GRATIS-VERSAND ENTSPERRT"
            : "🎯 FREE SHIPPING UNLOCKED"}
        </p>
      </div>
    );
  }

  if (!eligible) return null;

  const compact = variant === "checkout";

  return (
    <div
      ref={rootRef}
      className={`border border-[#c0392b]/35 bg-[#0a0a0a] transition-all duration-500 ease-out ${
        variant === "drawer" ? "mt-4" : "mt-6"
      }`}
    >
      <div className="h-1.5 w-full bg-white/10">
        <div
          className="h-full bg-[#c0392b] transition-[width] duration-[600ms] ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="px-3 py-2.5 text-center text-sm font-bold tracking-[0.15em] text-white">
        {headline}
      </p>

      {(fetching || products.length > 0) && (
        <div
          className={`flex flex-wrap gap-2 px-3 pb-3 ${
            compact ? "justify-center" : "justify-start"
          }`}
        >
          {fetching && products.length === 0
            ? Array.from({ length: SUGGESTION_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className={`animate-pulse rounded-none border border-[#222] bg-[#141414] ${
                    compact ? "h-[140px] w-[108px]" : "h-[168px] w-[132px]"
                  }`}
                />
              ))
            : products
                .slice(0, SUGGESTION_COUNT)
                .map((p) => (
                  <FillerRow key={p.id} product={p} compact={compact} />
                ))}
        </div>
      )}
    </div>
  );
}
