import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

interface LineItem {
  name: string;
  quantity: number;
  total: string;
  price: number;
}

interface Address {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  postcode: string;
  country: string;
}

interface WooOrder {
  id: number;
  number: string;
  customer_id: number;
  date_created: string;
  total: string;
  billing: Address & { email: string };
  shipping: Address;
  line_items: LineItem[];
  meta_data: Array<{ key: string; value: string }>;
}

interface WooCustomer {
  id: number;
  billing: Address & { email: string; phone: string };
  shipping: Address;
  meta_data: Array<{ key: string; value: string }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");

    if (!orderId) {
      return NextResponse.json({ error: "Keine Bestell-ID." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const haendlerEmail = cookieStore.get("haendler_email")?.value;

    if (!haendlerEmail) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    // Fetch order
    const orderRes = await fetch(
      `${WOO_URL}/wp-json/wc/v3/orders/${orderId}`,
      {
        headers: {
          Authorization: AUTH_HEADER,
          "Content-Type": "application/json",
        },
      }
    );

    if (!orderRes.ok) {
      return NextResponse.json(
        { error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    const order: WooOrder = await orderRes.json();

    // Verify ownership
    if (order.billing.email.toLowerCase() !== haendlerEmail.toLowerCase()) {
      return NextResponse.json({ error: "Zugriff verweigert." }, { status: 403 });
    }

    // Fetch customer data for UID and shipping address
    let customerData: WooCustomer | null = null;
    if (order.customer_id) {
      try {
        const cusRes = await fetch(
          `${WOO_URL}/wp-json/wc/v3/customers/${order.customer_id}`,
          {
            headers: {
              Authorization: AUTH_HEADER,
              "Content-Type": "application/json",
            },
          }
        );
        if (cusRes.ok) {
          customerData = await cusRes.json();
          console.log("[Invoice] Full customer object:", JSON.stringify(customerData, null, 2));
        } else {
          console.log("[Invoice] Customer fetch failed:", cusRes.status);
        }
      } catch (e) {
        console.log("[Invoice] Customer fetch error:", e);
      }
    } else {
      console.log("[Invoice] No customer_id on order");
    }

    // Extract UID from customer meta_data (primary) or order meta_data (fallback)
    const customerUid = customerData?.meta_data?.find((m) => m.key === "uid_nummer")?.value || "";
    const orderUid = order.meta_data?.find((m) => m.key === "uid_nummer")?.value || "";
    const uidNummer = customerUid || orderUid;
    console.log("[Invoice] UID found:", uidNummer, "(customer:", customerUid, "order:", orderUid, ")");

    // Use customer company if order billing company is empty
    const firma = order.billing.company || customerData?.billing?.company || "";
    console.log("[Invoice] Firma:", firma);

    const cusShip = customerData?.shipping;
    const billing = order.billing;

    console.log("[Invoice] Billing (Rechnungsanschrift):", JSON.stringify(billing, null, 2));
    console.log("[Invoice] Customer shipping (Lieferanschrift):", JSON.stringify(cusShip, null, 2));

    // Generate PDF
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const { height } = page.getSize();
    const RED = rgb(192 / 255, 57 / 255, 43 / 255);
    const WHITE_TEXT = rgb(0.2, 0.2, 0.2);
    const GREY = rgb(0.5, 0.5, 0.5);

    let y = height - 50;

    // ── Header: Logo ──
    page.drawText("UNCUT", {
      x: 50,
      y,
      size: 24,
      font: fontBold,
      color: WHITE_TEXT,
    });
    page.drawText("TV", {
      x: 50 + fontBold.widthOfTextAtSize("UNCUT", 24),
      y,
      size: 24,
      font: fontBold,
      color: RED,
    });

    // Company details right-aligned
    const companyLines = [
      "UncutTV GmbH",
      "Kalchgruben 4/11",
      "6094 Axams, Österreich",
      "ATU 815 26 957 · FN 643542 k",
      "office@uncuttv.at",
    ];
    let cy = y;
    for (const line of companyLines) {
      const w = font.widthOfTextAtSize(line, 8);
      page.drawText(line, { x: 545 - w, y: cy, size: 8, font, color: GREY });
      cy -= 12;
    }

    y -= 50;

    // ── Divider ──
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 30;

    // ── Recipient (Rechnungsanschrift) ──
    page.drawText("Rechnungsanschrift:", { x: 50, y: y + 12, size: 7, font, color: GREY });

    const recipientLines = [
      firma,
      `${billing.first_name} ${billing.last_name}`,
      billing.address_1,
      billing.address_2 || "",
      `${billing.postcode} ${billing.city}`,
      billing.country,
    ].filter(Boolean);

    for (const line of recipientLines) {
      page.drawText(line, { x: 50, y, size: 10, font, color: WHITE_TEXT });
      y -= 15;
    }

    // UID below recipient
    if (uidNummer) {
      page.drawText(`UID-Nr.: ${uidNummer}`, { x: 50, y, size: 9, font, color: GREY });
      y -= 15;
    }

    // ── Lieferanschrift (from customer.shipping) ──
    if (cusShip?.address_1?.trim()) {
      const shipStartY = y + recipientLines.length * 15 + (uidNummer ? 15 : 0);
      page.drawText("Lieferanschrift:", { x: 320, y: shipStartY + 12, size: 7, font, color: GREY });
      let sy = shipStartY;
      const shipLines = [
        cusShip.company || firma,
        `${cusShip.first_name || billing.first_name} ${cusShip.last_name || billing.last_name}`,
        cusShip.address_1,
        cusShip.address_2 || "",
        `${cusShip.postcode} ${cusShip.city}`,
        cusShip.country,
      ].filter(Boolean);
      for (const line of shipLines) {
        page.drawText(line, { x: 320, y: sy, size: 9, font, color: WHITE_TEXT });
        sy -= 13;
      }
    }

    y -= 20;

    // ── Invoice meta ──
    const invoiceNumber = `RE-${order.number}-2026`;
    const invoiceDate = new Date(order.date_created).toLocaleDateString("de-AT");

    page.drawText("RECHNUNG", {
      x: 50,
      y,
      size: 18,
      font: fontBold,
      color: WHITE_TEXT,
    });
    y -= 22;

    page.drawText(`Rechnungsnummer: ${invoiceNumber}`, {
      x: 50,
      y,
      size: 9,
      font,
      color: GREY,
    });
    y -= 14;
    page.drawText(`Rechnungsdatum: ${invoiceDate}`, {
      x: 50,
      y,
      size: 9,
      font,
      color: GREY,
    });
    y -= 14;
    page.drawText(`Bestellnummer: #${order.number}`, {
      x: 50,
      y,
      size: 9,
      font,
      color: GREY,
    });

    y -= 30;

    // ── Table header ──
    const colX = { pos: 50, name: 80, qty: 340, unit: 400, total: 480 };

    page.drawRectangle({
      x: 50,
      y: y - 2,
      width: 495,
      height: 18,
      color: rgb(0.95, 0.95, 0.95),
    });

    const thSize = 8;
    page.drawText("POS", { x: colX.pos, y: y + 2, size: thSize, font: fontBold, color: GREY });
    page.drawText("PRODUKT", { x: colX.name, y: y + 2, size: thSize, font: fontBold, color: GREY });
    page.drawText("MENGE", { x: colX.qty, y: y + 2, size: thSize, font: fontBold, color: GREY });
    page.drawText("EINZELPREIS", { x: colX.unit, y: y + 2, size: thSize, font: fontBold, color: GREY });
    page.drawText("GESAMT", { x: colX.total, y: y + 2, size: thSize, font: fontBold, color: GREY });

    y -= 20;

    // ── Table rows ──
    let subtotalCents = 0;
    order.line_items.forEach((item, i) => {
      const itemTotal = parseFloat(item.total);
      const unitPrice = item.quantity > 0 ? itemTotal / item.quantity : 0;
      subtotalCents += Math.round(itemTotal * 100);

      // Truncate long product names
      let name = item.name;
      if (font.widthOfTextAtSize(name, 9) > 250) {
        while (font.widthOfTextAtSize(name + "...", 9) > 250 && name.length > 0) {
          name = name.slice(0, -1);
        }
        name += "...";
      }

      page.drawText(String(i + 1), { x: colX.pos, y, size: 9, font, color: WHITE_TEXT });
      page.drawText(name, { x: colX.name, y, size: 9, font, color: WHITE_TEXT });
      page.drawText(String(item.quantity), { x: colX.qty, y, size: 9, font, color: WHITE_TEXT });
      page.drawText(`€${unitPrice.toFixed(2)}`, { x: colX.unit, y, size: 9, font, color: WHITE_TEXT });
      page.drawText(`€${itemTotal.toFixed(2)}`, { x: colX.total, y, size: 9, font, color: WHITE_TEXT });

      y -= 18;
    });

    y -= 10;

    // ── Divider ──
    page.drawLine({
      start: { x: 380, y },
      end: { x: 545, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 18;

    // ── Totals ──
    const subtotal = subtotalCents / 100;
    const vatRate = 0.2;
    const netAmount = subtotal / (1 + vatRate);
    const vatAmount = subtotal - netAmount;
    const total = parseFloat(order.total);

    page.drawText("Nettobetrag:", { x: 380, y, size: 9, font, color: GREY });
    page.drawText(`€${netAmount.toFixed(2)}`, { x: colX.total, y, size: 9, font, color: WHITE_TEXT });
    y -= 16;

    page.drawText("USt. 20%:", { x: 380, y, size: 9, font, color: GREY });
    page.drawText(`€${vatAmount.toFixed(2)}`, { x: colX.total, y, size: 9, font, color: WHITE_TEXT });
    y -= 16;

    page.drawLine({
      start: { x: 380, y: y + 6 },
      end: { x: 545, y: y + 6 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    page.drawText("Gesamtbetrag:", { x: 380, y, size: 11, font: fontBold, color: WHITE_TEXT });
    page.drawText(`€${total.toFixed(2)}`, { x: colX.total, y, size: 11, font: fontBold, color: RED });

    // ── Footer ──
    const footerY = 80;

    page.drawLine({
      start: { x: 50, y: footerY + 15 },
      end: { x: 545, y: footerY + 15 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    const footerLines = [
      "Bankverbindung: UncutTV GmbH · IBAN: AT00 0000 0000 0000 0000 · BIC: XXXXXXXX",
      "Zahlbar innerhalb 14 Tagen nach Rechnungsdatum.",
      "UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich · ATU 815 26 957",
    ];

    let fy = footerY;
    for (const line of footerLines) {
      page.drawText(line, { x: 50, y: fy, size: 7, font, color: GREY });
      fy -= 11;
    }

    // Serialize
    const pdfBytes = await pdf.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Rechnung-${invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Invoice] Error:", error);
    const message =
      error instanceof Error ? error.message : "Rechnung konnte nicht erstellt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
