/**
 * Prüfung der Warenkorbpositionen VOR der Zahlung -- für alle Produkte,
 * nicht nur Merch.
 *
 * Der Browser schickt Preise und Varianten aus seinem Warenkorb, der Tage
 * alt sein kann. Hier wird jede Position frisch bei WooCommerce
 * nachgeschlagen (kein unstable_cache, kein Fetch-Cache):
 *
 *   - Produkt vorhanden, veröffentlicht, kaufbar (`purchasable`, darin der
 *     Verkaufszeitraum-Filter aus WordPress), Verkaufszeitraum zusätzlich
 *     selbst gerechnet (dieselbe Regel wie verkaufszeitraum.php).
 *   - Variables Produkt: Variante angegeben, gehört zum Produkt, ist
 *     veröffentlicht, kaufbar und bestellbar (ohne Lagerverwaltung reicht
 *     stock_status; mit Lagerverwaltung mindestens die Menge).
 *   - Einfaches Produkt: nicht ausverkauft, Bestand reicht.
 *   - Merch nur für Endkunden: Händlerkonto oder Händler-Steuerweg wird
 *     abgewiesen.
 *   - Preis: Endkunden `price` (schließt eine laufende Preisaktion ein),
 *     Händler `haendler_preis` (Variante vor Produkt). Weicht der Preis vom
 *     Warenkorb ab, wird er ersetzt und als Korrektur gemeldet; die Kasse
 *     übernimmt ihn in den Warenkorb.
 *
 * Ergebnis: die geprüften Positionen (mit frischen Preisen und, wo sie
 * fehlte, der Größe) plus Probleme und Preiskorrekturen. ok = keine Probleme.
 */

import { getSession } from "@/lib/auth-session";
import { extractHaendlerPreisFromMeta } from "@/lib/haendler-filter";
import { parsePrice } from "@/lib/parse-price";
import type { CartMeta } from "@/lib/wc-order-from-payment";
import {
  datumKurzWien,
  hatMerchKategorie,
  istVariabel,
  istVarianteBestellbar,
  verkaufsStand,
  verkaufszeitraumAus,
  zuProductVariant,
  type VarianteRoh,
} from "@/lib/varianten";
import { wooFetch } from "@/lib/woocommerce";

export type PruefCode =
  | "nicht_gefunden"
  | "nicht_veroeffentlicht"
  | "nicht_kaufbar"
  | "ausverkauft"
  | "zeitraum_kommt"
  | "zeitraum_vorbei"
  | "groesse_fehlt"
  | "variante_unbekannt"
  | "merch_nur_endkunden";

export type Pruefproblem = {
  id: number;
  variation_id?: number;
  name: string;
  code: PruefCode;
  message: { de: string; en: string };
};

export type Preiskorrektur = {
  id: number;
  variation_id?: number;
  name: string;
  alt: string;
  neu: string;
};

export type Pruefergebnis = {
  ok: boolean;
  /** Die Positionen mit frischen Preisen (und Größe, wo sie fehlte). */
  items: CartMeta[];
  problems: Pruefproblem[];
  repriced: Preiskorrektur[];
};

export type Pruefkontext = {
  /** Händlerkasse (Händlerpreise, Netto) oder Reverse Charge. */
  isWholesale: boolean;
  isReverseCharge: boolean;
  /**
   * Der Aufrufer ist mit einem Händlerkonto angemeldet (geprüfte Sitzung),
   * unabhängig vom Steuerweg der Kasse. Sperrt Merch, ändert die Preisquelle
   * aber nicht -- die richtet sich nach isWholesale.
   */
  haendlerKonto?: boolean;
};

/** Hartes Problem: die Bestellung darf auch nach erfolgter Zahlung nicht so angelegt werden. */
export const HARTE_PROBLEME: ReadonlySet<PruefCode> = new Set<PruefCode>([
  "nicht_gefunden",
  "groesse_fehlt",
  "variante_unbekannt",
  "merch_nur_endkunden",
]);

