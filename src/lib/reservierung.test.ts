import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ausverkauftMeldung,
  bankSchluessel,
  gibReservierungFrei,
  leseReservierAntwort,
  reserviere,
  ReservierungNichtMoeglichFehler,
  reservierungsSchluessel,
  type Lager,
  type ReservierErgebnis,
  type ReservierPosition,
} from "@/lib/reservierung";

/**
 * Einzelstücke: zwei Käufer, Bestand 1.
 *
 * Anlass: Kunde A hatte das Bild im Warenkorb, Kunde B kaufte es, danach
 * konnte A trotzdem noch bezahlen.
 *
 * Der Nachbau verhält sich wie docs/wordpress/uncuttv-kasse.php (Stand 2):
 * Abbuchen ist EIN Schritt mit Bedingung ("nur wenn Bestand >= Menge"), so
 * wie die SQL-Anweisung dort; reserviert wird alles oder nichts; derselbe
 * Schlüssel bucht beim zweiten Klick nicht noch einmal ab. Die
 * Unteilbarkeit selbst leistet in Wirklichkeit die Datenbank; das lässt
 * sich hier nicht beweisen, nur das Verhalten des Shops darum herum.
 */
class NachbauLager implements Lager {
  /** Bestand je Produkt; nur diese Produkte sind Einzelstücke. */
  bestand = new Map<number, number>();
  reservierungen = new Map<string, Map<number, number>>();
  gestoert = false;
  schlagwoerterLesbar = true;
  aufrufe = 0;

  async nehmen(
    schluessel: string,
    positionen: ReservierPosition[]
  ): Promise<ReservierErgebnis> {
    this.aufrufe++;
    // Netz: Der Aufruf kommt verzögert an, danach läuft alles in einem Zug.
    await new Promise((r) => setTimeout(r, 2));
    if (this.gestoert) throw new Error("WordPress antwortet mit 500");

    const gewuenscht = new Map<number, number>();
    for (const p of positionen) {
      if (!this.bestand.has(p.id)) continue; // kein Einzelstück
      gewuenscht.set(p.id, (gewuenscht.get(p.id) ?? 0) + p.qty);
    }
    const vorhanden = this.reservierungen.get(schluessel);
    if (vorhanden) {
      const gleich =
        vorhanden.size === gewuenscht.size &&
        [...vorhanden].every(([id, n]) => gewuenscht.get(id) === n);
      if (gleich && vorhanden.size > 0) {
        return { ok: true, reserviert: vorhanden.size };
      }
      await this.freigeben(schluessel);
    }
    const genommen = new Map<number, number>();
    const ausverkauft: Array<{ id: number; name: string }> = [];
    for (const [id, menge] of gewuenscht) {
      // UPDATE … SET bestand = bestand - menge WHERE bestand >= menge
      const da = this.bestand.get(id) ?? 0;
      if (da >= menge) {
        this.bestand.set(id, da - menge);
        genommen.set(id, menge);
      } else {
        ausverkauft.push({
          id,
          name: positionen.find((p) => p.id === id)?.name ?? "",
        });
      }
    }
    if (ausverkauft.length > 0) {
      for (const [id, menge] of genommen) {
        this.bestand.set(id, (this.bestand.get(id) ?? 0) + menge);
      }
      return { ok: false, ausverkauft };
    }
    if (genommen.size > 0) this.reservierungen.set(schluessel, genommen);
    return { ok: true, reserviert: genommen.size };
  }

  async freigeben(schluessel: string): Promise<void> {
    if (this.gestoert) throw new Error("WordPress antwortet mit 500");
    const r = this.reservierungen.get(schluessel);
    if (!r) return;
    for (const [id, menge] of r) {
      this.bestand.set(id, (this.bestand.get(id) ?? 0) + menge);
    }
    this.reservierungen.delete(schluessel);
  }

  async hatEinzelstueck(positionen: ReservierPosition[]): Promise<boolean | null> {
    if (!this.schlagwoerterLesbar) return null;
    return positionen.some((p) => this.bestand.has(p.id));
  }
}

const BILD = 6579;
const DVD = 4122;

function lagerMitBild(bestand = 1): NachbauLager {
  const lager = new NachbauLager();
  lager.bestand.set(BILD, bestand);
  return lager;
}

