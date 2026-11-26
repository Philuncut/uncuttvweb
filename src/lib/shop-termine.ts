/**
 * Geplante Termine des Shops: Entwürfe zu einem Zeitpunkt veröffentlichen,
 * wahlweise mit Banner.
 *
 * Angelegt werden die Termine im Steuerpult (Tabelle public.shop_termine,
 * dort sql/106). Die Datenbank ruft zur fälligen Minute die Route
 * /api/intern/shop-termine; was dann geschieht, steht hier.
 *
 * Diese Datei rechnet und ordnet nur. Wer mit WooCommerce und der Datenbank
 * spricht, bekommt sie als `TerminWerkzeug` hereingereicht (die Route gibt
 * das echte, die Tests ein nachgebautes). So ist der Ablauf ohne Netz
 * prüfbar.
 *
 * Eine Wiederholung tut nichts doppelt: Was schon veröffentlicht ist, gilt
 * als erledigt; ein Cover, das schon im Banner steht, kommt kein zweites
 * Mal hinein.
 */

import { timingSafeEqual } from "node:crypto";

export const BANNER_MAX_BILDER = 3;

export type BannerArt = "keiner" | "aktivieren" | "aufnehmen";

export type TerminProdukt = { id: number; name: string };

export type Termin = {
  id: string;
  titel: string;
  /** UTC, ISO 8601. */
  faelligAm: string;
  produkte: TerminProdukt[];
  bannerArt: BannerArt;
  bannerId: string | null;
  versuche: number;
};

/** Ein Produkt, wie WooCommerce es meldet; nur was hier gebraucht wird. */
export type WooStand = {
  id: number;
  name: string;
  status: string;
  type: string;
  bild: string;
};

export type BannerBild = { image: string; label: string };

export type TerminWerkzeug = {
  /** null: WooCommerce kennt das Produkt nicht. Wirft bei Störungen. */
  holeProdukt: (id: number) => Promise<WooStand | null>;
  /** Setzt den Status auf "publish" und gibt den Status aus der Antwort zurück. */
  veroeffentliche: (id: number) => Promise<string>;
  /** Variables Produkt: alle Varianten auf "publish". null = in Ordnung, sonst der Fehlertext. */
  veroeffentlicheVarianten: (id: number) => Promise<string | null>;
  /** false: diesen Banner gibt es nicht. */
  aktiviereBanner: (bannerId: string) => Promise<boolean>;
  /** Der gerade aktive Banner oder null. */
  aktiverBanner: () => Promise<{ id: string; items: BannerBild[] } | null>;
  setzeBannerBilder: (bannerId: string, items: BannerBild[]) => Promise<void>;
  /** Millisekunden seit Beginn der Anfrage; für die Zeitgrenze. */
  vergangenMs: () => number;
};

export type ProduktErgebnis = {
  id: number;
  name: string;
  ok: boolean;
  /** Was geschah, in einem Satz. */
  text: string;
};

export type TerminErgebnis = {
  ok: boolean;
  /** Mindestens ein Produkt wurde in diesem Lauf veröffentlicht. */
  veroeffentlicht: boolean;
  produkte: ProduktErgebnis[];
  banner: { ok: boolean; text: string } | null;
  /** Alle Fehler in einem Text; null, wenn alles gelang. */
  fehler: string | null;
};

/**
 * Nach dieser Zeit wird kein weiteres Produkt mehr begonnen: die Route darf
 * 60 Sekunden laufen, und der Status muss noch zurückgeschrieben werden.
 */
export const ZEITGRENZE_MS = 45_000;

