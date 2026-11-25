import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wertePayPalOrderAus } from "@/lib/paypal-pruefung";
import {
  erwarteterBetragCent,
  pruefeZahlungGegenBestellung,
  zahlungReicht,
  ZahlungPasstNichtFehler,
} from "@/lib/zahlungsbetrag";

/**
 * Eine bezahlte Bestellung entsteht nur, wenn der Server die Zahlung selbst
 * gesehen hat und der Betrag für den Warenkorb reicht.
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

describe("Reicht die Zahlung?", () => {
  it("genau bezahlt und Rundungsdifferenz gehen durch", () => {
    assert.equal(zahlungReicht(6180, 6180), true);
    assert.equal(zahlungReicht(12312, 12311), true);
    assert.equal(zahlungReicht(6180, 6175), true);
  });

  it("zu wenig bezahlt geht nicht durch", () => {
    assert.equal(zahlungReicht(6180, 6174), false);
    assert.equal(zahlungReicht(6180, 100), false);
    assert.equal(zahlungReicht(6180, Number.NaN), false);
  });

  it("zu viel bezahlt geht durch", () => {
    assert.equal(zahlungReicht(6180, 9000), true);
  });

  it("falsche Währung wird abgewiesen, auch bei passender Zahl", () => {
    assert.throws(
      () => pruefeZahlungGegenBestellung(6180, 6180, "usd"),
      (err: unknown) =>
        err instanceof ZahlungPasstNichtFehler && err.grund === "waehrung"
    );
  });

  it("kleine Zahlung für großen Warenkorb wird abgewiesen", () => {
    assert.throws(
      () => pruefeZahlungGegenBestellung(24900, 100, "eur"),
      (err: unknown) =>
        err instanceof ZahlungPasstNichtFehler && err.grund === "betrag"
    );
    assert.doesNotThrow(() => pruefeZahlungGegenBestellung(24900, 24900, "EUR"));
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
