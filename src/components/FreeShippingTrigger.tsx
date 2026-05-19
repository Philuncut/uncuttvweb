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
import {
  clearCartFillerSessionIds,
  isSaleFillerCandidate,
  readCartFillerSessionIds,
  unitGrossPrice,
  writeCartFillerSessionIds,
} from "@/lib/cart-filler-pools";

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
  const onSale = isSaleFillerCandidate(product);
  const displayPrice = unitGrossPrice(product);
  const regularPrice = parsePrice(product.regular_price || product.price || "0");

  const onFlash = useCallback(() => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 300);
  }, []);

  const showQuick = product.stock_status !== "outofstock";

  return (
    <div
      className={`group flex w-full min-w-0 flex-col border border-[#2a2a2a] bg-[#0d0d0d] transition-shadow duration-300 ${
        flash ? "shadow-[0_0_16px_rgba(192,57,43,0.55)]" : ""
      }`}
    >
      <div
        data-quick-add-root
        className={`relative aspect-square w-full overflow-hidden bg-[#151515] ${
          compact ? "max-h-[72px]" : "max-h-[88px]"
        }`}
      >
        {onSale && (
          <span className="absolute top-1 left-1 z-10 bg-[#c0392b] px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-white">
            SALE
          </span>
        )}
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
          {onSale && product.sale_price && regularPrice > displayPrice ? (
            <>
              <span className="mr-1 text-white/30 line-through">
                {formatPrice(regularPrice)}
              </span>
              {formatPrice(displayPrice)}
            </>
          ) : (
            formatPrice(displayPrice)
          )}
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [intersecting, setIntersecting] = useState(false);

  const excludeIdsKey = useMemo(
    () => items.map((i) => i.product.id).sort((a, b) => a - b).join(","),
    [items]
  );

  useEffect(() => {
    if (!observeActive) {
      setIntersecting(false);
    }
  }, [observeActive]);

  useEffect(() => {
    if (!eligible) {
      setProducts([]);
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
    if (!intersecting || !eligible) return;

    let cancelled = false;

    async function loadFillers() {
      setFetching(true);
      const params = new URLSearchParams();
      if (excludeIdsKey) {
        params.set("excludeIds", excludeIdsKey);
      }

      const cachedIds = readCartFillerSessionIds();

      const fetchByIds = async (ids: number[]) => {
        params.set("ids", ids.join(","));
        const res = await fetch(
          `/api/free-shipping-fillers?${params.toString()}`
        );
        const data = (await res.json()) as { products?: WooProduct[] };
        return Array.isArray(data.products) ? data.products : [];
      };

      const fetchPick = async () => {
        params.set("pick", "1");
        const res = await fetch(
          `/api/free-shipping-fillers?${params.toString()}`
        );
        const data = (await res.json()) as { products?: WooProduct[] };
        return Array.isArray(data.products) ? data.products : [];
      };

      try {
        let next: WooProduct[] = [];

        if (cachedIds?.length) {
          next = await fetchByIds(cachedIds);
          if (next.length === 0) {
            clearCartFillerSessionIds();
            next = await fetchPick();
            if (next.length > 0) {
              writeCartFillerSessionIds(next.map((p) => p.id));
            }
          }
        } else {
          next = await fetchPick();
          if (next.length > 0) {
            writeCartFillerSessionIds(next.map((p) => p.id));
          }
        }

        if (!cancelled) {
          setProducts(next);
        }
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setFetching(false);
      }
    }

    void loadFillers();
    return () => {
      cancelled = true;
    };
  }, [intersecting, eligible, excludeIdsKey]);

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
        <div className="grid grid-cols-2 gap-3 px-3 pb-3">
          {fetching && products.length === 0
            ? Array.from({ length: SUGGESTION_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className={`animate-pulse border border-[#222] bg-[#141414] ${
                    compact ? "h-[140px]" : "h-[168px]"
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
