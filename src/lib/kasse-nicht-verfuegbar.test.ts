import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bereinigeKasse,
  ergaenzeKnappe,
  ergaenzeNamen,
  istNichtMehrVerfuegbar,
  knappMeldung,
  nichtVerfuegbarMeldung,
  offeneKnappe,
  problemMeldungen,
  type KassenProblem,
  type KorbZeile,
} from "@/lib/kasse-nicht-verfuegbar";
import { formatTranslation } from "@/lib/translations";
import { pruefungAlsFehler, type Pruefergebnis } from "@/lib/bestellpruefung";
import { ausverkauftMeldung } from "@/lib/reservierung";

/**
 * Anlass: Einzelstück (Bestand 1) liegt bei Kunde B im Warenkorb, Kunde A
 * kauft es. Bei B hing danach die Kasse: keine Versandauswahl, keine
 * Erklärung. Soll: Meldung mit Artikelnamen, Zeile raus aus dem Warenkorb,
 * der Rest läuft normal weiter; ist der Warenkorb leer, zurück in den Shop.
 */

const BILD: KorbZeile = { id: 501, name: "Originalzeichnung Nr. 7" };
const BLURAY: KorbZeile = { id: 77, name: "Blu-ray Mediabook" };
const SHIRT_L: KorbZeile = { id: 900, variation_id: 912, name: "Logo-Shirt" };

function ausverkauft(z: KorbZeile, extra: Partial<KassenProblem> = {}): KassenProblem {
  return {
    id: z.id,
    ...(z.variation_id ? { variation_id: z.variation_id } : {}),
    name: z.name,
    code: "ausverkauft",
    message: {
      de: `„${z.name}“ ist ausverkauft.`,
      en: `"${z.name}" is sold out.`,
    },
    ...extra,
  };
}

describe("Meldung: Artikel nicht mehr verfügbar", () => {
  it("nennt den Artikel, auf Deutsch und Englisch", () => {
    assert.equal(
      nichtVerfuegbarMeldung([BILD.name], "de"),
      "Dieser Artikel ist leider nicht mehr verfügbar: „Originalzeichnung Nr. 7“"
    );
    assert.equal(
      nichtVerfuegbarMeldung([BILD.name], "en"),
      'This item is unfortunately no longer available: "Originalzeichnung Nr. 7"'
    );
  });

  it("mehrere Artikel: Mehrzahl, alle Namen, keine Doppelten", () => {
    const de = nichtVerfuegbarMeldung([BILD.name, BLURAY.name, BILD.name], "de");
    assert.equal(
      de,
      "Diese Artikel sind leider nicht mehr verfügbar: „Originalzeichnung Nr. 7“, „Blu-ray Mediabook“"
    );
    assert.match(
      nichtVerfuegbarMeldung([BILD.name, BLURAY.name], "en"),
      /^These items are unfortunately no longer available: /
    );
  });

  it("ohne Namen keine Meldung", () => {
    assert.equal(nichtVerfuegbarMeldung([], "de"), "");
    assert.equal(nichtVerfuegbarMeldung(["  "], "en"), "");
  });
});

