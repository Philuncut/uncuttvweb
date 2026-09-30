import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBankTransferEmailHtml,
  buildCustomerEmailHtml,
  buildInvoiceResendEmailHtml,
  buildOfficeEmailHtml,
  STREAMING_BANNER,
  type OrderConfirmationWooOrder,
  type StreamingBannerLocale,
} from "@/lib/order-confirmation-email";

/**
 * Werbebanner "Jetzt streamen auf UncutTV" in der Bestellbestätigung.
 *
 * Er steht unter der Bestellübersicht, nie darüber, und nur in Mails an
 * Endkunden. Händler (Wholesale) und die Office-Mail bleiben ohne Banner.
 * Das Bild wird extern geladen, der Link trägt die UTM-Parameter, und ein
 * Textlink darunter fängt Mailprogramme ohne Bilder auf.
 *
 * Sprache: Die Bank-Mail folgt der Shop-Sprache (locale), die
 * Sofortzahlungs-Mail ist immer deutsch und bekommt daher immer den
 * deutschen Banner.
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
  items: [
    { id: 101, name: "VHS Underground Mediabook", qty: 1, price: "29.90" },
  ],
  total: "34.90",
};

const UTM_BASE =
  "https://uncuttv.app/?utm_source=shop&amp;utm_medium=email&amp;utm_campaign=bestellbestaetigung";

const ANY_BANNER_MARKERS = [
  STREAMING_BANNER.de.imageUrl,
  STREAMING_BANNER.en.imageUrl,
  "utm_campaign=bestellbestaetigung",
];

function assertBannerPresent(html: string, locale: StreamingBannerLocale) {
  const banner = STREAMING_BANNER[locale];
  const other = STREAMING_BANNER[locale === "de" ? "en" : "de"];
  assert.ok(html.includes(`src="${banner.imageUrl}"`), "Bild-URL fehlt");
  assert.ok(html.includes(`alt="${banner.alt}"`), "Alt-Text fehlt");
  assert.ok(
    html.includes(`href="${UTM_BASE}&amp;utm_content=${locale}"`),
    "Link mit UTM-Parametern und utm_content fehlt"
  );
  assert.ok(html.includes(`>${banner.text}</a>`), "Textlink fehlt");
  assert.ok(html.includes('width="600"'), "Anzeigebreite 600 px fehlt");
  assert.ok(html.includes("max-width:600px"), "max-width 600 px fehlt");
  assert.ok(
    !html.includes("cid:") && !html.includes("data:image"),
    "Bild darf kein Anhang und keine Data-URI sein"
  );
  assert.ok(!html.includes(other.imageUrl), "falsches Sprachbild");
  assert.ok(!html.includes(other.text), "falscher Sprachtext");
}

function assertBannerAbsent(html: string) {
  for (const marker of ANY_BANNER_MARKERS) {
    assert.ok(!html.includes(marker), `Banner darf nicht erscheinen: ${marker}`);
  }
}

describe("Sofortzahlung (Stripe/PayPal): Bestellbestätigung", () => {
  it("zeigt Endkunden den deutschen Banner unter der Bestellübersicht", () => {
    const html = buildCustomerEmailHtml(ORDER, {
      pdfAttached: true,
      orderId: 4711,
      isWholesale: false,
    });
    assertBannerPresent(html, "de");

    const overview = html.indexOf("Bestellübersicht");
    const total = html.indexOf("Gesamt");
    const banner = html.indexOf(STREAMING_BANNER.de.imageUrl);
    const shipping = html.indexOf("Versandadresse");
    assert.ok(
      overview > -1 && total > overview,
      "Übersicht mit Gesamtzeile fehlt"
    );
    assert.ok(banner > total, "Banner muss nach der Gesamtzeile stehen");
    assert.ok(banner < shipping, "Banner muss vor der Versandadresse stehen");
  });

  it("kennt keine Sprache und bleibt daher immer deutsch", () => {
    const html = buildCustomerEmailHtml(ORDER, {
      pdfAttached: false,
      orderId: 4711,
      isWholesale: false,
    });
    assert.ok(!html.includes(STREAMING_BANNER.en.imageUrl));
    assert.ok(html.includes("utm_content=de"));
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
  it("zeigt deutschen Endkunden den deutschen Banner unter der Bestellübersicht", () => {
    const html = buildBankTransferEmailHtml(
      "4711",
      { ...BANK_DETAILS, isWholesale: false, locale: "de" },
      { pdfAttached: false, orderId: 4711 }
    );
    assertBannerPresent(html, "de");

    const overview = html.indexOf("Bestellübersicht");
    const banner = html.indexOf(STREAMING_BANNER.de.imageUrl);
    const invoiceNote = html.indexOf("Die Rechnung folgt");
    const iban = html.indexOf("IBAN");
    assert.ok(iban < overview, "Bankdaten stehen vor der Übersicht");
    assert.ok(banner > overview, "Banner muss nach der Übersicht stehen");
    assert.ok(
      banner < invoiceNote,
      "Banner muss vor dem Rechnungshinweis stehen"
    );
  });

  it("zeigt englischen Endkunden den englischen Banner unter der Bestellübersicht", () => {
    const html = buildBankTransferEmailHtml(
      "4711",
      { ...BANK_DETAILS, isWholesale: false, locale: "en" },
      { pdfAttached: false, orderId: 4711 }
    );
    assertBannerPresent(html, "en");

    const overview = html.indexOf("Order summary");
    const banner = html.indexOf(STREAMING_BANNER.en.imageUrl);
    const invoiceNote = html.indexOf("Die Rechnung folgt");
    assert.ok(overview > -1, "englische Übersicht fehlt");
    assert.ok(banner > overview, "Banner muss nach der Übersicht stehen");
    assert.ok(
      banner < invoiceNote,
      "Banner muss vor dem Rechnungshinweis stehen"
    );
  });

  it("zeigt Händlern (Wholesale) keinen Banner, egal in welcher Sprache", () => {
    for (const locale of ["de", "en"] as const) {
      const html = buildBankTransferEmailHtml(
        "4711",
        { ...BANK_DETAILS, isWholesale: true, locale },
        { pdfAttached: false, orderId: 4711 }
      );
      assertBannerAbsent(html);
    }
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
