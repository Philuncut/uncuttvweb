import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WooOrderOwnership } from "@/lib/fetch-woo-invoice";
import { maySeeInvoice } from "@/lib/invoice-ownership";
import type { VerifiedSession } from "@/lib/session-core";

/**
 * Wer darf welche Rechnung abrufen?
 *
 * Vorher wurde die Mailadresse aus einem Cookie mit der Rechnungsadresse
 * der Bestellung verglichen. Wer die Adresse eines anderen kannte, kam an
 * dessen Rechnungen. Am Inhalt der Rechnungen ändert sich nichts, nur
 * daran, wer sie bekommt.
 */

function sitzung(
  wpUserId: number,
  email: string,
  roles: string[] = ["customer"]
): VerifiedSession {
  return {
    wpUserId,
    customerId: wpUserId,
    email,
    roles,
    isWholesale: roles.includes("wholesale"),
    source: "customer",
    token: `token-${wpUserId}`,
  };
}

function bestellung(
  customerId: number,
  email: string
): WooOrderOwnership {
  return {
    id: 5000 + customerId,
    number: String(5000 + customerId),
    customer_id: customerId,
    billing: { email },
  };
}

const ANTON = sitzung(11, "anton@example.com");
const BERTA = sitzung(22, "berta@example.com");

describe("Eigene Rechnungen", () => {
  it("sind abrufbar", () => {
    assert.equal(
      maySeeInvoice(bestellung(11, "anton@example.com"), ANTON),
      true
    );
  });

  it("bleiben abrufbar, wenn die Rechnungsadresse eine andere ist", () => {
    // Kunden bestellen auch mal an eine abweichende Adresse. Massgeblich
    // ist die Kundennummer.
    assert.equal(
      maySeeInvoice(bestellung(11, "buero@example.com"), ANTON),
      true
    );
  });
});

describe("Fremde Rechnungen", () => {
  it("sind nicht abrufbar", () => {
    assert.equal(
      maySeeInvoice(bestellung(22, "berta@example.com"), ANTON),
      false
    );
  });

  it("bleiben gesperrt, auch wenn die Mailadresse übereinstimmt", () => {
    // Genau die alte Lücke: Die Rechnungsadresse der fremden Bestellung
    // traegt Antons Mailadresse, die Bestellung gehoert aber Berta.
    assert.equal(
      maySeeInvoice(bestellung(22, "anton@example.com"), ANTON),
      false
    );
  });

  it("bleiben auch für Händler gesperrt", () => {
    const haendlerin = sitzung(33, "haendlerin@example.com", ["wholesale"]);
    assert.equal(
      maySeeInvoice(bestellung(22, "berta@example.com"), haendlerin),
      false
    );
  });
});

describe("Gastbestellungen ohne Kundennummer", () => {
  it("gehören dem, dessen geprüfte Mailadresse daran steht", () => {
    // Ohne diesen Weg käme niemand mehr an die Rechnung einer Bestellung,
    // die er vor der Registrierung aufgegeben hat. Die Adresse stammt aus
    // dem Token, nicht aus einem Cookie.
    assert.equal(maySeeInvoice(bestellung(0, "anton@example.com"), ANTON), true);
  });

  it("sind für alle anderen gesperrt", () => {
    assert.equal(maySeeInvoice(bestellung(0, "anton@example.com"), BERTA), false);
  });

  it("sind gesperrt, wenn gar keine Adresse daran steht", () => {
    assert.equal(maySeeInvoice(bestellung(0, ""), ANTON), false);
  });

  it("vergleichen ohne Rücksicht auf Groß- und Kleinschreibung", () => {
    assert.equal(
      maySeeInvoice(bestellung(0, "Anton@Example.com"), ANTON),
      true
    );
  });
});