describe("Warenkorb bereinigen", () => {
  it("Einzelstück weg, anderer Artikel bleibt: Kasse läuft mit dem Rest weiter", () => {
    const b = bereinigeKasse([ausverkauft(BILD)], [BILD, BLURAY]);
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.deepEqual(b.nichtVerfuegbar, ["Originalzeichnung Nr. 7"]);
    assert.equal(b.korbDanachLeer, false);
    assert.deepEqual(b.bleibt, []);
  });

  it("einziger Artikel weg: Warenkorb ist danach leer", () => {
    const b = bereinigeKasse([ausverkauft(BILD)], [BILD]);
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.equal(b.korbDanachLeer, true);
  });

  it("gilt für jeden ausverkauften Artikel, nicht nur für Einzelstücke", () => {
    const b = bereinigeKasse(
      [ausverkauft(BLURAY), ausverkauft(SHIRT_L)],
      [BILD, BLURAY, SHIRT_L]
    );
    assert.deepEqual(b.entfernen, [{ id: 77 }, { id: 900, variation_id: 912 }]);
    assert.deepEqual(b.nichtVerfuegbar, ["Blu-ray Mediabook", "Logo-Shirt"]);
    assert.equal(b.korbDanachLeer, false);
  });

  it("Größe: nur die ausverkaufte Variante fliegt raus, die andere bleibt", () => {
    const shirtM: KorbZeile = { id: 900, variation_id: 911, name: "Logo-Shirt" };
    const b = bereinigeKasse([ausverkauft(SHIRT_L)], [shirtM, SHIRT_L]);
    assert.deepEqual(b.entfernen, [{ id: 900, variation_id: 912 }]);
    assert.equal(b.korbDanachLeer, false);
  });

  it("nimmt den Namen aus dem Warenkorb, sonst aus der Meldung, sonst die Nummer", () => {
    assert.deepEqual(
      bereinigeKasse([{ id: 501, code: "ausverkauft", name: "Servername" }], [BILD])
        .nichtVerfuegbar,
      ["Originalzeichnung Nr. 7"]
    );
    assert.deepEqual(
      bereinigeKasse([{ id: 5, code: "ausverkauft", name: "Servername" }], [])
        .nichtVerfuegbar,
      ["Servername"]
    );
    assert.deepEqual(
      bereinigeKasse([{ id: 5, code: "ausverkauft" }], []).nichtVerfuegbar,
      ["Artikel 5"]
    );
  });

  it("\"nur noch 2 Stück\" ist nicht weg: Zeile bleibt, Servermeldung bleibt", () => {
    const knapp = ausverkauft(BLURAY, {
      verfuegbar: 2,
      message: {
        de: "Von „Blu-ray Mediabook“ sind nur noch 2 Stück verfügbar.",
        en: 'Only 2 of "Blu-ray Mediabook" left in stock.',
      },
    });
    assert.equal(istNichtMehrVerfuegbar(knapp), false);
    const b = bereinigeKasse([knapp], [BLURAY]);
    assert.deepEqual(b.entfernen, []);
    assert.deepEqual(b.nichtVerfuegbar, []);
    assert.equal(b.korbDanachLeer, false);
    assert.equal(
      problemMeldungen(b.bleibt, "en"),
      'Only 2 of "Blu-ray Mediabook" left in stock.'
    );
  });

  it("eigene Reservierung aktiv: der eigene Artikel fliegt nicht raus", () => {
    const b = bereinigeKasse([ausverkauft(BILD)], [BILD], {
      ausverkaufteEntfernen: false,
    });
    assert.deepEqual(b.entfernen, []);
    assert.deepEqual(b.nichtVerfuegbar, []);
    assert.equal(b.korbDanachLeer, false);
    assert.equal(b.bleibt.length, 1);
  });

  it("andere Probleme bleiben, wie sie waren", () => {
    const zeitraum: KassenProblem = {
      id: 77,
      name: BLURAY.name,
      code: "zeitraum_kommt",
      message: { de: "erst ab 01.12.", en: "from 01/12" },
    };
    const ohneGroesse: KassenProblem = {
      id: 900,
      name: "Logo-Shirt",
      code: "groesse_fehlt",
      message: { de: "Größe fehlt.", en: "No size." },
    };
    const b = bereinigeKasse(
      [ausverkauft(BILD), zeitraum, ohneGroesse],
      [BILD, BLURAY, { id: 900, name: "Logo-Shirt" }]
    );
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.deepEqual(b.nieBestellbar, [ohneGroesse]);
    assert.deepEqual(b.bleibt, [zeitraum, ohneGroesse]);
    assert.equal(problemMeldungen(b.bleibt, "de"), "erst ab 01.12. Größe fehlt.");
  });

  it("leere oder kaputte Antwort: nichts passiert", () => {
    for (const eingabe of [undefined, null, [], [{ id: 0, code: "ausverkauft" }]]) {
      const b = bereinigeKasse(eingabe as KassenProblem[] | undefined, [BILD]);
      assert.deepEqual(b.entfernen, []);
      assert.equal(b.korbDanachLeer, false);
    }
  });
});

