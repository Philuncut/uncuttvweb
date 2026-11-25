/**
 * Reservierung für Einzelstücke, vor der Zahlung.
 *
 * Warum: Einzelstücke (Bestand 1) wurden doppelt verkauft, weil zwischen
 * Laden der Kasse und Zahlung niemand den Bestand festhielt. Jetzt bucht
 * die Kasse beim Klick auf "Jetzt kaufen" den Bestand in WordPress ab,
 * bevor die Zahlung bestätigt wird (docs/wordpress/uncuttv-kasse.php,
 * Stand 2). Dort entscheidet eine einzige bedingte SQL-Anweisung, wer von
 * zwei gleichzeitigen Käufern gewinnt.
 *
 * Kleinste Variante bis zum Umbau (Phase 2b):
 *   - Gilt nur für Produkte mit dem Schlagwort "einzelstueck". Das
 *     entscheidet WordPress; alle anderen Positionen bleiben unberührt.
 *   - Ausschalter: EINZELSTUECK_RESERVIERUNG=aus.
 *   - Ohne Bestellung läuft die Reservierung nach RESERVIERUNG_MINUTEN ab.
 *
 * Wenn WordPress nicht antwortet: Enthält der Warenkorb ein Einzelstück,
 * wird die Zahlung nicht begonnen (ReservierungNichtMoeglichFehler). Für
 * Warenkörbe ohne Einzelstück läuft die Kasse wie bisher weiter.
 */

import { randomBytes } from "node:crypto";

export const RESERVIERUNG_MINUTEN = 15;
export const EINZELSTUECK_SCHLAGWORT = "einzelstueck";

const ZEITLIMIT_MS = 8_000;

export type ReservierPosition = {
  id: number;
  variation_id?: number;
  qty: number;
  name?: string;
};

export type Ausverkauft = { id: number; variation_id?: number; name: string };

export type ReservierErgebnis =
  | { ok: true; reserviert: number; uebersprungen?: string }
  | { ok: false; ausverkauft: Ausverkauft[] };

/** Die Aufrufe an WordPress; in Tests durch einen Nachbau ersetzt. */
export interface Lager {
  nehmen(
    schluessel: string,
    positionen: ReservierPosition[],
    minuten: number
  ): Promise<ReservierErgebnis>;
  freigeben(schluessel: string): Promise<void>;
  /** true/false, oder null, wenn es sich nicht feststellen lässt. */
  hatEinzelstueck(positionen: ReservierPosition[]): Promise<boolean | null>;
}

/** Warenkorb enthält ein Einzelstück, aber reservieren ist gerade nicht möglich. */
export class ReservierungNichtMoeglichFehler extends Error {
  readonly code = "reservierung_nicht_moeglich";

  constructor(detail: string) {
    super(`Reservierung nicht möglich: ${detail}`);
    this.name = "ReservierungNichtMoeglichFehler";
  }
}

export function reservierungAbgeschaltet(): boolean {
  return (
    (process.env.EINZELSTUECK_RESERVIERUNG ?? "").trim().toLowerCase() === "aus"
  );
}

/**
 * Schlüssel der Reservierung. Stripe: die PaymentIntent-ID (steht schon beim
 * Klick fest und später in der Bestellung). PayPal: die Kennung des
 * Kassenvorgangs aus dem Browser, weil die PayPal-Order erst danach
 * entsteht.
 */
export function reservierungsSchluessel(
  paymentIntentId: string | undefined | null,
  checkoutKey: string | undefined | null
): string | null {
  const pi = (paymentIntentId ?? "").trim();
  if (/^pi_[A-Za-z0-9_]{6,180}$/.test(pi)) return pi;
  const kennung = (checkoutKey ?? "").trim().toLowerCase();
  if (/^[a-f0-9]{16,64}$/.test(kennung)) return `rk_${kennung}`;
  return null;
}

/** Vorkasse hat weder PaymentIntent noch Kassenkennung: eigener Schlüssel. */
export function bankSchluessel(): string {
  return `bank_${randomBytes(16).toString("hex")}`;
}

/**
 * Reserviert die Einzelstücke des Warenkorbs. `ok: false` heißt: mindestens
 * eines ist inzwischen ausverkauft, es wurde nichts reserviert.
 */
