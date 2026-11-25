/**
 * Kasse: Was passiert mit Zeilen, die der Server als nicht mehr bestellbar
 * meldet?
 *
 * Anlass: Ein Einzelstück lag bei Kunde B im Warenkorb, Kunde A kaufte es.
 * Bei B blieb die Zeile stehen, die Versandabfrage scheiterte daran (die
 * Store-API nimmt keinen ausverkauften Artikel an), und die Kasse hing ohne
 * Erklärung. Jetzt fliegt die Zeile raus und der Kunde liest, warum.
 *
 * Die Probleme kommen in derselben Form von allen Stellen, die den Bestand
 * prüfen: /api/checkout/pruefung (Laden der Kasse, PayPal-Knopf),
 * create-/update-payment-intent (409 cart_invalid), /api/checkout/reservieren
 * (409 ausverkauft) und create-bank-order (409 cart_invalid).
 *
 * Reine Auswertung, kein React und kein Netz: so lässt sie sich testen.
 */

import { formatTranslation } from "@/lib/translations";

export type KassenProblem = {
  id: number;
  variation_id?: number;
  name?: string;
  code?: string;
  /** Noch so viele da, nur weniger als gewünscht: Zeile bleibt. */
  verfuegbar?: number;
  message?: { de?: string; en?: string };
};

export type KorbZeile = { id: number; variation_id?: number; name: string };

export type Kassenbereinigung = {
  /** Ausverkaufte Zeilen: raus aus dem Warenkorb. */
  entfernen: Array<{ id: number; variation_id?: number }>;
  /** Namen der ausverkauften Artikel, für die Meldung. Ohne Doppelte. */
  nichtVerfuegbar: string[];
  /** Zeilen, die nie bestellbar werden (Größe fehlt, Produkt weg). */
  nieBestellbar: KassenProblem[];
  /** Alle Probleme, deren Zeile im Warenkorb bleibt. */
  bleibt: KassenProblem[];
  /** Ist der Warenkorb leer, wenn `entfernen` draußen ist? */
  korbDanachLeer: boolean;
};

const NIE_BESTELLBAR = new Set([
  "groesse_fehlt",
  "variante_unbekannt",
  "nicht_gefunden",
  "nicht_veroeffentlicht",
]);

function zeilenSchluessel(id: unknown, variationId: unknown): string {
  const v = Number(variationId);
  return `${Number(id)}:${Number.isFinite(v) && v > 0 ? v : 0}`;
}

/** Ausverkauft und nichts mehr da (nicht: "nur noch 2 Stück"). */
export function istNichtMehrVerfuegbar(p: KassenProblem): boolean {
  return p.code === "ausverkauft" && !(Number(p.verfuegbar) > 0);
}

/**
 * @param ausverkaufteEntfernen false, solange dieser Tab selbst eine
 *   Reservierung hält oder gerade zurückgibt: Dann steht der eigene Artikel
 *   beim Server als ausverkauft da und darf nicht aus dem Warenkorb fliegen.
 */
export function bereinigeKasse(
  problems: KassenProblem[] | null | undefined,
  korb: KorbZeile[],
  optionen: { ausverkaufteEntfernen?: boolean } = {}
): Kassenbereinigung {
  const darfEntfernen = optionen.ausverkaufteEntfernen !== false;
  const liste = (Array.isArray(problems) ? problems : []).filter(
    (p) => p && Number(p.id) > 0
  );
  const nachSchluessel = new Map(
    korb.map((z) => [zeilenSchluessel(z.id, z.variation_id), z] as const)
  );

  const entfernen: Kassenbereinigung["entfernen"] = [];
  const nichtVerfuegbar: string[] = [];
  const nieBestellbar: KassenProblem[] = [];
  const bleibt: KassenProblem[] = [];
  const raus = new Set<string>();

  for (const p of liste) {
    const schluessel = zeilenSchluessel(p.id, p.variation_id);
    if (darfEntfernen && istNichtMehrVerfuegbar(p)) {
      if (!raus.has(schluessel)) {
        raus.add(schluessel);
        entfernen.push({
          id: Number(p.id),
          ...(Number(p.variation_id) > 0
            ? { variation_id: Number(p.variation_id) }
            : {}),
        });
      }
      const name =
        nachSchluessel.get(schluessel)?.name?.trim() ||
        (p.name ?? "").trim() ||
        `Artikel ${Number(p.id)}`;
      if (!nichtVerfuegbar.includes(name)) nichtVerfuegbar.push(name);
      continue;
    }
    if (NIE_BESTELLBAR.has(p.code ?? "")) nieBestellbar.push(p);
    bleibt.push(p);
  }

  const korbDanachLeer =
    korb.filter((z) => !raus.has(zeilenSchluessel(z.id, z.variation_id)))
      .length === 0;

  return { entfernen, nichtVerfuegbar, nieBestellbar, bleibt, korbDanachLeer };
}

/** "Dieser Artikel ist leider nicht mehr verfügbar: „Name“" (DE und EN). */
export function nichtVerfuegbarMeldung(
  namen: string[],
  sprache: "de" | "en"
): string {
  const eindeutig = [...new Set(namen.map((n) => n.trim()).filter(Boolean))];
  if (eindeutig.length === 0) return "";
  const name = eindeutig
    .map((n) => (sprache === "en" ? `"${n}"` : `„${n}“`))
    .join(", ");
  return formatTranslation(
    eindeutig.length === 1
      ? "CHECKOUT_ITEM_UNAVAILABLE"
      : "CHECKOUT_ITEMS_UNAVAILABLE",
    sprache,
    { name }
  );
}

/** Die Servermeldungen der übrigen Probleme, in der Sprache der Kasse. */
export function problemMeldungen(
  problems: KassenProblem[],
  sprache: "de" | "en"
): string {
  return problems
    .map((p) => (sprache === "en" ? p.message?.en : p.message?.de))
    .filter(Boolean)
    .join(" ");
}

/** Namensliste ohne Doppelte fortschreiben (für den Hinweis in der Kasse). */
export function ergaenzeNamen(bisher: string[], neu: string[]): string[] {
  const hinzu = neu.filter((n) => !bisher.includes(n));
  return hinzu.length === 0 ? bisher : [...bisher, ...hinzu];
}
