/**
 * Reine Rechenhelfer des Zahlungsabgleichs: Betraege aus Woo-Zeichenketten
 * und die Toleranz, innerhalb derer Zahlungsbeleg und Bestellsumme als
 * gleich gelten. Laeuft ohne Netz: `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BETRAG_TOLERANZ_CENT,
  betragInCent,
  betragStimmt,
  istBezahltStatus,
  metaWert,
} from "./bestellung-zahlung";

describe("betragInCent", () => {
  it("liest Woo-Betraege mit Punkt", () => {
    assert.equal(betragInCent("61.80"), 6180);
    assert.equal(betragInCent("123.11"), 12311);
    assert.equal(betragInCent("0.00"), 0);
  });
  it("kommt mit Komma, Zahl und leer zurecht", () => {
    assert.equal(betragInCent("61,80"), 6180);
    assert.equal(betragInCent(61.8), 6180);
    assert.equal(betragInCent(undefined), 0);
    assert.equal(betragInCent(null), 0);
  });
});

describe("betragStimmt", () => {
  it("akzeptiert exakte Treffer und kleine Rundungsdifferenzen", () => {
    assert.equal(betragStimmt(6180, 6180), true);
    assert.equal(betragStimmt(12311, 12312), true); // Fall #6389: 1 Cent
    assert.equal(betragStimmt(6180, 6180 + BETRAG_TOLERANZ_CENT), true);
  });
  it("lehnt groessere Abweichungen ab", () => {
    assert.equal(betragStimmt(6180, 6180 + BETRAG_TOLERANZ_CENT + 1), false);
    assert.equal(betragStimmt(6180, 100), false);
    assert.equal(betragStimmt(6180, 0), false);
  });
  it("lehnt ungueltige Zahlen ab", () => {
    assert.equal(betragStimmt(NaN, 6180), false);
    assert.equal(betragStimmt(6180, Number.POSITIVE_INFINITY), false);
  });
});

describe("istBezahltStatus", () => {
  it("kennt die bezahlten Woo-Status", () => {
    assert.equal(istBezahltStatus("processing"), true);
    assert.equal(istBezahltStatus("completed"), true);
    assert.equal(istBezahltStatus("refunded"), true);
    assert.equal(istBezahltStatus("Processing "), true);
  });
  it("haelt offene und stornierte fuer unbezahlt", () => {
    assert.equal(istBezahltStatus("pending"), false);
    assert.equal(istBezahltStatus("on-hold"), false);
    assert.equal(istBezahltStatus("cancelled"), false);
    assert.equal(istBezahltStatus("failed"), false);
    assert.equal(istBezahltStatus(undefined), false);
  });
});

describe("metaWert", () => {
  it("liest Zeichenketten und Zahlen aus meta_data", () => {
    const order = {
      meta_data: [
        { key: "_uncuttv_payment_ref", value: " paypal_1TY70703281148247 " },
        { key: "_paypal_order_id", value: 12 },
      ],
    };
    assert.equal(metaWert(order, "_uncuttv_payment_ref"), "paypal_1TY70703281148247");
    assert.equal(metaWert(order, "_paypal_order_id"), "12");
    assert.equal(metaWert(order, "fehlt"), "");
    assert.equal(metaWert(null, "x"), "");
  });
});
