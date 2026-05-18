"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  PayPalScriptProvider,
  PayPalButtons,
  FUNDING,
} from "@paypal/react-paypal-js";
import { useCart } from "@/lib/CartContext";
import { useRouter } from "next/navigation";
import { trackInitiateCheckout } from "@/lib/meta-pixel";
import { validateEuVatFormat } from "@/lib/vat-format";
import { isReverseChargeEligible } from "@/lib/reverse-charge";
import { parsePrice, parseFixedDiscountEuros } from "@/lib/parse-price";
import { formatPrice } from "@/lib/format-price";
import {
  buildCheckoutOrderExtras,
  buildCheckoutShippingBody,
  markCheckoutPiSynced,
  parsePiIdFromClientSecret,
  persistCheckoutSyncPayload,
  type CheckoutShippingForWoo,
} from "@/lib/checkout-order-extras";
import { clearVideoUtmStorage, videoUtmRequestField } from "@/lib/video-utm";
import { standardVatFraction } from "@/lib/woo-vat-split";
import { getShippingLogo } from "@/components/ShippingLogos";
import { filterDeAtShippingRatesForDisplay } from "@/lib/filter-de-at-shipping-rates";
import { isCountryBlocked } from "@/lib/blocked-countries";
import { isWholesaleCountryAllowed } from "@/lib/wholesale-allowed-countries";
import { getWorldCountriesForDropdown } from "@/lib/world-countries";
import { FreeShippingTrigger } from "@/components/FreeShippingTrigger";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, formatTranslation } from "@/lib/translations";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

type PaymentMethod = "card" | "bank" | "paypal" | "klarna" | "eps";

/** Map machine-readable API error codes; leave German message strings as-is. */
function resolveCheckoutApiError(
  error: string | undefined,
  t: (key: string) => string,
  fallbackKey: string
): string {
  if (!error) return t(fallbackKey);
  switch (error) {
    case "country_blocked":
      return t("CHECKOUT_ERROR_COUNTRY_BLOCKED");
    case "wholesale_eu_only":
      return t("CHECKOUT_ERROR_WHOLESALE_EU_ONLY");
    case "shipping_unavailable":
      return t("CHECKOUT_ERROR_SHIPPING_UNAVAILABLE");
    default:
      return error;
  }
}

type ClientShipRate = {
  rate_id: string;
  method_id: string;
  name: string;
  price: number;
  instance_id?: number;
};

/* ── Custom Checkbox ── */

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-all duration-200"
        style={{
          backgroundColor: checked ? "#c0392b" : "#111",
          borderColor: checked ? "#c0392b" : "#555",
        }}
      >
        {checked && (
          <svg
            className="h-3 w-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="square"
              strokeLinejoin="miter"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>
      <span className="text-[11px] leading-relaxed text-white/40">
        {children}
      </span>
    </label>
  );
}

/* ── Payment Method Option ── */

function PaymentOption({
  selected,
  onClick,
  label,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between p-4 transition-all duration-200"
      style={{
        backgroundColor: "#111",
        border: selected ? "1px solid #c0392b" : "1px solid #333",
        boxShadow: selected
          ? "0 0 12px rgba(192, 57, 43, 0.3), inset 0 0 8px rgba(192, 57, 43, 0.1)"
          : "none",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-4 w-4 items-center justify-center border"
          style={{
            borderColor: selected ? "#c0392b" : "#555",
            backgroundColor: selected ? "#c0392b" : "transparent",
          }}
        >
          {selected && (
            <div className="h-1.5 w-1.5 bg-white" />
          )}
        </div>
        <span className="text-sm font-bold tracking-wider text-white">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-white/50">{icon}</div>
    </button>
  );
}

/* ── Styled input helpers ── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      required={required}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
    />
  );
}

function Select({
  value,
  onChange,
  options,
  required,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white outline-none focus:border-[#c0392b] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value || "_empty"} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ── Payment icons ── */

function CardIcons() {
  return (
    <div className="flex gap-1.5">
      <span className="border border-[#444] px-1.5 py-0.5 text-[9px] font-bold text-white/60">
        VISA
      </span>
      <span className="border border-[#444] px-1.5 py-0.5 text-[9px] font-bold text-white/60">
        MC
      </span>
    </div>
  );
}

function BankIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="square"
        d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6M4.5 9.75v10.5h15V9.75"
      />
    </svg>
  );
}

function PayPalIcon() {
  return (
    <span className="text-xs font-bold tracking-wider text-[#00457C]">
      Pay<span className="text-[#0079C1]">Pal</span>
    </span>
  );
}

function KlarnaIcon() {
  return (
    <span className="border border-[#FFB3C7] bg-[#FFB3C7] px-2 py-0.5 text-[9px] font-black text-black">
      Klarna.
    </span>
  );
}

function EpsIcon() {
  return (
    <span className="border border-[#444] px-2 py-0.5 text-[9px] font-bold text-white/60">
      eps
    </span>
  );
}

/* ── Order Summary (right column) ── */

