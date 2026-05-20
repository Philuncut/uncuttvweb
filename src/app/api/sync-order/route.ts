import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
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
import { sendOrderConfirmationEmails } from "@/lib/order-confirmation-email";

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

async function trySendOrderConfirmation(result: CreateWooOrderResult): Promise<void> {
  try {
    await sendOrderConfirmationEmails(result.orderId, result.wooOrder);
  } catch (mailError) {
    console.error("[OrderMail] Failed to send confirmation:", mailError);
  }
}

export async function POST(request: Request) {
  let body: SyncBody | undefined;
  try {
    body = (await request.json()) as SyncBody;

    const isWholesaleCheckout = body.isWholesale === true;

    if (body.paymentIntentId?.startsWith("pi_")) {
      const result = await createWooOrderFromPayment({
        paymentIntentId: body.paymentIntentId,
        syncContext: {
          customer: body.customer,
          items: body.items,
          billing: body.billing,
          meta_data: body.meta_data,
          checkoutShipping: body.checkoutShipping,
          isReverseCharge: body.isReverseCharge,
          isWholesale: body.isWholesale,
          videoUtm: body.videoUtm,
        },
      });
      await trySendOrderConfirmation(result);
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

      cartItems = JSON.parse(session.metadata?.cart_items || "[]");
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
      stripePiId: transactionId.startsWith("pi_") ? transactionId : undefined,
    });

    await trySendOrderConfirmation(result);

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

    console.error("[sync-order] failed:", err);
    return NextResponse.json(
      {
        error: "sync-order-failed",
        message: err instanceof Error ? err.message : String(err),
        stack:
          err instanceof Error
            ? err.stack?.split("\n").slice(0, 5).join("\n")
            : undefined,
        debug: {
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
