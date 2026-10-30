/**
 * POST /api/sync-order
 *
 * Frueher: Der Browser meldete nach der Zahlung "ich habe bezahlt", und
 * diese Route legte die WooCommerce-Bestellung sofort als processing mit
 * set_paid an. Ohne Zahlungspruefung und ohne verlaessliche Idempotenz;
 * so entstanden #6390 bis #6392.
 *
 * Jetzt ist die Route ein ABGLEICH, keine Zahlungsquelle mehr:
 *
 * - Stripe (`pi_...`): Bestellung zur Zahlung sicherstellen (normalerweise
 *   schon ueber /api/checkout/prepare-order angelegt) und den PaymentIntent
 *   frisch bei Stripe pruefen. Nur bei `succeeded` und passendem Betrag
 *   wird sie bezahlt (stripe-zahlung.ts), dieselbe Logik wie im Webhook.
 *   Ist der Webhook schneller, antwortet die Route einfach "already_paid".
 *   Ist Stripe noch nicht durch, bleibt die Bestellung "pending" und der
 *   Webhook erledigt den Rest.
 *
 * - PayPal (`paypal_...`): nur noch fuer Browser mit altem Code, die die
 *   Capture selbst ausgefuehrt haben. Die Order wird bei PayPal geladen und
 *   die Bestellung nur mit COMPLETED-Capture und ohne Duplikat verbucht
 *   (paypal-zahlung.ts). Neue Clients gehen ueber /api/paypal/*.
 *
 * - Legacy Checkout Session (`cs_...`): Zahlung aus der Session (bei Stripe
 *   geladen), Bestellung pending anlegen, dann ueber die geprueften
 *   PaymentIntent-Daten verbuchen.
 *
 * Bestaetigungsmail und Haendler-Benachrichtigung laufen nach der Antwort
 * (after), nur wenn die Bestellung hier gerade bezahlt wurde.
 */

import { NextResponse, after } from "next/server";
import type { CartItem } from "@/lib/CartContext";
import { normalizeCartMetaItems } from "@/lib/cart-items-from-context";
import { applyCouponToSubtotalCents } from "@/lib/coupon-helpers";
import { parsePrice } from "@/lib/parse-price";
import { stripe } from "@/lib/stripe";
import type { MarketingUtmInput } from "@/lib/marketing-utm-server";
import type { VideoUtmInput } from "@/lib/video-utm-server";
import type {
  CartMeta,
  CustomerInfo,
  CheckoutShippingInput,
  CreateWooOrderResult,
} from "@/lib/wc-order-from-payment";
import type { OrderMetaEntry } from "@/lib/video-utm-server";
import {
  BestellungOhneArtikelFehler,
  verbucheStripeZahlung,
} from "@/lib/stripe-zahlung";
import { verbucheAltePayPalZahlung } from "@/lib/paypal-zahlung";
import { PayPalFehler } from "@/lib/paypal-server";
import { nachZahlungseingang, type Zahlungsart } from "@/lib/bestellung-zahlung";
import {
  estimateOrphanAmountEur,
  paypalOrderIdFromPaymentIntent,
  recordPayPalOrphanFailure,
  resolveSyncBodyEmail,
  validatePayPalSyncEmail,
} from "@/lib/paypal-orphan-order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncBody {
  sessionId?: string;
  paymentIntentId?: string;
  checkoutKey?: string;
  orderIdHint?: number;
  customer?: CustomerInfo;
  items?: CartMeta[];
  billing?: Record<string, string>;
  meta_data?: OrderMetaEntry[];
  isReverseCharge?: boolean;
  isWholesale?: boolean;
  checkoutShipping?: CheckoutShippingInput;
  videoUtm?: VideoUtmInput;
  marketingUtm?: MarketingUtmInput;
  couponCode?: string;
  customerEmail?: string;
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

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function checkoutKeyAus(body: SyncBody): string | undefined {
  return typeof body.checkoutKey === "string" &&
    /^[a-f0-9]{16,64}$/.test(body.checkoutKey)
    ? body.checkoutKey
    : undefined;
}

function orderIdHintAus(body: SyncBody): number | undefined {
  return typeof body.orderIdHint === "number" &&
    Number.isFinite(body.orderIdHint) &&
    body.orderIdHint > 0
    ? body.orderIdHint
    : undefined;
}

function antwort(result: CreateWooOrderResult, zahlungsart: Zahlungsart) {
  if (result.status === "paid") {
    after(() => nachZahlungseingang(result.orderId, zahlungsart));
  }
  return NextResponse.json({
    success: true,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    status: result.status,
    paid: result.status === "paid" || result.status === "already_paid",
  });
}