function OrderSummary({
  couponId,
  couponName,
  couponDiscount,
  onCouponApplied,
  onCouponRemoved,
  subtotal,
  hideCoupon,
  shippingAmount,
  shippingLabel,
  shippingLoading,
  shippingError,
  shippingNoZone,
  wholesaleNonRcTotals = null,
}: {
  couponId: string | null;
  couponName: string | null;
  couponDiscount: string | null;
  onCouponApplied: (id: string, name: string, display: string) => void;
  onCouponRemoved: () => void;
  subtotal: number;
  /** Wholesale: hide coupon input and applied-coupon UI (B2C unchanged). */
  hideCoupon?: boolean;
  shippingAmount: number;
  shippingLabel: string;
  shippingLoading: boolean;
  shippingError: string | null;
  shippingNoZone: boolean;
  /** Wholesale non–Reverse-Charge: net lines + net shipping + VAT → gross total. */
  wholesaleNonRcTotals?: {
    itemsNet: number;
    shipNet: number;
    vatTotal: number;
    grossTotal: number;
  } | null;
}) {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);
  const effectiveCouponDiscount = hideCoupon ? null : couponDiscount;

  // Calculate discounted subtotal (wholesale: never subtract coupon in math)
  let discountedSubtotal = subtotal;
  let discountAmount = 0;
  if (effectiveCouponDiscount) {
    const percentMatch = effectiveCouponDiscount.match(/(\d+)%/);
    const fixedEuros = parseFixedDiscountEuros(effectiveCouponDiscount);
    if (percentMatch) {
      discountAmount = subtotal * (parseFloat(percentMatch[1]) / 100);
      discountedSubtotal = subtotal - discountAmount;
    } else if (fixedEuros != null) {
      discountAmount = fixedEuros;
      discountedSubtotal = Math.max(0, subtotal - discountAmount);
    }
  }

  const grandTotal = wholesaleNonRcTotals
    ? wholesaleNonRcTotals.grossTotal
    : discountedSubtotal + shippingAmount;
  const { items } = useCart();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validate = useCallback(async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/validate-coupon?code=${encodeURIComponent(code.trim())}`
      );
      const data = await res.json();
      if (data.valid) {
        const display = data.percent_off
          ? `−${data.percent_off}%`
          : data.amount_off
            ? `−${data.amount_off}`
            : "";
        onCouponApplied(data.couponId, data.name, display);
        setCode("");
      } else {
        setError(data.error || t("CHECKOUT_INVALID_COUPON"));
      }
    } catch {
      setError(t("CHECKOUT_COUPON_VALIDATE_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [code, onCouponApplied, t]);

  return (
    <div className="border border-[#222] bg-[#111] p-6">
      <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
        {t("BESTELLUNG")}
      </h2>

      <div className="mt-4 space-y-3">
        {items.map(({ product, quantity }) => {
          const image = product.images[0]?.src;
          const price = parsePrice(product.price || "0");
          return (
            <div key={product.id} className="flex items-center gap-3">
              <div className="h-[48px] w-[48px] shrink-0 overflow-hidden bg-[#1a1a1a]">
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
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-xs font-bold text-white/80">
                  {product.name}
                </p>
                <p className="text-[10px] text-white/40">
                  {formatTranslation("CHECKOUT_QUANTITY", language, {
                    qty: String(quantity),
                  })}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-white">
                {formatPrice(price * quantity)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="my-4 border-t border-[#222]" />

      {!hideCoupon &&
        (couponId ? (
          <div className="mb-4 flex items-center justify-between bg-[#0a0a0a] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-green-400">
                {couponName}
              </span>
              <span className="text-xs text-green-400/70">{couponDiscount}</span>
            </div>
            <button
              type="button"
              onClick={onCouponRemoved}
              className="cursor-pointer bg-transparent text-xs text-white/30 hover:text-white/60"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && validate()}
                placeholder={t("GUTSCHEIN_PLACEHOLDER")}
                className="flex-1 border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#c0392b]"
              />
              <button
                type="button"
                onClick={validate}
                disabled={loading}
                className="shrink-0 cursor-pointer border border-[#c0392b] bg-transparent px-4 py-2 text-[10px] font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white disabled:opacity-50"
              >
                {loading ? "..." : t("EINLOESEN")}
              </button>
            </div>
            {error && (
              <p className="mt-1 text-[10px] text-[#c0392b]">{error}</p>
            )}
          </div>
        ))}

      <div className="space-y-2">
        {wholesaleNonRcTotals ? (
          <>
            <div className="flex justify-between text-xs text-white/50">
              <span>{t("CHECKOUT_SUBTOTAL_NET")}</span>
              <span>{formatPrice(wholesaleNonRcTotals.itemsNet)}</span>
            </div>
            <div className="flex justify-between text-xs text-white/50">
              <span className="flex flex-col gap-0.5">
                <span>{t("CHECKOUT_SHIPPING_NET")}</span>
                {shippingLabel && !shippingLoading && !shippingError && (
                  <span className="text-[9px] font-normal text-white/35">
                    {shippingLabel}
                  </span>
                )}
              </span>
              <span className="text-right">
                {shippingLoading ? (
                  <span className="text-white/40">{t("CHECKOUT_SHIPPING_CALCULATING")}</span>
                ) : shippingError ? (
                  <span className="text-[10px] text-[#c0392b]">{shippingError}</span>
                ) : shippingNoZone ? (
                  <span className="text-[10px] text-[#c0392b]">
                    {t("CHECKOUT_SHIPPING_UNAVAILABLE")}
                  </span>
                ) : wholesaleNonRcTotals.shipNet === 0 ? (
                  <span className="text-green-400/90">{t("CHECKOUT_FREE_SHIPPING")}</span>
                ) : (
                  formatPrice(wholesaleNonRcTotals.shipNet)
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs text-white/50">
              <span>{t("CHECKOUT_VAT")}</span>
              <span>{formatPrice(wholesaleNonRcTotals.vatTotal)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between text-xs text-white/50">
              <span>{t("ZWISCHENSUMME")}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {effectiveCouponDiscount && discountAmount > 0 && (
              <div className="flex justify-between text-xs text-green-400">
                <span>
                  {formatTranslation("CHECKOUT_DISCOUNT_LABEL", language, {
                    discount: effectiveCouponDiscount,
                  })}
                </span>
                <span>−{formatPrice(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-white/50">
              <span className="flex flex-col gap-0.5">
                <span>{t("CHECKOUT_SHIPPING_LINE")}</span>
                {shippingLabel && !shippingLoading && !shippingError && (
                  <span className="text-[9px] font-normal text-white/35">
                    {shippingLabel}
                  </span>
                )}
              </span>
              <span className="text-right">
                {shippingLoading ? (
                  <span className="text-white/40">{t("CHECKOUT_SHIPPING_CALCULATING")}</span>
                ) : shippingError ? (
                  <span className="text-[10px] text-[#c0392b]">{shippingError}</span>
                ) : shippingNoZone ? (
                  <span className="text-[10px] text-[#c0392b]">
                    {t("CHECKOUT_SHIPPING_UNAVAILABLE")}
                  </span>
                ) : shippingAmount === 0 ? (
                  <span className="text-green-400/90">{t("CHECKOUT_FREE_SHIPPING")}</span>
                ) : (
                  formatPrice(shippingAmount)
                )}
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between border-t border-[#222] pt-2">
          <span className="text-sm font-bold tracking-wider text-white/60">
            {wholesaleNonRcTotals ? t("CHECKOUT_TOTAL_GROSS") : t("GESAMT")}
          </span>
          <span className="text-xl font-black text-white">
            {formatPrice(grandTotal)}
          </span>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-white/30">
        {t("CHECKOUT_SHIPPING_FOOTER")}
      </p>

      <div className="mt-4 flex items-center gap-2 text-white/30">
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="square"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <span className="text-[10px]">{t("SSL_HINWEIS")}</span>
      </div>
    </div>
  );
}

/* ── Inner form (needs Stripe hooks) ── */

/* ── Stable PayPal Button wrapper — prevents re-mount on parent re-renders ── */

const paypalScriptOptions = {
  clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "",
  currency: "EUR",
  disableFunding: "card,credit,paylater,bancontact,blik,eps,giropay,ideal,mybank,p24,sepa,sofort,venmo",
};

function PayPalButtonWrapper({
  totalPrice,
  couponDiscount,
  shippingAmount,
  resolvedOrderTotalEuro,
  onApprove,
  onError,
  disabled,
  onBeforePayPalCreateOrder,
}: {
  totalPrice: number;
  couponDiscount: string | null;
  /** Brutto-Versand in EUR (nach Rabatt auf Warenkorb addieren) */
  shippingAmount: number;
  /** Wenn gesetzt (z. B. Wholesale AT netto→brutto), dieser Betrag statt totalPrice + Versand + Gutschein. */
  resolvedOrderTotalEuro?: number | null;
  onApprove: (data: Record<string, unknown>, actions: { order?: { capture: () => Promise<Record<string, unknown>> } }) => Promise<void>;
  onError: () => void;
  disabled?: boolean;
  /** Wholesale: block PayPal order creation until company + UID format are valid. */
  onBeforePayPalCreateOrder?: () => Promise<void>;
}) {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  // Memoize createOrder so PayPal doesn't reinitialize
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createOrder = useCallback(
    async (_data: any, actions: any) => {
      if (onBeforePayPalCreateOrder) {
        await onBeforePayPalCreateOrder();
      }
      let paypalTotal: number;
      if (
        resolvedOrderTotalEuro != null &&
        Number.isFinite(resolvedOrderTotalEuro)
      ) {
        paypalTotal = resolvedOrderTotalEuro;
      } else {
        paypalTotal = totalPrice;
        if (couponDiscount) {
          const pctMatch = couponDiscount.match(/(\d+)%/);
          const fixEuros = parseFixedDiscountEuros(couponDiscount);
          if (pctMatch)
            paypalTotal = totalPrice * (1 - parseFloat(pctMatch[1]) / 100);
          else if (fixEuros != null)
            paypalTotal = Math.max(0, totalPrice - fixEuros);
        }
        paypalTotal += shippingAmount;
      }
      return await actions.order.create({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: paypalTotal.toFixed(2),
            },
            description: t("CHECKOUT_PAYPAL_ORDER_DESCRIPTION"),
          },
        ],
      });
    },
    [
      totalPrice,
      couponDiscount,
      shippingAmount,
      resolvedOrderTotalEuro,
      onBeforePayPalCreateOrder,
      t,
    ]
  );

  return (
    <PayPalScriptProvider options={paypalScriptOptions}>
      <PayPalButtons
        fundingSource={FUNDING.PAYPAL}
        disabled={disabled}
        style={{
          color: "gold",
          shape: "rect",
          layout: "vertical",
          label: "paypal",
        }}
        createOrder={createOrder}
        onApprove={onApprove}
        onError={onError}
        forceReRender={[totalPrice, couponDiscount, shippingAmount, resolvedOrderTotalEuro ?? -1, disabled]}
      />
    </PayPalScriptProvider>
  );
}

function CheckoutInner() {
  console.log("[CheckoutDebug] CheckoutInner rendering");
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { items, totalPrice, clearCart } = useCart();
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  const initiateCheckoutTracked = useRef(false);
  useEffect(() => {
    console.log("[CheckoutDebug] useEffect fired", {
      tracked: initiateCheckoutTracked.current,
      itemsLength: items.length,
      totalPrice,
    });
    if (initiateCheckoutTracked.current) return;
    if (items.length === 0) return;
    initiateCheckoutTracked.current = true;
    console.log("[CheckoutDebug] calling trackInitiateCheckout");
    void trackInitiateCheckout(
      totalPrice,
      items.reduce((sum, i) => sum + i.quantity, 0),
      items.map((i) => i.product.id.toString())
    );
  }, [items, totalPrice]);

  const [email, setEmail] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("AT");
  const [state, setState] = useState("");
  const [provinceOptions, setProvinceOptions] = useState<
    { code: string; name: string }[]
  >([]);
  const [provinceListLoading, setProvinceListLoading] = useState(false);
  const [isWholesale, setIsWholesale] = useState(false);
  const [isNewsletterSubscribed, setIsNewsletterSubscribed] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [company, setCompany] = useState("");
  const [vat, setVat] = useState("");
  const [vatFieldError, setVatFieldError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        try {
          const sessionRes = await fetch("/api/auth/session", {
            cache: "no-store",
          });
          if (!cancelled && sessionRes.ok) {
            const s = await sessionRes.json();
            setIsWholesale(s.isWholesale === true);
            setIsNewsletterSubscribed(s.isNewsletterSubscribed === true);
          }
        } catch {
          /* ignore */
        }

        let filledFromProfile = false;
        try {
          const profileRes = await fetch("/api/auth/profile", {
            cache: "no-store",
          });
          if (profileRes.ok) {
            const p = (await profileRes.json()) as {
              email?: string;
              first_name?: string;
              last_name?: string;
              billing?: {
                company?: string;
                vat?: string;
                address_1?: string;
                postcode?: string;
                city?: string;
                country?: string;
                state?: string;
              };
            };
            if (cancelled) return;
            if (p.billing?.company)
              setCompany(String(p.billing.company).trim());
            if (p.billing?.vat)
              setVat(String(p.billing.vat).trim().toUpperCase());
            if (p.email) setEmail(p.email);
            if (p.first_name) setFirstName(p.first_name);
            if (p.last_name) setLastName(p.last_name);
            if (p.billing?.address_1) setStreet(p.billing.address_1);
            if (p.billing?.postcode) setZip(p.billing.postcode);
            if (p.billing?.city) setCity(p.billing.city);
            if (p.billing?.country) setCountry(p.billing.country);
            if (p.billing?.state) setState(String(p.billing.state).trim());
            filledFromProfile = true;
          }
        } catch {
          /* fall through */
        }

        if (!filledFromProfile) {
          try {
            const res = await fetch("/api/auth/me");
            if (!res.ok || cancelled) return;
            const data = await res.json();
            if (cancelled) return;
            if (data.email) setEmail(data.email);
            if (data.firstName) setFirstName(data.firstName);
            if (data.lastName) setLastName(data.lastName);
            if (data.billing?.address_1) setStreet(data.billing.address_1);
            if (data.billing?.postcode) setZip(data.billing.postcode);
            if (data.billing?.city) setCity(data.billing.city);
            if (data.billing?.country) setCountry(data.billing.country);
            if (data.billing?.state) setState(String(data.billing.state).trim());
          } catch {
            /* guest */
          }
        }
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const countrySelectOptions = useMemo(
    () =>
      getWorldCountriesForDropdown().map((c) => ({
        value: c.code,
        label: c.name,
      })),
    []
  );

  const validCountryCodes = useMemo(
    () => new Set(countrySelectOptions.map((o) => o.value)),
    [countrySelectOptions]
  );

  useEffect(() => {
    if (!sessionReady) return;
    if (!validCountryCodes.has(country)) {
      setCountry("AT");
    }
  }, [sessionReady, country, validCountryCodes]);

  const countryBlocksCheckout = useMemo(
    () =>
      isCountryBlocked(country) ||
      (isWholesale &&
        !isWholesaleCountryAllowed(country.trim().toUpperCase())),
    [country, isWholesale]
  );

  useEffect(() => {
    let cancelled = false;
    setProvinceListLoading(true);
    setProvinceOptions([]);
    void (async () => {
      try {
        const r = await fetch(
          `/api/woo-states/${encodeURIComponent(country)}`
        );
        const data = (await r.json()) as {
          states?: { code: string; name: string }[];
        };
        if (cancelled) return;
        setProvinceOptions(Array.isArray(data.states) ? data.states : []);
      } catch {
        if (!cancelled) setProvinceOptions([]);
      } finally {
        if (!cancelled) setProvinceListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country]);

  useEffect(() => {
    if (provinceListLoading) return;
    if (provinceOptions.length === 0) return;
    if (!state.trim()) return;
    const ok = provinceOptions.some((p) => p.code === state);
    if (!ok) setState("");
  }, [provinceListLoading, provinceOptions, state]);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  const [couponId, setCouponId] = useState<string | null>(null);
  const [couponName, setCouponName] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentError, setPaymentIntentError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [autoCouponApplied, setAutoCouponApplied] = useState(false);

  const [shipFetchLoading, setShipFetchLoading] = useState(false);
  const [shipResolved, setShipResolved] = useState(false);
  const [shipRate, setShipRate] = useState<number | null>(null);
  const [shipLabel, setShipLabel] = useState("");
  const [shipMethodId, setShipMethodId] = useState("");
  const [shipRateId, setShipRateId] = useState("");
  const [shipInstanceId, setShipInstanceId] = useState<number | undefined>(
    undefined
  );
  const [shipOptions, setShipOptions] = useState<ClientShipRate[]>([]);
  const [shipMultiChoice, setShipMultiChoice] = useState(false);
  const [selectedShipRateId, setSelectedShipRateId] = useState("");
  const selectedShipRateIdRef = useRef(selectedShipRateId);
  selectedShipRateIdRef.current = selectedShipRateId;
  const [shipError, setShipError] = useState<string | null>(null);
  const [shipNoZone, setShipNoZone] = useState(false);
  const [stripeShipCents, setStripeShipCents] = useState<number | null>(null);

  useEffect(() => {
    if (!isWholesale) return;
    setCouponId(null);
    setCouponName(null);
    setCouponDiscount(null);
    setAutoCouponApplied(false);
  }, [isWholesale]);

  useEffect(() => {
    if (isWholesale && couponId) {
      setCouponId(null);
      setCouponName(null);
      setCouponDiscount(null);
      setAutoCouponApplied(false);
    }
  }, [isWholesale, couponId]);

  // Read ?coupon= from URL and auto-apply (B2C / guest only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionReady) return;
    if (isWholesale) return;
    const params = new URLSearchParams(window.location.search);
    const urlCoupon = params.get("coupon");
    if (!urlCoupon) return;

    async function applyCoupon() {
      try {
        const res = await fetch(
          `/api/validate-coupon?code=${encodeURIComponent(urlCoupon!)}`
        );
        const data = await res.json();

        if (data.valid) {
          const display = data.percent_off
            ? `−${data.percent_off}%`
            : data.amount_off
              ? `−${data.amount_off}`
              : "−10%";
          setCouponId(data.couponId);
          setCouponName(data.name || urlCoupon);
          setCouponDiscount(display);
          setAutoCouponApplied(true);
        } else {
          setCouponName(urlCoupon!);
          setCouponDiscount("−10%");
          setAutoCouponApplied(true);
        }
      } catch {
        /* ignore */
      }
    }
    void applyCoupon();
  }, [sessionReady, isWholesale]);

  const itemsKey = items.map((i) => `${i.product.id}:${i.quantity}`).join(",");

  useEffect(() => {
    if (!sessionReady) return;

    if (items.length === 0) {
      setShipFetchLoading(false);
      setShipResolved(true);
      setShipRate(0);
      setShipLabel("");
      setShipMethodId("none");
      setShipRateId("");
      setShipInstanceId(undefined);
      setShipOptions([]);
      setShipMultiChoice(false);
      setSelectedShipRateId("");
      setShipError(null);
      setShipNoZone(false);
      setStripeShipCents(0);
      return;
    }

    if (isWholesale) {
      setShipFetchLoading(false);
      setShipResolved(true);
      setShipRate(10);
      setShipLabel(t("ORDER_SUCCESS_WHOLESALE_SHIPPING"));
      setShipMethodId("flat_rate");
      setShipRateId("wholesale_flat");
      setShipInstanceId(undefined);
      setShipOptions([]);
      setShipMultiChoice(false);
      setSelectedShipRateId("wholesale_flat");
      setShipError(null);
      setShipNoZone(false);
      setStripeShipCents(1000);
      return;
    }

    if (provinceListLoading) {
      setShipFetchLoading(true);
      setShipResolved(false);
      setStripeShipCents(null);
      setShipRate(null);
      return;
    }

    if (provinceOptions.length > 0 && !state.trim()) {
      setShipFetchLoading(false);
      setShipResolved(true);
      setShipError(t("CHECKOUT_ERROR_SHIPPING_PROVINCE"));
      setShipNoZone(false);
      setShipRate(null);
      setShipLabel("");
      setShipMethodId("");
      setShipRateId("");
      setShipInstanceId(undefined);
      setShipOptions([]);
      setShipMultiChoice(false);
      setSelectedShipRateId("");
      setStripeShipCents(null);
      return;
    }

    let cancelled = false;
    setShipFetchLoading(true);
    setShipError(null);
    setShipNoZone(false);
    setShipResolved(false);
    setStripeShipCents(null);
    setShipRate(null);
    setShipOptions([]);
    setShipMultiChoice(false);
    setSelectedShipRateId("");
    setShipInstanceId(undefined);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/shipping-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              id: i.product.id,
              quantity: i.quantity,
            })),
            country,
            state: state.trim() || undefined,
            postcode: zip,
            city,
            address_1: street,
            isWholesale: false,
          }),
        });
        const data = (await res.json()) as {
          rate?: number | null;
          label?: string;
          method_id?: string;
          rate_id?: string;
          instance_id?: number;
          source?: string;
          error?: string;
          message?: string;
          rates?: ClientShipRate[];
          multiple?: boolean;
          selectedRateId?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403 && data.error === "country_blocked") {
            setShipError(t("CHECKOUT_ERROR_COUNTRY_BLOCKED"));
          } else if (res.status === 403 && data.error === "wholesale_eu_only") {
            setShipError(t("CHECKOUT_ERROR_WHOLESALE_EU_ONLY"));
          } else if (res.status === 503 || data.error === "shipping_unavailable") {
            setShipError(t("CHECKOUT_ERROR_SHIPPING_UNAVAILABLE"));
          } else {
            setShipError(t("CHECKOUT_ERROR_SHIPPING_UNAVAILABLE"));
          }
          setShipResolved(true);
          setStripeShipCents(null);
          setShipRate(null);
          setShipOptions([]);
          setShipMultiChoice(false);
          setSelectedShipRateId("");
          setShipInstanceId(undefined);
          return;
        }
        if (data.source === "no-zone" || data.rate === null) {
          setShipRate(null);
          setShipLabel(data.label || t("CHECKOUT_SHIPPING_UNAVAILABLE"));
          setShipMethodId("");
          setShipRateId("");
          setShipInstanceId(undefined);
          setShipOptions([]);
          setShipMultiChoice(false);
          setSelectedShipRateId("");
          setShipNoZone(true);
          setShipResolved(true);
          setStripeShipCents(null);
          return;
        }
        const rowsRaw: ClientShipRate[] = Array.isArray(data.rates)
          ? data.rates.filter(
              (r) =>
                r &&
                typeof r.rate_id === "string" &&
                typeof r.method_id === "string" &&
                typeof r.name === "string" &&
                typeof r.price === "number"
            )
          : [];
        const rows = filterDeAtShippingRatesForDisplay(rowsRaw, country);
        const multi =
          data.multiple === true &&
          rows.length > 1 &&
          (country === "AT" || country === "DE");

        setShipOptions(rows);

        /** Priorität: gültige Nutzerwahl (z. B. Post) → API-ID falls noch in rows → günstigste Rate (nach Filter i. d. R. kostenlose GLS). */
        const prevSel = selectedShipRateIdRef.current;
        const selId = (() => {
          if (rows.length === 0) return "";
          if (prevSel && rows.some((r) => r.rate_id === prevSel)) {
            return prevSel;
          }
          if (
            multi &&
            data.selectedRateId &&
            rows.some((r) => r.rate_id === data.selectedRateId)
          ) {
            return data.selectedRateId;
          }
          return rows[0].rate_id;
        })();
        setShipMultiChoice(multi);
        setSelectedShipRateId(selId);

        const row = rows.find((r) => r.rate_id === selId) ?? rows[0];
        if (!row) {
          setShipRate(null);
          setShipLabel("");
          setShipMethodId("");
          setShipRateId("");
          setShipInstanceId(undefined);
          setShipNoZone(true);
          setShipResolved(true);
          setStripeShipCents(null);
          return;
        }

        setShipRate(row.price);
        setShipLabel(row.name);
        setShipMethodId(row.method_id || "flat_rate");
        setShipRateId(row.rate_id);
        setShipInstanceId(
          typeof row.instance_id === "number" ? row.instance_id : undefined
        );
        setShipNoZone(false);
        setShipResolved(true);
        setStripeShipCents(Math.round(row.price * 100));
      } catch {
        if (!cancelled) {
          setShipError(t("CHECKOUT_ERROR_SHIPPING_UNAVAILABLE"));
          setShipResolved(true);
          setStripeShipCents(null);
          setShipRate(null);
          setShipOptions([]);
          setShipMultiChoice(false);
          setSelectedShipRateId("");
          setShipInstanceId(undefined);
        }
      } finally {
        if (!cancelled) setShipFetchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    sessionReady,
    isWholesale,
    itemsKey,
    country,
    state,
    zip,
    city,
    street,
    provinceListLoading,
    provinceOptions,
    items.length,
    t,
  ]);

  const wholesaleReverseCharge = useMemo(
    () =>
      isReverseChargeEligible({
        isWholesale,
        vat,
        shippingCountry: country,
      }),
    [isWholesale, vat, country]
  );

  // Create PaymentIntent for card payments
  useEffect(() => {
    if (!sessionReady) return;
    if (items.length === 0 || (paymentMethod !== "card" && paymentMethod !== "klarna" && paymentMethod !== "eps")) return;
    if (!isWholesale && stripeShipCents === null) return;

    async function createPI() {
      setPaymentIntentError("");
      const shipCents = isWholesale ? 1000 : (stripeShipCents ?? 0);
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          couponId:
            isWholesale ? undefined : couponId || undefined,
          shippingCents: shipCents,
          isReverseCharge: isWholesale ? wholesaleReverseCharge : false,
          ...(isWholesale
            ? { isWholesale: true, taxCountry: country }
            : {
                shippingForStripe: {
                  name: `${firstName} ${lastName}`.trim(),
                  line1: street.trim(),
                  city: city.trim(),
                  postal_code: zip.trim(),
                  country: country.trim().toUpperCase(),
                  ...(state.trim() ? { state: state.trim() } : {}),
                },
                shippingMethodTitle: shipLabel.trim() || undefined,
              }),
          ...videoUtmRequestField(),
        }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok) {
        setClientSecret("");
        if (res.status === 403 && data.error === "country_blocked") {
          setPaymentIntentError(t("CHECKOUT_ERROR_COUNTRY_BLOCKED"));
        } else if (res.status === 403 && data.error === "wholesale_eu_only") {
          setPaymentIntentError(t("CHECKOUT_ERROR_WHOLESALE_EU_ONLY"));
        } else if (typeof data.error === "string" && data.error) {
          setPaymentIntentError(
            resolveCheckoutApiError(
              data.error,
              t,
              "CHECKOUT_ERROR_PAYMENT_INTENT"
            )
          );
        } else {
          setPaymentIntentError(t("CHECKOUT_ERROR_PAYMENT_INTENT"));
        }
        return;
      }
      setPaymentIntentError("");
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      }
    }
    createPI();
  }, [
    items,
    couponId,
    paymentMethod,
    isWholesale,
    sessionReady,
    stripeShipCents,
    wholesaleReverseCharge,
    country,
    firstName,
    lastName,
    street,
    city,
    zip,
    state,
    shipLabel,
    t,
  ]);

  const cartMeta = items.map((i) => ({
    id: i.product.id,
    name: i.product.name,
    qty: i.quantity,
    price: i.product.price,
  }));

  const customerData = {
    email,
    firstName,
    lastName,
    street,
    zip,
    city,
    country,
    ...(state.trim() ? { state: state.trim() } : {}),
  };

  const wholesaleCheckoutBlocked = useMemo(
    () =>
      isWholesale &&
      (!company.trim() ||
        !vat.trim() ||
        !validateEuVatFormat(vat)),
    [isWholesale, company, vat]
  );

  const paypalCouponDiscount = useMemo(
    () => (isWholesale ? null : couponDiscount),
    [isWholesale, couponDiscount]
  );

  const bankPaymentText = isWholesale
    ? t("BANK_TEXT_WHOLESALE")
    : t("BANK_TEXT_B2C");

  const checkoutShippingForWoo = useMemo((): CheckoutShippingForWoo | null => {
    if (!shipResolved || shipError) return null;
    if (shipNoZone || shipRate === null) return null;
    if (shipMethodId === "none" && shipRate === 0) return null;
    return {
      rate: shipRate,
      label: shipLabel || t("ORDER_SUCCESS_SHIPPING_DEFAULT"),
      method_id: shipMethodId || "flat_rate",
      ...(shipRateId ? { rate_id: shipRateId } : {}),
      ...(typeof shipInstanceId === "number"
        ? { instance_id: shipInstanceId }
        : {}),
    };
  }, [
    shipResolved,
    shipError,
    shipNoZone,
    shipRate,
    shipMethodId,
    shipLabel,
    shipRateId,
    shipInstanceId,
    t,
  ]);

  const shippingBlocksCheckout = useMemo(() => {
    if (countryBlocksCheckout) return true;
    if (isWholesale) return false;
    if (items.length === 0) return false;
    if (!sessionReady) return true;
    if (!shipResolved || shipFetchLoading) return true;
    if (shipError) return true;
    if (shipNoZone || shipRate === null) return true;
    if (stripeShipCents === null) return true;
    return false;
  }, [
    isWholesale,
    items.length,
    sessionReady,
    shipResolved,
    shipFetchLoading,
    shipError,
    shipNoZone,
    shipRate,
    stripeShipCents,
    countryBlocksCheckout,
  ]);

  const orderSummaryShippingAmount = useMemo(() => {
    if (!shipResolved || shipFetchLoading || shipError) return 0;
    if (shipNoZone || shipRate === null) return 0;
    return shipRate;
  }, [shipResolved, shipFetchLoading, shipError, shipNoZone, shipRate]);

  const wholesaleNonRcTotals = useMemo(() => {
    if (!isWholesale || wholesaleReverseCharge) return null;
    if (items.length === 0) return null;
    const r = standardVatFraction(country);
    const itemsNet = items.reduce(
      (s, i) =>
        s +
        Math.max(0, parsePrice(i.product.price)) * Math.max(1, i.quantity),
      0
    );
    const shipNet = orderSummaryShippingAmount;
    const netSum = itemsNet + shipNet;
    const grossCents = items.reduce((sum, i) => {
      const lineNet =
        Math.max(0, parsePrice(i.product.price)) * Math.max(1, i.quantity);
      return sum + Math.round(lineNet * (1 + r) * 100);
    }, 0) + Math.round(shipNet * (1 + r) * 100);
    const grossTotal = grossCents / 100;
    const vatTotal = Math.round((grossTotal - netSum) * 100) / 100;
    return { itemsNet, shipNet, vatTotal, grossTotal };
  }, [
    isWholesale,
    wholesaleReverseCharge,
    items,
    country,
    orderSummaryShippingAmount,
  ]);

  const uiShippingLoading =
    items.length > 0 &&
    ((!sessionReady && !isWholesale) ||
      shipFetchLoading ||
      (!isWholesale && provinceListLoading));

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setProcessing(true);
      setError("");

      if (isWholesale) {
        if (!company.trim()) {
          setError(t("CHECKOUT_ERROR_COMPANY_REQUIRED"));
          setProcessing(false);
          return;
        }
        if (!vat.trim() || !validateEuVatFormat(vat)) {
          setError(t("CHECKOUT_ERROR_UID_REQUIRED"));
          setVatFieldError(t("CHECKOUT_VALIDATION_UID_FORMAT"));
          setProcessing(false);
          return;
        }
      }

      if (shippingBlocksCheckout) {
        setError(t("CHECKOUT_ERROR_SHIPPING_BLOCKED"));
        setProcessing(false);
        return;
      }

      if (paymentMethod === "card") {
        if (!stripe || !elements || !clientSecret) {
          setProcessing(false);
          return;
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setError(t("CHECKOUT_ERROR_CARD_ELEMENT"));
          setProcessing(false);
          return;
        }

        const piId = parsePiIdFromClientSecret(clientSecret);
        if (isWholesale && piId) {
          try {
            const piRes = await fetch("/api/payment-intent-meta", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentIntentId: piId,
                isReverseCharge: wholesaleReverseCharge,
              }),
            });
            if (!piRes.ok) {
              setError(
                t("CHECKOUT_ERROR_PAYMENT_PREP_FAILED")
              );
              setProcessing(false);
              return;
            }
          } catch {
            setError(
              t("CHECKOUT_ERROR_PAYMENT_PREP_FAILED")
            );
            setProcessing(false);
            return;
          }
        } else if (isWholesale && !piId) {
          setError(t("CHECKOUT_ERROR_PAYMENT_SETUP"));
          setProcessing(false);
          return;
        }

        const { error: stripeError, paymentIntent } =
          await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: {
                name: `${firstName} ${lastName}`,
                email,
                address: {
                  line1: street,
                  postal_code: zip,
                  city,
                  state: state.trim() || undefined,
                  country,
                },
              },
            },
          });

        if (stripeError) {
          setError(stripeError.message || t("CHECKOUT_ERROR_PAYMENT_FAILED"));
          setProcessing(false);
          return;
        }

        if (paymentIntent?.status === "succeeded") {
          try {
            const syncBody = {
              paymentIntentId: paymentIntent.id,
              customer: customerData,
              items: cartMeta,
              ...buildCheckoutOrderExtras(company, vat),
              ...buildCheckoutShippingBody(checkoutShippingForWoo),
              ...(wholesaleReverseCharge ? { isReverseCharge: true } : {}),
              ...(isWholesale ? { isWholesale: true } : {}),
              ...videoUtmRequestField(),
            };
            await fetch("/api/sync-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(syncBody),
            });
            markCheckoutPiSynced(paymentIntent.id);
          } catch {
            // non-blocking
          }
          clearCart();
          clearVideoUtmStorage();
          router.push(
            "/bestellung/erfolg?payment_intent=" + paymentIntent.id
          );
        }
      } else if (paymentMethod === "bank") {
        try {
          const bankBody = {
            customer: customerData,
            items: cartMeta,
            ...buildCheckoutOrderExtras(company, vat),
            ...buildCheckoutShippingBody(checkoutShippingForWoo),
            ...(wholesaleReverseCharge ? { isReverseCharge: true } : {}),
            ...(isWholesale ? { isWholesale: true } : {}),
            locale: language,
            ...videoUtmRequestField(),
          };
          const res = await fetch("/api/create-bank-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bankBody),
          });
          const data = await res.json();
          if (data.success) {
            clearCart();
            clearVideoUtmStorage();
            router.push(
              "/bestellung/erfolg?method=bank&order=" +
                data.orderNumber +
                (isWholesale ? "&wholesale=1" : "")
            );
          } else {
            setError(
              resolveCheckoutApiError(
                data.error,
                t,
                "CHECKOUT_ERROR_ORDER_FAILED"
              )
            );
            setProcessing(false);
          }
        } catch {
          setError(t("CHECKOUT_ERROR_CONNECTION"));
          setProcessing(false);
        }
      } else if (paymentMethod === "klarna" || paymentMethod === "eps") {
        if (!stripe || !clientSecret) {
          setProcessing(false);
          return;
        }

        const returnUrl = `${window.location.origin}/bestellung/erfolg?method=${paymentMethod}`;

        // Confirm payment with redirect for Klarna/EPS
        const billingDetails = {
          name: `${firstName} ${lastName}`,
          email,
          address: {
            line1: street,
            postal_code: zip,
            city,
            state: state.trim() || undefined,
            country,
          },
        };

        const piIdForStorage = parsePiIdFromClientSecret(clientSecret);
        if (isWholesale && piIdForStorage) {
          try {
            const piRes = await fetch("/api/payment-intent-meta", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentIntentId: piIdForStorage,
                isReverseCharge: wholesaleReverseCharge,
              }),
            });
            if (!piRes.ok) {
              setError(
                t("CHECKOUT_ERROR_PAYMENT_PREP_FAILED")
              );
              setProcessing(false);
              return;
            }
          } catch {
            setError(
              t("CHECKOUT_ERROR_PAYMENT_PREP_FAILED")
            );
            setProcessing(false);
            return;
          }
        }

        if (piIdForStorage) {
          persistCheckoutSyncPayload(piIdForStorage, {
            ...customerData,
            ...buildCheckoutOrderExtras(company, vat),
            ...(checkoutShippingForWoo
              ? { checkoutShipping: checkoutShippingForWoo }
              : {}),
            isReverseCharge: wholesaleReverseCharge,
            ...(isWholesale ? { isWholesale: true } : {}),
            ...videoUtmRequestField(),
          });
        }

        const { error: confirmError } = await stripe.confirmPayment({
          clientSecret,
          confirmParams: {
            return_url: returnUrl,
            payment_method_data: {
              type: paymentMethod as "klarna" | "eps",
              billing_details: billingDetails,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          },
        });

        if (confirmError) {
          setError(confirmError.message || t("CHECKOUT_ERROR_PAYMENT_FAILED"));
          setProcessing(false);
        }
        // If successful, Stripe redirects — no code runs after this
      }
    },
    [
      stripe,
      elements,
      clientSecret,
      paymentMethod,
      firstName,
      lastName,
      email,
      street,
      zip,
      city,
      country,
      state,
      items,
      cartMeta,
      customerData,
      company,
      vat,
      isWholesale,
      clearCart,
      router,
      shippingBlocksCheckout,
      checkoutShippingForWoo,
      wholesaleReverseCharge,
      t,
      language,
    ]
  );

  // PayPal handlers
  const handlePayPalApprove = useCallback(
    async (_data: Record<string, unknown>, actions: { order?: { capture: () => Promise<Record<string, unknown>> } }) => {
      const details = await actions.order?.capture();
      try {
        const paypalSyncBody = {
          paymentIntentId: `paypal_${(details as Record<string, unknown>)?.id || "unknown"}`,
          customer: customerData,
          items: cartMeta,
          ...buildCheckoutOrderExtras(company, vat),
          ...buildCheckoutShippingBody(checkoutShippingForWoo),
          ...(wholesaleReverseCharge ? { isReverseCharge: true } : {}),
          ...(isWholesale ? { isWholesale: true } : {}),
          ...videoUtmRequestField(),
        };
        await fetch("/api/sync-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paypalSyncBody),
        });
      } catch {
        // non-blocking
      }
      clearCart();
      clearVideoUtmStorage();
      router.push("/bestellung/erfolg?method=paypal");
    },
    [customerData, cartMeta, clearCart, router, company, vat, checkoutShippingForWoo, wholesaleReverseCharge, isWholesale]
  );

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6">
        <p className="text-white/50">{t("WARENKORB_LEER")}</p>
        <a
          href="/shop"
          className="mt-4 inline-block text-sm text-[#c0392b] hover:underline"
        >
          {t("ZURUECK_ZUM_SHOP")}
        </a>
      </div>
    );
  }

  const needsStripe = paymentMethod === "card" || paymentMethod === "klarna" || paymentMethod === "eps";
  const isStripeDisabled =
    needsStripe &&
    (!stripe || !clientSecret || Boolean(paymentIntentError.trim()));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        {/* Left — Form */}
        <form onSubmit={handleSubmit}>
          {/* Auto-applied coupon banner (B2C / guest only — wholesale must not stack discounts) */}
          {!isWholesale && autoCouponApplied && (
            <div
              style={{
                background: "rgba(39, 174, 96, 0.08)",
                borderLeft: "4px solid #27ae60",
                padding: "14px 16px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  background: "#27ae60",
                  color: "white",
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: "bold",
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <div>
                <p style={{ color: "#27ae60", fontSize: 13, fontWeight: "bold", margin: 0 }}>
                  {formatTranslation("CHECKOUT_COUPON_ACTIVE_TITLE", language, {
                    code: couponName || "WELCOME10",
                  })}
                </p>
                <p style={{ color: "rgba(39,174,96,0.7)", fontSize: 11, margin: "2px 0 0" }}>
                  {t("CHECKOUT_COUPON_ACTIVE_SUB")}
                </p>
              </div>
            </div>
          )}

          {/* Kontakt */}
          <section>
            <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
              {t("KONTAKT")}
            </h2>
            <div className="mt-4">
              <Label>{t("E_MAIL")}</Label>
              <Input
                type="email"
                value={email}
                onChange={setEmail}
                placeholder={t("CHECKOUT_PLACEHOLDER_EMAIL")}
                required
              />
            </div>
          </section>

          {/* Lieferadresse */}
          <section className="mt-8">
            <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
              {t("LIEFERADRESSE")}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label>{t("VORNAME")}</Label>
                <Input
                  value={firstName}
                  onChange={setFirstName}
                  placeholder={t("CHECKOUT_PLACEHOLDER_FIRST")}
                  required
                />
              </div>
              <div>
                <Label>{t("NACHNAME")}</Label>
                <Input
                  value={lastName}
                  onChange={setLastName}
                  placeholder={t("CHECKOUT_PLACEHOLDER_LAST")}
                  required
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>{t("STRASSE")}</Label>
              <Input
                value={street}
                onChange={setStreet}
                placeholder={t("CHECKOUT_PLACEHOLDER_STREET")}
                required
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label>{t("PLZ")}</Label>
                <Input
                  value={zip}
                  onChange={setZip}
                  placeholder={t("CHECKOUT_PLACEHOLDER_ZIP")}
                  required
                />
              </div>
              <div>
                <Label>{t("ORT")}</Label>
                <Input
                  value={city}
                  onChange={setCity}
                  placeholder={t("CHECKOUT_PLACEHOLDER_CITY")}
                  required
                />
              </div>
            </div>
            {provinceOptions.length > 0 && (
              <div className="mt-3">
                <Label>{t("CHECKOUT_PROVINZ")}</Label>
                <Select
                  value={state}
                  onChange={setState}
                  required
                  disabled={provinceListLoading}
                  options={[
                    {
                      value: "",
                      label: provinceListLoading
                        ? t("CHECKOUT_PROVINCE_LOADING")
                        : t("CHECKOUT_SELECT_PLACEHOLDER"),
                    },
                    ...provinceOptions.map((p) => ({
                      value: p.code,
                      label: p.name,
                    })),
                  ]}
                />
              </div>
            )}
            <div className="mt-3">
              <Label>{t("LAND")}</Label>
              <Select
                value={country}
                onChange={(v) => {
                  setCountry(v);
                  setState("");
                  setPaymentIntentError("");
                  setError("");
                }}
                options={countrySelectOptions}
              />
            </div>
            {isWholesale &&
              country.trim() &&
              !isWholesaleCountryAllowed(country.trim().toUpperCase()) && (
                <p className="mt-1 rounded border border-amber-600/45 bg-amber-950/35 px-2 py-1.5 text-[10px] text-amber-200/95">
                  {t("CHECKOUT_ERROR_WHOLESALE_EU_ONLY")}
                </p>
              )}
            {!isWholesale && items.length > 0 && (
              <FreeShippingTrigger
                variant="checkout"
                shippingCountry={country.trim().toUpperCase()}
                isWholesale={isWholesale}
                observeActive
              />
            )}
            {!isWholesale &&
              shipMultiChoice &&
              (country === "AT" || country === "DE") &&
              shipOptions.length > 1 &&
              shipResolved &&
              !shipError &&
              !shipNoZone && (
                <div className="mt-6 border border-[#222] bg-[#111] p-4">
                  <Label>{t("CHECKOUT_VERSANDART")}</Label>
                  <div className="mt-3 space-y-3">
                    {shipOptions.map((opt) => (
                      <label
                        key={opt.rate_id}
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          type="radio"
                          name="shipMethod"
                          checked={selectedShipRateId === opt.rate_id}
                          onChange={() => {
                            setSelectedShipRateId(opt.rate_id);
                            setShipRate(opt.price);
                            setShipLabel(opt.name);
                            setShipMethodId(opt.method_id);
                            setShipRateId(opt.rate_id);
                            setShipInstanceId(
                              typeof opt.instance_id === "number"
                                ? opt.instance_id
                                : undefined
                            );
                            setStripeShipCents(Math.round(opt.price * 100));
                          }}
                          className="h-4 w-4 accent-[#c0392b]"
                        />
                        {getShippingLogo(opt.name)}
                        <span className="flex-1 text-sm text-white/90">
                          {opt.name}
                        </span>
                        <span className="text-sm font-bold text-[#c0392b]">
                          {formatPrice(opt.price)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            <div className="mt-3">
              <Label>
                {t("FIRMA")}{" "}
                {!isWholesale && t("CHECKOUT_FIRMA_OPTIONAL")}
              </Label>
              <Input
                value={company}
                onChange={(v) => {
                  setCompany(v);
                  if (error && isWholesale) setError("");
                }}
                placeholder={t("CHECKOUT_PLACEHOLDER_COMPANY")}
                required={isWholesale}
              />
            </div>
            {isWholesale && (
              <div className="mt-3">
                <Label>{t("CHECKOUT_UID_LABEL")}</Label>
                <Input
                  value={vat}
                  onChange={(v) => {
                    setVat(v.toUpperCase());
                    setVatFieldError("");
                    if (error) setError("");
                  }}
                  onBlur={() => {
                    if (!vat.trim()) {
                      setVatFieldError(t("CHECKOUT_VALIDATION_UID_REQUIRED"));
                      return;
                    }
                    if (!validateEuVatFormat(vat)) {
                      setVatFieldError(t("CHECKOUT_VALIDATION_UID_FORMAT"));
                      return;
                    }
                    setVatFieldError("");
                  }}
                  placeholder={t("CHECKOUT_PLACEHOLDER_UID")}
                  required
                />
                {vatFieldError && (
                  <p className="mt-1 text-[10px] text-[#c0392b]">{vatFieldError}</p>
                )}
              </div>
            )}
          </section>

          {/* 10% SPAREN — Newsletter opt-in + WELCOME coupon (B2C / guest only) */}
          {!isWholesale && !autoCouponApplied && !isNewsletterSubscribed && (
            <div
              className="mt-8"
              style={{
                border: "1px solid #c0392b",
                background: "rgba(192,57,43,0.04)",
                padding: "16px",
              }}
            >
              <Checkbox checked={newsletter} onChange={(v) => {
                setNewsletter(v);
                if (v && email && !couponId) {
                  // Subscribe + get unique coupon code
                  fetch("/api/newsletter/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                  })
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.alreadySubscribed) {
                        setIsNewsletterSubscribed(true);
                        setError(t("CHECKOUT_NEWSLETTER_ALREADY"));
                        setNewsletter(false);
                        return;
                      }
                      if (data.success) {
                        setIsNewsletterSubscribed(true);
                        setCouponName("WELCOME10");
                        setCouponDiscount("−10%");
                        setAutoCouponApplied(true);
                      }
                    })
                    .catch(() => {});
                }
              }}>
                <span style={{ color: "#c0392b", fontWeight: "bold" }}>
                  {t("CHECKOUT_NEWSLETTER_SPAREN")}
                </span>
                {t("CHECKOUT_NEWSLETTER_OPTIN")}
              </Checkbox>
            </div>
          )}

          {/* Zahlung */}
          <section className="mt-8">
            <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
              {t("ZAHLUNG")}
            </h2>

            {/* Payment method selector */}
            <div className="mt-4 space-y-2">
              <PaymentOption
                selected={paymentMethod === "card"}
                onClick={() => setPaymentMethod("card")}
                label={t("KREDITKARTE")}
                icon={<CardIcons />}
              />
              <PaymentOption
                selected={paymentMethod === "bank"}
                onClick={() => setPaymentMethod("bank")}
                label={t("UEBERWEISUNG")}
                icon={<BankIcon />}
              />
              <PaymentOption
                selected={paymentMethod === "paypal"}
                onClick={() => setPaymentMethod("paypal")}
                label="PAYPAL"
                icon={<PayPalIcon />}
              />
              <PaymentOption
                selected={paymentMethod === "klarna"}
                onClick={() => setPaymentMethod("klarna")}
                label="KLARNA"
                icon={<KlarnaIcon />}
              />
              <PaymentOption
                selected={paymentMethod === "eps"}
                onClick={() => setPaymentMethod("eps")}
                label={t("CHECKOUT_EPS_TRANSFER")}
                icon={<EpsIcon />}
              />
            </div>

            {/* Payment method content */}
            <div className="mt-4">
              {paymentMethod === "card" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <CardElement
                    options={{
                      hidePostalCode: true,
                      style: {
                        base: {
                          color: "#ffffff",
                          backgroundColor: "#111111",
                          fontSize: "16px",
                          fontFamily: "Arial, sans-serif",
                          "::placeholder": { color: "#555" },
                        },
                        invalid: { color: "#c0392b" },
                      },
                    }}
                  />
                </div>
              )}

              {paymentMethod === "bank" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <p className="text-xs leading-relaxed text-white/50">
                    {bankPaymentText}
                    <br /><br />
                    <strong style={{ color: "rgba(255,255,255,0.8)" }}>
                      UncutTV GmbH<br />
                      Raiffeisen Landesbank Tirol AG<br />
                      IBAN: AT52 3600 0000 0083 4978<br />
                      BIC: RZTIAT22
                    </strong>
                  </p>
                  {isWholesale && (
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
                </div>
              )}

              {paymentMethod === "paypal" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  {process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? (
                    <PayPalButtonWrapper
                      totalPrice={totalPrice}
                      couponDiscount={paypalCouponDiscount}
                      shippingAmount={orderSummaryShippingAmount}
                      resolvedOrderTotalEuro={
                        wholesaleNonRcTotals?.grossTotal ?? null
                      }
                      onApprove={handlePayPalApprove}
                      disabled={
                        wholesaleCheckoutBlocked || shippingBlocksCheckout
                      }
                      onError={() =>
                        setError(t("CHECKOUT_PAYPAL_FAILED"))
                      }
                      onBeforePayPalCreateOrder={async () => {
                        if (wholesaleCheckoutBlocked) {
                          throw new Error(t("CHECKOUT_PAYPAL_WHOLESALE_BLOCKED"));
                        }
                      }}
                    />
                  ) : (
                    <p className="text-xs text-white/30">
                      {t("CHECKOUT_PAYPAL_UNAVAILABLE")}
                    </p>
                  )}
                </div>
              )}

              {paymentMethod === "klarna" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <p className="text-xs leading-relaxed text-white/50">
                    {t("CHECKOUT_KLARNA_REDIRECT")}
                  </p>
                </div>
              )}

              {paymentMethod === "eps" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <p className="text-xs leading-relaxed text-white/50">
                    {t("CHECKOUT_EPS_REDIRECT")}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Error */}
          {paymentIntentError && (
            <p className="mt-4 text-sm text-[#c0392b]">{paymentIntentError}</p>
          )}
          {error && (
            <p className="mt-4 text-sm text-[#c0392b]">{error}</p>
          )}

          {/* Submit — hide for PayPal (it has its own button) */}
          {paymentMethod !== "paypal" && (
            <button
              type="submit"
              disabled={
                processing ||
                isStripeDisabled ||
                wholesaleCheckoutBlocked ||
                shippingBlocksCheckout
              }
              className="mt-8 flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:cursor-default disabled:opacity-60"
            >
              {processing ? (
                <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" />
              ) : (
                t("JETZT_KAUFEN")
              )}
            </button>
          )}
        </form>

        {/* Right — Order Summary */}
        <div className="lg:sticky lg:top-[80px] lg:self-start">
          <OrderSummary
            couponId={couponId}
            couponName={couponName}
            couponDiscount={couponDiscount}
            onCouponApplied={(id, name, display) => {
              setCouponId(id);
              setCouponName(name);
              setCouponDiscount(display);
            }}
            onCouponRemoved={() => {
              setCouponId(null);
              setCouponName(null);
              setCouponDiscount(null);
            }}
            subtotal={totalPrice}
            hideCoupon={isWholesale}
            shippingAmount={orderSummaryShippingAmount}
            shippingLabel={shipLabel}
            shippingLoading={uiShippingLoading}
            shippingError={shipError}
            shippingNoZone={shipNoZone}
            wholesaleNonRcTotals={wholesaleNonRcTotals}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Wrapper with Stripe Elements ── */

export default function CheckoutForm() {
  console.log("[CheckoutDebug] CheckoutForm rendering");
  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#c0392b",
            borderRadius: "0px",
          },
        },
      }}
    >
      <CheckoutInner />
    </Elements>
  );
}