type ProduktRoh = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  status?: unknown;
  price?: unknown;
  purchasable?: unknown;
  stock_status?: unknown;
  stock_quantity?: unknown;
  manage_stock?: unknown;
  categories?: Array<{ id?: unknown; slug?: unknown; name?: unknown }>;
  meta_data?: Array<{ key?: unknown; value?: unknown }>;
};

const PRODUKT_FELDER = [
  "id",
  "name",
  "type",
  "status",
  "price",
  "purchasable",
  "stock_status",
  "stock_quantity",
  "manage_stock",
  "categories",
  "meta_data",
].join(",");

const VARIANTEN_FELDER_PRUEFUNG = [
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
  "meta_data",
].join(",");

function text(wert: unknown): string {
  if (typeof wert === "string") return wert.trim();
  if (typeof wert === "number" && Number.isFinite(wert)) return String(wert);
  return "";
}

/** Preis als WooCommerce-Zeichenkette mit Punkt und zwei Stellen ("29.90"). */
function preisText(wert: string): string {
  return parsePrice(wert).toFixed(2);
}

function preiseGleich(a: string, b: string): boolean {
  return Math.abs(parsePrice(a) - parsePrice(b)) < 0.005;
}

/** Ist der Aufrufer ein Händlerkonto? Ohne Sitzung oder bei Störung: nein. */
export async function istHaendlerSitzung(): Promise<boolean> {
  try {
    const session = await getSession();
    return session?.isWholesale === true;
  } catch {
    return false;
  }
}

async function ladeProdukte(ids: number[]): Promise<Map<number, ProduktRoh>> {
  const ergebnis = new Map<number, ProduktRoh>();
  if (ids.length === 0) return ergebnis;
  // WooCommerce erlaubt höchstens 100 je Seite; der Warenkorb ist kleiner.
  for (let i = 0; i < ids.length; i += 100) {
    const teil = ids.slice(i, i + 100);
    const roh = await wooFetch<ProduktRoh[]>(
      "/products",
      {
        include: teil.join(","),
        per_page: String(teil.length),
        status: "any",
        _fields: PRODUKT_FELDER,
      },
      { cache: "no-store" }
    );
    for (const p of roh ?? []) {
      const id = Number(p.id);
      if (Number.isFinite(id) && id > 0) ergebnis.set(id, p);
    }
  }
  return ergebnis;
}

async function ladeVariante(
  produktId: number,
  variationId: number
): Promise<VarianteRoh | null> {
  try {
    return await wooFetch<VarianteRoh>(
      `/products/${produktId}/variations/${variationId}`,
      { _fields: VARIANTEN_FELDER_PRUEFUNG },
      { cache: "no-store" }
    );
  } catch {
    return null;
  }
}

function problem(
  item: CartMeta,
  code: PruefCode,
  de: string,
  en: string
): Pruefproblem {
  return {
    id: item.id,
    ...(item.variation_id ? { variation_id: item.variation_id } : {}),
    name: item.name,
    code,
    message: { de, en },
  };
}

