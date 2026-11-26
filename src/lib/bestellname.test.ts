import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ergaenzeBestellname,
  nameAusKonto,
  nameAusZahlung,
  nameFehltText,
  teileVollenNamen,
} from "@/lib/bestellname";
import {
  nameAusPayPalOrder,
  wertePayPalOrderAus,
} from "@/lib/paypal-pruefung";

/**
 * Bestellungen ohne Vor- und Nachnamen (in WooCommerce als "Gast" zu sehen).
 *
 * Der PayPal-Knopf prüft die Pflichtfelder des Formulars nicht. Bei
 * angemeldeten Kunden ohne Namen auf Kontoebene kam die Adresse aus dem
 * Konto, der Name blieb leer. Jetzt gilt je Feld: Formular, dann Konto
 * (Rechnungsname, sonst Kontoname), dann Zahlung. Bleibt alles leer, wird
 * die Bestellung angelegt, aber auf on-hold gemeldet.
 */

const ADRESSE = {
  email: "kunde@example.com",
  address_1: "Hauptstraße 1",
  city: "Innsbruck",
  postcode: "6020",
  country: "AT",
};

/** So kam die Bestellung bisher an: Adresse da, Name leer. */
const ohneName = () => ({
  billing: { first_name: "", last_name: "", ...ADRESSE },
  shipping: { first_name: "", last_name: "", ...ADRESSE },
});

const KONTO_NUR_RECHNUNGSNAME = {
  first_name: "",
  last_name: "",
  billing: { first_name: "Thomas", last_name: "Berger" },
};

const PAYPAL_NAME = {
  vorname: "Petra",
  nachname: "Huber",
  vollerName: "Petra Huber",
};

describe("Vollen Namen teilen", () => {
  it("zwei Wörter: Vorname und Nachname", () => {
    assert.deepEqual(teileVollenNamen("Anna Huber"), {
      vorname: "Anna",
      nachname: "Huber",
    });
  });

  it("mehrere Vornamen: das letzte Wort ist der Nachname", () => {
    assert.deepEqual(teileVollenNamen("  Anna  Maria   Huber "), {
      vorname: "Anna Maria",
      nachname: "Huber",
    });
  });

  it("ein Wort gilt als Vorname, leer bleibt leer", () => {
    assert.deepEqual(teileVollenNamen("Cher"), { vorname: "Cher", nachname: "" });
    assert.deepEqual(teileVollenNamen(""), { vorname: "", nachname: "" });
    assert.deepEqual(teileVollenNamen(undefined), { vorname: "", nachname: "" });
    assert.deepEqual(teileVollenNamen(null), { vorname: "", nachname: "" });
  });
});

describe("Name aus der Zahlung", () => {
  it("payer.name geht vor dem vollen Namen der Lieferung", () => {
    assert.deepEqual(
      nameAusZahlung({
        vorname: "Petra",
        nachname: "Huber",
        vollerName: "Firma Huber GmbH",
      }),
      { vorname: "Petra", nachname: "Huber" }
    );
  });

  it("ohne payer.name wird der volle Name geteilt", () => {
    assert.deepEqual(
      nameAusZahlung({ vorname: "", nachname: "", vollerName: "Petra Huber" }),
      { vorname: "Petra", nachname: "Huber" }
    );
  });

  it("nichts da: leer", () => {
    assert.deepEqual(nameAusZahlung(undefined), { vorname: "", nachname: "" });
    assert.deepEqual(nameAusZahlung({}), { vorname: "", nachname: "" });
  });
});

describe("Name aus dem Kundenkonto", () => {
  it("Rechnungsname geht vor dem Kontonamen", () => {
    assert.deepEqual(
      nameAusKonto({
        first_name: "Tom",
        last_name: "B.",
        billing: { first_name: "Thomas", last_name: "Berger" },
      }),
      { vorname: "Thomas", nachname: "Berger" }
    );
  });

  it("ohne Rechnungsnamen der Kontoname", () => {
    assert.deepEqual(
      nameAusKonto({
        first_name: "Thomas",
        last_name: "Berger",
        billing: { first_name: "", last_name: "" },
      }),
      { vorname: "Thomas", nachname: "Berger" }
    );
  });

  it("kein Konto (Gast): leer", () => {
    assert.deepEqual(nameAusKonto(null), { vorname: "", nachname: "" });
  });
});

