import { NextResponse } from "next/server";
import type { CartItem } from "@/lib/CartContext";
import {
  coerceStripeMetadata,
  normalizeCartMetaItems,
  parseCartItemsFromPiMetadata,
} from "@/lib/cart-items-from-context";
import { applyCouponToSubtotalCents } from "@/lib/coupon-helpers";
import { parsePrice } from "@/lib/parse-price";
import { stripe } from "@/lib/stripe";
import type { MarketingUtmInput } from "@/lib/marketing-utm-server";
import type { VideoUtmInput } from "@/lib/video-utm-server";
import {
  createWooOrderFromCheckoutSync,
  createWooOrderFromPayment,
  PaymentIntentNotSucceededError,
  type CartMeta,
  type CustomerInfo,
  type CheckoutShippingInput,
  type CreateWooOrderResult,
} from "@/lib/wc-order-from-payment";
import type { OrderMetaEntry } from "@/lib/video-utm-server";
import { sendOrderConfirmationWithPdf } from "@/lib/send-order-confirmation-with-pdf";
import {
  estimateOrphanAmountEur,
  paypalOrderIdFromPaymentIntent,
  recordPayPalOrphanFailure,
  resolveSyncBodyEmail,
  validatePayPalSyncEmail,
} from "@/lib/paypal-orphan-order";

interface SyncBody {
  sessionId?: string;
  paymentIntentId?: string;
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

async function reverseChargeFromStripePaymentIntent(
  piRef: string | { id?: string } | null | undefined
): Promise<boolean> {
  const id =
    typeof piRef === "string"
      ? piRef
      : piRef && typeof piRef === "object"
        ? piRef.id
        : undefined;
  if (!id || !id.startsWith("pi_")) {
    return false;
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(id);
    return pi.metadata?.is_reverse_charge === "true";
  } catch {
    return false;
  }
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function paymentTypeFromTransaction(transactionId: string): "paypal" | "stripe" {
  return transactionId.startsWith("paypal_") ? "paypal" : "stripe";
}

async function trySendOrderConfirmation(
  result: CreateWooOrderResult,
  transactionId = ""
): Promise<void> {
  try {
    await sendOrderConfirmationWithPdf(result.orderId, {
      paymentType: paymentTypeFromTransaction(transactionId),
    });
  } catch (mailError) {
    console.error("[OrderMail] Failed to send confirmation:", mailError);
  }
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

export async function POST(request: Request) {
  let body: SyncBody | undefined;
  try {
    body = (await request.json()) as SyncBody;

    const isWholesaleCheckout = body.isWholesale === true;

    if (body.paymentIntentId?.startsWith("pi_")) {
      const piId = body.paymentIntentId.trim();
      const pi = await stripe.paymentIntents.retrieve(piId);
      const piMeta = coerceStripeMetadata(pi.metadata ?? undefined);

      let cartItems = normalizeCartMetaItems(body.items);
      if (cartItems.length === 0) {
        cartItems = parseCartItemsFromPiMetadata(piMeta);
      }

      console.log(
        `[sync-order] Stripe card sync pi=${piId} inBody=${body.items?.length ?? 0} ` +
          `bodyNorm=${normalizeCartMetaItems(body.items).length} ` +
          `snapshotLen=${piMeta.cart_snapshot?.length ?? 0} ` +
          `resolved=${cartItems.length} raw0=${JSON.stringify(body.items?.[0] ?? null)}`
      );

      if (cartItems.length === 0) {
        return NextResponse.json(
          {
            error: "no_cart_items",
            message:
              "Keine Artikel für WooCommerce-Order (weder Request-Body noch PI cart_snapshot).",
            debug: {
              paymentIntentId: piId,
              cart_items_count: piMeta.cart_items_count,
              has_cart_snapshot: Boolean(piMeta.cart_snapshot?.trim()),
            },
          },
          { status: 400 }
        );
      }

      const result = await createWooOrderFromPayment({
        paymentIntentId: piId,
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
      await trySendOrderConfirmation(
        result,
        body.paymentIntentId ?? ""
      );
      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        status: result.status,
      });
    }

    let cartItems: CartMeta[] = [];
    let billing: Record<string, string> = {};
    let shipping: Record<string, string> = {};
    let transactionId = "";
    let isReverseCharge = false;

    if (body.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
        expand: ["customer_details", "line_items", "payment_intent"],
      });

      if (session.payment_status !== "paid") {
        return NextResponse.json(
          { error: "Zahlung nicht abgeschlossen." },
          { status: 400 }
        );
      }

      const stripeLineItems = await stripe.checkout.sessions.listLineItems(
        body.sessionId,
        { limit: 100 }
      );
      cartItems = stripeLineItems.data.map((line) => {
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
          {
            error: "legacy_session_empty",
            message: "Legacy Checkout Session enthält keine Line Items.",
          },
          { status: 400 }
        );
      }
      const piField = session.payment_intent;
      transactionId =
        typeof piField === "string"
          ? piField
          : piField && typeof piField === "object" && "id" in piField
            ? String((piField as { id: string }).id)
            : "";

      isReverseCharge = await reverseChargeFromStripePaymentIntent(
        session.payment_intent
      );

      const customer = session.customer_details;
      const ship = (session as unknown as Record<string, unknown>)
        .shipping_details as {
        name?: string;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          postal_code?: string;
          country?: string;
        };
      } | undefined;

      billing = {
        first_name: customer?.name?.split(" ")[0] || "",
        last_name: customer?.name?.split(" ").slice(1).join(" ") || "",
        email: customer?.email || "",
        phone: customer?.phone || "",
        address_1: customer?.address?.line1 || "",
        address_2: customer?.address?.line2 || "",
        city: customer?.address?.city || "",
        postcode: customer?.address?.postal_code || "",
        country: customer?.address?.country || "",
      };

      shipping = {
        first_name: ship?.name?.split(" ")[0] || billing.first_name,
        last_name:
          ship?.name?.split(" ").slice(1).join(" ") || billing.last_name,
        address_1: ship?.address?.line1 || billing.address_1,
        address_2: ship?.address?.line2 || billing.address_2,
        city: ship?.address?.city || billing.city,
        postcode: ship?.address?.postal_code || billing.postcode,
        country: ship?.address?.country || billing.country,
      };
    } else if (body.paymentIntentId && body.customer && body.items) {
      cartItems = body.items;
      transactionId = body.paymentIntentId;
      isReverseCharge = body.isReverseCharge === true;

      const c = body.customer;
      const stateVal = asString(c.state);
      billing = {
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        address_1: c.street,
        city: c.city,
        postcode: c.zip,
        country: c.country,
        ...(stateVal ? { state: stateVal } : {}),
      };
      shipping = { ...billing };
    } else {
      return NextResponse.json(
        { error: "Fehlende Daten." },
        { status: 400 }
      );
    }

    let couponCodeResolved: string | undefined;
    let stripeDiscountCents: number | undefined;
    const codeTrimmed = body.couponCode?.trim();

    if (codeTrimmed && !isWholesaleCheckout) {
      const subtotalCents = cartItems.reduce(
        (sum, item) =>
          sum +
          Math.round(parsePrice(item.price) * 100) * Math.max(1, item.qty),
        0
      );
      const applied = await applyCouponToSubtotalCents(
        codeTrimmed,
        subtotalCents,
        cartMetaToCartItems(cartItems),
        body.customerEmail?.trim() || body.customer?.email?.trim()
      );
      if (!applied.ok) {
        return NextResponse.json(
          { error: "invalid_coupon", message: applied.error },
          { status: 400 }
        );
      }
      couponCodeResolved = applied.metadata.coupon_code;
      stripeDiscountCents = applied.discountCents;
    }

    if (transactionId.startsWith("paypal_")) {
      const resolvedEmail = resolveSyncBodyEmail(body);
      if (!validatePayPalSyncEmail(resolvedEmail)) {
        console.error(
          "[sync-order] PayPal flow with invalid email, persisting orphan",
          {
            paymentIntentId: transactionId,
            customerEmail: body.customer?.email ?? "",
            customerEmailField: body.customerEmail ?? "",
          }
        );
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
          {
            error: "invalid_email",
            message: "Die E-Mail-Adresse ist ungültig.",
            orphaned: true,
          },
          { status: 400 }
        );
      }
      if (body.customer) {
        body.customer.email = resolvedEmail;
      }
      billing.email = resolvedEmail;
      shipping.email = resolvedEmail;
    }

