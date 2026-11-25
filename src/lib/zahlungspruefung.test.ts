import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wertePayPalOrderAus } from "@/lib/paypal-pruefung";
import { betragsabweichungText } from "@/lib/betragsabweichung-melden";
import {
  betragStimmt,
  ermittleBetragsabweichung,
  erwarteterBetragCent,
  FalscheWaehrungFehler,
  pruefeWaehrung,
} from "@/lib/zahlungsbetrag";

/**
 * Eine bezahlte Bestellung entsteht nur, wenn der Server die Zahlung selbst
 * gesehen hat. Passt der Betrag nicht zum Warenkorb, entsteht sie trotzdem,
 * aber auf "on-hold" mit Notiz und Mail ans Büro. Abgewiesen wird nur, was
 * nicht eingezogen ist oder in fremder Währung bezahlt wurde.
 *
 * Vorher genügte bei PayPal die Zeichenkette "paypal_<irgendwas>" im Aufruf
 * von /api/sync-order, und bei Stripe wurde der Betrag nicht mit dem
 * Warenkorb verglichen.
 */

describe("Erwarteter Betrag", () => {
  it("Endkunde: Summe der Zeilen, Rabatt ab, Versand dazu", () => {
    const cent = erwarteterBetragCent({
      items: [
        { qty: 2, price: "19.90" },
        { qty: 1, price: "49.00" },
      ],
      discountCents: 880,
      shippingCents: 590,
    });
    assert.equal(cent, 3980 + 4900 - 880 + 590);
  });

  it("Händler AT: Netto plus 20 % je Zeile, Versand ebenfalls", () => {
    const cent = erwarteterBetragCent({
      items: [{ qty: 3, price: "9.99" }],
      shippingCents: 1000,
      isWholesale: true,
      taxCountry: "AT",
    });
    assert.equal(cent, Math.round(29.97 * 1.2 * 100) + 1200);
  });

  it("Händler EU mit Reverse Charge: Netto bleibt Netto", () => {
    const cent = erwarteterBetragCent({
      items: [{ qty: 3, price: "9.99" }],
      shippingCents: 1000,
      isWholesale: true,
      isReverseCharge: true,
      taxCountry: "DE",
    });
    assert.equal(cent, 2997 + 1000);
  });

  it("stimmt mit der Rechnung des PaymentIntents überein (Händler DE, 19 %)", () => {
    // Dieselben Zahlen wie compute-payment-intent-amount.ts: je Zeile runden.
    const cent = erwarteterBetragCent({
      items: [
        { qty: 1, price: "12.61" },
        { qty: 2, price: "8.40" },
      ],
      shippingCents: 1000,
      isWholesale: true,
      taxCountry: "DE",
    });
    assert.equal(
      cent,
      Math.round(12.61 * 1.19 * 100) + Math.round(16.8 * 1.19 * 100) + 1190
    );
  });

  it("wird durch einen zu hohen Rabatt nicht negativ", () => {
    assert.equal(
      erwarteterBetragCent({
        items: [{ qty: 1, price: "5.00" }],
        discountCents: 900,
        shippingCents: 300,
      }),
      300
    );
  });
});

describe("Betrag der Zahlung gegen den Warenkorb", () => {
  it("genau bezahlt und Rundungsdifferenz: keine Abweichung", () => {
    assert.equal(betragStimmt(6180, 6180), true);
    assert.equal(betragStimmt(12311, 12312), true);
    assert.equal(ermittleBetragsabweichung(6180, 6175), null);
    assert.equal(ermittleBetragsabweichung(6180, 6185), null);
  });

  it("zu wenig bezahlt: Abweichung mit beiden Beträgen, keine Abweisung", () => {
    assert.deepEqual(ermittleBetragsabweichung(24900, 100), {
      erwartetCent: 24900,
      bezahltCent: 100,
    });
    assert.deepEqual(ermittleBetragsabweichung(6180, 6174), {
      erwartetCent: 6180,
      bezahltCent: 6174,
    });
  });

  it("zu viel bezahlt gilt ebenfalls als Abweichung", () => {
    assert.deepEqual(ermittleBetragsabweichung(6180, 9000), {
      erwartetCent: 6180,
      bezahltCent: 9000,
    });
  });

  it("unlesbarer Betrag gilt als Abweichung", () => {
    assert.equal(betragStimmt(6180, Number.NaN), false);
  });

  it("Notiztext nennt erwarteten und bezahlten Betrag und die Zahlung", () => {
    const text = betragsabweichungText({
      orderId: 7001,
      orderNumber: "7001",
      zahlungsreferenz: "paypal_5O190127TN364715T",
      erwartetCent: 8160,
      bezahltCent: 6180,
    });
    assert.match(text, /erwartet 81,60 €/);
    assert.match(text, /bezahlt 61,80 €/);
    assert.match(text, /paypal_5O190127TN364715T/);
  });
});

describe("Währung der Zahlung", () => {
  it("Euro geht durch, in jeder Schreibweise", () => {
    assert.doesNotThrow(() => pruefeWaehrung("eur"));
    assert.doesNotThrow(() => pruefeWaehrung("EUR"));
  });

  it("fremde oder fehlende Währung wird abgewiesen", () => {
    assert.throws(() => pruefeWaehrung("usd"), FalscheWaehrungFehler);
    assert.throws(() => pruefeWaehrung(""), FalscheWaehrungFehler);
    assert.throws(() => pruefeWaehrung(undefined), FalscheWaehrungFehler);
  });
});

describe("Antwort von PayPal auswerten", () => {
  const ID = "5O190127TN364715T";
  const bezahlt = {
    id: ID,
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: "3C679366HH908993F",
              status: "COMPLETED",
              amount: { currency_code: "EUR", value: "61.80" },
            },
          ],
        },
      },
    ],
  };

  it("eingezogene Order: Betrag, Währung und Capture-ID", () => {
    const p = wertePayPalOrderAus(ID, bezahlt);
    assert.equal(p.ok, true);
    if (p.ok) {
      assert.equal(p.bezahltCent, 6180);
      assert.equal(p.waehrung, "eur");
      assert.equal(p.captureId, "3C679366HH908993F");
    }
  });

  it("nur genehmigt, nicht eingezogen: keine Bestellung", () => {
    const p = wertePayPalOrderAus(ID, { id: ID, status: "APPROVED" });
    assert.equal(p.ok, false);
    if (!p.ok) assert.equal(p.grund, "nicht_bezahlt");
  });

  it("Capture noch in Prüfung (PENDING): keine Bestellung", () => {
    const p = wertePayPalOrderAus(ID, {
      ...bezahlt,
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: "X",
                status: "PENDING",
                amount: { currency_code: "EUR", value: "61.80" },
              },
            ],
          },
        },
      ],
    });
    assert.equal(p.ok, false);
  });

  it("Antwort zu einer anderen Order zählt nicht", () => {
    const p = wertePayPalOrderAus("9AB12345CD678901E", bezahlt);
    assert.equal(p.ok, false);
  });

  it("zurückerstattete oder abgelehnte Captures zählen nicht mit", () => {
    const p = wertePayPalOrderAus(ID, {
      id: ID,
      status: "COMPLETED",
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: "A",
                status: "DECLINED",
                amount: { currency_code: "EUR", value: "61.80" },
              },
            ],
          },
        },
      ],
    });
    assert.equal(p.ok, false);
  });
});
