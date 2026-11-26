import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ZEITGRENZE_MS,
  bannerMitCovern,
  fehlermail,
  fuehreTerminAus,
  geheimnisStimmt,
  wienText,
  zuTermin,
  type BannerBild,
  type Termin,
  type TerminWerkzeug,
  type WooStand,
} from "@/lib/shop-termine";

/**
 * Geplante Termine des Shops: Entwürfe zur Minute veröffentlichen,
 * wahlweise mit Banner. Geprüft wird der Ablauf gegen einen nachgebauten
 * Shop, ohne Netz.
 */

type Laden = {
  produkte: Map<number, WooStand>;
  banner: { id: string; items: BannerBild[]; active: boolean }[];
  /** Was geschrieben wurde, in der Reihenfolge. */
  spur: string[];
  zeit: number;
  /** Produkte, bei denen das Veröffentlichen scheitert. */
  kaputt: Set<number>;
};

function laden(staende: WooStand[]): Laden {
  return {
    produkte: new Map(staende.map((s) => [s.id, { ...s }])),
    banner: [
      { id: "alt", items: [{ image: "alt.jpg", label: "Alt" }], active: true },
      { id: "neu", items: [{ image: "neu.jpg", label: "Neu" }], active: false },
    ],
    spur: [],
    zeit: 0,
    kaputt: new Set(),
  };
}

function werkzeug(l: Laden): TerminWerkzeug {
  return {
    vergangenMs: () => l.zeit,
    holeProdukt: async (id) => {
      const p = l.produkte.get(id);
      return p ? { ...p } : null;
    },
    veroeffentliche: async (id) => {
      if (l.kaputt.has(id)) throw new Error("WooCommerce antwortet mit 500");
      l.spur.push(`publish:${id}`);
      l.produkte.get(id)!.status = "publish";
      return "publish";
    },
    veroeffentlicheVarianten: async (id) => {
      l.spur.push(`varianten:${id}`);
      return null;
    },
    aktiviereBanner: async (bannerId) => {
      if (!l.banner.some((b) => b.id === bannerId)) return false;
      l.spur.push(`banner-an:${bannerId}`);
      for (const b of l.banner) b.active = b.id === bannerId;
      return true;
    },
    aktiverBanner: async () => {
      const b = l.banner.find((x) => x.active);
      return b ? { id: b.id, items: b.items } : null;
    },
    setzeBannerBilder: async (bannerId, items) => {
      l.spur.push(`banner-bilder:${bannerId}`);
      l.banner.find((b) => b.id === bannerId)!.items = items;
    },
  };
}

const entwurf = (id: number, name: string): WooStand => ({
  id,
  name,
  status: "draft",
  type: "simple",
  bild: `cover-${id}.jpg`,
});

const termin = (teil: Partial<Termin> = {}): Termin => ({
  id: "11111111-2222-3333-4444-555555555555",
  titel: "Testfilm Mediabook",
  faelligAm: "2026-11-27T17:00:00Z",
  produkte: [
    { id: 1, name: "Testfilm Mediabook Cover A" },
    { id: 2, name: "Testfilm Mediabook Cover B" },
  ],
  bannerArt: "keiner",
  bannerId: null,
  versuche: 1,
  ...teil,
});

