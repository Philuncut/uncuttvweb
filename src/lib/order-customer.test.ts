import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orderCustomerFor,
  type SessionResult,
  type VerifiedSession,
} from "@/lib/session-core";

/**
 * Wem eine Bestellung gehört.
 *
 * Vorher genügte ein selbst gesetztes Cookie `woo_customer_id`, um die
 * eigene Bestellung im Konto eines Fremden abzulegen. Jetzt zählt allein
 * das geprüfte Token, und wo keines ist, entsteht eine Gastbestellung.
 * Abgelehnt wird dabei nie: Eine bezahlte Bestellung darf daran nicht
 * scheitern.
 */

const ANTON: VerifiedSession = {
  wpUserId: 11,
  customerId: 11,
  email: "anton@example.com",
  roles: ["customer"],
  isWholesale: false,
  source: "customer",
  token: "token-anton",
};

describe("Mit geprüfter Sitzung", () => {
  it("gehört die Bestellung der Nummer aus dem Token", () => {
    const ergebnis = orderCustomerFor({ status: "ok", session: ANTON });

    assert.equal(ergebnis.customerId, 11);
    assert.equal(ergebnis.reason, "verified");
  });

  it("auch für Händler", () => {
    const haendlerin: VerifiedSession = {
      ...ANTON,
      wpUserId: 33,
      customerId: 33,
      roles: ["wholesale"],
      isWholesale: true,
      source: "haendler",
    };

    assert.equal(
      orderCustomerFor({ status: "ok", session: haendlerin }).customerId,
      33
    );
  });
});

describe("Ohne geprüfte Sitzung", () => {
  it("wird es eine Gastbestellung", () => {
    const ergebnis = orderCustomerFor({ status: "anonymous" });

    assert.equal(ergebnis.customerId, 0);
    assert.equal(ergebnis.reason, "anonymous");
  });

  it("wird ein ungültiges Token ignoriert, nicht abgelehnt", () => {
    // Der eigentliche Punkt: Die Bestellung geht durch, sie landet nur
    // nicht im fremden Konto.
    const ergebnis = orderCustomerFor({ status: "invalid" });

    assert.equal(ergebnis.customerId, 0);
    assert.equal(ergebnis.reason, "invalid-token");
  });

  it("scheitert die Bestellung auch dann nicht, wenn WordPress schweigt", () => {
    const ergebnis = orderCustomerFor({ status: "unavailable" });

    assert.equal(ergebnis.customerId, 0);
    assert.equal(ergebnis.reason, "wordpress-unavailable");
  });
});

describe("In keinem Fall", () => {
  it("entsteht eine Zuordnung ohne geprüfte Sitzung", () => {
    const ohneSitzung: SessionResult[] = [
      { status: "anonymous" },
      { status: "invalid" },
      { status: "unavailable" },
    ];

    for (const result of ohneSitzung) {
      assert.equal(orderCustomerFor(result).customerId, 0);
    }
  });
});