async function reportPayPalSyncFailure(
  body: SyncBody,
  reason: string,
  errorDetails: unknown,
  syncStatus?: number
): Promise<void> {
  const paymentIntentId = body.paymentIntentId?.trim() ?? "";
  if (!paymentIntentId.startsWith("paypal_")) return;

  const paypalOrderId = paypalOrderIdFromPaymentIntent(paymentIntentId);
  const resolvedEmail = resolveSyncBodyEmail(body);
  const amountEur = estimateOrphanAmountEur(body);

  await recordPayPalOrphanFailure(
    {
      paypal_order_id: paypalOrderId,
      capture_id: null,
      amount_eur: amountEur,
      customer_email: resolvedEmail || null,
      raw_body: body,
      error_reason: reason,
      error_details: errorDetails,
    },
    {
      reason,
      paypalOrderId,
      email: resolvedEmail || undefined,
      formEmail: body.customer?.email,
      syncStatus,
      syncError: errorDetails,
      cartItems: body.items,
      rawBody: body,
    }
  );
}

/** Bestelleingaben aus dem Browser-Body (PayPal-Altpfad und Legacy-Session). */
async function bestellEingabenAusBody(
  body: SyncBody,
  cartItems: CartMeta[],
  billing: Record<string, string>,
  shipping: Record<string, string>,
  isReverseCharge: boolean
) {
  const isWholesaleCheckout = body.isWholesale === true;

  let couponCodeResolved: string | undefined;
  let discountCents: number | undefined;
  const codeTrimmed = body.couponCode?.trim();
  if (codeTrimmed && !isWholesaleCheckout) {
    const subtotalCents = cartItems.reduce(
      (sum, item) =>
        sum + Math.round(parsePrice(item.price) * 100) * Math.max(1, item.qty),
      0
    );
    const applied = await applyCouponToSubtotalCents(
      codeTrimmed,
      subtotalCents,
      cartMetaToCartItems(cartItems),
      body.customerEmail?.trim() || body.customer?.email?.trim()
    );
    if (!applied.ok) {
      const err = new Error(applied.error);
      (err as Error & { code?: string }).code = "invalid_coupon";
      throw err;
    }
    couponCodeResolved = applied.metadata.coupon_code;
    discountCents = applied.discountCents;
  }

  return {
    cartItems,
    billing,
    shipping,
    isReverseCharge,
    isWholesaleCheckout,
    billingOverrides: body.billing,
    meta_data: body.meta_data,
    checkoutShipping: body.checkoutShipping,
    videoUtm: body.videoUtm,
    marketingUtm: body.marketingUtm,
    couponCode: couponCodeResolved,
    stripeDiscountCents: discountCents,
  };
}