describe("Termin ausführen", () => {
  it("alle Entwürfe gehen live und werden nachgeprüft", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    const e = await fuehreTerminAus(termin(), werkzeug(l));
    assert.equal(e.ok, true);
    assert.equal(e.fehler, null);
    assert.equal(e.veroeffentlicht, true);
    assert.deepEqual(l.spur, ["publish:1", "publish:2"]);
    assert.deepEqual(
      e.produkte.map((p) => [p.id, p.ok, p.text]),
      [
        [1, true, "veröffentlicht und nachgeprüft"],
        [2, true, "veröffentlicht und nachgeprüft"],
      ]
    );
    assert.equal(e.banner, null);
  });

  it("Wiederholung: was schon live ist, wird nicht noch einmal geschrieben", async () => {
    const l = laden([{ ...entwurf(1, "Cover A"), status: "publish" }, entwurf(2, "Cover B")]);
    const e = await fuehreTerminAus(termin(), werkzeug(l));
    assert.equal(e.ok, true);
    assert.deepEqual(l.spur, ["publish:2"]);
    assert.equal(e.produkte[0].text, "stand schon auf veröffentlicht");
  });

  it("zweiter Lauf nach einem vollständigen ersten ändert nichts", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    await fuehreTerminAus(termin(), werkzeug(l));
    l.spur.length = 0;
    const e = await fuehreTerminAus(termin(), werkzeug(l));
    assert.equal(e.ok, true);
    assert.equal(e.veroeffentlicht, false);
    assert.deepEqual(l.spur, []);
  });

  it("ein Produkt scheitert: das andere geht trotzdem live, der Termin gilt als fehlgeschlagen", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    l.kaputt.add(1);
    const e = await fuehreTerminAus(termin(), werkzeug(l));
    assert.equal(e.ok, false);
    assert.equal(e.veroeffentlicht, true);
    assert.equal(l.produkte.get(2)!.status, "publish");
    assert.match(e.fehler ?? "", /Cover A: Veröffentlichen gescheitert: WooCommerce antwortet mit 500/);
  });

  it("gelöschtes Produkt und fremder Status werden gemeldet, nicht angefasst", async () => {
    const l = laden([{ ...entwurf(2, "Cover B"), status: "private" }]);
    const e = await fuehreTerminAus(termin(), werkzeug(l));
    assert.equal(e.ok, false);
    assert.deepEqual(l.spur, []);
    assert.match(e.produkte[0].text, /kennt dieses Produkt nicht/);
    assert.match(e.produkte[1].text, /Steht auf „private“/);
  });

  it("Merch: die Größen gehen mit", async () => {
    const l = laden([{ ...entwurf(1, "Shirt"), type: "variable" }]);
    const e = await fuehreTerminAus(termin({ produkte: [{ id: 1, name: "Shirt" }] }), werkzeug(l));
    assert.equal(e.ok, true);
    assert.deepEqual(l.spur, ["publish:1", "varianten:1"]);
  });

  it("Nachprüfung schlägt an, wenn der Shop danach nicht veröffentlicht meldet", async () => {
    const l = laden([entwurf(1, "Cover A")]);
    const w = werkzeug(l);
    // WooCommerce sagt beim Schreiben "publish", zeigt danach aber Entwurf.
    w.veroeffentliche = async () => "publish";
    const e = await fuehreTerminAus(termin({ produkte: [{ id: 1, name: "Cover A" }] }), w);
    assert.equal(e.ok, false);
    assert.match(e.fehler ?? "", /Nachprüfung: steht auf „draft“/);
  });

  it("Zeit um: weitere Produkte werden nicht mehr begonnen", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    const w = werkzeug(l);
    const echt = w.veroeffentliche;
    w.veroeffentliche = async (id) => {
      l.zeit = ZEITGRENZE_MS + 1;
      return echt(id);
    };
    const e = await fuehreTerminAus(termin(), w);
    assert.equal(e.ok, false);
    assert.deepEqual(l.spur, ["publish:1"]);
    assert.match(e.produkte[1].text, /Nicht mehr begonnen/);
  });

  it("Termin ohne Produkte ist ein Fehler", async () => {
    const e = await fuehreTerminAus(termin({ produkte: [] }), werkzeug(laden([])));
    assert.equal(e.ok, false);
  });
});

describe("Banner zum Termin", () => {
  it("vorbereiteten Banner aktiv schalten, alle anderen aus", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    const e = await fuehreTerminAus(
      termin({ bannerArt: "aktivieren", bannerId: "neu" }),
      werkzeug(l)
    );
    assert.equal(e.ok, true);
    assert.deepEqual(e.banner, { ok: true, text: "Banner aktiv geschaltet" });
    assert.deepEqual(
      l.banner.map((b) => [b.id, b.active]),
      [
        ["alt", false],
        ["neu", true],
      ]
    );
  });

  it("gelöschter Banner: Produkte sind live, der Termin meldet den Banner", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    const e = await fuehreTerminAus(
      termin({ bannerArt: "aktivieren", bannerId: "weg" }),
      werkzeug(l)
    );
    assert.equal(e.ok, false);
    assert.equal(l.produkte.get(1)!.status, "publish");
    assert.match(e.fehler ?? "", /Banner: Den gewählten Banner gibt es nicht mehr/);
  });

  it("Cover in den aktiven Banner aufnehmen: vorn, höchstens drei", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    const e = await fuehreTerminAus(termin({ bannerArt: "aufnehmen" }), werkzeug(l));
    assert.equal(e.ok, true);
    assert.deepEqual(l.banner[0].items, [
      { image: "cover-1.jpg", label: "Cover A" },
      { image: "cover-2.jpg", label: "Cover B" },
      { image: "alt.jpg", label: "Alt" },
    ]);
  });

  it("kein Banner aktiv: gemeldet", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    l.banner.forEach((b) => (b.active = false));
    const e = await fuehreTerminAus(termin({ bannerArt: "aufnehmen" }), werkzeug(l));
    assert.equal(e.ok, false);
    assert.match(e.fehler ?? "", /kein Banner aktiv/);
  });

  it("ist ein Produkt nicht live, bleibt der Banner, wie er ist", async () => {
    const l = laden([entwurf(1, "Cover A"), entwurf(2, "Cover B")]);
    l.kaputt.add(2);
    const e = await fuehreTerminAus(
      termin({ bannerArt: "aktivieren", bannerId: "neu" }),
      werkzeug(l)
    );
    assert.equal(e.banner?.ok, false);
    assert.equal(l.banner[0].active, true);
    assert.equal(l.spur.some((s) => s.startsWith("banner")), false);
  });
});

