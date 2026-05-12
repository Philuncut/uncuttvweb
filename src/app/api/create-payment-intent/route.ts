import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type { CartItem } from "@/lib/CartContext";
import { standardVatFraction } from "@/lib/woo-vat-split";

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

    let totalCents = wholesaleNetPricing
      ? items.reduce((sum, item) => {
          const lineNet =
            Math.max(0, parseFloat(item.product.price) || 0) *
            Math.max(1, item.quantity);
          const r = standardVatFraction(taxCountry!);
          return sum + Math.round(lineNet * (1 + r) * 100);
        }, 0)
      : items.reduce((sum, item) => {
          return sum + Math.round(parseFloat(item.product.price) * 100) * item.quantity;
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
            discountLabel = `-€${(coupon.amount_off / 100).toFixed(2)}`;
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
      const r = standardVatFraction(taxCountry!);
      const shipNetEuro = ship / 100;
      totalCents += Math.round(shipNetEuro * (1 + r) * 100);
    } else {
      totalCents += ship;
    }

    if (totalCents < 50) {
      return NextResponse.json(
        { error: "Mindestbestellwert nicht erreicht." },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
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