    const result = await createWooOrderFromCheckoutSync({
      cartItems,
      billing,
      shipping,
      transactionId,
      isReverseCharge,
      isWholesaleCheckout,
      billingOverrides: body.billing,
      meta_data: body.meta_data,
      checkoutShipping: body.checkoutShipping,
      videoUtm: body.videoUtm,
      marketingUtm: body.marketingUtm,
      stripePiId: transactionId.startsWith("pi_") ? transactionId : undefined,
      couponCode: couponCodeResolved,
      stripeDiscountCents,
    });

    if (transactionId.startsWith("paypal_")) {
      const wooTotal = (result.wooOrder as { total?: string } | undefined)
        ?.total;
      const wooTotalCents = wooTotal
        ? Math.round(parsePrice(String(wooTotal)) * 100)
        : 0;
      console.log(
        `[PayPal] order=${result.orderId}, wcTotal=${wooTotalCents}, discount=-${stripeDiscountCents ?? 0}, coupon=${couponCodeResolved ?? "none"}`
      );
    }

    await trySendOrderConfirmation(result, transactionId);

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof PaymentIntentNotSucceededError) {
      return NextResponse.json(
        {
          error: "payment_intent_not_succeeded",
          message: err.message,
        },
        { status: 400 }
      );
    }

    const code =
      err instanceof Error
        ? (err as Error & { code?: string }).code
        : undefined;
    if (code === "country_blocked") {
      return NextResponse.json(
        {
          error: "country_blocked",
          message:
            err instanceof Error
              ? err.message
              : "Versand in dieses Land ist nicht möglich",
        },
        { status: 403 }
      );
    }
    if (code === "wholesale_eu_only") {
      return NextResponse.json(
        {
          error: "wholesale_eu_only",
          message:
            err instanceof Error
              ? err.message
              : "Wholesale ist nur innerhalb der EU verfügbar",
        },
        { status: 403 }
      );
    }

    const failMsg = err instanceof Error ? err.message : String(err);
    const resolvedLogEmail = body ? resolveSyncBodyEmail(body) : "";
    console.error(
      `[sync-order] FAILED pi=${body?.paymentIntentId ?? "?"} msg=${failMsg} itemsInBody=${body?.items?.length ?? 0} email=${resolvedLogEmail}`
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
        message: err instanceof Error ? err.message : String(err),
        stack:
          err instanceof Error
            ? err.stack?.split("\n").slice(0, 5).join("\n")
            : undefined,
        debug: {
          paymentIntentId: body?.paymentIntentId,
          isReverseCharge: body?.isReverseCharge,
          isWholesale: body?.isWholesale,
          itemsCount: body?.items?.length,
          customerEmail: body?.customer?.email,
        },
      },
      { status: 400 }
    );
  }
}