export async function POST(request: Request) {
  let body: SyncBody | undefined;
  try {
    body = (await request.json()) as SyncBody;
    const ref = body.paymentIntentId?.trim() ?? "";

    // ---- Stripe PaymentIntent: Abgleich mit serverseitig geladenem PI ----
    if (ref.startsWith("pi_")) {
      const cartItems = normalizeCartMetaItems(body.items);
      const result = await verbucheStripeZahlung({
        paymentIntentId: ref,
        quelle: "sync-order (Abgleich Erfolgsseite)",
        checkoutKey: checkoutKeyAus(body),
        orderIdHinweis: orderIdHintAus(body),
        syncContext: {
          customer: body.customer,
          items: cartItems,
          billing: body.billing,
          meta_data: body.meta_data,
          checkoutShipping: body.checkoutShipping,
          isReverseCharge: body.isReverseCharge,
          isWholesale: body.isWholesale,
          videoUtm: body.videoUtm,
          marketingUtm: body.marketingUtm,
        },
      });
      console.log(
        `[sync-order] pi=${ref} -> #${result.orderNumber} ${result.status}`
      );
      return antwort(result, "stripe");
    }

    // ---- PayPal, alter Browser-Pfad (Capture im Browser) ----
    if (ref.startsWith("paypal_")) {
      const cartItems = normalizeCartMetaItems(body.items);
      if (cartItems.length === 0 || !body.customer) {
        return NextResponse.json({ error: "Fehlende Daten." }, { status: 400 });
      }
      const resolvedEmail = resolveSyncBodyEmail(body);
      if (!validatePayPalSyncEmail(resolvedEmail)) {
        await reportPayPalSyncFailure(
          body,
          "invalid_email_pre_wc",
          {
            received_email: body.customer?.email ?? "",
            customer_email_field: body.customerEmail ?? "",
            billing_email: body.billing?.email ?? "",
          },
          400
        );
        return NextResponse.json(
          { error: "invalid_email", message: "Die E-Mail-Adresse ist ungültig.", orphaned: true },
          { status: 400 }
        );
      }
      const c = body.customer;
      const stateVal = asString(c.state);
      const billing: Record<string, string> = {
        first_name: c.firstName,
        last_name: c.lastName,
        email: resolvedEmail,
        address_1: c.street,
        city: c.city,
        postcode: c.zip,
        country: c.country,
        ...(stateVal ? { state: stateVal } : {}),
      };
      const eingaben = await bestellEingabenAusBody(
        body,
        cartItems,
        billing,
        { ...billing },
        body.isReverseCharge === true
      );
      const result = await verbucheAltePayPalZahlung(
        paypalOrderIdFromPaymentIntent(ref),
        eingaben
      );
      console.log(
        `[sync-order] ${ref} (alter Client) -> #${result.orderNumber} ${result.status}`
      );
      return antwort(result, "paypal");
    }

    // ---- Legacy Stripe Checkout Session ----
    if (body.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
        expand: ["customer_details", "line_items", "payment_intent"],
      });
      if (session.payment_status !== "paid") {
        return NextResponse.json({ error: "Zahlung nicht abgeschlossen." }, { status: 400 });
      }
      const piField = session.payment_intent;
      const piId =
        typeof piField === "string"
          ? piField
          : piField && typeof piField === "object" && "id" in piField
            ? String((piField as { id: string }).id)
            : "";
      if (!piId.startsWith("pi_")) {
        return NextResponse.json(
          { error: "legacy_session_no_pi", message: "Checkout Session ohne PaymentIntent." },
          { status: 400 }
        );
      }

      const stripeLineItems = await stripe.checkout.sessions.listLineItems(
        body.sessionId,
        { limit: 100 }
      );
      const cartItems: CartMeta[] = stripeLineItems.data.map((line) => {
        const qty = Math.max(1, line.quantity ?? 1);
        const totalCents = line.amount_total ?? 0;
        const productId =
          typeof line.price?.product === "string"
            ? parseInt(line.price.product.replace(/\D/g, ""), 10) || 0
            : typeof line.price?.product === "object" &&
                line.price.product &&
                "id" in line.price.product
              ? Number((line.price.product as { id: string | number }).id) || 0
              : 0;
        return {
          id: productId,
          name: line.description || "Artikel",
          qty,
          price: (totalCents / 100 / qty).toFixed(2),
        };
      });
      if (cartItems.length === 0) {
        return NextResponse.json(
          { error: "legacy_session_empty", message: "Legacy Checkout Session enthält keine Line Items." },
          { status: 400 }
        );
      }

      const customer = session.customer_details;
      const result = await verbucheStripeZahlung({
        paymentIntentId: piId,
        quelle: `sync-order (Legacy Checkout Session ${body.sessionId})`,
        syncContext: {
          items: cartItems,
          customer: {
            email: customer?.email || "",
            firstName: customer?.name?.split(" ")[0] || "",
            lastName: customer?.name?.split(" ").slice(1).join(" ") || "",
            street: customer?.address?.line1 || "",
            zip: customer?.address?.postal_code || "",
            city: customer?.address?.city || "",
            country: customer?.address?.country || "",
          },
        },
      });
      return antwort(result, "stripe");
    }

    return NextResponse.json({ error: "Fehlende Daten." }, { status: 400 });
  } catch (err) {
    if (err instanceof BestellungOhneArtikelFehler) {
      return NextResponse.json(
        {
          error: "no_cart_items",
          message: "Keine Artikel für WooCommerce-Order (weder Request-Body noch PI cart_snapshot).",
          debug: { paymentIntentId: body?.paymentIntentId },
        },
        { status: 400 }
      );
    }
    if (err instanceof PayPalFehler) {
      console.error(`[sync-order] PayPal: ${err.message} (debug ${err.debugId})`);
      if (body?.paymentIntentId?.startsWith("paypal_")) {
        await reportPayPalSyncFailure(body, "paypal_not_captured", err.message, 402);
      }
      return NextResponse.json(
        { error: "paypal_not_captured", message: err.message },
        { status: 402 }
      );
    }

    const code =
      err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "invalid_coupon") {
      return NextResponse.json(
        { error: "invalid_coupon", message: err instanceof Error ? err.message : "Ungültiger Gutschein" },
        { status: 400 }
      );
    }
    if (code === "country_blocked" || code === "wholesale_eu_only") {
      return NextResponse.json(
        { error: code, message: err instanceof Error ? err.message : code },
        { status: 403 }
      );
    }

    const failMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[sync-order] FAILED ref=${body?.paymentIntentId ?? body?.sessionId ?? "?"} msg=${failMsg}`
    );
    if (body?.paymentIntentId?.startsWith("paypal_")) {
      const reason = failMsg.includes("WooCommerce order creation failed")
        ? "wc_rejected"
        : "sync_order_failed";
      await reportPayPalSyncFailure(body, reason, failMsg, 400);
    }
    return NextResponse.json(
      {
        error: "sync-order-failed",
        message: failMsg,
        debug: {
          paymentIntentId: body?.paymentIntentId,
          itemsCount: body?.items?.length,
        },
      },
      { status: 400 }
    );
  }
}
