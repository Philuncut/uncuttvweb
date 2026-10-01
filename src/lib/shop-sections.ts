import type { ShopListProduct } from "@/lib/types";

/**
 * Abschnitte des Shops: welche Titel unter "Jetzt vorbestellen", "Neu" und
 * "Jetzt erhältlich" stehen. Gemeinsame Quelle für ShopContent (/shop) und
 * die Produktreihe unter der Weiche (/start), damit beide dieselbe Auswahl
 * treffen und keine zweite Logik entsteht.
 *
 * Kein "use client": Die Funktionen sind rein und laufen im Browser wie auf
 * dem Server.
 */

export const VORVERKAUF_SLUG = "vorverkauf";
export const BRANDNEU_SLUG = "brandneu";
export const INSTOCK_SLUG = "instock";
export const OOP_SLUG = "outofprint";

export function hasCatSlug(product: ShopListProduct, slug: string): boolean {
  return product.categories.some((c) => c.slug === slug);
}

/** Lieferbare Titel zuerst, sonst bleibt die Reihenfolge des Katalogs. */
export function sortProducts(products: ShopListProduct[]): ShopListProduct[] {
  return [...products].sort((a, b) => {
    if (a.stock_status === "instock" && b.stock_status !== "instock") return -1;
    if (a.stock_status !== "instock" && b.stock_status === "instock") return 1;
    return 0;
  });
}

/** Steht der Titel im Abschnitt "Jetzt vorbestellen"? */
export function istVorverkauf(product: ShopListProduct): boolean {
  return hasCatSlug(product, VORVERKAUF_SLUG);
}

/** Der Abschnitt "Jetzt vorbestellen", in seiner Reihenfolge im Shop. */
export function vorverkaufProdukte(products: ShopListProduct[]): ShopListProduct[] {
  return sortProducts(products.filter(istVorverkauf));
}

/**
 * Wo im Produktnamen der Filmtitel endet: an der ersten Angabe zu Format,
 * Ausstattung oder Cover. Das ist der RÜCKFALL für Produkte aus dem alten
 * Dashboard oder aus WordPress. Produkte aus dem Steuerpult tragen den
 * Filmtitel in uncuttv_angaben (film_titel am Listenprodukt), dort wird
 * nicht geraten.
 *
 * WooCommerce kennt keine Verbindung zwischen den Varianten eines Films
 * (alles einfache Produkte, ohne Elternprodukt, Tags oder durchgehende
 * SKU); verlässlich ist nur dieser Aufbau des Namens, etwa "Fear Cabin
 * 2-Disc-Mediabook (DVD + Blu-ray) Mediabook Cover F" oder "Mudbrick
 * Amaray". "Medi?a" fängt die Schreibung "Medabook" mit ab. Die
 * Verpackungen hier entsprechen der Liste in verpackung.ts.
 */
const FORMAT_ANGABE =
  /\s(?:\d+-Disc-)?(?:Medi?a\s?-?book|Amaray|Scanavo|Steelbook|Retro-?VHS-?Box|VHS\b|Blu-?Ray|UHD|DVD|Hartbox|Pappschuber|Feelbook|Woodbox|Holzbox|Digipa[ck]k?|Handsigniert|Ultra\s+Limit|Cover\s+[A-Z]\b)/i;

/** Einzelstücke nennen ihren Film hinter "inkl.". */
const INKLUSIVE = /\binkl\.?\s+/i;

function titelTeil(name: string, anfangGehoertZumTitel = true): string {
  // Mit vorangestelltem Leerzeichen, damit auch eine Angabe ganz am Anfang
  // zählt ("Mediabook Cover C" hinter "inkl." ergibt einen leeren Titel).
  const text = " " + name;
  const treffer = text.search(FORMAT_ANGABE);
  if (treffer < 0) return text;
  // Steht die Verpackung ganz vorn im NAMEN, gehört sie zum Titel ("VHS
  // Underground Mediabook Cover A", "Scanavo: Underground Files …"): dann
  // zählt erst die nächste Angabe dahinter. Hinter "inkl." gilt das nicht
  // ("inkl. Mediabook Cover A" nennt keinen Film).
  if (treffer === 0 && anfangGehoertZumTitel) {
    const wort = text.match(FORMAT_ANGABE)?.[0] ?? "";
    const rest = text.slice(wort.length);
    const naechster = rest.search(FORMAT_ANGABE);
    return naechster >= 0 ? text.slice(0, wort.length + naechster) : text;
  }
  return text.slice(0, treffer);
}