describe("Bestellname ergänzen", () => {
  it("vollständiger Name aus dem Formular bleibt unangetastet", () => {
    const eingabe = {
      billing: { first_name: "Anna", last_name: "Muster", ...ADRESSE },
      shipping: { first_name: "Anna", last_name: "Muster", ...ADRESSE },
    };
    const e = ergaenzeBestellname({
      ...eingabe,
      konto: KONTO_NUR_RECHNUNGSNAME,
      zahlung: PAYPAL_NAME,
    });
    assert.equal(e.ergaenzt, false);
    assert.equal(e.nameFehlt, false);
    assert.equal(e.quelle, "formular");
    // Dieselben Objekte: nichts kopiert, nichts verändert.
    assert.equal(e.billing, eingabe.billing);
    assert.equal(e.shipping, eingabe.shipping);
  });

  it("der Fall #6869: Kontoname leer, Rechnungsname im Konto da -> aus dem Konto, nicht aus PayPal", () => {
    const e = ergaenzeBestellname({
      ...ohneName(),
      konto: KONTO_NUR_RECHNUNGSNAME,
      zahlung: PAYPAL_NAME,
    });
    assert.equal(e.quelle, "konto");
    assert.equal(e.nameFehlt, false);
    assert.equal(e.ergaenzt, true);
    assert.equal(e.billing.first_name, "Thomas");
    assert.equal(e.billing.last_name, "Berger");
    assert.equal(e.shipping.first_name, "Thomas");
    assert.equal(e.shipping.last_name, "Berger");
  });

  it("Konto ohne Rechnungsnamen: Kontoname", () => {
    const e = ergaenzeBestellname({
      ...ohneName(),
      konto: { first_name: "Tom", last_name: "Berger", billing: {} },
      zahlung: PAYPAL_NAME,
    });
    assert.equal(e.quelle, "konto");
    assert.equal(e.billing.first_name, "Tom");
    assert.equal(e.billing.last_name, "Berger");
  });

  it("Gast ohne Konto: direkt der Name aus der Zahlung (payer.name)", () => {
    const e = ergaenzeBestellname({ ...ohneName(), konto: null, zahlung: PAYPAL_NAME });
    assert.equal(e.quelle, "zahlung");
    assert.equal(e.nameFehlt, false);
    assert.equal(e.billing.first_name, "Petra");
    assert.equal(e.billing.last_name, "Huber");
    assert.equal(e.shipping.first_name, "Petra");
    assert.equal(e.shipping.last_name, "Huber");
  });

  it("Konto ganz ohne Namen: Zahlung, dort ohne payer.name der geteilte volle Name", () => {
    const e = ergaenzeBestellname({
      ...ohneName(),
      konto: { first_name: "", last_name: "", billing: { first_name: "", last_name: "" } },
      zahlung: { vollerName: "Petra Maria Huber" },
    });
    assert.equal(e.quelle, "zahlung");
    assert.equal(e.billing.first_name, "Petra Maria");
    assert.equal(e.billing.last_name, "Huber");
  });

  it("Stripe (Apple Pay / Google Pay): der Name aus der Zahlung kommt ungeteilt", () => {
    const e = ergaenzeBestellname({
      ...ohneName(),
      zahlung: { vollerName: "Jonas Maier" },
    });
    assert.equal(e.billing.first_name, "Jonas");
    assert.equal(e.billing.last_name, "Maier");
  });

  it("nur Leerzeichen im Formular zählen als leer", () => {
    const e = ergaenzeBestellname({
      billing: { first_name: "  ", last_name: " ", ...ADRESSE },
      shipping: { first_name: "  ", last_name: " ", ...ADRESSE },
      konto: KONTO_NUR_RECHNUNGSNAME,
    });
    assert.equal(e.billing.first_name, "Thomas");
    assert.equal(e.billing.last_name, "Berger");
  });

  it("halber Name im Formular: der Teil aus dem Formular bleibt, nur der fehlende kommt dazu", () => {
    const e = ergaenzeBestellname({
      billing: { first_name: "Tommy", last_name: "", ...ADRESSE },
      shipping: { first_name: "Tommy", last_name: "", ...ADRESSE },
      konto: KONTO_NUR_RECHNUNGSNAME,
      zahlung: PAYPAL_NAME,
    });
    assert.equal(e.billing.first_name, "Tommy");
    assert.equal(e.billing.last_name, "Berger");
    assert.equal(e.nameFehlt, false);
  });

  it("eigener Liefername bleibt, auch wenn der Rechnungsname ergänzt wird", () => {
    const e = ergaenzeBestellname({
      billing: { first_name: "", last_name: "", ...ADRESSE },
      shipping: { first_name: "Oma", last_name: "Berger", ...ADRESSE },
      konto: KONTO_NUR_RECHNUNGSNAME,
    });
    assert.equal(e.billing.first_name, "Thomas");
    assert.equal(e.shipping.first_name, "Oma");
    assert.equal(e.shipping.last_name, "Berger");
  });

  it("nirgends ein Name: Bestellung bleibt ohne Namen und wird gemeldet", () => {
    const eingabe = ohneName();
    const e = ergaenzeBestellname({
      ...eingabe,
      konto: { first_name: "", last_name: "", billing: {} },
      zahlung: { vorname: "", nachname: "", vollerName: "" },
    });
    assert.equal(e.nameFehlt, true);
    assert.equal(e.quelle, "leer");
    assert.equal(e.ergaenzt, false);
    assert.equal(e.billing.first_name, "");
    assert.equal(e.billing.last_name, "");
  });

  it("Gast ohne Namen und ohne Zahlungsnamen: gemeldet", () => {
    assert.equal(ergaenzeBestellname(ohneName()).nameFehlt, true);
  });

  it("Adresse, E-Mail und alle anderen Felder bleiben, wie sie sind", () => {
    const eingabe = ohneName();
    const e = ergaenzeBestellname({ ...eingabe, zahlung: PAYPAL_NAME });
    const name = { first_name: "Petra", last_name: "Huber" };
    assert.deepEqual(e.billing, { ...name, ...ADRESSE });
    assert.deepEqual(e.shipping, { ...name, ...ADRESSE });
    // Die Eingabe selbst wird nicht verändert.
    assert.equal(eingabe.billing.first_name, "");
    assert.equal(eingabe.shipping.last_name, "");
  });
});