export async function pruefeBestellpositionen(
  items: CartMeta[],
  ctx: Pruefkontext
): Promise<Pruefergebnis> {
  const problems: Pruefproblem[] = [];
  const repriced: Preiskorrektur[] = [];
  const geprueft: CartMeta[] = [];
  /** Händlerpreise gelten in der Händlerkasse und bei Reverse Charge. */
  const haendler = ctx.isWholesale || ctx.isReverseCharge;
  /** Merch ist gesperrt, sobald Händlerkasse, Reverse Charge oder Händlerkonto. */
  const merchGesperrt = haendler || ctx.haendlerKonto === true;

  const ids = [...new Set(items.map((i) => Number(i.id)).filter((n) => n > 0))];
  const produkte = await ladeProdukte(ids);
  const jetzt = Date.now();

  for (const item of items) {
    const kopie: CartMeta = { ...item };
    const p = produkte.get(Number(item.id));
    const anzeigeName = item.name || `Artikel ${item.id}`;

    if (!p) {
      problems.push(
        problem(
          item,
          "nicht_gefunden",
          `„${anzeigeName}“ gibt es nicht mehr im Shop.`,
          `"${anzeigeName}" is no longer in the shop.`
        )
      );
      geprueft.push(kopie);
      continue;
    }

    if (text(p.status) !== "publish") {
      problems.push(
        problem(
          item,
          "nicht_veroeffentlicht",
          `„${anzeigeName}“ ist nicht mehr erhältlich.`,
          `"${anzeigeName}" is no longer available.`
        )
      );
      geprueft.push(kopie);
      continue;
    }

    const kategorien = (p.categories ?? []).map((c) => ({
      slug: text(c.slug),
    }));
    if (merchGesperrt && hatMerchKategorie(kategorien)) {
      problems.push(
        problem(
          item,
          "merch_nur_endkunden",
          `„${anzeigeName}“ gibt es nur für Endkunden, nicht über das Händlerkonto.`,
          `"${anzeigeName}" is available to retail customers only, not via dealer accounts.`
        )
      );
      geprueft.push(kopie);
      continue;
    }

    // Verkaufszeitraum: dieselbe Regel wie das WordPress-Snippet, hier noch
    // einmal, weil die REST-Bestellung an is_purchasable vorbeigeht.
    const zeitraum = verkaufszeitraumAus(p.meta_data);
    const stand = verkaufsStand(zeitraum.verkauf_von, zeitraum.verkauf_bis, jetzt);
    if (stand === "kommt") {
      const ab = datumKurzWien(zeitraum.verkauf_von);
      problems.push(
        problem(
          item,
          "zeitraum_kommt",
          `„${anzeigeName}“ ist erst ab ${ab} erhältlich.`,
          `"${anzeigeName}" is available from ${ab} on.`
        )
      );
      geprueft.push(kopie);
      continue;
    }
    if (stand === "vorbei") {
      problems.push(
        problem(
          item,
          "zeitraum_vorbei",
          `Der Verkauf von „${anzeigeName}“ ist beendet.`,
          `"${anzeigeName}" is no longer on sale.`
        )
      );
      geprueft.push(kopie);
      continue;
    }

    if (p.purchasable === false) {
      problems.push(
        problem(
          item,
          "nicht_kaufbar",
          `„${anzeigeName}“ ist derzeit nicht erhältlich.`,
          `"${anzeigeName}" is currently not available.`
        )
      );
      geprueft.push(kopie);
      continue;
    }

    let frischerPreis: string;

    if (istVariabel({ type: text(p.type) })) {
      const variationId = Number(item.variation_id ?? 0);
      if (!(variationId > 0)) {
        problems.push(
          problem(
            item,
            "groesse_fehlt",
            `Für „${anzeigeName}“ fehlt die Größe. Bitte den Artikel neu in den Warenkorb legen.`,
            `"${anzeigeName}" has no size selected. Please add it to the cart again.`
          )
        );
        geprueft.push(kopie);
        continue;
      }
      const roh = await ladeVariante(Number(item.id), variationId);
      const v = roh ? zuProductVariant(roh) : null;
      if (!v) {
        problems.push(
          problem(
            item,
            "variante_unbekannt",
            `Die gewählte Größe von „${anzeigeName}“ gibt es nicht mehr. Bitte den Artikel neu in den Warenkorb legen.`,
            `The selected size of "${anzeigeName}" no longer exists. Please add the item to the cart again.`
          )
        );
        geprueft.push(kopie);
        continue;
      }
      if (!istVarianteBestellbar(v, item.qty)) {
        const groesse = v.size || item.size || "";
        problems.push(
          problem(
            item,
            "ausverkauft",
            groesse
              ? `„${anzeigeName}“ ist in Größe ${groesse} ausverkauft.`
              : `„${anzeigeName}“ ist ausverkauft.`,
            groesse
              ? `"${anzeigeName}" is sold out in size ${groesse}.`
              : `"${anzeigeName}" is sold out.`
          )
        );
        geprueft.push(kopie);
        continue;
      }
      // Größe aus WooCommerce übernehmen, falls der Warenkorb sie nicht trägt.
      if (v.size) {
        kopie.size = v.size;
        kopie.size_slug = v.size_slug;
      }
      if (haendler) {
        const hp =
          extractHaendlerPreisFromMeta(
            (roh?.meta_data ?? []) as Array<{ key: string; value: unknown }>
          ) ||
          extractHaendlerPreisFromMeta(
            (p.meta_data ?? []) as Array<{ key: string; value: unknown }>
          );
        if (!(parsePrice(hp) > 0)) {
          problems.push(
            problem(
              item,
              "nicht_kaufbar",
              `Für „${anzeigeName}“ gibt es keinen Händlerpreis.`,
              `"${anzeigeName}" has no dealer price.`
            )
          );
          geprueft.push(kopie);
          continue;
        }
        frischerPreis = preisText(hp);
      } else {
        frischerPreis = preisText(v.price);
      }
    } else {
      // Einfaches Produkt: eine mitgeschickte Variante ist ein Rest aus
      // einem alten Warenkorb und fällt weg.
      delete kopie.variation_id;
      delete kopie.size;
      delete kopie.size_slug;

      if (text(p.stock_status) === "outofstock") {
        problems.push(
          problem(
            item,
            "ausverkauft",
            `„${anzeigeName}“ ist ausverkauft.`,
            `"${anzeigeName}" is sold out.`
          )
        );
        geprueft.push(kopie);
        continue;
      }
      const bestand =
        p.manage_stock === true && typeof p.stock_quantity === "number"
          ? p.stock_quantity
          : null;
      if (bestand !== null && bestand < item.qty) {
        problems.push(
          problem(
            item,
            "ausverkauft",
            bestand > 0
              ? `Von „${anzeigeName}“ sind nur noch ${bestand} Stück verfügbar.`
              : `„${anzeigeName}“ ist ausverkauft.`,
            bestand > 0
              ? `Only ${bestand} of "${anzeigeName}" left in stock.`
              : `"${anzeigeName}" is sold out.`
          )
        );
        geprueft.push(kopie);
        continue;
      }
      if (haendler) {
        const hp = extractHaendlerPreisFromMeta(
          (p.meta_data ?? []) as Array<{ key: string; value: unknown }>
        );
        if (!(parsePrice(hp) > 0)) {
          problems.push(
            problem(
              item,
              "nicht_kaufbar",
              `Für „${anzeigeName}“ gibt es keinen Händlerpreis.`,
              `"${anzeigeName}" has no dealer price.`
            )
          );
          geprueft.push(kopie);
          continue;
        }
        frischerPreis = preisText(hp);
      } else {
        frischerPreis = preisText(text(p.price));
      }
    }

    if (!preiseGleich(item.price, frischerPreis)) {
      repriced.push({
        id: item.id,
        ...(kopie.variation_id ? { variation_id: kopie.variation_id } : {}),
        name: anzeigeName,
        alt: preisText(item.price),
        neu: frischerPreis,
      });
      kopie.price = frischerPreis;
    }
    geprueft.push(kopie);
  }

  return { ok: problems.length === 0, items: geprueft, problems, repriced };
}

/** Nur die harten Probleme (siehe HARTE_PROBLEME). */
export function harteProbleme(problems: Pruefproblem[]): Pruefproblem[] {
  return problems.filter((p) => HARTE_PROBLEME.has(p.code));
}

/** Antwortkörper für 409 "cart_invalid" -- die Kasse zeigt die Meldung und nimmt die Preise. */
export function pruefungAlsFehler(ergebnis: Pruefergebnis, locale: "de" | "en" = "de") {
  return {
    error: "cart_invalid" as const,
    message:
      ergebnis.problems.map((p) => p.message[locale]).join(" ") ||
      (locale === "de"
        ? "Ein Artikel im Warenkorb ist nicht mehr bestellbar."
        : "An item in your cart is no longer available."),
    problems: ergebnis.problems,
    items: ergebnis.items,
    repriced: ergebnis.repriced,
  };
}
