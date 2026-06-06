import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { fetchOrderDetailsPayloadByReference } from "@/lib/order-lookup";
import {
  findWooOrderByPaymentReference,
  mapWooOrderToOrderDetailsPayload,
  type WooOrderForDetails,
} from "@/lib/wc-order-from-payment";
import { wooFetch } from "@/lib/woocommerce";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");
  const wooOrderId = searchParams.get("woo_order_id");

  try {
    if (wooOrderId) {
      const id = Number(wooOrderId);
      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json(
          { error: "invalid_woo_order_id" },
          { status: 400 }
        );
      }
      const order = await wooFetch<WooOrderForDetails>(
        `/orders/${id}`,
        {},
        { cache: "no-store" }
      );
      return NextResponse.json(mapWooOrderToOrderDetailsPayload(order));
    }

    if (sessionId) {
      const wcPayload = await fetchOrderDetailsPayloadByReference(sessionId);
      if (wcPayload) {
        return NextResponse.json(wcPayload);
      }

      return NextResponse.json(
        {
          error: "order_not_synced",
          message:
            "Bestellung noch nicht synchronisiert. Bitte Seite in ein paar Sekunden neu laden.",
        },
        { status: 404 }
      );
    }

    if (paymentIntentId?.startsWith("paypal_")) {
      const wooOrder = await findWooOrderByPaymentReference(paymentIntentId);
      if (!wooOrder?.id) {
        return NextResponse.json(
          {
            error: "order_not_synced",
            message:
              "Bestellung noch nicht synchronisiert. Bitte Seite in ein paar Sekunden neu laden.",
          },
          { status: 404 }
        );
      }
      const fullOrder = await wooFetch<WooOrderForDetails>(
        `/orders/${wooOrder.id}`,
        {},
        { cache: "no-store" }
      );
      return NextResponse.json(mapWooOrderToOrderDetailsPayload(fullOrder));
    }

    if (paymentIntentId) {
      const wcPayload =
        await fetchOrderDetailsPayloadByReference(paymentIntentId);
      if (wcPayload) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const shippingMeta = parseInt(pi.metadata?.shipping_cents ?? "", 10);
        const shippingCents =
          wcPayload.shippingCents > 0
            ? wcPayload.shippingCents
            : Number.isFinite(shippingMeta) && shippingMeta > 0
              ? shippingMeta
              : 0;
        const isWholesaleShipping =
          pi.metadata?.is_wholesale === "true" ||
          wcPayload.isWholesaleShipping;
        const shippingMethodTitle =
          typeof pi.metadata?.shipping_method_title === "string" &&
          pi.metadata.shipping_method_title.trim()
            ? pi.metadata.shipping_method_title.trim()
            : wcPayload.shippingMethodTitle;
        const shippingCountry =
          typeof pi.metadata?.shipping_country === "string" &&
          pi.metadata.shipping_country.trim()
            ? pi.metadata.shipping_country.trim().toUpperCase()
            : wcPayload.shippingCountry;

        let customerEmail = wcPayload.customerEmail;
        let customerName = wcPayload.customerName;
        if (!customerEmail && pi.latest_charge) {
          try {
            const charge = await stripe.charges.retrieve(
              pi.latest_charge as string
            );
            customerEmail = charge.billing_details?.email || "";
            customerName = charge.billing_details?.name || "";
          } catch {
            // charge not available yet
          }
        }

        return NextResponse.json({
          ...wcPayload,
          customerName,
          customerEmail,
          total: (pi.amount / 100).toFixed(2),
          currency: pi.currency || wcPayload.currency,
          shippingCents,
          isWholesaleShipping,
          shippingMethodTitle: shippingMethodTitle || undefined,
          shippingCountry: shippingCountry || undefined,
        });
      }

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status === "succeeded") {
        return NextResponse.json(
          {
            error: "order_not_synced",
            message:
              "Bestellung noch nicht synchronisiert. Bitte Seite in ein paar Sekunden neu laden.",
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "payment_not_complete", message: "Zahlung nicht abgeschlossen." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Keine Session-ID oder PaymentIntent-ID." },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Bestellung nicht gefunden." },
      { status: 404 }
    );
  }
}
