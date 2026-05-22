import { NextResponse } from "next/server";
import { isCountryBlocked } from "@/lib/blocked-countries";
import { isWholesaleCountryAllowed } from "@/lib/wholesale-allowed-countries";
import { stripe } from "@/lib/stripe";
import type { CartItem } from "@/lib/CartContext";
import {
  COUPON_REMOVE_SENTINEL,
  computePaymentIntentAmount,
  formatPiAmountLog,
} from "@/lib/compute-payment-intent-amount";
import {
  buildVideoUtmOrderMeta,
  type VideoUtmInput,
} from "@/lib/video-utm-server";

interface Body {
  paymentIntentId: string;
  items: CartItem[];
  couponCode?: string;
  customerEmail?: string;
  shippingCents?: number;
  isReverseCharge?: boolean;
  isWholesale?: boolean;
  taxCountry?: string;
  shippingForStripe?: {
    name: string;
    line1: string;
    city: string;
    postal_code: string;
    country: string;
    state?: string;
  };
  shippingMethodTitle?: string;
  videoUtm?: VideoUtmInput;
  piUpdateSeq?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const paymentIntentId = body.paymentIntentId?.trim();
    if (!paymentIntentId?.startsWith("pi_")) {
      return NextResponse.json(
        { error: "Ungültige Payment Intent ID." },
        { status: 400 }
      );
    }

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
      piUpdateSeq,
    } = body;

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

    const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
    const prev = { ...(existing.metadata ?? {}) };
    delete prev.cart_items;

    if (
      piUpdateSeq != null &&
      Number.isFinite(piUpdateSeq) &&
      typeof prev.pi_update_seq === "string" &&
      prev.pi_update_seq.trim() !== ""
    ) {
      const prevSeq = parseInt(prev.pi_update_seq, 10);
      if (Number.isFinite(prevSeq) && piUpdateSeq < prevSeq) {
        console.log(
          `[PI] Skipped stale update ${paymentIntentId}: seq=${piUpdateSeq} < stored=${prevSeq}`
        );
        return NextResponse.json({
          clientSecret: existing.client_secret,
          amount: existing.amount,
          stale: true,
        });
      }
    }

    const explicitRemove = couponCode === COUPON_REMOVE_SENTINEL;
    const omitCoupon =
      !explicitRemove &&
      (couponCode === undefined || couponCode === "");
    const fallbackCouponCode = explicitRemove
      ? undefined
      : omitCoupon
        ? prev.coupon_code?.trim() || undefined
        : undefined;
    const effectiveCouponCode = explicitRemove
      ? COUPON_REMOVE_SENTINEL
      : omitCoupon
        ? undefined
        : couponCode;

    let breakdown;
    try {
      breakdown = await computePaymentIntentAmount({
        items,
        couponCode: effectiveCouponCode,
        fallbackCouponCode,
        customerEmail,
        shippingCents,
        isWholesale,
        isReverseCharge,
        taxCountry,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ungültiger Gutschein";
      return NextResponse.json(
        { error: "invalid_coupon", message },
        { status: 400 }
      );
    }

    const { totalCents, couponMeta, shippingCents: ship } = breakdown;

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

    const couponMetaRecord = couponMeta as Record<string, string>;

    const paymentIntent = await stripe.paymentIntents.update(paymentIntentId, {
      amount: totalCents,
      ...(stripeShipping ? { shipping: stripeShipping } : {}),
      metadata: {
        ...prev,
        cart_items_count: String(items.length),
        coupon_code: couponMetaRecord.coupon_code ?? "",
        coupon_wc_id: couponMetaRecord.coupon_wc_id ?? "",
        discount_amount_cents: couponMetaRecord.discount_amount_cents ?? "",
        discount_label: couponMetaRecord.discount_label ?? "",
        is_reverse_charge: isReverseCharge === true ? "true" : "false",
        shipping_cents: String(ship),
        is_wholesale: isWholesale === true ? "true" : "false",
        shipping_method_title: metaShipTitle,
        shipping_country: metaShipCountry,
        ...(piUpdateSeq != null && Number.isFinite(piUpdateSeq)
          ? { pi_update_seq: String(piUpdateSeq) }
          : {}),
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

    console.log(
      formatPiAmountLog(
        "Updated",
        paymentIntentId,
        breakdown,
        items.length,
        piUpdateSeq
      )
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
      couponCodeApplied: breakdown.couponCodeApplied,
      discountCents: breakdown.discountCents,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "PaymentIntent-Update fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