function vergleichsform(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bvolume\b/g, "vol")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Schlüssel, unter dem die Varianten eines Films zusammenfallen: der
 * Filmtitel ohne Format- und Coverangaben, ohne Groß- und Kleinschreibung,
 * Akzente, Leer- und Satzzeichen. So gehören "Backwood : The Camp Massacre
 * HANDSIGNIERT Cover F" und "Backwood: The Camp Massacre Mediabook Cover A"
 * zusammen, ebenso "WHAT LURKS BENEATH Amaray" und "What Lurks Beneath
 * Mediabook Cover D". Ein Einzelstück "… inkl. Fear Cabin Mediabook Cover C"
 * zählt zu Fear Cabin; nennt es hinter "inkl." keinen Titel, gilt der Teil
 * davor.
 */
export function filmSchluessel(
  produkt: string | { name: string; film_titel?: string | null }
): string {
  // Aus dem Steuerpult: der Filmtitel steht in den Angaben -- ohne
  // Verpackung und Cover, aber mit allem, was der Titel selbst enthält
  // ("EINZELSTÜCK: … inkl. Conditio Germania MB-Cover C"). Deshalb läuft
  // auch er durch die inkl.-Regel.
  if (typeof produkt !== "string") {
    const titel = produkt.film_titel?.trim();
    if (titel) return schluesselAusName(titel) || vergleichsform(produkt.name);
  }
  return schluesselAusName(typeof produkt === "string" ? produkt : produkt.name);
}

function schluesselAusName(name: string): string {
  const inkl = name.search(INKLUSIVE);
  if (inkl >= 0) {
    const danach = name.slice(inkl).replace(INKLUSIVE, "");
    // Ein einzelnes Wort hinter "inkl." ist Beigabe (Poster, Booklet),
    // kein Film. Erst ab zwei Wörtern gilt es als Verweis auf den Film.
    if (danach.trim().split(/\s+/).length >= 2) {
      const film = vergleichsform(titelTeil(danach, false));
      if (film) return film;
    }
    return vergleichsform(titelTeil(name.slice(0, inkl))) || vergleichsform(name);
  }
  return vergleichsform(titelTeil(name)) || vergleichsform(name);
}

/**
 * Auswahl für /start: bis zu `anzahl` Filme, je Film nur eine Variante, und
 * zwar die erste in der jeweiligen Reihenfolge. Zuerst Vorbestellungen, in
 * der Reihenfolge von "Jetzt vorbestellen". Reichen sie nicht, wird mit
 * regulären Titeln aufgefüllt: zuerst die aus "Neu" (Kategorie brandneu),
 * dann die übrigen, jeweils neueste zuerst (Reihenfolge des Katalogs).
 * Ausverkaufte reguläre Titel werden übersprungen, ebenso Filme, die schon
 * als Vorbestellung dastehen.
 *
 * Nur für /start: Der Shop zeigt weiterhin jede Variante einzeln.
 */
export function startAuswahl(products: ShopListProduct[], anzahl: number): ShopListProduct[] {
  const auswahl: ShopListProduct[] = [];
  const filme = new Set<string>();
  const nimm = (liste: ShopListProduct[]) => {
    for (const p of liste) {
      if (auswahl.length >= anzahl) return;
      const film = filmSchluessel(p);
      if (filme.has(film)) continue;
      filme.add(film);
      auswahl.push(p);
    }
  };

  nimm(vorverkaufProdukte(products));
  if (auswahl.length < anzahl) {
    const regulaer = products.filter((p) => !istVorverkauf(p) && p.stock_status !== "outofstock");
    nimm(regulaer.filter((p) => hasCatSlug(p, BRANDNEU_SLUG)));
    nimm(regulaer.filter((p) => !hasCatSlug(p, BRANDNEU_SLUG)));
  }
  return auswahl;
}
