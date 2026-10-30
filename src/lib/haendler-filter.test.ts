import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isProductVisibleForHaendler, productIsMerch } from "./haendler-filter";

const merchImVorverkauf = {
  categories: [
    { id: 52, name: "Merch", slug: "merch" },
    { id: 29, name: "Vorverkauf", slug: "vorverkauf" },
  ],
  meta_data: [{ key: "haendler_preis", value: "29,90" }],
  stock_status: "instock",
};

const film = {
  categories: [{ id: 29, name: "Vorverkauf", slug: "vorverkauf" }],
  meta_data: [{ key: "haendler_preis", value: "26.90" }],
  stock_status: "instock",
};

describe("Merch im Händlerportal", () => {
  it("erkennt die Kategorie merch", () => {
    assert.equal(productIsMerch(merchImVorverkauf), true);
    assert.equal(productIsMerch(film), false);
  });
  it("ist nie sichtbar, auch mit Händlerpreis und Kategorie Vorverkauf", () => {
    assert.equal(isProductVisibleForHaendler(merchImVorverkauf), false);
    assert.equal(isProductVisibleForHaendler(merchImVorverkauf, "29,90"), false);
  });
  it("Filme mit Händlerpreis bleiben sichtbar", () => {
    assert.equal(isProductVisibleForHaendler(film), true);
  });
});