describe("Cover in den Banner", () => {
  it("schon vorhandenes Cover steht nicht doppelt, rückt aber nach vorn", () => {
    assert.deepEqual(
      bannerMitCovern(
        [
          { image: "x.jpg", label: "X" },
          { image: "a.jpg", label: "A alt" },
        ],
        [{ image: " a.jpg ", label: "A" }]
      ),
      [
        { image: "a.jpg", label: "A" },
        { image: "x.jpg", label: "X" },
      ]
    );
  });

  it("mehr als drei: die hintersten fallen weg, leere Adressen auch", () => {
    const bild = (n: string): BannerBild => ({ image: n, label: n });
    assert.deepEqual(
      bannerMitCovern([bild("1"), bild("2"), bild("3")], [bild("n1"), bild(""), bild("n2")]).map(
        (b) => b.image
      ),
      ["n1", "n2", "1"]
    );
  });
});

describe("Zugang zur Route", () => {
  const geheim = "a".repeat(40);
  it("nur der richtige Bearer-Kopf", () => {
    assert.equal(geheimnisStimmt(`Bearer ${geheim}`, geheim), true);
    assert.equal(geheimnisStimmt(`Bearer ${geheim}x`, geheim), false);
    assert.equal(geheimnisStimmt(geheim, geheim), false);
    assert.equal(geheimnisStimmt(null, geheim), false);
  });

  it("ohne oder mit zu kurzem Geheimnis kommt niemand hinein", () => {
    assert.equal(geheimnisStimmt("Bearer ", ""), false);
    assert.equal(geheimnisStimmt("Bearer undefined", undefined), false);
    assert.equal(geheimnisStimmt("Bearer kurz", "kurz"), false);
  });
});

describe("Zeile aus der Datenbank", () => {
  it("liest Produkte, Banner und Versuche", () => {
    const t = zuTermin({
      id: "11111111-2222-3333-4444-555555555555",
      titel: "Testfilm",
      faellig_am: "2026-11-27T17:00:00+00:00",
      produkte: [{ id: 7, name: "A" }, { id: "8", name: "B" }, { id: 7, name: "doppelt" }, { id: 0 }],
      banner_art: "aktivieren",
      banner_id: "b1",
      versuche: 2,
    });
    assert.deepEqual(t?.produkte, [
      { id: 7, name: "A" },
      { id: 8, name: "B" },
    ]);
    assert.equal(t?.bannerArt, "aktivieren");
    assert.equal(t?.bannerId, "b1");
    assert.equal(t?.versuche, 2);
  });

  it("nichts abgeholt: null", () => {
    assert.equal(zuTermin(null), null);
  });
});

describe("Fehlermail", () => {
  it("nennt Titel, Wiener Zeit, Fehler und was zu tun ist", () => {
    assert.equal(wienText("2026-11-27T17:00:00Z"), "27.11.2026 18:00");
    assert.equal(wienText("2026-07-01T16:00:00Z"), "01.07.2026 18:00");
    const m = fehlermail(termin(), "Cover A: WooCommerce antwortet mit 500", [
      { id: 1, name: "Cover A", ok: false, text: "WooCommerce antwortet mit 500" },
      { id: 2, name: "Cover B", ok: true, text: "veröffentlicht und nachgeprüft" },
    ]);
    assert.equal(m.betreff, "Shop-Termin fehlgeschlagen: Testfilm Mediabook");
    assert.match(m.text, /27\.11\.2026 18:00 Uhr, Wien/);
    assert.match(m.text, /FEHLER · Cover A \(Nr\. 1\)/);
    assert.match(m.text, /in Ordnung · Cover B/);
    assert.match(m.text, /Erneut versuchen/);
  });
});
