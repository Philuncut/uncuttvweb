import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filmSchluessel } from "@/lib/shop-sections";
import { angabenAus, verpackungAusName, verpackungVon } from "@/lib/verpackung";

/**
 * Gruppierung der Cover-Varianten eines Films: aus den Angaben des
 * Steuerpults, wenn vorhanden, sonst aus dem Namen. Die Namen hier sind
 * echte Produktnamen aus dem Shop.
 */

const ANGABEN = (produktname: string, packung: string, packungText = "") => [
  {
    key: "uncuttv_angaben",
    value: JSON.stringify({ version: 1, titel: { produktname, packung, packungText }, cover: {} }),
  },
];

describe("filmSchluessel aus dem Namen (alte Produkte)", () => {
  it("fasst Cover-Varianten eines Mediabooks zusammen", () => {
    assert.equal(
      filmSchluessel("Fear Cabin 2-Disc-Mediabook (DVD + Blu-ray) Mediabook Cover F"),
      filmSchluessel("Fear Cabin 2-Disc-Mediabook (DVD + Blu-ray) Mediabook Cover A")
    );
  });

  it("kennt Scanavo, Steelbook, VHS und Retro-VHS-Box als Verpackung", () => {
    assert.equal(filmSchluessel("Underground Files Scanavo Cover A"), "undergroundfiles");
    assert.equal(filmSchluessel("Underground Files Scanavo Cover B"), "undergroundfiles");
    assert.equal(filmSchluessel("Fetus Steelbook"), "fetus");
    assert.equal(filmSchluessel("Fetus + Septic Retro-VHS-Box Cover A"), "fetusseptic");
    assert.equal(filmSchluessel("Septic VHS"), "septic");
  });

  it("Amaray und Mediabook desselben Films fallen zusammen", () => {
    assert.equal(
      filmSchluessel("WHAT LURKS BENEATH Amaray"),
      filmSchluessel("What Lurks Beneath Mediabook Cover D")
    );
  });

  it("Einzelstück zählt zum Film hinter inkl.", () => {
    assert.equal(
      filmSchluessel("EINZELSTÜCK: Originales Öl-Gemälde inkl. Fear Cabin Mediabook Cover C"),
      filmSchluessel("Fear Cabin Mediabook Cover A")
    );
  });
});

describe("filmSchluessel aus den Angaben des Steuerpults", () => {
  it("nimmt den Filmtitel aus uncuttv_angaben, egal wie der Name aussieht", () => {
    const a = {
      name: "Scanavo: UNDERGROUND FILES – Films by Simon Spachmann – Blu-ray + DVD | inkl. Poster Amaray Cover B inkl. Poster",
      film_titel: "Scanavo: UNDERGROUND FILES – Films by Simon Spachmann – Blu-ray + DVD | inkl. Poster",
    };
    const b = { ...a, name: a.name.replace("Cover B", "Cover A").replace("inkl. Poster", "inl. Poster") };
    assert.equal(filmSchluessel(a), filmSchluessel(b));
    // Ohne Angaben landet dieser Name beim Teil hinter "inkl." -- "Poster".
    // Mit Angaben ist der Schlüssel der Filmtitel.
    assert.notEqual(filmSchluessel(a), "poster");
  });

  it("Retro-VHS-Box: Filmtitel aus den Angaben", () => {
    const p = {
      name: "Retro-VHS-Box FETUS + SEPTIC | Limitiert auf 66 Stück | Brian Paulin – Doppel-Blu-ray | mit Wendecover Amaray VHS-Retro-Box",
      film_titel: "Retro-VHS-Box FETUS + SEPTIC | Limitiert auf 66 Stück | Brian Paulin – Doppel-Blu-ray | mit Wendecover",
    };
    assert.equal(filmSchluessel(p), filmSchluessel({ ...p, name: p.name + " Cover B" }));
  });

  it("ohne film_titel gilt der Name", () => {
    assert.equal(filmSchluessel({ name: "Mudbrick Amaray" }), "mudbrick");
  });
});

describe("Verpackung", () => {
  it("liest Packung und freie Bezeichnung aus den Angaben", () => {
    assert.equal(verpackungVon({ name: "x", meta_data: ANGABEN("Fetus", "scanavo") }), "Scanavo");
    assert.equal(
      verpackungVon({ name: "x", meta_data: ANGABEN("Fetus", "sonstige", "Retro-VHS-Box") }),
      "Retro-VHS-Box"
    );
    assert.equal(angabenAus(ANGABEN("Fetus", "unsinn"))?.packung, "mediabook");
  });

  it("fällt auf den Namen zurück, dann auf Mediabook", () => {
    assert.equal(verpackungAusName("Mudbrick Amaray"), "Amaray");
    assert.equal(verpackungAusName("Fetus + Septic Retro-VHS-Box Cover A"), "Retro-VHS-Box");
    assert.equal(verpackungAusName("Conditio Germania Hartbox"), "Hartbox");
    assert.equal(verpackungVon({ name: "Irgendwas Bundle" }), "Mediabook");
  });
});