function meldung(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Bearer-Kopf gegen das Geheimnis, ohne über die Laufzeit etwas zu verraten. */
export function geheimnisStimmt(
  kopf: string | null,
  geheimnis: string | undefined
): boolean {
  const soll = (geheimnis ?? "").trim();
  if (soll.length < 16 || !kopf) return false;
  const a = Buffer.from(kopf);
  const b = Buffer.from(`Bearer ${soll}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Zeile aus public.shop_termine -> Termin. null, wenn sie nicht lesbar ist. */
export function zuTermin(zeile: Record<string, unknown> | null): Termin | null {
  if (!zeile || typeof zeile.id !== "string") return null;
  const roh = Array.isArray(zeile.produkte) ? zeile.produkte : [];
  const produkte: TerminProdukt[] = [];
  for (const p of roh as Record<string, unknown>[]) {
    const id = typeof p?.id === "number" ? p.id : Number(p?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (produkte.some((x) => x.id === id)) continue;
    produkte.push({ id, name: typeof p.name === "string" ? p.name : "" });
  }
  const art = zeile.banner_art;
  return {
    id: zeile.id,
    titel: typeof zeile.titel === "string" ? zeile.titel : "",
    faelligAm: typeof zeile.faellig_am === "string" ? zeile.faellig_am : "",
    produkte,
    bannerArt: art === "aktivieren" || art === "aufnehmen" ? art : "keiner",
    bannerId: typeof zeile.banner_id === "string" ? zeile.banner_id : null,
    versuche: typeof zeile.versuche === "number" ? zeile.versuche : 0,
  };
}

/**
 * Die Cover vorn in den Banner stellen. Was schon drin ist (gleiche
 * Bildadresse), rückt nach vorn statt doppelt zu stehen; mehr als drei
 * zeigt der Shop nicht, die hintersten fallen weg.
 */
export function bannerMitCovern(
  bisher: BannerBild[],
  neu: BannerBild[]
): BannerBild[] {
  const gesehen = new Set<string>();
  const ergebnis: BannerBild[] = [];
  for (const bild of [...neu, ...bisher]) {
    const adresse = (bild.image ?? "").trim();
    if (!adresse || gesehen.has(adresse)) continue;
    gesehen.add(adresse);
    ergebnis.push({ image: adresse, label: (bild.label ?? "").trim() });
  }
  return ergebnis.slice(0, BANNER_MAX_BILDER);
}

async function veroeffentlicheEines(
  produkt: TerminProdukt,
  w: TerminWerkzeug
): Promise<{ ergebnis: ProduktErgebnis; neu: boolean; stand: WooStand | null }> {
  const name = produkt.name || `Nr. ${produkt.id}`;
  const scheitert = (text: string, stand: WooStand | null = null) => ({
    ergebnis: { id: produkt.id, name: stand?.name || name, ok: false, text },
    neu: false,
    stand,
  });

  let vorher: WooStand | null;
  try {
    vorher = await w.holeProdukt(produkt.id);
  } catch (err) {
    return scheitert(`WooCommerce nicht lesbar: ${meldung(err)}`);
  }
  if (!vorher) return scheitert("WooCommerce kennt dieses Produkt nicht (gelöscht?).");

  let neu = false;
  if (vorher.status === "draft") {
    try {
      const status = await w.veroeffentliche(produkt.id);
      if (status !== "publish") {
        return scheitert(`WooCommerce meldet nach dem Veröffentlichen Status „${status}“.`, vorher);
      }
      neu = true;
    } catch (err) {
      return scheitert(`Veröffentlichen gescheitert: ${meldung(err)}`, vorher);
    }
  } else if (vorher.status !== "publish") {
    return scheitert(
      `Steht auf „${vorher.status}“, nicht auf Entwurf. Nichts geändert.`,
      vorher
    );
  }

  // Merch: die Größen gehen mit, auch wenn das Produkt schon live war
  // (dann war ein früherer Versuch genau hier hängen geblieben).
  if (vorher.type === "variable") {
    try {
      const fehler = await w.veroeffentlicheVarianten(produkt.id);
      if (fehler) {
        return { ...scheitert(fehler, vorher), neu };
      }
    } catch (err) {
      return { ...scheitert(`Größen nicht veröffentlicht: ${meldung(err)}`, vorher), neu };
    }
  }

  // Nachprüfen: frisch lesen, nicht der Antwort auf das Schreiben glauben.
  let nachher: WooStand | null;
  try {
    nachher = await w.holeProdukt(produkt.id);
  } catch (err) {
    return { ...scheitert(`Nachprüfung nicht möglich: ${meldung(err)}`, vorher), neu };
  }
  if (!nachher || nachher.status !== "publish") {
    return {
      ...scheitert(
        `Nachprüfung: steht auf „${nachher?.status ?? "unbekannt"}“ statt veröffentlicht.`,
        vorher
      ),
      neu,
    };
  }

  return {
    ergebnis: {
      id: produkt.id,
      name: nachher.name || name,
      ok: true,
      text: neu ? "veröffentlicht und nachgeprüft" : "stand schon auf veröffentlicht",
    },
    neu,
    stand: nachher,
  };
}

async function setzeBanner(
  termin: Termin,
  staende: WooStand[],
  w: TerminWerkzeug
): Promise<{ ok: boolean; text: string }> {
  try {
    if (termin.bannerArt === "aktivieren") {
      if (!termin.bannerId) return { ok: false, text: "Am Termin ist kein Banner gewählt." };
      const gefunden = await w.aktiviereBanner(termin.bannerId);
      return gefunden
        ? { ok: true, text: "Banner aktiv geschaltet" }
        : { ok: false, text: "Den gewählten Banner gibt es nicht mehr." };
    }
    const cover = staende
      .filter((s) => s.bild)
      .map((s) => ({ image: s.bild, label: s.name }));
    if (cover.length === 0) {
      return { ok: false, text: "Kein Produkt hat ein Bild; der Banner blieb, wie er war." };
    }
    const aktiv = await w.aktiverBanner();
    if (!aktiv) {
      return {
        ok: false,
        text: "Es ist kein Banner aktiv; die Cover wurden nirgends aufgenommen.",
      };
    }
    await w.setzeBannerBilder(aktiv.id, bannerMitCovern(aktiv.items, cover));
    return {
      ok: true,
      text: `${Math.min(cover.length, BANNER_MAX_BILDER)} Cover in den aktiven Banner aufgenommen`,
    };
  } catch (err) {
    return { ok: false, text: `Banner nicht geändert: ${meldung(err)}` };
  }
}

/**
 * Einen Termin ausführen: jedes Produkt veröffentlichen und nachprüfen,
 * dann der Banner. Der Banner wird nur gesetzt, wenn ALLE Produkte live
 * sind; ein Banner, der auf ein unsichtbares Produkt zeigt, wäre schlimmer
 * als keiner. Wirft nie.
 */
export async function fuehreTerminAus(
  termin: Termin,
  w: TerminWerkzeug
): Promise<TerminErgebnis> {
  const produkte: ProduktErgebnis[] = [];
  const staende: WooStand[] = [];
  let veroeffentlicht = false;

  if (termin.produkte.length === 0) {
    return {
      ok: false,
      veroeffentlicht: false,
      produkte,
      banner: null,
      fehler: "Am Termin hängt kein Produkt.",
    };
  }

  for (const produkt of termin.produkte) {
    if (w.vergangenMs() > ZEITGRENZE_MS) {
      produkte.push({
        id: produkt.id,
        name: produkt.name || `Nr. ${produkt.id}`,
        ok: false,
        text: "Nicht mehr begonnen: die Zeit der Route war um.",
      });
      continue;
    }
    const e = await veroeffentlicheEines(produkt, w);
    produkte.push(e.ergebnis);
    if (e.neu) veroeffentlicht = true;
    if (e.ergebnis.ok && e.stand) staende.push(e.stand);
  }

  const alleLive = produkte.every((p) => p.ok);
  let banner: TerminErgebnis["banner"] = null;
  if (termin.bannerArt !== "keiner") {
    banner = alleLive
      ? await setzeBanner(termin, staende, w)
      : { ok: false, text: "Nicht gesetzt, weil nicht alle Produkte live sind." };
  }

  const fehler = [
    ...produkte.filter((p) => !p.ok).map((p) => `${p.name}: ${p.text}`),
    ...(banner && !banner.ok ? [`Banner: ${banner.text}`] : []),
  ];

  return {
    ok: fehler.length === 0,
    veroeffentlicht,
    produkte,
    banner,
    fehler: fehler.length > 0 ? fehler.join(" — ") : null,
  };
}

/** "27.11.2026 18:00" in Wiener Zeit; leer bei unlesbarem Wert. */
export function wienText(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(ms))
    .replace(",", "");
}

/** Betreff und Text der Mail an das Büro, wenn ein Termin scheitert. Ohne Netz, testbar. */
export function fehlermail(
  termin: Pick<Termin, "titel" | "faelligAm" | "versuche">,
  fehler: string,
  produkte: ProduktErgebnis[] = []
): { betreff: string; text: string } {
  const zeilen = [
    `Der geplante Termin „${termin.titel}“ (${wienText(termin.faelligAm)} Uhr, Wien) ist fehlgeschlagen.`,
    "",
    `Fehler: ${fehler}`,
  ];
  if (produkte.length > 0) {
    zeilen.push("", "Je Produkt:");
    for (const p of produkte) {
      zeilen.push(`  ${p.ok ? "in Ordnung" : "FEHLER"} · ${p.name} (Nr. ${p.id}): ${p.text}`);
    }
  }
  zeilen.push(
    "",
    `Versuch ${termin.versuche}. Von selbst wird nichts wiederholt.`,
    "Im Steuerpult unter Shop › Geplant steht der Termin mit diesem Fehler;",
    "dort „Erneut versuchen“ (bereits Veröffentlichtes bleibt unberührt)",
    "oder die Produkte unter Shop › Produkte von Hand live stellen."
  );
  return {
    betreff: `Shop-Termin fehlgeschlagen: ${termin.titel}`,
    text: zeilen.join("\n"),
  };
}
