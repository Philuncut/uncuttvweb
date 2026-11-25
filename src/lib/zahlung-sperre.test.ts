import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AnlageAbgelehntFehler,
  BestellungInArbeitFehler,
  kassenSchluessel,
  leseSperrAntwort,
  mitZahlungSperre,
  SperreNichtVerfuegbarFehler,
  sperrSchluessel,
  sucheBestellungZurZahlung,
  type Sperre,
  type SperrAntwort,
} from "@/lib/zahlung-sperre";

/**
 * Eine Bestellung je Zahlung.
 *
 * Anlass: Zu einer PayPal-Zahlung entstanden bis zu fünf Bestellungen, weil
 * der Browser denselben Auftrag wiederholte (Wiederanlauf bei jedem
 * Seitenaufruf) und der Server vorher nicht dicht suchte.
 *
 * Der Nachbau unten verhält sich wie docs/wordpress/uncuttv-kasse.php: ein
 * eindeutiger Schlüssel je Zeile, belegen ist ein einzelner Schritt ohne
 * await dazwischen, so wie INSERT IGNORE in der Datenbank ein einzelner
 * Schritt ist.
 */
class NachbauSperre implements Sperre {
  zeilen = new Map<string, { token: string; orderId: number }>();
  bestellungen = new Map<number, { transactionId: string; status: string }>();
  aufrufe = 0;
  gestoert = false;
  private naechsterToken = 1;

  private finde(schluessel: string[]): SperrAntwort | null {
    const sortiert = [...schluessel].sort(
      (a, b) => Number(a.startsWith("kasse_")) - Number(b.startsWith("kasse_"))
    );
    for (const k of sortiert) {
      const zeile = this.zeilen.get(k);
      if (zeile && zeile.orderId > 0) {
        const b = this.bestellungen.get(zeile.orderId);
        return {
          zustand: "vorhanden",
          orderId: zeile.orderId,
          orderNumber: String(zeile.orderId),
          status: b?.status ?? "processing",
          transactionId: b?.transactionId ?? "",
          treffer: k,
        };
      }
    }
    return null;
  }

  async belegen(schluessel: string[], nurSuchen: boolean): Promise<SperrAntwort> {
    this.aufrufe++;
    if (this.gestoert) throw new SperreNichtVerfuegbarFehler("WordPress antwortet mit 500");
    const vorhanden = this.finde(schluessel);
    if (vorhanden) return vorhanden;
    if (nurSuchen) return { zustand: "frei" };
    if (schluessel.some((k) => this.zeilen.has(k))) return { zustand: "in_arbeit" };
    const token = `t${this.naechsterToken++}`;
    for (const k of schluessel) this.zeilen.set(k, { token, orderId: 0 });
    return { zustand: "frei", token };
  }

  async bestaetigen(token: string, orderId: number): Promise<void> {
    for (const z of this.zeilen.values()) {
      if (z.token === token && z.orderId === 0) z.orderId = orderId;
    }
  }

  async freigeben(token: string): Promise<void> {
    for (const [k, z] of this.zeilen) {
      if (z.token === token && z.orderId === 0) this.zeilen.delete(k);
    }
  }
}

/** WooCommerce-Ersatz: zählt, wie oft wirklich angelegt wurde. */
function laden(sperre: NachbauSperre) {
  let naechste = 7000;
  const angelegt: number[] = [];
  return {
    angelegt,
    anlegen:
      (transactionId: string, dauerMs = 5) =>
      async () => {
        await new Promise((r) => setTimeout(r, dauerMs));
        const id = naechste++;
        angelegt.push(id);
        sperre.bestellungen.set(id, { transactionId, status: "processing" });
        return { id };
      },
  };
}

const schnell = { wartenGesamtMs: 400, wartenSchrittMs: 10 };

