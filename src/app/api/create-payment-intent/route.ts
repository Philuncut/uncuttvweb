import { NextResponse } from "next/server";
import { isCountryBlocked } from "@/lib/blocked-countries";
import { isWholesaleCountryAllowed } from "@/lib/wholesale-allowed-countries";
import { stripe } from "@/lib/stripe";
import type { CartItem } from "@/lib/CartContext";
import { getVatRateForCountry } from "@/lib/eu-vat-rates";
import { parsePrice } from "@/lib/parse-price";
import { applyCouponToSubtotalCents } from "@/lib/apply-coupon-to-pi";
import {
  buildVideoUtmOrderMeta,
  type VideoUtmInput,
} from "@/lib/video-utm-server";

interface Body {
  items: CartItem[];
  /** WooCommerce coupon code (plaintext, e.g. welcome10). */
  couponCode?: string;
  customerEmail?: string;
  /** Versand in Cent (>= 0), aus Checkout */
  shippingCents?: number;
  /** EU B2B Reverse Charge — echoed in PI metadata when true (optional). */
  isReverseCharge?: boolean;
  /** Wholesale checkout — combined with taxCountry for net→gross PI amount when not RC. */
  isWholesale?: boolean;
  /** ISO2 shipping/billing country for wholesale net VAT gross-up. */
  taxCountry?: string;
  /** B2C: shipping address on PaymentIntent (incl. state for US/IT/…). */
  shippingForStripe?: {
    name: string;
    line1: string;
    city: string;
    postal_code: string;
    country: string;
    state?: string;
  };
  /** Echoed in PI metadata for success page / receipts (e.g. GLS, Post.at). */
  shippingMethodTitle?: string;
  videoUtm?: VideoUtmInput;
}

export async function POST(request: Request) {
  try {
    const {
      items,
      couponCode,
      customerEmail,
      shippingCents,
      isReverseCharge,
      isWholesale,
      taxCountry,
      shippingForStripe,
      shippingMethodTitle,
      videoUtm,
    } = (await request.json()) as Body;

    const videoUtmMeta = await buildVideoUtmOrderMeta(videoUtm);

    const resolvedCountry =
      isWholesale === true
        ? (taxCountry ?? "").trim().toUpperCase()
        : (shippingForStripe?.country ?? "").trim().toUpperCase();

    if (resolvedCountry) {
      if (isCountryBlocked(resolvedCountry)) {
        return NextResponse.json(
          {
            error: "country_blocked",
            message: "Versand in dieses Land ist nicht möglich",
          },
          { status: 403 }
        );
      }
      if (isWholesale === true && !isWholesaleCountryAllowed(resolvedCountry)) {
        return NextResponse.json(
          {
            error: "wholesale_eu_only",
            message: "Wholesale ist nur innerhalb der EU verfügbar",
          },
          { status: 403 }
        );
      }
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Warenkorb ist leer." },
        { status: 400 }
      );
    }

    const wholesaleNetPricing =
      isWholesale === true &&
      isReverseCharge !== true &&
      Boolean(taxCountry?.trim());

    const wholesaleVatFraction = (() => {
      const pct = getVatRateForCountry(taxCountry ?? "") ?? 20;
      return pct / 100;
    })();

    let totalCents = wholesaleNetPricing
      ? items.reduce((sum, item) => {
          const lineNet =
            Math.max(0, parsePrice(item.product.price)) *
            Math.max(1, item.quantity);
          return sum + Math.round(lineNet * (1 + wholesaleVatFraction) * 100);
        }, 0)
      : items.reduce((sum, item) => {
          return sum + Math.round(parsePrice(item.product.price) * 100) * item.quantity;
        }, 0);

    let couponMeta: Record<string, string> = {};
    const codeTrimmed = couponCode?.trim();
    if (codeTrimmed && isWholesale !== true) {
      const applied = await applyCouponToSubtotalCents(
        codeTrimmed,
        totalCents,
        items,
        customerEmail?.trim()
      );
      if (!applied.ok) {
        return NextResponse.json(
          { error: "invalid_coupon", message: applied.error },
          { status: 400 }
        );
      }
      totalCents = Math.max(0, totalCents - applied.discountCents);
      couponMeta = applied.metadata;
    }

    const ship =
      typeof shippingCents === "number" &&
      Number.isFinite(shippingCents) &&
      shippingCents >= 0
        ? Math.round(shippingCents)
        : 0;

    if (wholesaleNetPricing) {
      const shipNetEuro = ship / 100;
      totalCents += Math.round(shipNetEuro * (1 + wholesaleVatFraction) * 100);
    } else {
      totalCents += ship;
    }

    if (totalCents < 50) {
      return NextResponse.json(
        { error: "Mindestbestellwert nicht erreicht." },
        { status: 400 }
      );
    }

    const shipAddr = shippingForStripe;
    const metaShipTitle =
      typeof shippingMethodTitle === "string" && shippingMethodTitle.trim()
        ? shippingMethodTitle.trim()
        : isWholesale === true
          ? "Wholesale-Versand"
          : "";
    const metaShipCountry =
      isWholesale === true && taxCountry?.trim()
        ? taxCountry.trim().toUpperCase()
        : shipAddr?.country?.trim()
          ? shipAddr.country.trim().toUpperCase()
          : "";

    const stripeShipping =
      shipAddr &&
      isWholesale !== true &&
      shipAddr.name?.trim() &&
      shipAddr.line1?.trim() &&
      shipAddr.city?.trim() &&
      shipAddr.postal_code?.trim() &&
      shipAddr.country?.trim()
        ? {
            name: shipAddr.name.trim(),
            address: {
              line1: shipAddr.line1.trim(),
              city: shipAddr.city.trim(),
              postal_code: shipAddr.postal_code.trim(),
              country: shipAddr.country.trim().toUpperCase(),
              ...(shipAddr.state?.trim()
                ? { state: shipAddr.state.trim() }
                : {}),
            },
          }
        : undefined;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      ...(stripeShipping ? { shipping: stripeShipping } : {}),
      metadata: {
        cart_items: JSON.stringify(
          items.map((i) => ({
            id: i.product.id,
            name: i.product.name,
            qty: i.quantity,
            price: i.product.price,
          }))
        ),
        coupon_code: couponMeta.coupon_code ?? "",
        coupon_wc_id: couponMeta.coupon_wc_id ?? "",
        discount_amount_cents: couponMeta.discount_amount_cents ?? "",
        discount_label: couponMeta.discount_label ?? "",
        is_reverse_charge: isReverseCharge === true ? "true" : "false",
        shipping_cents: String(ship),
        is_wholesale: isWholesale === true ? "true" : "false",
        shipping_method_title: metaShipTitle,
        shipping_country: metaShipCountry,
        ...(videoUtmMeta[0]
          ? { utm_source: String(videoUtmMeta[0].value) }
          : {}),
        ...(videoUtmMeta[1]
          ? { utm_video_id: String(videoUtmMeta[1].value) }
          : {}),
        ...(videoUtmMeta[2]
          ? { utm_video_title: String(videoUtmMeta[2].value) }
          : {}),
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PaymentIntent fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
