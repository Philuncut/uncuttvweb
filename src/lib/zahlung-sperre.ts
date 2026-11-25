/**
 * Eine Bestellung je Zahlung: dichte Suche und Sperre.
 *
 * Warum: Zu einer PayPal-Zahlung entstanden bis zu fünf Bestellungen
 * (2.10.2026: #6144, #6181, #6183, #6184, #6186), weil vor dem Anlegen
 * nicht oder nur unter den neuesten 20 Bestellungen gesucht wurde und der
 * PayPal-Wiederanlauf denselben Auftrag bei jedem Seitenaufruf erneut
 * schickte.
 *
 * Jetzt gilt vor jedem Anlegen:
 *   1. WordPress fragen (docs/wordpress/uncuttv-kasse.php), ob es zur
 *      Zahlung (pi_… / paypal_…) oder zum Kassenvorgang (kasse_…) schon eine
 *      Bestellung gibt. Gesucht wird in der Datenbank, nicht über die
 *      REST-Liste.
 *   2. Die Sperre nehmen. Von zwei gleichzeitigen Aufrufen bekommt genau
 *      einer sie; der andere wartet kurz und bekommt dann die fertige
 *      Bestellung des ersten.
 *   3. Schlägt Suche oder Sperre fehl, wird NICHT angelegt
 *      (SperreNichtVerfuegbarFehler), der Aufrufer meldet einen Fehler.
 *
 * Notschalter: ZAHLUNG_SPERRE=aus in den Umgebungsvariablen schaltet Suche
 * und Sperre ab (dann wie vor November 2026, ohne Schutz vor Doppelten).
 * Nur für den Fall gedacht, dass das Snippet in WordPress ausfällt.
 */

import { createHash } from "node:crypto";

const ZEITLIMIT_MS = 8_000;
/** So lange wartet ein zweiter Aufruf auf die Bestellung des ersten. */
const WARTEN_GESAMT_MS = 12_000;
const WARTEN_SCHRITT_MS = 1_500;

export type VorhandeneBestellung = {
  orderId: number;
  orderNumber: string;
  status: string;
  transactionId: string;
  /** Der Schlüssel, über den die Bestellung gefunden wurde. */
  treffer: string;
};

export type SperrAntwort =
  | ({ zustand: "vorhanden" } & VorhandeneBestellung)
  | { zustand: "frei"; token?: string }
  | { zustand: "in_arbeit" };

/** Die vier Aufrufe an WordPress; in Tests durch einen Nachbau ersetzt. */
export interface Sperre {
  belegen(schluessel: string[], nurSuchen: boolean): Promise<SperrAntwort>;
  bestaetigen(token: string, orderId: number): Promise<void>;
  freigeben(token: string): Promise<void>;
}

/** Suche oder Sperre nicht erreichbar: Es darf nicht angelegt werden. */
export class SperreNichtVerfuegbarFehler extends Error {
  readonly code = "lock_unavailable";

  constructor(detail: string) {
    super(`Suche nach vorhandener Bestellung nicht möglich: ${detail}`);
    this.name = "SperreNichtVerfuegbarFehler";
  }
}

/** Ein anderer Aufruf legt gerade an und ist noch nicht fertig. */
export class BestellungInArbeitFehler extends Error {
  readonly code = "order_in_progress";

  constructor() {
    super("Die Bestellung zu dieser Zahlung wird gerade angelegt.");
    this.name = "BestellungInArbeitFehler";
  }
}

/**
 * Das Anlegen ist endgültig gescheitert (WooCommerce hat abgelehnt). Nur
 * dann wird die Sperre freigegeben. Bei Zeitüberschreitung oder Netzfehler
 * bleibt sie liegen, weil WordPress die Bestellung trotzdem angelegt haben
 * kann.
 */
export class AnlageAbgelehntFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnlageAbgelehntFehler";
  }
}

export function sperreAbgeschaltet(): boolean {
  return (process.env.ZAHLUNG_SPERRE ?? "").trim().toLowerCase() === "aus";
}

/**
 * Schlüssel des Kassenvorgangs. Der Browser liefert eine Zufallskennung je
 * Tab; erst zusammen mit E-Mail und Warenkorb wird daraus der Schlüssel.
 * So trifft eine liegen gebliebene Kennung keinen späteren, anderen Einkauf.
 */
export function kassenSchluessel(
  browserKennung: string | undefined | null,
  email: string | undefined | null,
  items: Array<{ id: number; qty: number; variation_id?: number }>
): string | null {
  const kennung = (browserKennung ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{16,64}$/.test(kennung)) return null;
  const zeilen = items
    .map(
      (i) =>
        `${Number(i.id)}:${Number(i.variation_id ?? 0) || 0}:${Math.max(1, Number(i.qty) || 1)}`
    )
    .sort();
  const hash = createHash("sha256")
    .update(
      JSON.stringify([kennung, (email ?? "").trim().toLowerCase(), zeilen])
    )
    .digest("hex")
    .slice(0, 40);
  return `kasse_${hash}`;
}

