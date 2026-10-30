/**
 * Fingerabdruck der Kassen-Eingaben: Nur wenn er gleich bleibt, darf eine
 * offene Bestellung wiederverwendet werden. Ohne Netz: `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkoutFingerabdruck, type BestellungEingaben } from "./offene-bestellung";

function eingaben(aenderung: Partial<BestellungEingaben> = {}): BestellungEingaben {
  return {
    cartItems: [
      { id: 4100, name: "Collar Mediabook Cover D", qty: 1, price: "33.21" },
    ],
    billing: {
      first_name: "A",
      last_name: "P",
      email: "ad@example.com",
      address_1: "Street 1",
      city: "Sydney",
      postcode: "2000",
      country: "AU",
    },
    shipping: {
      first_name: "A",
      last_name: "P",
      address_1: "Street 1",
      city: "Sydney",
      postcode: "2000",
      country: "AU",
    },
    isReverseCharge: false,
    isWholesaleCheckout: false,
    checkoutShipping: { rate: 28.59, label: "Versand", method_id: "flat_rate" },
    ...aenderung,
  };
}

describe("checkoutFingerabdruck", () => {
  it("ist stabil fuer gleiche Eingaben", () => {
    assert.equal(
      checkoutFingerabdruck("paypal", eingaben()),
      checkoutFingerabdruck("paypal", eingaben())
    );
  });
  it("ignoriert Reihenfolge der Artikel und Gross-/Kleinschreibung der E-Mail", () => {
    const a = eingaben({
      cartItems: [
        { id: 1, name: "A", qty: 1, price: "10.00" },
        { id: 2, name: "B", qty: 2, price: "5.00" },
      ],
    });
    const b = eingaben({
      cartItems: [
        { id: 2, name: "B", qty: 2, price: "5.00" },
        { id: 1, name: "A", qty: 1, price: "10.00" },
      ],
      billing: { ...eingaben().billing, email: "AD@Example.com" },
    });
    assert.equal(checkoutFingerabdruck("stripe", a), checkoutFingerabdruck("stripe", b));
  });
  it("aendert sich bei Menge, Zahlungsweg, Versand, Gutschein und Adresse", () => {
    const basis = checkoutFingerabdruck("stripe", eingaben());
    assert.notEqual(
      basis,
      checkoutFingerabdruck("stripe", eingaben({
        cartItems: [{ id: 4100, name: "x", qty: 2, price: "33.21" }],
      }))
    );
    assert.notEqual(basis, checkoutFingerabdruck("paypal", eingaben()));
    assert.notEqual(
      basis,
      checkoutFingerabdruck("stripe", eingaben({
        checkoutShipping: { rate: 0, label: "Abholung", method_id: "local_pickup" },
      }))
    );
    assert.notEqual(
      basis,
      checkoutFingerabdruck("stripe", eingaben({ couponCode: "welcome10", stripeDiscountCents: 332 }))
    );
    assert.notEqual(
      basis,
      checkoutFingerabdruck("stripe", eingaben({
        billing: { ...eingaben().billing, postcode: "2001" },
      }))
    );
  });
  it("beruecksichtigt Firma und UID aus Overrides und Meta", () => {
    const basis = checkoutFingerabdruck("stripe", eingaben());
    assert.notEqual(
      basis,
      checkoutFingerabdruck("stripe", eingaben({ billingOverrides: { company: "Firma GmbH" } }))
    );
    assert.notEqual(
      basis,
      checkoutFingerabdruck("stripe", eingaben({
        meta_data: [{ key: "_billing_vat", value: "ATU12345678" }],
      }))
    );
  });
});
