import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import {
  BESTELLUNG_META,
  GEMELDET_META,
  istPruefkandidat,
  kundenEmailAusPi,
  mailZuZahlungOhneBestellung,
  zahlungszeitpunkt,
} from "@/lib/zahlung-ohne-bestellung";

/**
 * Stripe-Zahlungen ohne Bestellung: welche geprüft werden und was in der
 * Mail ans Büro steht. Anlass: vier bezahlte PaymentIntents im Herbst 2026,
 * zu denen nie eine Bestellung entstand.
 */

const JETZT = 1_800_000_000;

function pi(teile: Record<string, unknown> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_3Ud8LxEgrBeispiel000001",
    status: "succeeded",
    amount: 6360,
    amount_received: 6360,
    currency: "eur",
    created: JETZT - 3600,
    receipt_email: null,
    latest_charge: {
      id: "ch_1",
      created: JETZT - 11 * 60,
      billing_details: { email: "kundin@example.com" },
    },
    metadata: {
      cart_items_count: "2",
      cart_snapshot: JSON.stringify([
        { id: 6579, q: 1, p: "49.00", n: "Kunstdruck <Nr. 3>" },
        { id: 6083, q: 1, p: "9.80", n: "Shirt", v: 6090, s: "L", ss: "l" },
      ]),
      shipping_cents: "480",
      shipping_method_title: "Post.at",
      shipping_country: "AT",
      coupon_code: "",
      is_wholesale: "false",
      is_reverse_charge: "false",
    },
    ...teile,
  } as unknown as Stripe.PaymentIntent;
}

describe("Welche Zahlungen geprüft werden", () => {
  it("bezahlt vor elf Minuten, aus der Kasse, nicht gemeldet: ja", () => {
    assert.equal(istPruefkandidat(pi(), JETZT), true);
  });

  it("bezahlt vor neun Minuten: noch nicht (der Browser hat zehn Minuten Zeit)", () => {
    const frisch = pi({
      latest_charge: { id: "ch_1", created: JETZT - 9 * 60, billing_details: {} },
    });
    assert.equal(istPruefkandidat(frisch, JETZT), false);
  });

  it("es zählt der Zeitpunkt der Zahlung, nicht der des PaymentIntents", () => {
    // PaymentIntent seit Stunden offen, eben erst bezahlt.
    const eben = pi({
      created: JETZT - 5 * 3600,
      latest_charge: { id: "ch_1", created: JETZT - 60, billing_details: {} },
    });
    assert.equal(zahlungszeitpunkt(eben), JETZT - 60);
    assert.equal(istPruefkandidat(eben, JETZT), false);
  });

  it("nicht bezahlt: nein", () => {
    assert.equal(istPruefkandidat(pi({ status: "requires_payment_method" }), JETZT), false);
    assert.equal(istPruefkandidat(pi({ status: "processing" }), JETZT), false);
  });

  it("schon gemeldet: nicht noch einmal", () => {
    const gemeldet = pi();
    (gemeldet.metadata as Record<string, string>)[GEMELDET_META] = "2026-11-27T18:20:00.000Z";
    assert.equal(istPruefkandidat(gemeldet, JETZT), false);
  });

  it("Bestellung schon einmal gefunden: wird nicht wieder gesucht", () => {
    const erledigt = pi();
    (erledigt.metadata as Record<string, string>)[BESTELLUNG_META] = "6725";
    assert.equal(istPruefkandidat(erledigt, JETZT), false);
  });

  it("Zahlung ohne Kassen-Metadaten (anderes Produkt auf demselben Stripe-Konto): nein", () => {
    assert.equal(istPruefkandidat(pi({ metadata: {} }), JETZT), false);
  });
});

describe("Mail ans Büro", () => {
  it("nennt Betrag, PaymentIntent, E-Mail und den Warenkorb", () => {
    const mail = mailZuZahlungOhneBestellung(pi());
    assert.match(mail.subject, /63,60 €/);
    assert.match(mail.subject, /pi_3Ud8LxEgrBeispiel000001/);
    assert.match(mail.html, /kundin@example\.com/);
    assert.match(mail.html, /1 × Shirt \(Größe L\) zu 9\.80 €/);
    assert.match(mail.html, /Produkt 6083, Variante 6090/);
    assert.match(mail.html, /4,80 € \(Post\.at\), AT/);
  });

  it("maskiert HTML in Produktnamen", () => {
    const mail = mailZuZahlungOhneBestellung(pi());
    assert.match(mail.html, /Kunstdruck &lt;Nr\. 3&gt;/);
    assert.doesNotMatch(mail.html, /<Nr\. 3>/);
  });

  it("sagt es, wenn der Warenkorb in den Metadaten gekürzt ist oder fehlt", () => {
    const gekuerzt = pi();
    (gekuerzt.metadata as Record<string, string>).cart_items_count = "5";
    assert.match(
      mailZuZahlungOhneBestellung(gekuerzt).html,
      /hatte 5 Positionen; in den Metadaten stehen nur 2/
    );
    const ohne = pi({ metadata: { cart_items_count: "3" } });
    assert.match(mailZuZahlungOhneBestellung(ohne).html, /Kein Warenkorb in den Metadaten/);
  });

  it("E-Mail: Quittungsadresse vor der Adresse der Belastung, sonst leer", () => {
    assert.equal(kundenEmailAusPi(pi({ receipt_email: "quittung@example.com" })), "quittung@example.com");
    assert.equal(kundenEmailAusPi(pi()), "kundin@example.com");
    assert.equal(kundenEmailAusPi(pi({ latest_charge: "ch_1" })), "");
    assert.match(
      mailZuZahlungOhneBestellung(pi({ latest_charge: "ch_1" })).html,
      /keine E-Mail bei Stripe/
    );
  });
});
