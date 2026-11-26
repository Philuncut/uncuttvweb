/**
 * Vor- und Nachname einer Bestellung ergänzen, wenn das Kassenformular
 * keinen geliefert hat.
 *
 * Anlass: Der PayPal-Knopf (und Apple Pay / Google Pay) ist kein Absenden
 * des Formulars, die Pflichtfelder greifen dort nicht. Bei angemeldeten
 * Kunden ohne Namen auf Kontoebene blieben die Namensfelder leer, während
 * die Adresse aus dem Konto vorausgefüllt war; die Bestellung stand in
 * WooCommerce dann als "Gast" ohne Namen da.
 *
 * Reihenfolge, je Feld (Vorname, Nachname) die erste Quelle mit Inhalt:
 *
 *   1. Formular
 *   2. Kundenkonto: Rechnungsname, sonst Kontoname
 *   3. Zahlung: bei PayPal payer.name, sonst shipping.name; bei Stripe der
 *      Name aus der Zahlung
 *
 * Das Konto steht vor der Zahlung, weil in diesen Fällen auch die Adresse
 * aus dem Konto kommt und der PayPal-Name eine andere Person sein kann.
 * Für Gäste gibt es kein Konto, dort greift direkt die Zahlung.
 *
 * Steht im Formular ein vollständiger Name, ändert sich nichts. Diese Datei
 * rechnet nur; sie lädt nichts und ist ohne Netz prüfbar.
 */

export type NamensQuelle = "formular" | "konto" | "zahlung" | "leer";

/** Name, wie ihn die Zahlung kennt. Alles optional. */
export type ZahlungsName = {
  vorname?: string | null;
  nachname?: string | null;
  /** Ungeteilt, z. B. PayPal shipping.name.full_name oder Stripe billing_details.name. */
  vollerName?: string | null;
};

/** Ausschnitt des WooCommerce-Kundensatzes, soweit er Namen trägt. */
export type KontoName = {
  first_name?: unknown;
  last_name?: unknown;
  billing?: { [feld: string]: unknown } | null;
};

type Paar = { vorname: string; nachname: string };

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

/**
 * Teilt einen ungeteilten Namen: das letzte Wort ist der Nachname, alles
 * davor der Vorname ("Anna Maria Huber" -> "Anna Maria" / "Huber"). Ein
 * einzelnes Wort gilt als Vorname.
 */
export function teileVollenNamen(vollerName: unknown): Paar {
  const teile = text(vollerName).split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { vorname: "", nachname: "" };
  if (teile.length === 1) return { vorname: teile[0], nachname: "" };
  return {
    vorname: teile.slice(0, -1).join(" "),
    nachname: teile[teile.length - 1],
  };
}

/** Name aus der Zahlung: geteilte Felder zuerst, sonst der volle Name. */
export function nameAusZahlung(zahlung: ZahlungsName | null | undefined): Paar {
  const vorname = text(zahlung?.vorname);
  const nachname = text(zahlung?.nachname);
  if (vorname || nachname) return { vorname, nachname };
  return teileVollenNamen(zahlung?.vollerName);
}

/** Name aus dem Konto: Rechnungsname, sonst Kontoname. */
export function nameAusKonto(konto: KontoName | null | undefined): Paar {
  const rechnung = {
    vorname: text(konto?.billing?.first_name),
    nachname: text(konto?.billing?.last_name),
  };
  if (rechnung.vorname || rechnung.nachname) return rechnung;
  return {
    vorname: text(konto?.first_name),
    nachname: text(konto?.last_name),
  };
}

export type BestellnameEingabe = {
  billing: Record<string, string>;
  shipping: Record<string, string>;
  /** Kundensatz des angemeldeten Kunden; bei Gästen leer lassen. */
  konto?: KontoName | null;
  zahlung?: ZahlungsName | null;
};

export type BestellnameErgebnis = {
  billing: Record<string, string>;
  shipping: Record<string, string>;
  /** Woher der Rechnungsname stammt; "leer", wenn es nirgends einen gab. */
  quelle: NamensQuelle;
  /** Vor- und Nachname der Rechnung sind beide leer geblieben. */
  nameFehlt: boolean;
  /** false: Formular war vollständig, es wurde nichts angefasst. */
  ergaenzt: boolean;
};

export function ergaenzeBestellname(
  eingabe: BestellnameEingabe
): BestellnameErgebnis {
  const formular: Paar = {
    vorname: text(eingabe.billing.first_name),
    nachname: text(eingabe.billing.last_name),
  };
  const lieferung: Paar = {
    vorname: text(eingabe.shipping.first_name),
    nachname: text(eingabe.shipping.last_name),
  };

  const rechnungVollstaendig = Boolean(formular.vorname && formular.nachname);
  const lieferungVollstaendig = Boolean(lieferung.vorname && lieferung.nachname);
  if (rechnungVollstaendig && lieferungVollstaendig) {
    return {
      billing: eingabe.billing,
      shipping: eingabe.shipping,
      quelle: "formular",
      nameFehlt: false,
      ergaenzt: false,
    };
  }

  const stufen: Array<{ quelle: NamensQuelle; name: Paar }> = [
    { quelle: "formular", name: formular },
    { quelle: "konto", name: nameAusKonto(eingabe.konto) },
    { quelle: "zahlung", name: nameAusZahlung(eingabe.zahlung) },
  ];

  let vorname = "";
  let nachname = "";
  let quelle: NamensQuelle = "leer";
  for (const stufe of stufen) {
    const neu = (!vorname && stufe.name.vorname) || (!nachname && stufe.name.nachname);
    if (!vorname) vorname = stufe.name.vorname;
    if (!nachname) nachname = stufe.name.nachname;
    // Die späteste Stufe, die etwas beigetragen hat, benennt die Herkunft.
    if (neu) quelle = stufe.quelle;
    if (vorname && nachname) break;
  }

  const billing = { ...eingabe.billing };
  if (!formular.vorname && vorname) billing.first_name = vorname;
  if (!formular.nachname && nachname) billing.last_name = nachname;

  // Lieferung: eigener Name bleibt; was fehlt, kommt vom Rechnungsnamen.
  const shipping = { ...eingabe.shipping };
  if (!lieferung.vorname && vorname) shipping.first_name = vorname;
  if (!lieferung.nachname && nachname) shipping.last_name = nachname;

  return {
    billing,
    shipping,
    quelle,
    nameFehlt: !vorname && !nachname,
    ergaenzt:
      billing.first_name !== eingabe.billing.first_name ||
      billing.last_name !== eingabe.billing.last_name ||
      shipping.first_name !== eingabe.shipping.first_name ||
      shipping.last_name !== eingabe.shipping.last_name,
  };
}

/** Text der Bestellnotiz und Kern der Mail, wenn kein Name zu finden war. */
export function nameFehltText(zahlungsreferenz: string): string {
  return (
    `Bestellung ohne Vor- und Nachnamen: Weder das Kassenformular noch das ` +
    `Kundenkonto noch die Zahlung (${zahlungsreferenz || "ohne Referenz"}) ` +
    `haben einen Namen geliefert. Die Zahlung ist eingegangen. Bestellung ` +
    `steht auf "Wartend"; bitte den Namen nachtragen und danach auf ` +
    `"In Bearbeitung" stellen.`
  );
}
