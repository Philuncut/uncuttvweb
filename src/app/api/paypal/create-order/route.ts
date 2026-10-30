/**
 * POST /api/paypal/create-order
 *
 * Wird vom PayPal-Button (createOrder-Callback) aufgerufen, BEVOR das
 * PayPal-Fenster aufgeht. Legt die WooCommerce-Bestellung als "pending" an
 * (oder findet die offene Bestellung dieser Kassen-Sitzung) und erzeugt
 * dazu die PayPal-Order mit dem Betrag der Woo-Bestellung. Vorher rechnete
 * der Browser den PayPal-Betrag selbst und legte die Order per JS-SDK an;
 * der Server konnte nichts pruefen (siehe paypal-zahlung.ts).
 *
 * Antwort: { paypalOrderId, orderId, orderNumber }. Der Browser gibt
 * paypalOrderId an das PayPal-SDK zurueck und ruft nach der Bestaetigung
 * /api/paypal/capture-order auf.
 */

import { NextResponse } from "next/server";
import type { CartItem } from "@/lib/CartContext";
import { normalizeCartMetaItems } from "@/lib/cart-items-from-context";
import { applyCouponToSubtotalCents } from "@/lib/coupon-helpers";
import { parsePrice } from "@/lib/parse-price";
import { legePayPalOrderZurBestellungAn } from "@/lib/paypal-zahlung";
import { PayPalFehler, paypalKonfiguriert } from "@/lib/paypal-server";
import type {
  CartMeta,
  CheckoutShippingInput,
  CustomerInfo,
} from "@/lib/wc-order-from-payment";
import type { OrderMetaEntry, VideoUtmInput } from "@/lib/video-utm-server";
import type { MarketingUtmInput } from "@/lib/marketing-utm-server";

export const dynamic = "force-dynamic";

type Body = {
  checkoutKey?: string;
  orderIdHint?: number;
  customer?: CustomerInfo;
  items?: CartMeta[];
  billing?: Record<string, string>;
  meta_data?: OrderMetaEntry[];
  checkoutShipping?: CheckoutShippingInput;
  isReverseCharge?: boolean;
  isWholesale?: boolean;
  videoUtm?: VideoUtmInput;
  marketingUtm?: MarketingUtmInput;
  couponCode?: string;
  customerEmail?: string;
  locale?: "de" | "en";
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

/** Minimalpruefung der Adresse; Woo wuerde die Bestellung sonst ohne Anschrift anlegen. */
function kundeVollstaendig(c: CustomerInfo | undefined): c is CustomerInfo {
  if (!c) return false;
  const pflicht = [c.email, c.firstName, c.lastName, c.street, c.zip, c.city, c.country];
  return pflicht.every((v) => asString(v).length > 0) && asString(c.email).includes("@");
}

function cartMetaToCartItems(items: CartMeta[]): CartItem[] {
  return items.map((item) => ({
    product: {
      id: Number(item.id),
      name: item.name,
      slug: "",
      status: "publish",
      price: item.price,
      regular_price: item.price,
      sale_price: "",
      on_sale: false,
      stock_status: "instock" as const,
      sku: "",
      images: [],
      categories: [],
      short_description: "",
      description: "",
      related_ids: [],
    },
    quantity: Math.max(1, Number(item.qty) || 1),
  }));
}

export async function POST(request: Request) {
  if (!paypalKonfiguriert()) {
    return NextResponse.json({ error: "paypal_not_configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const items = normalizeCartMetaItems(body.items);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "no_cart_items", message: "Warenkorb ist leer." },
      { status: 400 }
    );
  }
  if (!kundeVollstaendig(body.customer)) {
    return NextResponse.json(
      {
        error: "customer_incomplete",
        message: "Bitte zuerst alle Adressfelder ausfüllen.",
      },
      { status: 400 }
    );
  }
  const c = body.customer;
  const checkoutKey =
    typeof body.checkoutKey === "string" && /^[a-f0-9]{16,64}$/.test(body.checkoutKey)
      ? body.checkoutKey
      : undefined;
  const orderIdHint =
    typeof body.orderIdHint === "number" && Number.isFinite(body.orderIdHint) && body.orderIdHint > 0
      ? body.orderIdHint
      : undefined;
  const isWholesale = body.isWholesale === true;

  // Gutschein wie bisher im sync-order-PayPal-Pfad: serverseitig geprueft,
  // Rabatt auf die Zwischensumme.
  let couponCodeResolved: string | undefined;
  let discountCents: number | undefined;
  const codeTrimmed = body.couponCode?.trim();
  if (codeTrimmed && !isWholesale) {
    const subtotalCents = items.reduce(
      (sum, item) =>
        sum + Math.round(parsePrice(item.price) * 100) * Math.max(1, item.qty),
      0
    );
    const applied = await applyCouponToSubtotalCents(
      codeTrimmed,
      subtotalCents,
      cartMetaToCartItems(items),
      body.customerEmail?.trim() || c.email.trim()
    );
    if (!applied.ok) {
      return NextResponse.json(
        { error: "invalid_coupon", message: applied.error },
        { status: 400 }
      );
    }
    couponCodeResolved = applied.metadata.coupon_code;
    discountCents = applied.discountCents;
  }

  const stateVal = asString(c.state);
  const billing: Record<string, string> = {
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email.trim().toLowerCase(),
    address_1: c.street,
    city: c.city,
    postcode: c.zip,
    country: c.country,
    ...(stateVal ? { state: stateVal } : {}),
  };

  try {
    const ergebnis = await legePayPalOrderZurBestellungAn({
      checkoutKey,
      orderIdHinweis: orderIdHint,
      beschreibung:
        body.locale === "en" ? "UNCUTTV shop order" : "UNCUTTV Shop Bestellung",
      bestellung: {
        cartItems: items,
        billing,
        shipping: { ...billing },
        isReverseCharge: body.isReverseCharge === true,
        isWholesaleCheckout: isWholesale,
        billingOverrides: body.billing,
        meta_data: body.meta_data,
        checkoutShipping: body.checkoutShipping,
        videoUtm: body.videoUtm,
        marketingUtm: body.marketingUtm,
        couponCode: couponCodeResolved,
        stripeDiscountCents: discountCents,
      },
    });

    if (ergebnis.bereitsBezahlt) {
      return NextResponse.json(
        {
          error: "already_paid",
          message: "Diese Bestellung ist bereits bezahlt.",
          orderId: ergebnis.orderId,
          orderNumber: ergebnis.orderNumber,
          paypalOrderId: ergebnis.paypalOrderId,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      paypalOrderId: ergebnis.paypalOrderId,
      orderId: ergebnis.orderId,
      orderNumber: ergebnis.orderNumber,
      totalCents: ergebnis.totalCents,
    });
  } catch (err) {
    const code =
      err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "country_blocked" || code === "wholesale_eu_only") {
      return NextResponse.json(
        { error: code, message: err instanceof Error ? err.message : code },
        { status: 403 }
      );
    }
    if (err instanceof PayPalFehler) {
      console.error(`[paypal/create-order] PayPal: ${err.message} (debug ${err.debugId})`);
      return NextResponse.json(
        { error: "paypal_error", issue: err.issue, message: "PayPal ist gerade nicht erreichbar." },
        { status: 502 }
      );
    }
    console.error("[paypal/create-order] FAILED:", err);
    return NextResponse.json(
      { error: "create_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