describe("Derselbe Auftrag kommt mehrfach", () => {
  it("zweimal nacheinander (Webhook oder Wiederanlauf kommt doppelt): eine Bestellung", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const ref = "paypal_5O190127TN364715T";

    const erster = await mitZahlungSperre({
      sperre,
      schluessel: [ref],
      anlegen: woo.anlegen(ref),
      orderIdAus: (o) => o.id,
      ...schnell,
    });
    const zweiter = await mitZahlungSperre({
      sperre,
      schluessel: [ref],
      anlegen: woo.anlegen(ref),
      orderIdAus: (o) => o.id,
      ...schnell,
    });

    assert.equal(erster.art, "neu");
    assert.equal(zweiter.art, "vorhanden");
    assert.equal(woo.angelegt.length, 1);
    if (zweiter.art === "vorhanden") {
      assert.equal(zweiter.bestellung.orderId, woo.angelegt[0]);
    }
  });

  it("fünfmal gleichzeitig: eine Bestellung, alle bekommen dieselbe Nummer", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const ref = "paypal_8WF61480AB123456C";

    const ergebnisse = await Promise.all(
      Array.from({ length: 5 }, () =>
        mitZahlungSperre({
          sperre,
          schluessel: [ref],
          anlegen: woo.anlegen(ref, 40),
          orderIdAus: (o) => o.id,
          ...schnell,
        })
      )
    );

    assert.equal(woo.angelegt.length, 1);
    assert.equal(ergebnisse.filter((e) => e.art === "neu").length, 1);
    const nummern = ergebnisse.map((e) =>
      e.art === "neu" ? e.ergebnis.id : e.bestellung.orderId
    );
    assert.deepEqual([...new Set(nummern)], [woo.angelegt[0]]);
  });

  it("Stripe-Zahlung zweimal gemeldet: eine Bestellung", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const ref = "pi_3Ud8LxEgrTestTestTest00";
    for (let i = 0; i < 2; i++) {
      await mitZahlungSperre({
        sperre,
        schluessel: [ref],
        anlegen: woo.anlegen(ref),
        orderIdAus: (o) => o.id,
        ...schnell,
      });
    }
    assert.equal(woo.angelegt.length, 1);
  });

  it("der erste Aufruf braucht länger als die Wartezeit: der zweite legt nicht an", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const ref = "paypal_1TY70700AB123456C";
    const erster = mitZahlungSperre({
      sperre,
      schluessel: [ref],
      anlegen: woo.anlegen(ref, 300),
      orderIdAus: (o) => o.id,
    });
    await assert.rejects(
      mitZahlungSperre({
        sperre,
        schluessel: [ref],
        anlegen: woo.anlegen(ref),
        orderIdAus: (o) => o.id,
        wartenGesamtMs: 50,
        wartenSchrittMs: 10,
      }),
      BestellungInArbeitFehler
    );
    await erster;
    assert.equal(woo.angelegt.length, 1);
  });
});

describe("Derselbe Kassenvorgang, andere Zahlung", () => {
  it("zweiter PayPal-Kauf im selben Kassenvorgang: keine zweite Bestellung, Treffer über die Kasse", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const kasse = kassenSchluessel("a".repeat(32), "kunde@example.com", [
      { id: 6579, qty: 1 },
    ]);
    assert.ok(kasse);

    await mitZahlungSperre({
      sperre,
      schluessel: sperrSchluessel("paypal_AAAAAAAAAAAAAAAA1", kasse),
      anlegen: woo.anlegen("paypal_AAAAAAAAAAAAAAAA1"),
      orderIdAus: (o) => o.id,
      ...schnell,
    });
    const zweiter = await mitZahlungSperre({
      sperre,
      schluessel: sperrSchluessel("paypal_BBBBBBBBBBBBBBBB2", kasse),
      anlegen: woo.anlegen("paypal_BBBBBBBBBBBBBBBB2"),
      orderIdAus: (o) => o.id,
      ...schnell,
    });

    assert.equal(woo.angelegt.length, 1);
    assert.equal(zweiter.art, "vorhanden");
    if (zweiter.art === "vorhanden") {
      assert.ok(zweiter.bestellung.treffer.startsWith("kasse_"));
      // Andere Zahlung als die der Bestellung: daran erkennt der Aufrufer
      // die zweite Zahlung und meldet sie ans Büro.
      assert.equal(zweiter.bestellung.transactionId, "paypal_AAAAAAAAAAAAAAAA1");
    }
  });

  it("anderer Warenkorb oder andere E-Mail ist ein anderer Kassenvorgang", () => {
    const k = "b".repeat(32);
    const a = kassenSchluessel(k, "kunde@example.com", [{ id: 1, qty: 1 }]);
    assert.notEqual(a, kassenSchluessel(k, "kunde@example.com", [{ id: 1, qty: 2 }]));
    assert.notEqual(a, kassenSchluessel(k, "andere@example.com", [{ id: 1, qty: 1 }]));
    assert.notEqual(a, kassenSchluessel("c".repeat(32), "kunde@example.com", [{ id: 1, qty: 1 }]));
    assert.equal(a, kassenSchluessel(k, " Kunde@Example.com ", [{ id: 1, qty: 1 }]));
  });

  it("ohne Kennung aus dem Browser gibt es keinen Kassen-Schlüssel", () => {
    assert.equal(kassenSchluessel("", "kunde@example.com", [{ id: 1, qty: 1 }]), null);
    assert.equal(kassenSchluessel("nicht-hex", "kunde@example.com", []), null);
    assert.deepEqual(sperrSchluessel("paypal_5O190127TN364715T", null), [
      "paypal_5O190127TN364715T",
    ]);
    assert.deepEqual(sperrSchluessel("", null), []);
    assert.deepEqual(sperrSchluessel("irgendwas", null), []);
  });
});