describe("dieselbe Auswertung an allen Stellen, die den Bestand prüfen", () => {
  it("create-/update-payment-intent und Vorkasse: 409 cart_invalid", () => {
    const pruefung: Pruefergebnis = {
      ok: false,
      items: [],
      repriced: [],
      problems: [
        {
          id: 501,
          name: BILD.name,
          code: "ausverkauft",
          message: { de: "„x“ ist ausverkauft.", en: '"x" is sold out.' },
        },
      ],
    };
    const antwort = pruefungAlsFehler(pruefung);
    assert.equal(antwort.error, "cart_invalid");
    const b = bereinigeKasse(antwort.problems, [BILD, BLURAY]);
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.equal(
      nichtVerfuegbarMeldung(b.nichtVerfuegbar, "de"),
      "Dieser Artikel ist leider nicht mehr verfügbar: „Originalzeichnung Nr. 7“"
    );
  });

  it("\"Jetzt kaufen\" und PayPal-Knopf: 409 der Reservierung", () => {
    // Form wie in /api/checkout/reservieren.
    const verloren = { id: 501, name: BILD.name };
    const problems = [
      { ...verloren, code: "ausverkauft" as const, message: ausverkauftMeldung(verloren) },
    ];
    const b = bereinigeKasse(problems, [BILD]);
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.equal(b.korbDanachLeer, true);
    assert.match(
      nichtVerfuegbarMeldung(b.nichtVerfuegbar, "en"),
      /no longer available: "Originalzeichnung Nr\. 7"$/
    );
  });
});

/**
 * Anlass: Menge 2 im Warenkorb, Bestand 1. Der Hinweis stand nur klein
 * unten. Soll: auffällig oben, mit Name und Zahl, dazu ein Knopf, der die
 * Menge auf den Bestand senkt.
 */
