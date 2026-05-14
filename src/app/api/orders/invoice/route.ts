import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatPrice } from "@/lib/format-price";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

interface LineItem {
  name: string;
  quantity: number;
  total: string;
}

interface WooOrder {
  id: number;
  number: string;
  date_created: string;
  total: string;
  billing: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    postcode: string;
    country: string;
    email: string;
  };
  line_items: LineItem[];
  meta_data?: Array<{ key: string; value: unknown }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");

    if (!orderId) {
      return NextResponse.json({ error: "Keine Bestell-ID." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const customerEmail = cookieStore.get("woo_customer_email")?.value;

    if (!customerEmail) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const orderRes = await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${orderId}`, {
      headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
    });

    if (!orderRes.ok) {
      return NextResponse.json({ error: "Bestellung nicht gefunden." }, { status: 404 });
    }

    const order: WooOrder = await orderRes.json();

    if (order.billing.email.toLowerCase() !== customerEmail.toLowerCase()) {
      return NextResponse.json({ error: "Zugriff verweigert." }, { status: 403 });
    }

    const rawVat = order.meta_data?.find((m) => m.key === "_billing_vat")?.value;
    const vat =
      rawVat != null && typeof rawVat !== "object"
        ? String(rawVat).trim()
        : "";

    const reverseChargeRaw = order.meta_data?.find(
      (m) => m.key === "_uncuttv_reverse_charge"
    )?.value;
    const isReverseCharge =
      String(reverseChargeRaw ?? "").trim().toLowerCase() === "yes";

    // Generate PDF
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const RED = rgb(192 / 255, 57 / 255, 43 / 255);
    const TEXT = rgb(0.2, 0.2, 0.2);
    const GREY = rgb(0.5, 0.5, 0.5);

    let y = 792;

    // Header
    page.drawText("UNCUT", { x: 50, y, size: 24, font: fontBold, color: TEXT });
    page.drawText("TV", { x: 50 + fontBold.widthOfTextAtSize("UNCUT", 24), y, size: 24, font: fontBold, color: RED });

    const companyLines = ["UncutTV GmbH", "Kalchgruben 4/11", "6094 Axams, Österreich", "ATU 815 26 957 · FN 643542 k", "office@uncuttv.at"];
    let cy = y;
    for (const line of companyLines) {
      const w = font.widthOfTextAtSize(line, 8);
      page.drawText(line, { x: 545 - w, y: cy, size: 8, font, color: GREY });
      cy -= 12;
    }

    y -= 50;
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 30;

    // Recipient
    const billing = order.billing;
    const recipientLines = [
      billing.company || "",
      `${billing.first_name} ${billing.last_name}`,
      billing.address_1,
      billing.address_2 || "",
      `${billing.postcode} ${billing.city}`,
      billing.country,
    ].filter(Boolean);

    for (const line of recipientLines) {
      page.drawText(line, { x: 50, y, size: 10, font, color: TEXT });
      y -= 15;
    }

    if (vat) {
      page.drawText(`UID-Nr.: ${vat}`, { x: 50, y, size: 10, font, color: TEXT });
      y -= 15;
    }

    if (isReverseCharge) {
      page.drawText(
        "Steuerschuldnerschaft des Leistungsempfängers gem. Art. 196",
        { x: 50, y, size: 8, font, color: GREY }
      );
      y -= 12;
      page.drawText("MwStSystRL (Reverse Charge)", {
        x: 50,
        y,
        size: 8,
        font,
        color: GREY,
      });
      y -= 12;
    }

    y -= 20;

    // Invoice meta
    const invoiceNumber = `RE-${order.number}`;
    const invoiceDate = new Date(order.date_created).toLocaleDateString("de-AT");

    page.drawText("RECHNUNG", { x: 50, y, size: 18, font: fontBold, color: TEXT });
    y -= 22;
    page.drawText(`Rechnungsnummer: ${invoiceNumber}`, { x: 50, y, size: 9, font, color: GREY });
    y -= 14;
    page.drawText(`Rechnungsdatum: ${invoiceDate}`, { x: 50, y, size: 9, font, color: GREY });
    y -= 14;
    page.drawText(`Bestellnummer: #${order.number}`, { x: 50, y, size: 9, font, color: GREY });
    y -= 30;

    // Table header
    const colX = { pos: 50, name: 80, qty: 340, unit: 400, total: 480 };
    page.drawRectangle({ x: 50, y: y - 2, width: 495, height: 18, color: rgb(0.95, 0.95, 0.95) });
    page.drawText("POS", { x: colX.pos, y: y + 2, size: 8, font: fontBold, color: GREY });
    page.drawText("PRODUKT", { x: colX.name, y: y + 2, size: 8, font: fontBold, color: GREY });
    page.drawText("MENGE", { x: colX.qty, y: y + 2, size: 8, font: fontBold, color: GREY });
    page.drawText("EINZELPREIS", { x: colX.unit, y: y + 2, size: 8, font: fontBold, color: GREY });
    page.drawText("GESAMT", { x: colX.total, y: y + 2, size: 8, font: fontBold, color: GREY });
    y -= 20;

    // Table rows
    let subtotalCents = 0;
    order.line_items.forEach((item, i) => {
      const itemTotal = parseFloat(item.total);
      const unitPrice = item.quantity > 0 ? itemTotal / item.quantity : 0;
      subtotalCents += Math.round(itemTotal * 100);

      let name = item.name;
      if (font.widthOfTextAtSize(name, 9) > 250) {
        while (font.widthOfTextAtSize(name + "...", 9) > 250 && name.length > 0) name = name.slice(0, -1);
        name += "...";
      }

      page.drawText(String(i + 1), { x: colX.pos, y, size: 9, font, color: TEXT });
      page.drawText(name, { x: colX.name, y, size: 9, font, color: TEXT });
      page.drawText(String(item.quantity), { x: colX.qty, y, size: 9, font, color: TEXT });
      page.drawText(formatPrice(unitPrice), { x: colX.unit, y, size: 9, font, color: TEXT });
      page.drawText(formatPrice(itemTotal), { x: colX.total, y, size: 9, font, color: TEXT });
      y -= 18;
    });

    y -= 10;
    page.drawLine({ start: { x: 380, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 18;

    // Totals
    const subtotal = subtotalCents / 100;
    const netAmount = subtotal / 1.2;
    const vatAmount = subtotal - netAmount;
    const total = parseFloat(order.total);

    if (!isReverseCharge) {
      page.drawText("Nettobetrag:", { x: 380, y, size: 9, font, color: GREY });
      page.drawText(formatPrice(netAmount), { x: colX.total, y, size: 9, font, color: TEXT });
      y -= 16;
      page.drawText("USt. 20%:", { x: 380, y, size: 9, font, color: GREY });
      page.drawText(formatPrice(vatAmount), { x: colX.total, y, size: 9, font, color: TEXT });
      y -= 16;
    }
    page.drawLine({ start: { x: 380, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    page.drawText("Gesamtbetrag:", { x: 380, y, size: 11, font: fontBold, color: TEXT });
    page.drawText(formatPrice(total), { x: colX.total, y, size: 11, font: fontBold, color: RED });

    // Footer
    const footerY = 80;
    page.drawLine({ start: { x: 50, y: footerY + 15 }, end: { x: 545, y: footerY + 15 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    const footerLines = [
      "Bankverbindung: UncutTV GmbH · IBAN: AT52 3600 0000 0083 4978 · BIC: RZTIAT22",
      "UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich · ATU 815 26 957",
    ];
    let fy = footerY;
    for (const line of footerLines) {
      page.drawText(line, { x: 50, y: fy, size: 7, font, color: GREY });
      fy -= 11;
    }

    const pdfBytes = await pdf.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Rechnung-${invoiceNumber}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[Invoice] Error:", error);
    return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
  }
}
