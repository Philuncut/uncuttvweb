import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ProductVariant } from "./types";
import {
  datumKurzWien,
  groessenSlug,
  istVarianteBestellbar,
  lineKey,
  preisAnzeige,
  produktKaufstatus,
  sortiereVarianten,
  verkaufsStand,
  zuProductVariant,
} from "./varianten";

function variante(teil: Partial<ProductVariant>): ProductVariant {
  return {
    id: 1,
    size: "M",
    size_slug: "m",
    price: "29.90",
    regular_price: "29.90",
    sale_price: "",
    on_sale: false,
    stock_status: "instock",
    stock_quantity: null,
    manage_stock: false,
    purchasable: true,
    status: "publish",
    ...teil,
  };
}

describe("groessenSlug", () => {
  it("bildet den WordPress-Slug der Größe", () => {
    assert.equal(groessenSlug("3XL"), "3xl");
    assert.equal(groessenSlug(" XXL "), "xxl");
    assert.equal(groessenSlug("Größe M"), "groesse-m");
  });
});

describe("lineKey", () => {
  it("trennt Größen desselben Produkts", () => {
    assert.equal(lineKey(6545), "6545");
    assert.equal(lineKey(6545, 7001), "6545:7001");
    assert.notEqual(lineKey(6545, 7001), lineKey(6545, 7002));
    assert.equal(lineKey(6545, 0), "6545");
  });
});

describe("istVarianteBestellbar", () => {
  it("ohne Lagerverwaltung zählt nur stock_status", () => {
    assert.equal(istVarianteBestellbar(variante({})), true);
    assert.equal(istVarianteBestellbar(variante({ stock_status: "outofstock" })), false);
  });
  it("mit Lagerverwaltung muss die Menge reichen", () => {
    assert.equal(istVarianteBestellbar(variante({ manage_stock: true, stock_quantity: 1 })), true);
    assert.equal(istVarianteBestellbar(variante({ manage_stock: true, stock_quantity: 1 }), 2), false);
    assert.equal(istVarianteBestellbar(variante({ manage_stock: true, stock_quantity: 0 })), false);
  });
  it("nicht veröffentlicht oder nicht kaufbar: nein", () => {
    assert.equal(istVarianteBestellbar(variante({ status: "private" })), false);
    assert.equal(istVarianteBestellbar(variante({ purchasable: false })), false);
  });
});

describe("zuProductVariant", () => {
  it("liest Größe, Preise und Lager aus der REST-Variante", () => {
    const v = zuProductVariant({
      id: 7001,
      status: "publish",
      price: "24.99",
      regular_price: "29.90",
      sale_price: "24.99",
      on_sale: true,
      purchasable: true,
      stock_status: "instock",
      stock_quantity: null,
      manage_stock: false,
      attributes: [{ id: 1, name: "Größe", slug: "pa_groesse", option: "3XL" }],
    });
    assert.ok(v);
    assert.equal(v.size, "3XL");
    assert.equal(v.size_slug, "3xl");
    assert.equal(v.on_sale, true);
    assert.equal(v.price, "24.99");
  });
  it("fehlendes purchasable gilt als kaufbar", () => {
    const v = zuProductVariant({ id: 5, attributes: [] });
    assert.equal(v?.purchasable, true);
  });
});

describe("sortiereVarianten", () => {
  it("folgt der Reihenfolge der Attribut-Optionen", () => {
    const sortiert = sortiereVarianten(
      [
        variante({ id: 3, size: "XL", size_slug: "xl" }),
        variante({ id: 1, size: "S", size_slug: "s" }),
        variante({ id: 2, size: "3XL", size_slug: "3xl" }),
      ],
      ["XS", "S", "M", "L", "XL", "XXL", "3XL"]
    );
    assert.deepEqual(sortiert.map((v) => v.size), ["S", "XL", "3XL"]);
  });
});

describe("verkaufsStand", () => {
  const jetzt = Date.parse("2026-10-30T20:00:00Z");
  it("ohne Zeitraum: keiner", () => {
    assert.equal(verkaufsStand(null, null, jetzt), "keiner");
    assert.equal(verkaufsStand("", "", jetzt), "keiner");
  });
  it("vor dem Beginn: kommt, nach dem Ende: vorbei, sonst läuft", () => {
    assert.equal(verkaufsStand("2026-10-31T00:00:00Z", null, jetzt), "kommt");
    assert.equal(verkaufsStand(null, "2026-11-06T17:00:00Z", jetzt), "laeuft");
    assert.equal(verkaufsStand(null, "2026-10-30T20:00:00Z", jetzt), "vorbei");
    assert.equal(verkaufsStand("2026-10-30T18:00:00Z", "2026-11-06T17:00:00Z", jetzt), "laeuft");
  });
  it("liest auch die MySQL-Schreibweise als UTC", () => {
    assert.equal(verkaufsStand("2026-10-31 00:00:00", null, jetzt), "kommt");
  });
});

