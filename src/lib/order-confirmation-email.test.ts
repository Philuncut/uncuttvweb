import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBankTransferEmailHtml,
  buildCustomerEmailHtml,
  buildInvoiceResendEmailHtml,
  buildOfficeEmailHtml,
  STREAMING_BANNER_ALT,
  STREAMING_BANNER_IMAGE_URL,
  STREAMING_BANNER_TEXT,
  type OrderConfirmationWooOrder,
} from "@/lib/order-confirmation-email";

/**
 * Werbebanner "Jetzt streamen auf UncutTV" in der Bestellbestätigung.
 *
 * Er steht unter der Bestellübersicht, nie darüber, und nur in Mails an
 * Endkunden. Händler (Wholesale) und die Office-Mail bleiben ohne Banner.
 * Das Bild wird extern geladen, der Link trägt die UTM-Parameter, und ein
 * Textlink darunter fängt Mailprogramme ohne Bilder auf.
 */

const ORDER: OrderConfirmationWooOrder = {
  id: 4711,
  number: "4711",
  status: "processing",
  currency: "EUR",
  total: "34.90",
  date_paid: "2026-09-30T12:00:00",
  payment_method_title: "Kreditkarte",
  billing: {
    first_name: "Erika",
    last_name: "Muster",
    email: "erika@example.com",
    address_1: "Musterweg 1",
    postcode: "6020",
    city: "Innsbruck",
    country: "AT",
  },
  line_items: [
    { name: "VHS Underground Mediabook", quantity: 1, total: "29.90" },
  ],
  shipping_lines: [{ method_title: "Post", total: "5.00" }],
};

const BANK_DETAILS = {
  customerName: "Erika Muster",
  items: [{ id: 101, name: "VHS Underground Mediabook", qty: 1, price: "29.90" }],
  total: "34.90",
  locale: "de" as const,
};

const EXPECTED_HREF =
  'href="https://uncuttv.app/?utm_source=shop&amp;utm_medium=email&amp;utm_campaign=bestellbestaetigung"';

function assertBannerPresent(html: string) {
  assert.ok(
    html.includes(`src="${STREAMING_BANNER_IMAGE_URL}"`),
    "Bild-URL fehlt"
  );
  assert.ok(html.includes(`alt="${STREAMING_BANNER_ALT}"`), "Alt-Text fehlt");
  assert.ok(html.includes(EXPECTED_HREF), "Link mit UTM-Parametern fehlt");
  assert.ok(html.includes(`>${STREAMING_BANNER_TEXT}</a>`), "Textlink fehlt");
  assert.ok(html.includes('width="600"'), "Anzeigebreite 600 px fehlt");
  assert.ok(html.includes("max-width:600px"), "max-width 600 px fehlt");
  assert.ok(
    !html.includes("cid:") && !html.includes("data:image"),
    "Bild darf kein Anhang und keine Data-URI sein"
  );
}

function assertBannerAbsent(html: string) {
  assert.ok(
    !html.includes(STREAMING_BANNER_IMAGE_URL),
    "Banner-Bild darf nicht erscheinen"
  );
  assert.ok(
    !html.includes("utm_campaign=bestellbestaetigung"),
    "Banner-Link darf nicht erscheinen"
  );
}

describe("Sofortzahlung (Stripe/PayPal): Bestellbestätigung", () => {
  it("zeigt Endkunden den Banner unter der Bestellübersicht", () => {
    const html = buildCustomerEmailHtml(ORDER, {
      pdfAttached: true,
      orderId: 4711,
      isWholesale: false,
    });
    assertBannerPresent(html);

    const overview = html.indexOf("Bestellübersicht");
    const total = html.indexOf("Gesamt");
    const banner = html.indexOf(STREAMING_BANNER_IMAGE_URL);
    const shipping = html.indexOf("Versandadresse");
    assert.ok(
      overview > -1 && total > overview,
      "Übersicht mit Gesamtzeile fehlt"
    );
    assert.ok(banner > total, "Banner muss nach der Gesamtzeile stehen");
    assert.ok(banner < shipping, "Banner muss vor der Versandadresse stehen");
  });

  it("zeigt Händlern (Wholesale) keinen Banner", () => {
    const html = buildCustomerEmailHtml(ORDER, {
      pdfAttached: true,
      orderId: 4711,
      isWholesale: true,
    });
    assertBannerAbsent(html);
    assert.ok(
      html.includes("Bestellübersicht"),
      "Rest der Mail bleibt unverändert"
    );
  });
});

describe("Banküberweisung: Bestellbestätigung", () => {
  it("zeigt Endkunden den Banner unter der Bestellübersicht", () => {
    const html = buildBankTransferEmailHtml(
      "4711",
      { ...BANK_DETAILS, isWholesale: false },
      { pdfAttached: false, orderId: 4711 }
    );
    assertBannerPresent(html);

    const overview = html.indexOf("Bestellübersicht");
    const banner = html.indexOf(STREAMING_BANNER_IMAGE_URL);
    const invoiceNote = html.indexOf("Die Rechnung folgt");
    const iban = html.indexOf("IBAN");
    assert.ok(iban < overview, "Bankdaten stehen vor der Übersicht");
    assert.ok(banner > overview, "Banner muss nach der Übersicht stehen");
    assert.ok(
      banner < invoiceNote,
      "Banner muss vor dem Rechnungshinweis stehen"
    );
  });

  it("zeigt Händlern (Wholesale) keinen Banner", () => {
    const html = buildBankTransferEmailHtml(
      "4711",
      { ...BANK_DETAILS, isWholesale: true },
      { pdfAttached: false, orderId: 4711 }
    );
    assertBannerAbsent(html);
  });
});

describe("Andere Mails", () => {
  it("Office-Mail bleibt ohne Banner", () => {
    assertBannerAbsent(buildOfficeEmailHtml(ORDER, 4711));
  });

  it("PDF-Nachversandmail bleibt ohne Banner", () => {
    assertBannerAbsent(buildInvoiceResendEmailHtml(ORDER, 4711));
  });
});
