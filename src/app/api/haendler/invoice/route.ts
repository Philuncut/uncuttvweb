import { NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/auth-session";
import {
  fetchWooInvoicePdf,
  fetchWooOrderForOwnership,
  invoicePdfResponse,
  WooInvoiceFetchError,
} from "@/lib/fetch-woo-invoice";
import { maySeeInvoice } from "@/lib/invoice-ownership";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Portalzugang aus den geprüften Rollen, danach dieselbe Zuordnung der
  // Bestellung zur Kundennummer wie im Kundenkonto.
  const auth = await requirePortalSession();
  if (auth.response) return auth.response;
  const { session } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const orderIdParam = searchParams.get("order_id");

    if (!orderIdParam || !/^\d+$/.test(orderIdParam)) {
      return NextResponse.json({ error: "Keine Bestell-ID." }, { status: 400 });
    }

    const orderId = Number(orderIdParam);

    const order = await fetchWooOrderForOwnership(orderId);
    if (!order) {
      return NextResponse.json(
        { error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    if (!maySeeInvoice(order, session)) {
      return NextResponse.json({ error: "Zugriff verweigert." }, { status: 403 });
    }

    const { buffer, filename } = await fetchWooInvoicePdf(orderId, {
      orderNumber: order.number,
    });

    return invoicePdfResponse(buffer, filename);
  } catch (error) {
    if (error instanceof WooInvoiceFetchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[haendler/invoice]", error);
    return NextResponse.json(
      { error: "Rechnung konnte nicht abgerufen werden." },
      { status: 500 }
    );
  }
}