describe("datumKurzWien", () => {
  it("rechnet UTC in Wiener Zeit um", () => {
    // 30.10. 23:00 UTC = 31.10. 00:00 Wien (Sommerzeit endete am 25.10.: +1)
    assert.equal(datumKurzWien("2026-10-30T23:00:00Z"), "31.10.");
    assert.equal(datumKurzWien("2026-11-06T17:00:00Z"), "06.11.");
  });
});

describe("produktKaufstatus", () => {
  const jetzt = Date.parse("2026-10-30T20:00:00Z");
  it("einfaches Produkt: Lager entscheidet", () => {
    assert.equal(produktKaufstatus({ stock_status: "instock" }, jetzt).bestellbar, true);
    assert.equal(produktKaufstatus({ stock_status: "outofstock" }, jetzt).grund, "ausverkauft");
  });
  it("variables Produkt: ausverkauft erst, wenn keine Größe mehr bestellbar ist", () => {
    const teils = produktKaufstatus(
      {
        type: "variable",
        stock_status: "instock",
        variants: [
          variante({ id: 1, stock_status: "outofstock" }),
          variante({ id: 2, size: "L", size_slug: "l" }),
        ],
      },
      jetzt
    );
    assert.equal(teils.bestellbar, true);
    const alle = produktKaufstatus(
      {
        type: "variable",
        stock_status: "outofstock",
        variants: [variante({ id: 1, stock_status: "outofstock" })],
      },
      jetzt
    );
    assert.equal(alle.grund, "ausverkauft");
  });
  it("Verkaufszeitraum geht vor Lager", () => {
    const kommt = produktKaufstatus(
      { stock_status: "instock", verkauf_von: "2026-10-30T23:00:00Z" },
      jetzt
    );
    assert.equal(kommt.grund, "kommt");
    if (kommt.grund === "kommt") assert.equal(kommt.ab, "31.10.");
    const vorbei = produktKaufstatus(
      { stock_status: "instock", verkauf_bis: "2026-10-30T19:00:00Z" },
      jetzt
    );
    assert.equal(vorbei.grund, "vorbei");
  });
});

describe("preisAnzeige", () => {
  it("variables Produkt mit gleichen Preisen: kein ab", () => {
    const p = preisAnzeige({
      type: "variable",
      price: "",
      regular_price: "",
      sale_price: "",
      variants: [variante({ id: 1 }), variante({ id: 2, size: "L", size_slug: "l" })],
    });
    assert.equal(p.ab, false);
    assert.equal(p.price, "29.90");
    assert.equal(p.regular_price, null);
  });
  it("unterschiedliche Preise: ab günstigste bestellbare", () => {
    const p = preisAnzeige({
      type: "variable",
      price: "",
      regular_price: "",
      sale_price: "",
      variants: [
        variante({ id: 1, price: "19.90", stock_status: "outofstock" }),
        variante({ id: 2, size: "L", size_slug: "l", price: "29.90" }),
        variante({ id: 3, size: "5XL", size_slug: "5xl", price: "34.90" }),
      ],
    });
    assert.equal(p.ab, true);
    assert.equal(p.price, "29.90");
  });
  it("Aktion auf der günstigsten Variante: durchgestrichener Vergleichspreis", () => {
    const p = preisAnzeige({
      type: "variable",
      price: "",
      regular_price: "",
      sale_price: "",
      variants: [
        variante({ id: 1, price: "24.99", regular_price: "29.90", sale_price: "24.99", on_sale: true }),
      ],
    });
    assert.equal(p.price, "24.99");
    assert.equal(p.regular_price, "29.90");
  });
  it("einfaches Produkt wie bisher", () => {
    const p = preisAnzeige({ price: "14.99", regular_price: "20.90", sale_price: "14.99", on_sale: true });
    assert.equal(p.price, "14.99");
    assert.equal(p.regular_price, "20.90");
    const o = preisAnzeige({ price: "29.90", regular_price: "29.90", sale_price: "", on_sale: false });
    assert.equal(o.regular_price, null);
  });
});