afterEach(() => {
  delete process.env.EINZELSTUECK_RESERVIERUNG;
});

describe("Zwei gleichzeitige Käufer, Bestand 1", () => {
  it("genau einer gewinnt, der andere bekommt 'inzwischen ausverkauft'", async () => {
    const lager = lagerMitBild(1);
    const bild = [{ id: BILD, qty: 1, name: "Kunstdruck Nr. 3" }];

    const [a, b] = await Promise.all([
      reserviere({ schluessel: "pi_KundeA0000000001", items: bild, lager }),
      reserviere({ schluessel: "pi_KundeB0000000002", items: bild, lager }),
    ]);

    const gewinner = [a, b].filter((e) => e.ok);
    const verlierer = [a, b].filter((e) => !e.ok);
    assert.equal(gewinner.length, 1);
    assert.equal(verlierer.length, 1);
    assert.equal(lager.bestand.get(BILD), 0);

    const v = verlierer[0];
    assert.ok(!v.ok);
    if (!v.ok) {
      assert.deepEqual(v.ausverkauft, [{ id: BILD, name: "Kunstdruck Nr. 3" }]);
      assert.equal(
        ausverkauftMeldung(v.ausverkauft[0]).de,
        "„Kunstdruck Nr. 3“ ist inzwischen ausverkauft."
      );
    }
  });

  it("zwanzig gleichzeitige Käufer: einer gewinnt, der Bestand wird nie negativ", async () => {
    const lager = lagerMitBild(1);
    const ergebnisse = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        reserviere({
          schluessel: `rk_${String(i).padStart(32, "a")}`,
          items: [{ id: BILD, qty: 1 }],
          lager,
        })
      )
    );
    assert.equal(ergebnisse.filter((e) => e.ok).length, 1);
    assert.equal(lager.bestand.get(BILD), 0);
  });

  it("A hat das Bild im Warenkorb, B kauft: A kann danach nicht mehr reservieren", async () => {
    const lager = lagerMitBild(1);
    const b = await reserviere({
      schluessel: "pi_KundeB0000000002",
      items: [{ id: BILD, qty: 1 }],
      lager,
    });
    assert.equal(b.ok, true);
    const a = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [{ id: BILD, qty: 1 }],
      lager,
    });
    assert.equal(a.ok, false);
  });

  it("alles oder nichts: ein ausverkauftes Einzelstück gibt die anderen wieder frei", async () => {
    const lager = lagerMitBild(1);
    lager.bestand.set(7000, 0);
    const e = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [
        { id: BILD, qty: 1 },
        { id: 7000, qty: 1, name: "Zweites Bild" },
      ],
      lager,
    });
    assert.equal(e.ok, false);
    assert.equal(lager.bestand.get(BILD), 1);
    assert.equal(lager.reservierungen.size, 0);
  });
});

describe("Derselbe Käufer", () => {
  it("zweiter Klick (Karte abgelehnt, noch einmal): bucht nicht zweimal ab", async () => {
    const lager = lagerMitBild(1);
    const bild = [{ id: BILD, qty: 1 }];
    const erster = await reserviere({ schluessel: "pi_KundeA0000000001", items: bild, lager });
    const zweiter = await reserviere({ schluessel: "pi_KundeA0000000001", items: bild, lager });
    assert.equal(erster.ok, true);
    assert.equal(zweiter.ok, true);
    assert.equal(lager.bestand.get(BILD), 0);
  });

  it("Zahlung abgebrochen: Freigabe gibt den Bestand zurück, der Nächste kann kaufen", async () => {
    const lager = lagerMitBild(1);
    const bild = [{ id: BILD, qty: 1 }];
    await reserviere({ schluessel: "rk_" + "a".repeat(32), items: bild, lager });
    await gibReservierungFrei("rk_" + "a".repeat(32), lager);
    assert.equal(lager.bestand.get(BILD), 1);
    const b = await reserviere({ schluessel: "pi_KundeB0000000002", items: bild, lager });
    assert.equal(b.ok, true);
  });

  it("Freigabe scheitert nie laut (die Reservierung läuft von selbst ab)", async () => {
    const lager = lagerMitBild(1);
    lager.gestoert = true;
    await assert.doesNotReject(gibReservierungFrei("pi_KundeA0000000001", lager));
    await assert.doesNotReject(gibReservierungFrei(null, lager));
  });
});

