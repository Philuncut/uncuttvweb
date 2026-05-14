import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type { CartItem } from "@/lib/CartContext";
import { getVatRateForCountry } from "@/lib/eu-vat-rates";
import { parsePrice } from "@/lib/parse-price";
import { formatPrice } from "@/lib/format-price";

interface Body {
  items: CartItem[];
  couponId?: string;
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
}

export async function POST(request: Request) {
  try {
    const {
      items,
      couponId,
      shippingCents,
      isReverseCharge,
      isWholesale,
      taxCountry,
      shippingForStripe,
      shippingMethodTitle,
    } = (await request.json()) as Body;

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

    // Apply coupon discount if provided
    let discountLabel = "";
    if (couponId) {
      try {
        const coupon = await stripe.coupons.retrieve(couponId);
        if (coupon.valid) {
          if (coupon.percent_off) {
            const discount = Math.round(totalCents * (coupon.percent_off / 100));
            totalCents -= discount;
            discountLabel = `-${coupon.percent_off}%`;
          } else if (coupon.amount_off) {
            totalCents = Math.max(0, totalCents - coupon.amount_off);
            discountLabel = `−${formatPrice(coupon.amount_off / 100)}`;
          }
        }
      } catch {
        // Invalid coupon — ignore silently, charge full price
      }
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
        coupon: couponId || "",
        discount: discountLabel,
        is_reverse_charge: isReverseCharge === true ? "true" : "false",
        shipping_cents: String(ship),
        is_wholesale: isWholesale === true ? "true" : "false",
        shipping_method_title: metaShipTitle,
        shipping_country: metaShipCountry,
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
