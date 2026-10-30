/**
 * Variable Produkte (Merch mit Größen) und der Verkaufszeitraum.
 *
 * Reine Funktionen, laufen im Browser wie auf dem Server. Was hier steht,
 * gilt überall gleich: Katalogkarte, Produktseite, Warenkorb und die
 * Prüfung vor der Zahlung (bestellpruefung.ts) fragen dieselben Regeln.
 *
 * ── Wie Merch in WooCommerce liegt (angelegt vom Steuerpult) ─────────────
 *   - EIN variables Produkt (type "variable") mit dem globalen Attribut
 *     "Größe" (pa_groesse), variation: true; die Optionen stehen in der
 *     Reihenfolge der Begriffe (XS … 5XL).
 *   - Je Größe eine Variante mit eigenem Preis, eigenem Lager (oder ohne
 *     Lagerverwaltung: dann gilt sie als bestellbar, solange stock_status
 *     nicht "outofstock" ist -- der Normalfall im Vorverkauf).
 *   - Verkaufszeitraum als Meta uncuttv_verkauf_von / uncuttv_verkauf_bis
 *     am Elternprodukt, UTC nach ISO 8601 mit "Z". WordPress wertet ihn in
 *     woocommerce_is_purchasable aus (REST-Feld `purchasable`); hier wird
 *     dieselbe Regel noch einmal gerechnet, weil die Bestellung über REST
 *     daran vorbeigeht.
 */

import type { ProductVariant, ShopListProduct, WooCategory } from "@/lib/types";

export const GROESSE_ATTRIBUT_SLUG = "pa_groesse";
export const MERCH_SLUG = "merch";

/** Produkt in der Kategorie Merch? Nur für Endkunden, nie im Händlerportal. */
export function hatMerchKategorie(
  categories: Array<Pick<WooCategory, "slug">> | undefined | null
): boolean {
  return (categories ?? []).some(
    (c) => String(c.slug ?? "").toLowerCase() === MERCH_SLUG
  );
}

export function istVariabel(
  product: { type?: string | null } | null | undefined
): boolean {
  return product?.type === "variable";
}

/**
 * Schlüssel einer Warenkorbposition: Produkt plus Variante. Zwei Größen
 * desselben Shirts sind zwei Positionen.
 */
export function lineKey(productId: number, variationId?: number | null): string {
  return variationId && variationId > 0
    ? `${productId}:${variationId}`
    : `${productId}`;
}

/**
 * Slug einer Größe, wie WordPress ihn für den Begriff bildet
 * (sanitize_title): "3XL" -> "3xl", "XXL" -> "xxl". Als Wert des
 * Positions-Metas pa_groesse, damit WooCommerce "Größe: 3XL" anzeigt.
 */
