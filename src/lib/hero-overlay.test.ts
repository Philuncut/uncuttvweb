import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  baueHeroOverlay,
  istImAngebot,
  overlayGilt,
  sicheresZiel,
  zeileMitMax,
} from "@/lib/hero-overlay";

/**
 * Sale-Overlay im Hero-Video: aus der Zeile der Datenbank wird, was die
 * Seite zeigt. Ohne aktives Overlay bleibt die Seite, wie sie ist.
 */

const ZEILE = {
  titel: " BLACK FRIDAY ",
  zeile: "bis zu {max} % Rabatt",
  knopf: "ZUM SALE",
  ziel: "/shop?aktion=1",
  max_prozent: 52,
  von: "2026-11-27T16:55:00+00:00",
  bis: "2026-12-06T22:59:00+00:00",
};

describe("Overlay aus der Datenbank", () => {
  it("setzt {max} ein und liest Beginn und Ende", () => {
    assert.deepEqual(baueHeroOverlay([ZEILE]), {
      titel: "BLACK FRIDAY",
      zeile: "bis zu 52 % Rabatt",
      knopf: "ZUM SALE",
      ziel: "/shop?aktion=1",
      vonMs: Date.parse("2026-11-27T16:55:00Z"),
      bisMs: Date.parse("2026-12-06T22:59:00Z"),
    });
  });

  it("kein Overlay aktiv: leere Antwort ergibt null", () => {
    assert.equal(baueHeroOverlay([]), null);
    assert.equal(baueHeroOverlay(null), null);
    assert.equal(baueHeroOverlay(undefined), null);
  });

  it("ohne Überschrift, Knopf, brauchbares Ziel oder Ende gibt es keines", () => {
    assert.equal(baueHeroOverlay([{ ...ZEILE, titel: "  " }]), null);
    assert.equal(baueHeroOverlay([{ ...ZEILE, knopf: "" }]), null);
    assert.equal(baueHeroOverlay([{ ...ZEILE, ziel: "javascript:alert(1)" }]), null);
    assert.equal(baueHeroOverlay([{ ...ZEILE, bis: "irgendwann" }]), null);
  });

  it("Zusatzzeile ohne feststehenden Rabatt bleibt weg, das Overlay nicht", () => {
    const o = baueHeroOverlay([{ ...ZEILE, max_prozent: null }]);
    assert.equal(o?.zeile, "");
    assert.equal(o?.titel, "BLACK FRIDAY");
  });
});

describe("Zusatzzeile", () => {
  it("ersetzt {max}, auch groß geschrieben und mehrfach", () => {
    assert.equal(zeileMitMax("bis zu {max} % Rabatt", 30), "bis zu 30 % Rabatt");
    assert.equal(zeileMitMax("{MAX} % – ja, {max} %", 30), "30 % – ja, 30 %");
  });

  it("Text ohne Platzhalter bleibt; unsinnige Zahlen ergeben keine Zeile", () => {
    assert.equal(zeileMitMax("Nur dieses Wochenende", null), "Nur dieses Wochenende");
    assert.equal(zeileMitMax("bis zu {max} %", 0), "");
    assert.equal(zeileMitMax("bis zu {max} %", 100), "");
    assert.equal(zeileMitMax("bis zu {max} %", "52"), "");
    assert.equal(zeileMitMax(null, 52), "");
  });
});

describe("Ziel des Knopfs", () => {
  it("eigene Seiten und https gehen durch", () => {
    assert.equal(sicheresZiel("/shop?aktion=1"), "/shop?aktion=1");
    assert.equal(sicheresZiel(" https://uncuttv.at/shop "), "https://uncuttv.at/shop");
  });

  it("alles andere wird nicht verlinkt", () => {
    assert.equal(sicheresZiel("//boese.example"), "");
    assert.equal(sicheresZiel("/\\boese.example"), "");
    assert.equal(sicheresZiel("http://uncuttv.at"), "");
    assert.equal(sicheresZiel("javascript:alert(1)"), "");
    assert.equal(sicheresZiel(""), "");
    assert.equal(sicheresZiel(42), "");
  });
});

describe("Gilt das Overlay jetzt?", () => {
  const o = baueHeroOverlay([ZEILE]);
  it("nur zwischen Beginn und Ende der Aktion", () => {
    assert.equal(overlayGilt(o, Date.parse("2026-11-27T16:54:59Z")), false);
    assert.equal(overlayGilt(o, Date.parse("2026-11-27T16:55:00Z")), true);
    assert.equal(overlayGilt(o, Date.parse("2026-12-06T22:58:59Z")), true);
    assert.equal(overlayGilt(o, Date.parse("2026-12-06T22:59:00Z")), false);
    assert.equal(overlayGilt(null, Date.parse("2026-11-28T12:00:00Z")), false);
  });
});

describe("Filter ?aktion=1: was steht im Angebot?", () => {
  it("Angebotspreis unter dem Normalpreis", () => {
    assert.equal(istImAngebot({ regular_price: "36.90", sale_price: "24.99" }), true);
    assert.equal(istImAngebot({ regular_price: "36.90", sale_price: "" }), false);
    assert.equal(istImAngebot({ regular_price: "36.90", sale_price: "36.90" }), false);
    assert.equal(istImAngebot({ regular_price: "", sale_price: "24.99" }), false);
    assert.equal(istImAngebot({}), false);
  });

  it("Merch: eine Größe im Angebot reicht", () => {
    assert.equal(
      istImAngebot({
        regular_price: "",
        sale_price: "",
        variants: [
          { regular_price: "25.00", sale_price: "" },
          { regular_price: "25.00", sale_price: "18.99" },
        ],
      }),
      true
    );
    assert.equal(
      istImAngebot({
        regular_price: "",
        sale_price: "",
        variants: [{ regular_price: "25.00", sale_price: "" }],
      }),
      false
    );
  });
});