describe("Suche oder Anlegen scheitert", () => {
  it("Suche nicht möglich: es wird NICHT angelegt", async () => {
    const sperre = new NachbauSperre();
    sperre.gestoert = true;
    const woo = laden(sperre);
    await assert.rejects(
      mitZahlungSperre({
        sperre,
        schluessel: ["paypal_5O190127TN364715T"],
        anlegen: woo.anlegen("paypal_5O190127TN364715T"),
        orderIdAus: (o) => o.id,
        ...schnell,
      }),
      SperreNichtVerfuegbarFehler
    );
    await assert.rejects(
      sucheBestellungZurZahlung(["paypal_5O190127TN364715T"], sperre),
      SperreNichtVerfuegbarFehler
    );
    assert.equal(woo.angelegt.length, 0);
  });

  it("WooCommerce lehnt ab: Sperre wird frei, der nächste Versuch darf anlegen", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const ref = "paypal_5O190127TN364715T";
    await assert.rejects(
      mitZahlungSperre({
        sperre,
        schluessel: [ref],
        anlegen: async () => {
          throw new AnlageAbgelehntFehler("WooCommerce order creation failed: 400");
        },
        orderIdAus: (o: { id: number }) => o.id,
        ...schnell,
      }),
      AnlageAbgelehntFehler
    );
    const zweiter = await mitZahlungSperre({
      sperre,
      schluessel: [ref],
      anlegen: woo.anlegen(ref),
      orderIdAus: (o) => o.id,
      ...schnell,
    });
    assert.equal(zweiter.art, "neu");
    assert.equal(woo.angelegt.length, 1);
  });

  it("Zeitüberschreitung beim Anlegen: Sperre bleibt, niemand legt blind ein zweites Mal an", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const ref = "paypal_5O190127TN364715T";
    await assert.rejects(
      mitZahlungSperre({
        sperre,
        schluessel: [ref],
        anlegen: async () => {
          throw new Error("The operation was aborted due to timeout");
        },
        orderIdAus: (o: { id: number }) => o.id,
        ...schnell,
      })
    );
    await assert.rejects(
      mitZahlungSperre({
        sperre,
        schluessel: [ref],
        anlegen: woo.anlegen(ref),
        orderIdAus: (o) => o.id,
        wartenGesamtMs: 40,
        wartenSchrittMs: 10,
      }),
      BestellungInArbeitFehler
    );
    assert.equal(woo.angelegt.length, 0);
  });

  it("ohne Schlüssel (alter Stripe-Checkout) wird wie bisher angelegt", async () => {
    const sperre = new NachbauSperre();
    const woo = laden(sperre);
    const e = await mitZahlungSperre({
      sperre,
      schluessel: [],
      anlegen: woo.anlegen(""),
      orderIdAus: (o) => o.id,
    });
    assert.equal(e.art, "neu");
    assert.equal(sperre.aufrufe, 0);
  });
});

describe("Antwort von WordPress lesen", () => {
  it("vorhanden, frei, in Arbeit", () => {
    assert.deepEqual(
      leseSperrAntwort({
        zustand: "vorhanden",
        order_id: 6181,
        number: "6181",
        status: "processing",
        transaction_id: "paypal_8WF6148",
        treffer: "paypal_8WF6148",
      }),
      {
        zustand: "vorhanden",
        orderId: 6181,
        orderNumber: "6181",
        status: "processing",
        transactionId: "paypal_8WF6148",
        treffer: "paypal_8WF6148",
      }
    );
    assert.deepEqual(leseSperrAntwort({ zustand: "frei", token: "ab" }), {
      zustand: "frei",
      token: "ab",
    });
    assert.deepEqual(leseSperrAntwort({ zustand: "in_arbeit" }), {
      zustand: "in_arbeit",
    });
  });

  it("Unlesbares gilt als Störung, nicht als frei", () => {
    assert.throws(() => leseSperrAntwort({}), SperreNichtVerfuegbarFehler);
    assert.throws(() => leseSperrAntwort(null), SperreNichtVerfuegbarFehler);
    assert.throws(
      () => leseSperrAntwort({ zustand: "vorhanden" }),
      SperreNichtVerfuegbarFehler
    );
    assert.throws(
      () => leseSperrAntwort({ code: "rest_no_route" }),
      SperreNichtVerfuegbarFehler
    );
  });
});
