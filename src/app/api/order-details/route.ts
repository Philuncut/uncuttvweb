import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { fetchOrderDetailsPayloadByReference } from "@/lib/order-lookup";
import {
  findWooOrderByPaymentReference,
  mapWooOrderToOrderDetailsPayload,
} from "@/lib/wc-order-from-payment";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");

  try {
    if (sessionId) {
      const wcPayload = await fetchOrderDetailsPayloadByReference(sessionId);
      if (wcPayload) {
        return NextResponse.json(wcPayload);
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items"],
      });

      const items =
        session.line_items?.data.map((item) => ({
          description: item.description,
          quantity: item.quantity ?? 1,
          amount: item.amount_total ?? 0,
        })) ?? [];

      const shippingCents =
        session.total_details?.amount_shipping != null
          ? session.total_details.amount_shipping
          : 0;

      const stripeLineItems = await stripe.checkout.sessions.listLineItems(
        sessionId,
        { limit: 100 }
      );
      const line_items = stripeLineItems.data.map((line) => {
        const qty = Math.max(1, line.quantity ?? 1);
        const totalCents = line.amount_total ?? 0;
        const productId =
          typeof line.price?.product === "string"
            ? line.price.product
            : typeof line.price?.product === "object" &&
                line.price.product &&
                "id" in line.price.product
              ? String((line.price.product as { id: string | number }).id)
              : "0";
        return {
          product_id: productId,
          name: line.description || "Artikel",
          quantity: qty,
          price: totalCents / 100 / qty,
        };
      });

      return NextResponse.json({
        customerName: session.customer_details?.name || "",
        customerEmail: session.customer_details?.email || "",
        total: ((session.amount_total ?? 0) / 100).toFixed(2),
        currency: session.currency || "eur",
        items,
        shippingCents,
        isWholesaleShipping: false,
        line_items,
      });
    }

    if (paymentIntentId?.startsWith("paypal_")) {
      const wooOrder = await findWooOrderByPaymentReference(paymentIntentId);
      if (!wooOrder) {
        return NextResponse.json(
          {
            error: "order_not_synced",
            message:
              "Bestellung noch nicht synchronisiert. Bitte Seite in ein paar Sekunden neu laden.",
          },
          { status: 404 }
        );
      }
      return NextResponse.json(mapWooOrderToOrderDetailsPayload(wooOrder));
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