export function groessenSlug(option: string): string {
  return option
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Rohe Variante, wie sie GET /products/{id}/variations liefert (Ausschnitt). */
export type VarianteRoh = {
  id?: unknown;
  status?: unknown;
  price?: unknown;
  regular_price?: unknown;
  sale_price?: unknown;
  on_sale?: unknown;
  purchasable?: unknown;
  stock_status?: unknown;
  stock_quantity?: unknown;
  manage_stock?: unknown;
  attributes?: Array<{
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    option?: unknown;
  }>;
  meta_data?: Array<{ key?: unknown; value?: unknown }>;
};

/** Die Felder, die der Shop von einer Variante holt (`_fields`). */
export const VARIANTEN_FELDER = [
  "id",
  "status",
  "price",
  "regular_price",
  "sale_price",
  "on_sale",
  "purchasable",
  "stock_status",
  "stock_quantity",
  "manage_stock",
  "attributes",
].join(",");

function text(wert: unknown): string {
  if (typeof wert === "string") return wert.trim();
  if (typeof wert === "number" && Number.isFinite(wert)) return String(wert);
  return "";
}

/** Die Option des Attributs Größe an einer Variante ("M"), leer ohne Größe. */
export function groesseAusVariante(v: VarianteRoh): string {
  const attr = (v.attributes ?? []).find(
    (a) =>
      text(a.slug) === GROESSE_ATTRIBUT_SLUG ||
      text(a.name).toLowerCase() === "größe" ||
      text(a.name).toLowerCase() === "groesse"
  );
  return text(attr?.option);
}

/** Rohe Variante -> ProductVariant für Katalog und Produktseite. */
export function zuProductVariant(v: VarianteRoh): ProductVariant | null {
  const id = Number(v.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const stockStatus = text(v.stock_status);
  const size = groesseAusVariante(v);
  const quantity =
    typeof v.stock_quantity === "number" && Number.isFinite(v.stock_quantity)
      ? v.stock_quantity
      : null;
  return {
    id,
    size,
    size_slug: groessenSlug(size),
    price: text(v.price),
    regular_price: text(v.regular_price),
    sale_price: text(v.sale_price),
    on_sale: v.on_sale === true,
    stock_status:
      stockStatus === "outofstock" || stockStatus === "onbackorder"
        ? stockStatus
        : "instock",
    stock_quantity: quantity,
    manage_stock: v.manage_stock === true,
    // Fehlt das Feld (ältere WooCommerce-Fassung), gilt die Variante als
    // kaufbar; der Verkaufszeitraum wird ohnehin getrennt geprüft.
    purchasable: v.purchasable !== false,
    status: text(v.status) || "publish",
  };
}

/**
 * Bestellbar: veröffentlicht, kaufbar, nicht "nicht vorrätig", und bei
 * Lagerverwaltung mindestens die gewünschte Menge. Ohne Lagerverwaltung
 * zählt allein stock_status -- so legt das Steuerpult Merch im Vorverkauf an.
 */
export function istVarianteBestellbar(v: ProductVariant, menge = 1): boolean {
  if (v.status && v.status !== "publish") return false;
  if (!v.purchasable) return false;
  if (v.stock_status === "outofstock") return false;
  if (v.manage_stock && typeof v.stock_quantity === "number") {
    return v.stock_quantity >= Math.max(1, menge);
  }
  return true;
}

/**
 * Varianten in der Reihenfolge der Attribut-Optionen am Elternprodukt
 * (die WooCommerce nach menu_order der Begriffe liefert). Unbekannte Größen
 * hinten, in sich nach Name.
 */
export function sortiereVarianten(
  variants: ProductVariant[],
  optionen: string[] | undefined | null
): ProductVariant[] {
  const rang = new Map(
    (optionen ?? []).map((o, i) => [groessenSlug(o), i] as const)
  );
  return [...variants].sort((a, b) => {
    const ra = rang.get(a.size_slug) ?? 9999;
    const rb = rang.get(b.size_slug) ?? 9999;
    return ra - rb || a.size.localeCompare(b.size, "de");
  });
}

// ── Verkaufszeitraum ───────────────────────────────────────────────────────

/** ISO-Zeit (UTC mit Z, oder ohne Zone = UTC) -> Millisekunden, null wenn unlesbar. */
export function zeitpunktMs(wert: string | null | undefined): number | null {
  const t = (wert ?? "").trim();
  if (!t) return null;
  // "2026-11-06 17:00:00" (MySQL-Schreibweise) ebenfalls als UTC lesen.
  const normalisiert = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t)
    ? t.replace(" ", "T") + "Z"
    : t;
  const ms = Date.parse(normalisiert);
  return Number.isNaN(ms) ? null : ms;
}

export type VerkaufsStand = "keiner" | "kommt" | "laeuft" | "vorbei";

/** Dieselbe Regel wie das WordPress-Snippet verkaufszeitraum.php. */
export function verkaufsStand(
  von: string | null | undefined,
  bis: string | null | undefined,
  jetztMs = Date.now()
): VerkaufsStand {
  const vonMs = zeitpunktMs(von);
  const bisMs = zeitpunktMs(bis);
  if (vonMs === null && bisMs === null) return "keiner";
  if (vonMs !== null && vonMs > jetztMs) return "kommt";
  if (bisMs !== null && bisMs <= jetztMs) return "vorbei";
  return "laeuft";
}

/** "31.10." in Wiener Zeit, für "Ab 31.10." auf Karte und Produktseite. */
export function datumKurzWien(iso: string | null | undefined): string {
  const ms = zeitpunktMs(iso);
  if (ms === null) return "";
  try {
    const teile = new Intl.DateTimeFormat("de-AT", {
      timeZone: "Europe/Vienna",
      day: "2-digit",
      month: "2-digit",
    }).formatToParts(new Date(ms));
    const tag = teile.find((p) => p.type === "day")?.value ?? "";
    const monat = teile.find((p) => p.type === "month")?.value ?? "";
    return tag && monat ? `${tag}.${monat}.` : "";
  } catch {
    const d = new Date(ms);
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(
      d.getUTCMonth() + 1
    ).padStart(2, "0")}.`;
  }
}

// ── Kaufstatus eines Produkts (Karte, Produktseite) ───────────────────────

export type Kaufstatus =
  | { bestellbar: true; grund: "ok" }
  | { bestellbar: false; grund: "kommt"; ab: string }
  | { bestellbar: false; grund: "vorbei" }
  | { bestellbar: false; grund: "ausverkauft" }
  | { bestellbar: false; grund: "nicht_kaufbar" };

type ProduktFuerStatus = Pick<ShopListProduct, "stock_status"> & {
  type?: string | null;
  purchasable?: boolean;
  variants?: ProductVariant[] | null;
  verkauf_von?: string | null;
  verkauf_bis?: string | null;
};

/**
 * Was die Karte und der Kaufknopf sagen sollen. Reihenfolge: Verkaufs-
 * zeitraum vor Lager -- ein Artikel, der erst morgen in den Verkauf geht,
 * ist nicht "ausverkauft".
 */
export function produktKaufstatus(
  p: ProduktFuerStatus,
  jetztMs = Date.now()
): Kaufstatus {
  const stand = verkaufsStand(p.verkauf_von, p.verkauf_bis, jetztMs);
  if (stand === "kommt") {
    return {
      bestellbar: false,
      grund: "kommt",
      ab: datumKurzWien(p.verkauf_von),
    };
  }
  if (stand === "vorbei") return { bestellbar: false, grund: "vorbei" };

  if (istVariabel(p)) {
    const varianten = p.variants ?? [];
    if (varianten.length === 0) {
      return { bestellbar: false, grund: "nicht_kaufbar" };
    }
    if (!varianten.some((v) => istVarianteBestellbar(v))) {
      return { bestellbar: false, grund: "ausverkauft" };
    }
    return { bestellbar: true, grund: "ok" };
  }

  if (p.stock_status === "outofstock") {
    return { bestellbar: false, grund: "ausverkauft" };
  }
  // `purchasable` false ohne lesbaren Zeitraum: WordPress sagt nein (Snippet
  // oder Produkt ohne Preis). Fehlt das Feld (Listenfelder ohne purchasable),
  // gilt das Produkt als kaufbar.
  if (p.purchasable === false) {
    return { bestellbar: false, grund: "nicht_kaufbar" };
  }
  return { bestellbar: true, grund: "ok" };
}

export type PreisAnzeige = {
  /** "ab" davor, wenn die Varianten unterschiedlich kosten. */
  ab: boolean;
  /** Der zu zeigende Preis (bei "ab" der günstigste). */
  price: string;
  /** Durchgestrichener Vergleichspreis, wenn eine Aktion läuft. */
  regular_price: string | null;
};

function preisZahl(wert: string | null | undefined): number {
  const n = parseFloat(String(wert ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Preis für Karte und Produktseite (ohne gewählte Größe). Bei variablen
 * Produkten zählen nur bestellbare Varianten; sind alle ausverkauft, alle.
 * Der durchgestrichene Vergleichspreis erscheint nur, wenn der gezeigte
 * (günstigste) Preis selbst aus einer Aktion stammt.
 */
export function preisAnzeige(p: {
  type?: string | null;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale?: boolean;
  variants?: ProductVariant[] | null;
}): PreisAnzeige {
  if (istVariabel(p) && (p.variants?.length ?? 0) > 0) {
    const alle = p.variants ?? [];
    const bestellbar = alle.filter((v) => istVarianteBestellbar(v));
    const basis = bestellbar.length > 0 ? bestellbar : alle;
    const preise = basis.map((v) => preisZahl(v.price)).filter((n) => n > 0);
    if (preise.length === 0) {
      return { ab: false, price: p.price || "0", regular_price: null };
    }
    const min = Math.min(...preise);
    const max = Math.max(...preise);
    const guenstigste = basis.find((v) => preisZahl(v.price) === min)!;
    const aktion =
      guenstigste.on_sale &&
      preisZahl(guenstigste.sale_price) > 0 &&
      preisZahl(guenstigste.regular_price) > preisZahl(guenstigste.sale_price);
    return {
      ab: max > min,
      price: guenstigste.price,
      regular_price: aktion ? guenstigste.regular_price : null,
    };
  }
  const aktion =
    (p.on_sale ?? Boolean(p.sale_price)) &&
    preisZahl(p.sale_price) > 0 &&
    preisZahl(p.regular_price) > preisZahl(p.sale_price);
  return {
    ab: false,
    price: aktion ? p.sale_price : p.price,
    regular_price: aktion ? p.regular_price : null,
  };
}

/** Meta uncuttv_verkauf_von / _bis aus meta_data lesen. */
export function verkaufszeitraumAus(
  meta: Array<{ key?: unknown; value?: unknown }> | undefined | null
): { verkauf_von: string | null; verkauf_bis: string | null } {
  const lies = (key: string): string | null => {
    const zeile = (meta ?? []).find((m) => m.key === key);
    const wert = typeof zeile?.value === "string" ? zeile.value.trim() : "";
    return wert ? wert : null;
  };
  return {
    verkauf_von: lies("uncuttv_verkauf_von"),
    verkauf_bis: lies("uncuttv_verkauf_bis"),
  };
}