describe("Alle anderen Produkte laufen unverändert", () => {
  it("Warenkorb ohne Einzelstück: nichts reserviert, Bestand unberührt", async () => {
    const lager = lagerMitBild(1);
    const e = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [{ id: DVD, qty: 3 }],
      lager,
    });
    assert.deepEqual(e, { ok: true, reserviert: 0 });
    assert.equal(lager.bestand.get(BILD), 1);
  });

  it("gemischter Warenkorb: nur das Einzelstück wird reserviert", async () => {
    const lager = lagerMitBild(1);
    const e = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [
        { id: DVD, qty: 2 },
        { id: BILD, qty: 1 },
      ],
      lager,
    });
    assert.deepEqual(e, { ok: true, reserviert: 1 });
  });

  it("Ausschalter EINZELSTUECK_RESERVIERUNG=aus: WordPress wird gar nicht gefragt", async () => {
    process.env.EINZELSTUECK_RESERVIERUNG = "aus";
    const lager = lagerMitBild(1);
    const e = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [{ id: BILD, qty: 1 }],
      lager,
    });
    assert.equal(e.ok, true);
    assert.equal(lager.aufrufe, 0);
    assert.equal(lager.bestand.get(BILD), 1);
  });
});

describe("WordPress antwortet nicht", () => {
  it("Einzelstück im Warenkorb: Zahlung beginnt nicht", async () => {
    const lager = lagerMitBild(1);
    lager.gestoert = true;
    await assert.rejects(
      reserviere({
        schluessel: "pi_KundeA0000000001",
        items: [{ id: BILD, qty: 1 }],
        lager,
      }),
      ReservierungNichtMoeglichFehler
    );
  });

  it("kein Einzelstück im Warenkorb: Kasse läuft wie bisher weiter", async () => {
    const lager = lagerMitBild(1);
    lager.gestoert = true;
    const e = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [{ id: DVD, qty: 1 }],
      lager,
    });
    assert.equal(e.ok, true);
  });

  it("Schlagwörter nicht lesbar: Kasse läuft wie bisher weiter", async () => {
    const lager = lagerMitBild(1);
    lager.gestoert = true;
    lager.schlagwoerterLesbar = false;
    const e = await reserviere({
      schluessel: "pi_KundeA0000000001",
      items: [{ id: BILD, qty: 1 }],
      lager,
    });
    assert.equal(e.ok, true);
  });
});

describe("Schlüssel und Antworten", () => {
  it("Stripe: PaymentIntent-ID; PayPal: Kennung des Kassenvorgangs; sonst keiner", () => {
    assert.equal(
      reservierungsSchluessel("pi_3Ud8LxEgrBeispiel", "a".repeat(32)),
      "pi_3Ud8LxEgrBeispiel"
    );
    assert.equal(reservierungsSchluessel(null, "A".repeat(32)), "rk_" + "a".repeat(32));
    assert.equal(reservierungsSchluessel("paypal_123456789", ""), null);
    assert.equal(reservierungsSchluessel(undefined, "kein hex"), null);
    assert.match(bankSchluessel(), /^bank_[a-f0-9]{32}$/);
    assert.notEqual(bankSchluessel(), bankSchluessel());
  });

  it("Antwort von WordPress: Name kommt aus dem Warenkorb, Größe bleibt erhalten", () => {
    const korb = [{ id: 6083, variation_id: 6090, qty: 1, name: "Shirt" }];
    assert.deepEqual(
      leseReservierAntwort(
        { ok: false, ausverkauft: [{ product_id: 6083, variation_id: 6090, name: "Shirt - L" }] },
        korb
      ),
      { ok: false, ausverkauft: [{ id: 6083, variation_id: 6090, name: "Shirt" }] }
    );
    assert.deepEqual(leseReservierAntwort({ ok: true, reserviert: 2 }, korb), {
      ok: true,
      reserviert: 2,
    });
    assert.throws(() => leseReservierAntwort({ code: "rest_no_route" }, korb));
  });
});