export async function reserviere(eingabe: {
  schluessel: string;
  items: ReservierPosition[];
  minuten?: number;
  lager?: Lager;
}): Promise<ReservierErgebnis> {
  if (reservierungAbgeschaltet()) {
    return { ok: true, reserviert: 0, uebersprungen: "abgeschaltet" };
  }
  const lager = eingabe.lager ?? wooLager;
  const positionen = eingabe.items
    .map((i) => ({
      id: Number(i.id),
      variation_id:
        Number(i.variation_id) > 0 ? Number(i.variation_id) : undefined,
      qty: Math.max(1, Number(i.qty) || 1),
      name: i.name,
    }))
    .filter((i) => Number.isFinite(i.id) && i.id > 0);
  if (positionen.length === 0) {
    return { ok: true, reserviert: 0, uebersprungen: "leer" };
  }
  try {
    return await lager.nehmen(
      eingabe.schluessel,
      positionen,
      eingabe.minuten ?? RESERVIERUNG_MINUTEN
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // WordPress hat nicht reserviert. Ist überhaupt ein Einzelstück dabei?
    let einzelstueck: boolean | null = null;
    try {
      einzelstueck = await lager.hatEinzelstueck(positionen);
    } catch {
      einzelstueck = null;
    }
    if (einzelstueck === true) {
      throw new ReservierungNichtMoeglichFehler(detail);
    }
    console.error(
      `[reservierung] Reservieren fehlgeschlagen (${detail}); ` +
        (einzelstueck === false
          ? "kein Einzelstück im Warenkorb, Kasse läuft weiter"
          : "Schlagwörter nicht lesbar, Kasse läuft wie bisher weiter")
    );
    return { ok: true, reserviert: 0, uebersprungen: "nicht_erreichbar" };
  }
}

/** Gibt eine offene Reservierung zurück. Wirft nie. */
export async function gibReservierungFrei(
  schluessel: string | null,
  lager: Lager = wooLager
): Promise<void> {
  if (!schluessel || reservierungAbgeschaltet()) return;
  try {
    await lager.freigeben(schluessel);
  } catch (err) {
    // Nicht schlimm: Die Reservierung läuft von selbst ab.
    console.warn(
      "[reservierung] Freigabe fehlgeschlagen:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Meldung für die Kasse, in beiden Sprachen. */
export function ausverkauftMeldung(a: Ausverkauft): { de: string; en: string } {
  const name = a.name || `Artikel ${a.id}`;
  return {
    de: `„${name}“ ist inzwischen ausverkauft.`,
    en: `"${name}" has sold out in the meantime.`,
  };
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

async function snippet(pfad: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${wooBasis()}/wp-json/wc-uncuttv/v1${pfad}`, {
    method: "POST",
    headers: { Authorization: wooAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (!res.ok) {
    throw new Error(`WordPress antwortet mit ${res.status} auf ${pfad}`);
  }
  return res.json();
}

/** Antwort von /reservierung/nehmen in die eigene Form bringen. Testbar. */
export function leseReservierAntwort(
  roh: unknown,
  positionen: ReservierPosition[]
): ReservierErgebnis {
  const a = (roh ?? {}) as Record<string, unknown>;
  if (a.ok === true) {
    return { ok: true, reserviert: Number(a.reserviert) || 0 };
  }
  if (a.ok === false && Array.isArray(a.ausverkauft)) {
    return {
      ok: false,
      ausverkauft: (a.ausverkauft as Array<Record<string, unknown>>).map((x) => {
        const id = Number(x.product_id);
        const variationId = Number(x.variation_id) || 0;
        const ausKorb = positionen.find(
          (p) => p.id === id && (p.variation_id ?? 0) === variationId
        );
        return {
          id,
          ...(variationId > 0 ? { variation_id: variationId } : {}),
          name: String(ausKorb?.name || x.name || ""),
        };
      }),
    };
  }
  throw new Error("unbekannte Antwort der Reservierung");
}

export const wooLager: Lager = {
  async nehmen(schluessel, positionen, minuten) {
    return leseReservierAntwort(
      await snippet("/reservierung/nehmen", {
        schluessel,
        minuten,
        positionen: positionen.map((p) => ({
          product_id: p.id,
          variation_id: p.variation_id ?? 0,
          qty: p.qty,
        })),
      }),
      positionen
    );
  },
  async freigeben(schluessel) {
    await snippet("/reservierung/freigeben", { schluessel });
  },
  async hatEinzelstueck(positionen) {
    const ids = [...new Set(positionen.map((p) => p.id))];
    const url = new URL(`${wooBasis()}/wp-json/wc/v3/products`);
    url.searchParams.set("include", ids.join(","));
    url.searchParams.set("per_page", String(Math.min(100, ids.length)));
    url.searchParams.set("status", "any");
    url.searchParams.set("_fields", "id,tags");
    const res = await fetch(url, {
      headers: { Authorization: wooAuth() },
      cache: "no-store",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
    if (!res.ok) return null;
    const produkte = (await res.json()) as Array<{
      tags?: Array<{ slug?: string }>;
    }>;
    return produkte.some((p) =>
      (p.tags ?? []).some((t) => t.slug === EINZELSTUECK_SCHLAGWORT)
    );
  },
};

/** Abgelaufene Reservierungen in WordPress zurückbuchen (Cron). */
export async function raeumeReservierungenAuf(): Promise<unknown> {
  return snippet("/reservierung/aufraeumen", {});
}
