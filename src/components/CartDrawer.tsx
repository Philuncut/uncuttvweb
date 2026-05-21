"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/CartContext";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import { parsePrice } from "@/lib/parse-price";
import { formatPrice } from "@/lib/format-price";
import { FreeShippingTrigger } from "@/components/FreeShippingTrigger";
import PreOrderMixedShippingBanner from "@/components/PreOrderMixedShippingBanner";
import {
  cartHasMixedPreOrder,
  cartItemsFingerprint,
} from "@/lib/cart-preorder-mixed";

interface CouponState {
  code: string;
  couponId: string;
  name: string;
  displayLabel: string;
  percent_off: number | null;
  amount_off: string | null;
}

export default function CartDrawer() {
  const pathname = usePathname();
  const [dealerCookie, setDealerCookie] = useState(false);
  const [isWholesale, setIsWholesale] = useState(false);

  useEffect(() => {
    setDealerCookie(/(?:^|;\s*)haendler_token=/.test(document.cookie));
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          isNewsletterSubscribed?: boolean;
          isWholesale?: boolean;
        };
        if (!cancelled) {
          setIsNewsletterSubscribed(data.isNewsletterSubscribed === true);
          setIsWholesale(data.isWholesale === true);
        }
      } catch {
        /* guest or offline */
      }
    })();
    const onSessionChanged = () => {
      void (async () => {
        try {
          const res = await fetch("/api/auth/session", { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as {
            isNewsletterSubscribed?: boolean;
            isWholesale?: boolean;
          };
          setIsNewsletterSubscribed(data.isNewsletterSubscribed === true);
          setIsWholesale(data.isWholesale === true);
        } catch {
          /* ignore */
        }
      })();
    };
    window.addEventListener("uncuttv:session-changed", onSessionChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("uncuttv:session-changed", onSessionChanged);
    };
  }, []);

  const {
    items,
    removeFromCart,
    updateQuantity,
    totalPrice,
    drawerOpen,
    closeDrawer,
  } = useCart();

  const isB2B =
    (pathname ?? "").startsWith("/haendler") || dealerCookie || isWholesale;

  const showPreOrderMixedBanner = useMemo(
    () => !isB2B && cartHasMixedPreOrder(items),
    [isB2B, items]
  );

  const [preOrderBannerDismissed, setPreOrderBannerDismissed] = useState(false);
  const cartFingerprint = useMemo(
    () => cartItemsFingerprint(items),
    [items]
  );

  useEffect(() => {
    setPreOrderBannerDismissed(false);
  }, [cartFingerprint]);

  const { language } = useLanguage();
  const t = createT(language);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [isNewsletterSubscribed, setIsNewsletterSubscribed] = useState(false);

  useEffect(() => {
    if (!isB2B) return;
    setCoupon(null);
    setCouponInput("");
    setCouponError("");
    setNewsletter(false);
    setNewsletterEmail("");
  }, [isB2B]);

  const validateCoupon = useCallback(async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    setCoupon(null);

    try {
      const res = await fetch("/api/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponInput.trim(),
          cartTotal: Math.round(totalPrice * 100),
          cartItems: items.map((item) => ({
            product_id: Number(item.product.id),
            quantity: Math.max(1, item.quantity),
            price_cents: Math.round(parsePrice(item.product.price) * 100),
          })),
        }),
      });
      const data = await res.json();
      if (data.valid) {
        const display =
          data.displayLabel ??
          (data.percent_off
            ? `−${data.percent_off}%`
            : data.amount_off
              ? `−${data.amount_off}`
              : "");
        setCoupon({
          code: data.couponCode ?? couponInput.trim().toLowerCase(),
          couponId: String(data.couponId),
          name: data.name,
          displayLabel: display,
          percent_off: data.percent_off ?? null,
          amount_off: data.amount_off ?? null,
        });
        setCouponInput("");
      } else {
        setCouponError(data.error || "Ungültiger Code.");
      }
    } catch {
      setCouponError("Fehler bei der Überprüfung.");
    } finally {
      setCouponLoading(false);
    }
  }, [couponInput, items, totalPrice]);

  const handleCheckout = useCallback(async () => {
    let couponCode = "";

    // Subscribe to newsletter if checked and email provided (B2C only)
    if (
      !isB2B &&
      newsletter &&
      newsletterEmail.trim() &&
      newsletterEmail.includes("@")
    ) {
      try {
        const res = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: newsletterEmail.trim() }),
        });
        const data = await res.json();
        if (data.success) couponCode = "WELCOME10";
      } catch {
        // Non-blocking — don't prevent checkout
      }
    }

    const drawerCoupon = coupon?.code?.trim();
    if (drawerCoupon) {
      couponCode = drawerCoupon;
    }

    closeDrawer();
    window.location.href = couponCode
      ? `/checkout?coupon=${encodeURIComponent(couponCode)}`
      : "/checkout";
  }, [closeDrawer, isB2B, newsletter, newsletterEmail, coupon]);

  const discountDisplay = coupon
    ? coupon.displayLabel ||
      (coupon.percent_off
        ? `−${coupon.percent_off}%`
        : coupon.amount_off
          ? `−${coupon.amount_off}`
          : "")
    : "";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/70 transition-opacity duration-300 ${
          drawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={closeDrawer}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-[#111] transition-transform duration-300 ease-in-out sm:w-[420px] ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222] px-6 py-4">
          <h2 className="text-lg font-black tracking-[0.15em] text-white">
            {t("WARENKORB")}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            className="cursor-pointer bg-transparent p-1 text-white/40 transition-colors hover:text-white"
            aria-label="Warenkorb schließen"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="square" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <p className="mt-20 text-center text-sm text-white/30">
              {t("WARENKORB_LEER")}
            </p>
          ) : (
            <>
              {showPreOrderMixedBanner && !preOrderBannerDismissed && (
                <PreOrderMixedShippingBanner
                  className="mb-4"
                  onDismiss={() => setPreOrderBannerDismissed(true)}
                />
              )}
              <div className="space-y-4">
              {items.map(({ product, quantity }) => {
                const image = product.images[0]?.src;
                const price = parsePrice(product.price || "0");
                const subtotal = formatPrice(price * quantity);

                return (
                  <div
                    key={product.id}
                    className="flex gap-4 border-b border-[#222] pb-4"
                  >
                    {/* Thumbnail */}
                    <div className="h-[60px] w-[60px] shrink-0 overflow-hidden bg-[#1a1a1a]">
                      {image ? (
                        <img
                          src={image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/20">
                          —
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-xs font-bold leading-tight text-white/90">
                          {product.name}
                        </h3>
                        <button
                          type="button"
                          onClick={() => removeFromCart(product.id)}
                          className="shrink-0 cursor-pointer bg-transparent p-0.5 text-white/30 transition-colors hover:text-[#c0392b]"
                          aria-label="Entfernen"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="square"
                              d="M18 6L6 18M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center border border-[#333]">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(product.id, quantity - 1)
                            }
                            disabled={quantity <= 1}
                            className="cursor-pointer bg-transparent px-2 py-1 text-xs text-white/60 transition-colors hover:text-white disabled:cursor-default disabled:text-white/20"
                          >
                            −
                          </button>
                          <span className="min-w-[28px] px-1 text-center text-xs font-bold text-white">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(product.id, quantity + 1)
                            }
                            className="cursor-pointer bg-transparent px-2 py-1 text-xs text-white/60 transition-colors hover:text-white"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm font-bold text-[#c0392b]">
                          {subtotal}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!isB2B && (
              <FreeShippingTrigger
                variant="drawer"
                shippingCountry="AT"
                isWholesale={false}
                observeActive={drawerOpen}
              />
            )}
            </>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-[#222] px-6 py-5">
            {!isB2B && (
              <div className="mb-4 coupon-input">
                {coupon ? (
                  <div className="flex items-center justify-between bg-[#0a0a0a] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-wider text-green-400">
                        {coupon.name}
                      </span>
                      <span className="text-xs text-green-400/70">
                        {discountDisplay}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCoupon(null)}
                      className="cursor-pointer bg-transparent text-xs text-white/30 hover:text-white/60"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && validateCoupon()}
                      placeholder={t("GUTSCHEIN_PLACEHOLDER")}
                      className="flex-1 border border-[#333] bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#c0392b]"
                    />
                    <button
                      type="button"
                      onClick={validateCoupon}
                      disabled={couponLoading}
                      className="shrink-0 cursor-pointer border border-[#c0392b] bg-transparent px-4 py-2 text-[10px] font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white disabled:opacity-50"
                    >
                      {couponLoading ? "..." : t("EINLOESEN")}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="mt-1 text-[10px] text-[#c0392b]">
                    {couponError}
                  </p>
                )}
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold tracking-wider text-white/60">
                {t("GESAMT")}
              </span>
              <span className="text-2xl font-black text-white">
                {formatPrice(totalPrice)}
              </span>
            </div>

            {!isB2B && !isNewsletterSubscribed && (
              <div className="mt-4 border border-[#222] bg-[#0a0a0a] p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <span
                    onClick={() => setNewsletter((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                      height: 18,
                      marginTop: 1,
                      flexShrink: 0,
                      border: newsletter ? "1px solid #c0392b" : "1px solid #555",
                      background: newsletter ? "#c0392b" : "transparent",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {newsletter && (
                      <svg style={{ width: 12, height: 12, color: "white" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="square" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-xs leading-relaxed text-white/70">
                    <span className="font-bold text-[#c0392b]">10% sparen</span>
                    {" "}— Newsletter abonnieren &amp; Rabattcode erhalten
                  </span>
                </label>
                {newsletter && (
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="deine@email.com"
                    className="mt-3 w-full border border-[#333] bg-[#111] px-3 py-2.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#c0392b]"
                  />
                )}
              </div>
            )}

            {/* Checkout */}
            <button
              type="button"
              onClick={handleCheckout}
              className="mt-4 w-full cursor-pointer bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
            >
              {t("ZUR_KASSE")}
            </button>

            {/* Continue shopping */}
            <button
              type="button"
              onClick={closeDrawer}
              className="mt-3 w-full cursor-pointer bg-transparent py-2 text-xs tracking-wider text-white/40 transition-colors hover:text-white/70"
            >
              {t("WEITER_EINKAUFEN")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