describe("Name aus der PayPal-Order", () => {
  const ID = "7YK78693AB123456C";
  const order = {
    id: ID,
    status: "COMPLETED",
    payer: { name: { given_name: " Petra ", surname: "Huber" } },
    purchase_units: [
      {
        shipping: { name: { full_name: "Petra Huber" } },
        payments: {
          captures: [
            {
              id: "CAP1",
              status: "COMPLETED",
              amount: { currency_code: "EUR", value: "46.70" },
            },
          ],
        },
      },
    ],
  };

  it("liest payer.name und shipping.name.full_name", () => {
    assert.deepEqual(nameAusPayPalOrder(order), {
      vorname: "Petra",
      nachname: "Huber",
      vollerName: "Petra Huber",
    });
  });

  it("Order ohne Namen: alles leer, kein Fehler", () => {
    assert.deepEqual(nameAusPayPalOrder({ id: ID, status: "COMPLETED" }), {
      vorname: "",
      nachname: "",
      vollerName: "",
    });
  });

  it("die Zahlungsprüfung selbst bleibt, wie sie war", () => {
    const p = wertePayPalOrderAus(ID, order);
    assert.equal(p.ok, true);
    if (p.ok) {
      assert.equal(p.bezahltCent, 4670);
      assert.equal(p.waehrung, "eur");
      assert.equal(p.captureId, "CAP1");
    }
  });
});

describe("Meldung bei fehlendem Namen", () => {
  it("nennt die Zahlung und was zu tun ist", () => {
    const text = nameFehltText("paypal_7YK78693AB123456C");
    assert.match(text, /paypal_7YK78693AB123456C/);
    assert.match(text, /Wartend/);
    assert.match(text, /Namen nachtragen/);
  });
});
