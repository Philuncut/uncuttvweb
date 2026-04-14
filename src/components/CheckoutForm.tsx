"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
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

console.log("[Stripe Debug] PUBLISHABLE_KEY prefix:", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.slice(0, 20));
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

type PaymentMethod = "card" | "bank" | "paypal" | "klarna" | "eps";

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
  placeholder,
  type = "text",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white outline-none focus:border-[#c0392b]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
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
}: {
  couponId: string | null;
  couponName: string | null;
  couponDiscount: string | null;
  onCouponApplied: (id: string, name: string, display: string) => void;
  onCouponRemoved: () => void;
  subtotal: number;
}) {
  // Calculate discounted total
  let discountedTotal = subtotal;
  let discountAmount = 0;
  if (couponDiscount) {
    const percentMatch = couponDiscount.match(/(\d+)%/);
    const fixedMatch = couponDiscount.match(/€([\d.]+)/);
    if (percentMatch) {
      discountAmount = subtotal * (parseFloat(percentMatch[1]) / 100);
      discountedTotal = subtotal - discountAmount;
    } else if (fixedMatch) {
      discountAmount = parseFloat(fixedMatch[1]);
      discountedTotal = Math.max(0, subtotal - discountAmount);
    }
  }
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
            ? `−€${data.amount_off}`
            : "";
        onCouponApplied(data.couponId, data.name, display);
        setCode("");
      } else {
        setError(data.error || "Ungültiger Code.");
      }
    } catch {
      setError("Fehler bei der Überprüfung.");
    } finally {
      setLoading(false);
    }
  }, [code, onCouponApplied]);

  return (
    <div className="border border-[#222] bg-[#111] p-6">
      <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
        BESTELLUNG
      </h2>

      <div className="mt-4 space-y-3">
        {items.map(({ product, quantity }) => {
          const image = product.images[0]?.src;
          const price = parseFloat(product.price || "0");
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
                <p className="text-[10px] text-white/40">Menge: {quantity}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-white">
                €{(price * quantity).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="my-4 border-t border-[#222]" />

      {couponId ? (
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
              placeholder="Gutschein-Code eingeben"
              className="flex-1 border border-[#333] bg-[#0a0a0a] px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#c0392b]"
            />
            <button
              type="button"
              onClick={validate}
              disabled={loading}
              className="shrink-0 cursor-pointer border border-[#c0392b] bg-transparent px-4 py-2 text-[10px] font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white disabled:opacity-50"
            >
              {loading ? "..." : "EINLÖSEN"}
            </button>
          </div>
          {error && (
            <p className="mt-1 text-[10px] text-[#c0392b]">{error}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-white/50">
          <span>Zwischensumme</span>
          <span>€{subtotal.toFixed(2)}</span>
        </div>
        {couponDiscount && discountAmount > 0 && (
          <div className="flex justify-between text-xs text-green-400">
            <span>Rabatt ({couponDiscount})</span>
            <span>−€{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-[#222] pt-2">
          <span className="text-sm font-bold tracking-wider text-white/60">
            GESAMT
          </span>
          <span className="text-xl font-black text-white">
            €{discountedTotal.toFixed(2)}
          </span>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-white/30">
        Versandkosten werden im nächsten Schritt berechnet.
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
        <span className="text-[10px]">Sichere SSL-Verschlüsselung</span>
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
  onApprove,
  onError,
}: {
  totalPrice: number;
  couponDiscount: string | null;
  onApprove: (data: Record<string, unknown>, actions: { order?: { capture: () => Promise<Record<string, unknown>> } }) => Promise<void>;
  onError: () => void;
}) {
  // Memoize createOrder so PayPal doesn't reinitialize
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createOrder = useCallback(
    (_data: any, actions: any) => {
      let paypalTotal = totalPrice;
      if (couponDiscount) {
        const pctMatch = couponDiscount.match(/(\d+)%/);
        const fixMatch = couponDiscount.match(/€([\d.]+)/);
        if (pctMatch) paypalTotal = totalPrice * (1 - parseFloat(pctMatch[1]) / 100);
        else if (fixMatch) paypalTotal = Math.max(0, totalPrice - parseFloat(fixMatch[1]));
      }
      return actions.order.create({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: paypalTotal.toFixed(2),
            },
            description: "UNCUTTV Shop Bestellung",
          },
        ],
      });
    },
    [totalPrice, couponDiscount]
  );

  return (
    <PayPalScriptProvider options={paypalScriptOptions}>
      <PayPalButtons
        fundingSource={FUNDING.PAYPAL}
        style={{
          color: "gold",
          shape: "rect",
          layout: "vertical",
          label: "paypal",
        }}
        createOrder={createOrder}
        onApprove={onApprove}
        onError={onError}
        forceReRender={[totalPrice, couponDiscount]}
      />
    </PayPalScriptProvider>
  );
}

function CheckoutInner() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { items, totalPrice, clearCart } = useCart();

  const [email, setEmail] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("AT");

  // Pre-fill fields from logged-in user data
  useEffect(() => {
    async function prefill() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data.email && !email) setEmail(data.email);
        if (data.firstName && !firstName) setFirstName(data.firstName);
        if (data.lastName && !lastName) setLastName(data.lastName);
        if (data.billing?.address_1 && !street) setStreet(data.billing.address_1);
        if (data.billing?.postcode && !zip) setZip(data.billing.postcode);
        if (data.billing?.city && !city) setCity(data.billing.city);
        if (data.billing?.country && !country) setCountry(data.billing.country);
      } catch {
        // Not logged in — fields stay empty
      }
    }
    prefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  const [couponId, setCouponId] = useState<string | null>(null);
  const [couponName, setCouponName] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [autoCouponApplied, setAutoCouponApplied] = useState(false);

  // Read ?coupon= from URL and auto-apply
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlCoupon = params.get("coupon");
    console.log("[Checkout] URL coupon param:", urlCoupon);
    if (!urlCoupon) return;

    async function applyCoupon() {
      try {
        // First try Stripe validation
        const res = await fetch(
          `/api/validate-coupon?code=${encodeURIComponent(urlCoupon!)}`
        );
        const data = await res.json();
        console.log("[Checkout] Coupon validation result:", data);

        if (data.valid) {
          const display = data.percent_off
            ? `−${data.percent_off}%`
            : data.amount_off
              ? `−€${data.amount_off}`
              : "−10%";
          setCouponId(data.couponId);
          setCouponName(data.name || urlCoupon);
          setCouponDiscount(display);
          setAutoCouponApplied(true);
          console.log("[Checkout] Coupon auto-applied:", data.couponId, display);
        } else {
          // Coupon not in Stripe — still show banner as applied (discount handled server-side)
          console.log("[Checkout] Coupon not valid in Stripe, applying as display-only");
          setCouponName(urlCoupon!);
          setCouponDiscount("−10%");
          setAutoCouponApplied(true);
        }
      } catch (err) {
        console.error("[Checkout] Coupon validation error:", err);
      }
    }
    applyCoupon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create PaymentIntent for card payments
  useEffect(() => {
    if (items.length === 0 || (paymentMethod !== "card" && paymentMethod !== "klarna" && paymentMethod !== "eps")) return;

    async function createPI() {
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          couponId: couponId || undefined,
        }),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      }
    }
    createPI();
  }, [items, couponId, paymentMethod]);

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
  };

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setProcessing(true);
      setError("");

      if (paymentMethod === "card") {
        if (!stripe || !elements || !clientSecret) {
          setProcessing(false);
          return;
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setError("Kartenelement nicht gefunden.");
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
                  country,
                },
              },
            },
          });

        if (stripeError) {
          setError(stripeError.message || "Zahlung fehlgeschlagen.");
          setProcessing(false);
          return;
        }

        if (paymentIntent?.status === "succeeded") {
          try {
            await fetch("/api/sync-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentIntentId: paymentIntent.id,
                customer: customerData,
                items: cartMeta,
              }),
            });
          } catch {
            // non-blocking
          }
          clearCart();
          router.push(
            "/bestellung/erfolg?payment_intent=" + paymentIntent.id
          );
        }
      } else if (paymentMethod === "bank") {
        try {
          const res = await fetch("/api/create-bank-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer: customerData,
              items: cartMeta,
            }),
          });
          const data = await res.json();
          if (data.success) {
            clearCart();
            router.push(
              "/bestellung/erfolg?method=bank&order=" + data.orderNumber
            );
          } else {
            setError(data.error || "Bestellung fehlgeschlagen.");
            setProcessing(false);
          }
        } catch {
          setError("Verbindungsfehler. Bitte versuche es erneut.");
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
            country,
          },
        };

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
          setError(confirmError.message || "Zahlung fehlgeschlagen.");
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
      items,
      cartMeta,
      customerData,
      clearCart,
      router,
    ]
  );

  // PayPal handlers
  const handlePayPalApprove = useCallback(
    async (_data: Record<string, unknown>, actions: { order?: { capture: () => Promise<Record<string, unknown>> } }) => {
      const details = await actions.order?.capture();
      try {
        await fetch("/api/sync-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentIntentId: `paypal_${(details as Record<string, unknown>)?.id || "unknown"}`,
            customer: customerData,
            items: cartMeta,
          }),
        });
      } catch {
        // non-blocking
      }
      clearCart();
      router.push("/bestellung/erfolg?method=paypal");
    },
    [customerData, cartMeta, clearCart, router]
  );

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6">
        <p className="text-white/50">Dein Warenkorb ist leer.</p>
        <a
          href="/shop"
          className="mt-4 inline-block text-sm text-[#c0392b] hover:underline"
        >
          Zurück zum Shop
        </a>
      </div>
    );
  }

  const needsStripe = paymentMethod === "card" || paymentMethod === "klarna" || paymentMethod === "eps";
  const isStripeDisabled = needsStripe && (!stripe || !clientSecret);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
        {/* Left — Form */}
        <form onSubmit={handleSubmit}>
          {/* Auto-applied coupon banner */}
          {autoCouponApplied && (
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
                  10% Rabattcode {couponName || "WELCOME10"} aktiv
                </p>
                <p style={{ color: "rgba(39,174,96,0.7)", fontSize: 11, margin: "2px 0 0" }}>
                  Dein Rabatt wird beim Bezahlen abgezogen
                </p>
              </div>
            </div>
          )}

          {/* Kontakt */}
          <section>
            <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
              KONTAKT
            </h2>
            <div className="mt-4">
              <Label>E-MAIL</Label>
              <Input
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="deine@email.com"
                required
              />
            </div>
          </section>

          {/* Lieferadresse */}
          <section className="mt-8">
            <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
              LIEFERADRESSE
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label>VORNAME</Label>
                <Input
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="Max"
                  required
                />
              </div>
              <div>
                <Label>NACHNAME</Label>
                <Input
                  value={lastName}
                  onChange={setLastName}
                  placeholder="Mustermann"
                  required
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>STRASSE + HAUSNUMMER</Label>
              <Input
                value={street}
                onChange={setStreet}
                placeholder="Musterstraße 1"
                required
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label>PLZ</Label>
                <Input
                  value={zip}
                  onChange={setZip}
                  placeholder="6020"
                  required
                />
              </div>
              <div>
                <Label>ORT</Label>
                <Input
                  value={city}
                  onChange={setCity}
                  placeholder="Innsbruck"
                  required
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>LAND</Label>
              <Select
                value={country}
                onChange={setCountry}
                options={[
                  { value: "AT", label: "Österreich" },
                  { value: "DE", label: "Deutschland" },
                  { value: "CH", label: "Schweiz" },
                ]}
              />
            </div>
          </section>

          {/* Newsletter + Rabatt */}
          {!autoCouponApplied && (
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
                        setError("Du bist bereits für den Newsletter angemeldet.");
                        setNewsletter(false);
                        return;
                      }
                      if (data.couponCode) {
                        setCouponName(data.couponCode);
                        setCouponDiscount("−10%");
                        setAutoCouponApplied(true);
                      }
                    })
                    .catch(() => {});
                }
              }}>
                <span style={{ color: "#c0392b", fontWeight: "bold" }}>10% SPAREN</span>
                {" "}— Newsletter abonnieren &amp; persönlichen Rabattcode sofort erhalten
              </Checkbox>
            </div>
          )}

          {/* Zahlung */}
          <section className="mt-8">
            <h2 className="border-l-4 border-[#c0392b] pl-3 text-sm font-black tracking-[0.15em] text-white">
              ZAHLUNG
            </h2>

            {/* Payment method selector */}
            <div className="mt-4 space-y-2">
              <PaymentOption
                selected={paymentMethod === "card"}
                onClick={() => setPaymentMethod("card")}
                label="KREDITKARTE"
                icon={<CardIcons />}
              />
              <PaymentOption
                selected={paymentMethod === "bank"}
                onClick={() => setPaymentMethod("bank")}
                label="ÜBERWEISUNG"
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
                label="EPS-ÜBERWEISUNG"
                icon={<EpsIcon />}
              />
            </div>

            {/* Payment method content */}
            <div className="mt-4">
              {paymentMethod === "card" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <CardElement
                    options={{
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
                    Bitte überweise den Betrag innerhalb von 5 Werktagen an:
                    <br /><br />
                    <strong style={{ color: "rgba(255,255,255,0.8)" }}>
                      UncutTV GmbH<br />
                      Raiffeisen Landesbank Tirol AG<br />
                      IBAN: AT52 3600 0000 0083 4978<br />
                      BIC: RZTIAT22
                    </strong>
                  </p>
                </div>
              )}

              {paymentMethod === "paypal" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  {process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? (
                    <PayPalButtonWrapper
                      totalPrice={totalPrice}
                      couponDiscount={couponDiscount}
                      onApprove={handlePayPalApprove}
                      onError={() =>
                        setError(
                          "PayPal-Zahlung fehlgeschlagen. Bitte versuche es erneut."
                        )
                      }
                    />
                  ) : (
                    <p className="text-xs text-white/30">
                      PayPal ist derzeit nicht verfügbar.
                    </p>
                  )}
                </div>
              )}

              {paymentMethod === "klarna" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <p className="text-xs leading-relaxed text-white/50">
                    Du wirst nach dem Absenden zur Klarna-Zahlung
                    weitergeleitet.
                  </p>
                </div>
              )}

              {paymentMethod === "eps" && (
                <div className="border border-[#333] bg-[#111] p-4">
                  <p className="text-xs leading-relaxed text-white/50">
                    Du wirst nach dem Absenden zur EPS-Zahlung
                    weitergeleitet.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Error */}
          {error && (
            <p className="mt-4 text-sm text-[#c0392b]">{error}</p>
          )}

          {/* Submit — hide for PayPal (it has its own button) */}
          {paymentMethod !== "paypal" && (
            <button
              type="submit"
              disabled={processing || isStripeDisabled}
              className="mt-8 flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:cursor-default disabled:opacity-60"
            >
              {processing ? (
                <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" />
              ) : (
                "JETZT KAUFEN"
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
          />
        </div>
      </div>
    </div>
  );
}

/* ── Wrapper with Stripe Elements ── */

export default function CheckoutForm() {
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
