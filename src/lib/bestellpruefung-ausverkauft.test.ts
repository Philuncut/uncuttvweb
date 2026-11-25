import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { bereinigeKasse } from "@/lib/kasse-nicht-verfuegbar";
import type { CartMeta } from "@/lib/wc-order-from-payment";

/**
 * Serverprüfung und Kasse zusammen: Was meldet pruefeBestellpositionen,
 * wenn ein Artikel inzwischen ausverkauft ist, und was macht die Kasse
 * daraus? WooCommerce ist hier ein Nachbau über fetch.
 *
 * "Ausverkauft" (nichts mehr da) fliegt aus dem Warenkorb. "Nur noch 2
 * Stück" trägt `verfuegbar` und bleibt stehen.
 */

type Pruefung = typeof import("@/lib/bestellpruefung");
let pruefeBestellpositionen: Pruefung["pruefeBestellpositionen"];

const echtesFetch = globalThis.fetch;

before(async () => {
  // woocommerce.ts liest die Adresse beim Laden des Moduls.
  process.env.WOOCOMMERCE_URL = "https://woo.test";
  process.env.WOOCOMMERCE_KEY = "ck_test";
  process.env.WOOCOMMERCE_SECRET = "cs_test";
  ({ pruefeBestellpositionen } = await import("@/lib/bestellpruefung"));
});

afterEach(() => {
  globalThis.fetch = echtesFetch;
});

function nachbauWoo(
  produkte: Array<Record<string, unknown>>,
  varianten: Record<string, Record<string, unknown>> = {}
) {
  globalThis.fetch = (async (eingabe: unknown) => {
    const url = new URL(String(eingabe));
    const variante = url.pathname.match(/\/products\/(\d+)\/variations\/(\d+)$/);
    if (variante) {
      const v = varianten[`${variante[1]}:${variante[2]}`];
      return v
        ? Response.json(v)
        : new Response("{}", { status: 404, statusText: "Not Found" });
    }
    if (url.pathname.endsWith("/products")) {
      const ids = (url.searchParams.get("include") ?? "").split(",").map(Number);
      return Response.json(produkte.filter((p) => ids.includes(Number(p.id))));
    }
    return new Response("{}", { status: 404, statusText: "Not Found" });
  }) as typeof fetch;
}

function einfach(id: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    type: "simple",
    status: "publish",
    price: "49.90",
    purchasable: true,
    stock_status: "instock",
    stock_quantity: null,
    manage_stock: false,
    categories: [],
    meta_data: [],
    ...extra,
  };
}

const ENDKUNDE = { isWholesale: false, isReverseCharge: false };
const BILD: CartMeta = { id: 501, name: "Originalzeichnung Nr. 7", qty: 1, price: "49.90" };
const BLURAY: CartMeta = { id: 77, name: "Blu-ray Mediabook", qty: 1, price: "49.90" };

function korb(...zeilen: CartMeta[]) {
  return zeilen.map((z) => ({ id: z.id, variation_id: z.variation_id, name: z.name }));
}

