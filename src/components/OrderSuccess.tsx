"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/lib/CartContext";
import Link from "next/link";
import {
  clearCheckoutPiSynced,
  consumeCheckoutSyncPayload,
  readCheckoutSyncPayload,
  wasCheckoutPiSynced,
} from "@/lib/checkout-order-extras";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import { getShippingLogo } from "@/components/ShippingLogos";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, formatTranslation, getTranslation } from "@/lib/translations";
import { clearVideoUtmStorage } from "@/lib/video-utm";
import { trackPurchase } from "@/lib/meta-pixel";

interface OrderLineItem {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
}

interface OrderDetails {
  customerName: string;
  customerEmail: string;
  total: string;
  currency: string;
  items: Array<{ description: string; quantity: number; amount: number }>;
  /** Versand in Cent (Stripe PI-Metadaten, Checkout-Session total_details, oder SessionStorage-Fallback). */
  shippingCents?: number;
  isWholesaleShipping?: boolean;
  shippingMethodTitle?: string;
  /** ISO2 aus PI-Metadaten / SessionStorage für Versand-Logo-Mapping. */
  shippingCountry?: string;
  line_items?: OrderLineItem[];
}

export default function OrderSuccess() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");
  const redirectStatus = searchParams.get("redirect_status");
  const method = searchParams.get("method");
  const bankOrder = searchParams.get("order");

  const { clearCart } = useCart();
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isWholesaleBank, setIsWholesaleBank] = useState(false);
  const syncedRef = useRef(false);

  const bankPaymentText = isWholesaleBank
    ? t("BANK_TEXT_WHOLESALE")
    : t("BANK_TEXT_B2C");

  const bankThanksText = formatTranslation("ORDER_SUCCESS_BANK_THANKS", language, {
    order: bankOrder ? ` #${bankOrder}` : "",
  });

  const hasPayment = !!(
    sessionId ||
    paymentIntentId ||
    method === "bank" ||
    method === "paypal"
  );

  useEffect(() => {
    if (!hasPayment || syncedRef.current) return;
    syncedRef.current = true;

    // Handle failed redirect
    if (redirectStatus === "failed") {
      setError(getTranslation("ORDER_SUCCESS_PAYMENT_FAILED_BODY", language));
      setLoading(false);
      return;
    }

    // Handle processing redirect
    if (redirectStatus === "processing") {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        // Bank transfer — no Stripe details to fetch
        if (method === "bank") {
          clearCart();
          clearVideoUtmStorage();
          let wholesale = searchParams.get("wholesale") === "1";
          if (!wholesale) {
            try {
              const sessionRes = await fetch("/api/auth/session", {
                cache: "no-store",
              });
              if (sessionRes.ok) {
                const s = await sessionRes.json();
                wholesale = s.isWholesale === true;
              }
            } catch {
              // keep B2C default
            }
          }
          setIsWholesaleBank(wholesale);
          setLoading(false);
          return;
        }

        // Fetch order details for either flow
        const param = sessionId
          ? `session_id=${sessionId}`
          : `payment_intent=${paymentIntentId}`;

        const res = await fetch(`/api/order-details?${param}`);
        if (res.ok) {
          const data = (await res.json()) as OrderDetails;
          trackPurchase(
            sessionId ?? paymentIntentId ?? `order-${Date.now()}`,
            parsePrice(data.total),
            data.line_items?.map((i) => i.product_id) ?? []
          );
          let merged = data;
          const stored = paymentIntentId
            ? readCheckoutSyncPayload(paymentIntentId)
            : null;
          if (
            paymentIntentId &&
            (!merged.shippingCents || merged.shippingCents <= 0)
          ) {
            const rate = stored?.checkoutShipping?.rate;
            if (typeof rate === "number" && rate > 0 && !Number.isNaN(rate)) {
              merged = {
                ...merged,
                shippingCents: Math.round(rate * 100),
                isWholesaleShipping: stored?.isWholesale === true,
              };
            }
          }
          if (paymentIntentId && stored) {
            if (
              !merged.shippingMethodTitle?.trim() &&
              stored.checkoutShipping?.label
            ) {
              merged = {
                ...merged,
                shippingMethodTitle: stored.checkoutShipping.label,
              };
            }
            if (!merged.shippingCountry?.trim() && stored.country?.trim()) {
              merged = {
                ...merged,
                shippingCountry: stored.country.trim().toUpperCase(),
              };
            }
          }
          setOrder(merged);
        } else if (paymentIntentId?.startsWith("paypal_")) {
          const errBody = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          if (errBody.message) {
            setError(errBody.message);
          }
        }

        // Sync order to WooCommerce
        if (sessionId) {
          await fetch("/api/sync-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
        }
        // PaymentIntent flow: sync was already done in CheckoutForm before redirect
        // but for Klarna/EPS redirects, we need to sync here too
        if (
          paymentIntentId &&
          !sessionId &&
          !paymentIntentId.startsWith("paypal_")
        ) {
          if (wasCheckoutPiSynced(paymentIntentId)) {
            clearCheckoutPiSynced(paymentIntentId);
          } else {
            const stored = consumeCheckoutSyncPayload(paymentIntentId);
            const pi = await fetch(
              `/api/order-details?payment_intent=${paymentIntentId}`
            );
            if (pi.ok) {
              const piData = await pi.json();
              const customer = stored
                ? {
                    email: stored.email,
                    firstName: stored.firstName,
                    lastName: stored.lastName,
                    street: stored.street,
                    zip: stored.zip,
                    city: stored.city,
                    country: stored.country,
                    ...(stored.state?.trim()
                      ? { state: stored.state.trim() }
                      : {}),
                  }
                : {
                    email: piData.customerEmail || "",
                    firstName: piData.customerName?.split(" ")[0] || "",
                    lastName:
                      piData.customerName?.split(" ").slice(1).join(" ") || "",
                    street: "",
                    zip: "",
                    city: "",
                    country: "",
                  };
              await fetch("/api/sync-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  paymentIntentId,
                  customer,
                  items:
                    piData.items?.map(
                      (i: {
                        description: string;
                        quantity: number;
                        amount: number;
                      }) => ({
                        id: 0,
                        name: i.description,
                        qty: i.quantity,
                        price: (i.amount / 100 / i.quantity).toFixed(2),
                      })
                    ) || [],
                  ...(stored?.billing ? { billing: stored.billing } : {}),
                  ...(stored?.meta_data
                    ? { meta_data: stored.meta_data }
                    : {}),
                  ...(stored?.checkoutShipping
                    ? { checkoutShipping: stored.checkoutShipping }
                    : {}),
                  ...(stored?.isReverseCharge
                    ? { isReverseCharge: true }
                    : {}),
                  ...(stored?.isWholesale ? { isWholesale: true } : {}),
                  ...(stored?.videoUtm ? { videoUtm: stored.videoUtm } : {}),
                }),
              });
            }
          }
        }

        clearCart();
        clearVideoUtmStorage();
      } catch {
        setError(getTranslation("ORDER_SUCCESS_LOAD_FAILED", language));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [
    hasPayment,
    sessionId,
    paymentIntentId,
    redirectStatus,
    method,
    clearCart,
    language,
    searchParams,
  ]);

  // No params at all
  if (!hasPayment) {
    return (
      <div className="text-center">
        <p className="text-white/50">{t("ORDER_SUCCESS_NONE")}</p>
        <Link
          href="/shop"
          className="mt-4 inline-block text-sm text-[#c0392b] hover:underline"
        >
          {t("ZURUECK_ZUM_SHOP")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-sm space-y-6">
        <div className="skeleton mx-auto h-20 w-20" />
        <div className="skeleton mx-auto h-8 w-64" />
        <div className="skeleton mx-auto h-4 w-48" />
        <div className="space-y-3 border border-[#222] bg-[#111] p-6">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-full" />
          <div className="border-t border-[#222] pt-3 mt-3">
            <div className="skeleton h-6 w-24 ml-auto" />
          </div>
        </div>
      </div>
    );
  }

  // Redirect status: processing
  if (redirectStatus === "processing") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center border-2 border-yellow-500">
          <svg
            className="h-10 w-10 text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="square"
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
          {t("ORDER_SUCCESS_PAYMENT_PROCESSING_TITLE")}
        </h1>
        <p className="mt-3 text-sm text-white/50">
          {t("ORDER_SUCCESS_PAYMENT_PROCESSING_BODY")}
        </p>
        <Link
          href="/shop"
          className="mt-8 inline-block bg-[#c0392b] px-8 py-3 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
        >
          {t("ORDER_SUCCESS_BACK_TO_SHOP")}
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center border-2 border-[#c0392b]">
          <svg
            className="h-10 w-10 text-[#c0392b]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="square" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
          {t("ORDER_SUCCESS_PAYMENT_FAILED_TITLE")}
        </h1>
        <p className="mt-3 text-sm text-[#c0392b]">{error}</p>
        <Link
          href="/checkout"
          className="mt-8 inline-block bg-[#c0392b] px-8 py-3 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
        >
          {t("ORDER_SUCCESS_RETRY")}
        </Link>
      </div>
    );
  }

  // Bank transfer success
  if (method === "bank") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center border-2 border-green-500">
          <svg
            className="h-10 w-10 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="square"
              strokeLinejoin="miter"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
          {t("ORDER_SUCCESS_BANK_TITLE")}
        </h1>
        <p className="mt-3 text-sm text-white/50">
          {bankThanksText} {bankPaymentText}
        </p>
        <div className="mt-4 border border-[#222] bg-[#111] p-4 text-left text-sm text-white/70">
          <p className="font-bold text-white">UncutTV GmbH</p>
          <p>Raiffeisen Landesbank Tirol AG</p>
          <p>IBAN: AT52 3600 0000 0083 4978</p>
          <p>BIC: RZTIAT22</p>
        </div>
        {isWholesaleBank && (
          <p
            style={{
              fontSize: "12px",
              color: "#888",
              marginTop: "12px",
              lineHeight: "1.5",
            }}
          >
            {t("BANK_HINT_WHOLESALE")}
          </p>
        )}
        <Link
          href="/shop"
          className="mt-8 inline-block bg-[#c0392b] px-8 py-3 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
        >
          {t("WEITER_EINKAUFEN")}
        </Link>
      </div>
    );
  }

  // Standard success (card, Klarna, EPS, PayPal, Checkout Session)
  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center border-2 border-green-500">
        <svg
          className="h-10 w-10 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="square"
            strokeLinejoin="miter"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h1 className="mt-6 text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
        {t("ORDER_SUCCESS_TITLE")}
      </h1>

      <p className="mt-3 text-sm text-white/50">
        {t("ORDER_SUCCESS_PAID_THANKS")}
        {order?.customerEmail && (
          <>
            {" "}
            {t("ORDER_SUCCESS_PAID_THANKS_AT")}{" "}
            <span className="text-white/70">{order.customerEmail}</span>
          </>
        )}
        .
      </p>

      {order && order.items.length > 0 && (
        <div className="mx-auto mt-8 max-w-sm border border-[#222] bg-[#111] p-6 text-left">
          <h3 className="text-xs font-bold tracking-[0.2em] text-white/60">
            {t("ORDER_SUCCESS_SUMMARY")}
          </h3>
          <div className="mt-4 space-y-3">
            {order.items.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-white/70">
                  {item.quantity}× {item.description}
                </span>
                <span className="text-white">
                  {formatPrice(item.amount / 100)}
                </span>
              </div>
            ))}
            {typeof order.shippingCents === "number" &&
              order.shippingCents > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/70">
                    {order.isWholesaleShipping ? (
                      t("ORDER_SUCCESS_WHOLESALE_SHIPPING")
                    ) : (
                      <>
                        {getShippingLogo(
                          order.shippingMethodTitle ||
                            t("ORDER_SUCCESS_SHIPPING_DEFAULT")
                        )}
                        <span>
                          {order.shippingMethodTitle?.trim() ||
                            t("ORDER_SUCCESS_SHIPPING_DEFAULT")}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="text-white">
                    {formatPrice(order.shippingCents / 100)}
                  </span>
                </div>
              )}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#222] pt-4">
            <span className="text-sm font-bold tracking-wider text-white/60">
              {t("GESAMT")}
            </span>
            <span className="text-xl font-black text-white">
              {formatPrice(parsePrice(order.total))}
            </span>
          </div>
        </div>
      )}

      <Link
        href="/shop"
        className="mt-8 inline-block bg-[#c0392b] px-8 py-3 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
      >
        {t("WEITER_EINKAUFEN")}
      </Link>
    </div>
  );
}