/** Zahlungsreferenz und Kassenvorgang als Liste, ohne Leeres. */
export function sperrSchluessel(
  zahlungsreferenz: string | undefined | null,
  kasse?: string | null
): string[] {
  const out: string[] = [];
  const ref = (zahlungsreferenz ?? "").trim();
  if (/^(pi|paypal)_[A-Za-z0-9_]{6,180}$/.test(ref)) out.push(ref);
  if (kasse && /^kasse_[a-f0-9]{40}$/.test(kasse)) out.push(kasse);
  return out;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Nur suchen, nichts sperren. null = es gibt keine Bestellung. */
export async function sucheBestellungZurZahlung(
  schluessel: string[],
  sperre: Sperre = wooSperre
): Promise<VorhandeneBestellung | null> {
  if (schluessel.length === 0 || sperreAbgeschaltet()) return null;
  const antwort = await sperre.belegen(schluessel, true);
  return antwort.zustand === "vorhanden" ? antwort : null;
}

export type MitSperreErgebnis<T> =
  | { art: "neu"; ergebnis: T }
  | { art: "vorhanden"; bestellung: VorhandeneBestellung };

/**
 * Führt `anlegen` höchstens einmal je Schlüssel aus. Gibt es die Bestellung
 * schon (oder entsteht sie gerade in einem anderen Aufruf), kommt sie als
 * "vorhanden" zurück und `anlegen` läuft nicht.
 */
export async function mitZahlungSperre<T>(eingabe: {
  schluessel: string[];
  anlegen: () => Promise<T>;
  /** Bestellnummer aus dem Ergebnis, für die Bestätigung der Sperre. */
  orderIdAus: (ergebnis: T) => number;
  sperre?: Sperre;
  wartenGesamtMs?: number;
  wartenSchrittMs?: number;
}): Promise<MitSperreErgebnis<T>> {
  const sperre = eingabe.sperre ?? wooSperre;
  if (eingabe.schluessel.length === 0 || sperreAbgeschaltet()) {
    return { art: "neu", ergebnis: await eingabe.anlegen() };
  }
  const gesamt = eingabe.wartenGesamtMs ?? WARTEN_GESAMT_MS;
  const schritt = eingabe.wartenSchrittMs ?? WARTEN_SCHRITT_MS;

  let token = "";
  const ende = Date.now() + gesamt;
  for (;;) {
    const antwort = await sperre.belegen(eingabe.schluessel, false);
    if (antwort.zustand === "vorhanden") {
      return { art: "vorhanden", bestellung: antwort };
    }
    if (antwort.zustand === "frei") {
      if (!antwort.token) {
        throw new SperreNichtVerfuegbarFehler("Sperre ohne Token");
      }
      token = antwort.token;
      break;
    }
    if (Date.now() + schritt > ende) {
      throw new BestellungInArbeitFehler();
    }
    await pause(schritt);
  }

  let ergebnis: T;
  try {
    ergebnis = await eingabe.anlegen();
  } catch (err) {
    if (err instanceof AnlageAbgelehntFehler) {
      try {
        await sperre.freigeben(token);
      } catch (freigabeFehler) {
        console.error("[zahlung-sperre] Freigabe fehlgeschlagen:", freigabeFehler);
      }
    }
    throw err;
  }

  try {
    await sperre.bestaetigen(token, eingabe.orderIdAus(ergebnis));
  } catch (err) {
    // Nicht schlimm: Die Suche findet die Bestellung auch über ihre
    // Zahlungsreferenz und ihr Meta-Feld.
    console.error("[zahlung-sperre] Bestätigung fehlgeschlagen:", err);
  }
  return { art: "neu", ergebnis };
}

function wooBasis(): string {
  return (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
}

function wooAuth(): string {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.WOOCOMMERCE_KEY}:${process.env.WOOCOMMERCE_SECRET}`
    ).toString("base64")
  );
}

async function aufruf(pfad: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${wooBasis()}/wp-json/wc-uncuttv/v1${pfad}`, {
      method: "POST",
      headers: { Authorization: wooAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
  } catch (err) {
    throw new SperreNichtVerfuegbarFehler(
      err instanceof Error ? err.message : String(err)
    );
  }
  if (!res.ok) {
    throw new SperreNichtVerfuegbarFehler(
      `WordPress antwortet mit ${res.status} auf ${pfad}`
    );
  }
  try {
    return await res.json();
  } catch {
    throw new SperreNichtVerfuegbarFehler(`Antwort auf ${pfad} nicht lesbar`);
  }
}

/** Antwort von WordPress prüfen und in die eigene Form bringen. Testbar. */
export function leseSperrAntwort(roh: unknown): SperrAntwort {
  const a = (roh ?? {}) as Record<string, unknown>;
  if (a.zustand === "vorhanden") {
    const orderId = Number(a.order_id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw new SperreNichtVerfuegbarFehler("vorhanden ohne Bestellnummer");
    }
    return {
      zustand: "vorhanden",
      orderId,
      orderNumber: String(a.number ?? orderId),
      status: String(a.status ?? ""),
      transactionId: String(a.transaction_id ?? ""),
      treffer: String(a.treffer ?? ""),
    };
  }
  if (a.zustand === "frei") {
    return {
      zustand: "frei",
      token: typeof a.token === "string" ? a.token : undefined,
    };
  }
  if (a.zustand === "in_arbeit") return { zustand: "in_arbeit" };
  throw new SperreNichtVerfuegbarFehler("unbekannte Antwort");
}

export const wooSperre: Sperre = {
  async belegen(schluessel, nurSuchen) {
    return leseSperrAntwort(
      await aufruf("/zahlung/belegen", { schluessel, nur_suchen: nurSuchen })
    );
  },
  async bestaetigen(token, orderId) {
    await aufruf("/zahlung/bestaetigen", { token, order_id: orderId });
  },
  async freigeben(token) {
    await aufruf("/zahlung/freigeben", { token });
  },
};