describe("Serverprüfung: Artikel inzwischen ausverkauft", () => {
  it("Einzelstück verkauft (Bestand 0): Zeile raus, der andere Artikel bleibt bestellbar", async () => {
    nachbauWoo([
      einfach(501, BILD.name, {
        manage_stock: true,
        stock_quantity: 0,
        stock_status: "outofstock",
      }),
      einfach(77, BLURAY.name),
    ]);
    const ergebnis = await pruefeBestellpositionen([BILD, BLURAY], ENDKUNDE);
    assert.equal(ergebnis.ok, false);
    assert.equal(ergebnis.problems.length, 1);
    assert.equal(ergebnis.problems[0].code, "ausverkauft");
    assert.equal(ergebnis.problems[0].verfuegbar, undefined);

    const b = bereinigeKasse(ergebnis.problems, korb(BILD, BLURAY));
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.deepEqual(b.nichtVerfuegbar, [BILD.name]);
    assert.equal(b.korbDanachLeer, false);

    // Zweiter Lauf mit dem bereinigten Warenkorb: alles in Ordnung.
    const danach = await pruefeBestellpositionen([BLURAY], ENDKUNDE);
    assert.equal(danach.ok, true);
  });

  it("Bestand 0 bei Lagerverwaltung, Status noch nicht umgestellt: trotzdem raus", async () => {
    nachbauWoo([einfach(501, BILD.name, { manage_stock: true, stock_quantity: 0 })]);
    const ergebnis = await pruefeBestellpositionen([BILD], ENDKUNDE);
    assert.equal(ergebnis.problems[0].code, "ausverkauft");
    assert.equal(ergebnis.problems[0].verfuegbar, undefined);
    const b = bereinigeKasse(ergebnis.problems, korb(BILD));
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.equal(b.korbDanachLeer, true);
  });

  it("nur noch 2 von 3 gewünschten: bleibt im Warenkorb, Meldung nennt die Zahl", async () => {
    nachbauWoo([einfach(77, BLURAY.name, { manage_stock: true, stock_quantity: 2 })]);
    const drei = { ...BLURAY, qty: 3 };
    const ergebnis = await pruefeBestellpositionen([drei], ENDKUNDE);
    assert.equal(ergebnis.problems[0].code, "ausverkauft");
    assert.equal(ergebnis.problems[0].verfuegbar, 2);
    assert.match(ergebnis.problems[0].message.de, /nur noch 2 Stück/);

    const b = bereinigeKasse(ergebnis.problems, korb(drei));
    assert.deepEqual(b.entfernen, []);
    assert.equal(b.bleibt.length, 1);
    assert.deepEqual(b.knapp, [{ id: 77, name: BLURAY.name, verfuegbar: 2 }]);
  });

  it("Menge 2, Bestand 1: nach \"Menge auf 1 anpassen\" ist der Warenkorb bestellbar", async () => {
    nachbauWoo([einfach(77, BLURAY.name, { manage_stock: true, stock_quantity: 1 })]);
    const zwei = { ...BLURAY, qty: 2 };
    const ergebnis = await pruefeBestellpositionen([zwei], ENDKUNDE);
    const [knapp] = bereinigeKasse(ergebnis.problems, korb(zwei)).knapp;
    assert.equal(knapp.verfuegbar, 1);

    // Der Knopf setzt die Menge auf die gemeldete Zahl.
    const angepasst = { ...zwei, qty: knapp.verfuegbar };
    const danach = await pruefeBestellpositionen([angepasst], ENDKUNDE);
    assert.equal(danach.ok, true);
    assert.deepEqual(danach.problems, []);
  });

  it("Größe ausverkauft: nur diese Variante fliegt raus", async () => {
    const shirt = {
      ...einfach(900, "Logo-Shirt"),
      type: "variable",
    };
    const variante = (id: number, groesse: string, extra: Record<string, unknown>) => ({
      id,
      status: "publish",
      price: "29.90",
      purchasable: true,
      stock_status: "instock",
      stock_quantity: null,
      manage_stock: false,
      attributes: [{ name: "Größe", slug: "pa_groesse", option: groesse }],
      meta_data: [],
      ...extra,
    });
    nachbauWoo([shirt], {
      "900:911": variante(911, "M", {}),
      "900:912": variante(912, "L", { stock_status: "outofstock" }),
    });
    const m: CartMeta = { id: 900, variation_id: 911, name: "Logo-Shirt", qty: 1, price: "29.90" };
    const l: CartMeta = { id: 900, variation_id: 912, name: "Logo-Shirt", qty: 1, price: "29.90" };
    const ergebnis = await pruefeBestellpositionen([m, l], ENDKUNDE);
    assert.equal(ergebnis.problems.length, 1);
    assert.equal(ergebnis.problems[0].variation_id, 912);
    assert.equal(ergebnis.problems[0].verfuegbar, undefined);

    const b = bereinigeKasse(ergebnis.problems, korb(m, l));
    assert.deepEqual(b.entfernen, [{ id: 900, variation_id: 912 }]);
    assert.equal(b.korbDanachLeer, false);
  });

  it("Größe: nur noch 1 von 2 gewünschten bleibt im Warenkorb", async () => {
    nachbauWoo([{ ...einfach(900, "Logo-Shirt"), type: "variable" }], {
      "900:912": {
        id: 912,
        status: "publish",
        price: "29.90",
        purchasable: true,
        stock_status: "instock",
        stock_quantity: 1,
        manage_stock: true,
        attributes: [{ name: "Größe", slug: "pa_groesse", option: "L" }],
        meta_data: [],
      },
    });
    const l: CartMeta = { id: 900, variation_id: 912, name: "Logo-Shirt", qty: 2, price: "29.90" };
    const ergebnis = await pruefeBestellpositionen([l], ENDKUNDE);
    assert.equal(ergebnis.problems[0].code, "ausverkauft");
    assert.equal(ergebnis.problems[0].verfuegbar, 1);
    assert.deepEqual(bereinigeKasse(ergebnis.problems, korb(l)).entfernen, []);
  });
});
