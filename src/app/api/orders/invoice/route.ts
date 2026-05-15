import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchWooInvoicePdf,
  fetchWooOrderForOwnership,
  invoicePdfResponse,
  WooInvoiceFetchError,
} from "@/lib/fetch-woo-invoice";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderIdParam = searchParams.get("order_id");

    if (!orderIdParam || !/^\d+$/.test(orderIdParam)) {
      return NextResponse.json({ error: "Keine Bestell-ID." }, { status: 400 });
    }

    const orderId = Number(orderIdParam);
    const cookieStore = await cookies();
    const customerEmail = cookieStore.get("woo_customer_email")?.value;

    if (!customerEmail) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const order = await fetchWooOrderForOwnership(orderId);
    if (!order) {
      return NextResponse.json(
        { error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    if (order.billing.email.toLowerCase() !== customerEmail.toLowerCase()) {
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
    console.error("[orders/invoice]", error);
    return NextResponse.json(
      { error: "Rechnung konnte nicht abgerufen werden." },
      { status: 500 }
    );
  }
}
