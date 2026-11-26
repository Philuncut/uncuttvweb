/**
 * Sale-Overlay im Hero-Video des Shops.
 *
 * Gepflegt wird es im Steuerpult je Preisaktion (dort sql/107): Schalter,
 * Überschrift, Zusatzzeile mit "{max}", Knopf mit Ziel. Die Datenbank gibt
 * über public.shop_hero_overlay() höchstens EIN Overlay heraus, und zwar
 * nur, wenn der Schalter an ist und die Aktion live im Zeitfenster liegt.
 *
 * Diese Datei rechnet nur (ohne Netz, testbar): aus der Zeile der Datenbank
 * wird, was die Seite zeigt. Geladen wird in hero-overlay-laden.ts.
 */

export type HeroOverlay = {
  titel: string;
  /** Fertig, "{max}" schon ersetzt. Leer, wenn es keine Zusatzzeile gibt. */
  zeile: string;
  knopf: string;
  /** Pfad im Shop ("/shop?aktion=1") oder eine https-Adresse. */
  ziel: string;
  /** Beginn und Ende der Aktion, Millisekunden. */
  vonMs: number;
  bisMs: number;
};

/** Der Filter der Shop-Seite auf alles mit Angebotspreis: /shop?aktion=1 */
export const AKTION_PARAMETER = "aktion";

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

/** Nur eigene Seiten ("/…", nicht "//…") oder https. Alles andere wird nicht verlinkt. */
export function sicheresZiel(roh: unknown): string {
  const ziel = text(roh);
  if (ziel.startsWith("/") && !ziel.startsWith("//") && !ziel.includes("\\")) {
    return ziel;
  }
  if (/^https:\/\/[^\s]+$/i.test(ziel)) return ziel;
  return "";
}

/**
 * Die Zusatzzeile: "{max}" wird durch den größten Rabatt ersetzt. Verlangt
 * die Vorlage "{max}" und es steht keiner fest, bleibt die Zeile weg —
 * "bis zu  % Rabatt" soll nie im Shop stehen.
 */
export function zeileMitMax(vorlage: unknown, max: unknown): string {
  const t = text(vorlage);
  if (!/\{max\}/i.test(t)) return t;
  const n = typeof max === "number" ? Math.floor(max) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return "";
  return t.replace(/\{max\}/gi, String(n));
}

/**
 * Zeile aus public.shop_hero_overlay() -> Overlay. null, wenn es keines
 * gibt oder die Zeile nicht taugt (ohne Überschrift, ohne Knopf, ohne
 * brauchbares Ziel, ohne lesbares Ende).
 */
export function baueHeroOverlay(zeile: unknown): HeroOverlay | null {
  const z = (Array.isArray(zeile) ? zeile[0] : zeile) as Record<string, unknown> | null | undefined;
  if (!z || typeof z !== "object") return null;
  const titel = text(z.titel);
  const knopf = text(z.knopf);
  const ziel = sicheresZiel(z.ziel);
  const vonMs = Date.parse(text(z.von));
  const bisMs = Date.parse(text(z.bis));
  if (!titel || !knopf || !ziel) return null;
  if (!Number.isFinite(vonMs) || !Number.isFinite(bisMs)) return null;
  return {
    titel,
    zeile: zeileMitMax(z.zeile, z.max_prozent),
    knopf,
    ziel,
    vonMs,
    bisMs,
  };
}

/**
 * Gilt das Overlay in diesem Augenblick? Die Seite hält ihren Stand bis zu
 * einer Minute; das Ende der Aktion soll trotzdem zur Sekunde greifen.
 */
export function overlayGilt(o: HeroOverlay | null, jetztMs: number): o is HeroOverlay {
  return o !== null && jetztMs >= o.vonMs && jetztMs < o.bisMs;
}

function betrag(wert: unknown): number {
  const n = typeof wert === "string" && wert.trim() !== "" ? Number(wert) : Number.NaN;
  return Number.isFinite(n) ? n : Number.NaN;
}

type MitPreis = { regular_price?: string; sale_price?: string };

function hatAngebotspreis(p: MitPreis): boolean {
  const normal = betrag(p.regular_price);
  const angebot = betrag(p.sale_price);
  return angebot > 0 && normal > 0 && angebot < normal;
}

/**
 * Steht das Produkt gerade im Angebot? Ein Angebotspreis unter dem
 * Normalpreis, am Produkt selbst oder an einer seiner Größen. WooCommerce
 * liefert den Angebotspreis nur innerhalb des Aktionszeitraums (Snippet
 * preisaktion.php); deshalb reicht der Blick auf die Preise.
 */
export function istImAngebot(p: MitPreis & { variants?: MitPreis[] }): boolean {
  return hatAngebotspreis(p) || (p.variants ?? []).some(hatAngebotspreis);
}