describe("Mehr im Warenkorb als verfügbar", () => {
  const knappesProblem = (z: KorbZeile, verfuegbar: number): KassenProblem =>
    ausverkauft(z, { verfuegbar });

  it("Meldung nennt Artikel und Zahl, auf Deutsch und Englisch", () => {
    assert.equal(
      knappMeldung({ name: BLURAY.name, verfuegbar: 1 }, "de"),
      "Von „Blu-ray Mediabook“ ist nur noch 1 Stück verfügbar."
    );
    assert.equal(
      knappMeldung({ name: BLURAY.name, verfuegbar: 3 }, "de"),
      "Von „Blu-ray Mediabook“ sind nur noch 3 Stück verfügbar."
    );
    assert.equal(
      knappMeldung({ name: BLURAY.name, verfuegbar: 1 }, "en"),
      'Only 1 of "Blu-ray Mediabook" is left in stock.'
    );
    assert.equal(
      knappMeldung({ name: BLURAY.name, verfuegbar: 3 }, "en"),
      'Only 3 of "Blu-ray Mediabook" are left in stock.'
    );
  });

  it("Knopftext nennt die Zielmenge", () => {
    assert.equal(
      formatTranslation("CHECKOUT_ADJUST_QTY", "de", { menge: "1" }),
      "Menge auf 1 anpassen"
    );
    assert.equal(
      formatTranslation("CHECKOUT_ADJUST_QTY", "en", { menge: "1" }),
      "Reduce quantity to 1"
    );
  });

  it("Menge 2, Bestand 1: Zeile bleibt, Hinweis mit Name und Zahl", () => {
    const zwei = { ...BLURAY, qty: 2 };
    const b = bereinigeKasse([knappesProblem(BLURAY, 1)], [zwei]);
    assert.deepEqual(b.entfernen, []);
    assert.deepEqual(b.knapp, [{ id: 77, name: "Blu-ray Mediabook", verfuegbar: 1 }]);
    assert.equal(b.korbDanachLeer, false);
    // Der kleine Hinweis unten bekommt weiter die Servermeldung.
    assert.equal(b.bleibt.length, 1);
  });

  it("Größe: der Hinweis gilt der Variante", () => {
    const b = bereinigeKasse([knappesProblem(SHIRT_L, 2)], [{ ...SHIRT_L, qty: 4 }]);
    assert.deepEqual(b.knapp, [
      { id: 900, variation_id: 912, name: "Logo-Shirt", verfuegbar: 2 },
    ]);
  });

  it("ausverkauft und knapp zusammen: eines raus, das andere mit Knopf", () => {
    const b = bereinigeKasse(
      [ausverkauft(BILD), knappesProblem(BLURAY, 1)],
      [BILD, { ...BLURAY, qty: 2 }]
    );
    assert.deepEqual(b.entfernen, [{ id: 501 }]);
    assert.deepEqual(b.knapp.map((k) => k.id), [77]);
  });

  it("eigene Reservierung aktiv: kein Angebot, die Zahl wäre falsch", () => {
    const b = bereinigeKasse([knappesProblem(BLURAY, 1)], [{ ...BLURAY, qty: 2 }], {
      ausverkaufteEntfernen: false,
    });
    assert.deepEqual(b.knapp, []);
    assert.equal(b.bleibt.length, 1);
  });

  it("Hinweis steht, solange die Menge zu hoch ist, und erledigt sich nach dem Anpassen", () => {
    const gemeldet = [{ id: 77, name: BLURAY.name, verfuegbar: 1 }];
    assert.deepEqual(offeneKnappe(gemeldet, [{ ...BLURAY, qty: 2 }]), gemeldet);
    // Knopf gedrückt: Menge = verfügbare Zahl.
    assert.deepEqual(offeneKnappe(gemeldet, [{ ...BLURAY, qty: 1 }]), []);
    // Zeile von Hand entfernt.
    assert.deepEqual(offeneKnappe(gemeldet, [{ ...BILD, qty: 1 }]), []);
  });

  it("Größen getrennt: M anpassen lässt den Hinweis für L stehen", () => {
    const m = { id: 900, variation_id: 911, name: "Logo-Shirt", verfuegbar: 1 };
    const l = { id: 900, variation_id: 912, name: "Logo-Shirt", verfuegbar: 1 };
    const korb = [
      { id: 900, variation_id: 911, name: "Logo-Shirt", qty: 1 },
      { id: 900, variation_id: 912, name: "Logo-Shirt", qty: 2 },
    ];
    assert.deepEqual(offeneKnappe([m, l], korb), [l]);
  });

  it("neuer Fund zur selben Zeile ersetzt die alte Zahl", () => {
    const alt = [{ id: 77, name: BLURAY.name, verfuegbar: 3 }];
    assert.equal(ergaenzeKnappe(alt, []), alt);
    assert.deepEqual(
      ergaenzeKnappe(alt, [{ id: 77, name: BLURAY.name, verfuegbar: 1 }]),
      [{ id: 77, name: BLURAY.name, verfuegbar: 1 }]
    );
    assert.equal(
      ergaenzeKnappe(alt, [{ id: 501, name: BILD.name, verfuegbar: 2 }]).length,
      2
    );
  });
});

describe("Hinweis fortschreiben", () => {
  it("hängt neue Namen an, ohne Doppelte, und lässt die Liste sonst unberührt", () => {
    const bisher = ["A"];
    assert.equal(ergaenzeNamen(bisher, ["A"]), bisher);
    assert.deepEqual(ergaenzeNamen(bisher, ["B", "A"]), ["A", "B"]);
  });
});
