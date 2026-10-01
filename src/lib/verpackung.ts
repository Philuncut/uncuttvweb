/**
 * Die Verpackung eines Produkts: Mediabook, Amaray, Scanavo, Hartbox,
 * Retro-VHS-Box und was das Steuerpult sonst einträgt.
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *
 *   1. Das Meta-Feld uncuttv_angaben, das das Steuerpult je Produkt
 *      schreibt (JSON mit titel.produktname, titel.packung und, bei
 *      "sonstige", titel.packungText). Daraus kommen Filmtitel und
 *      Verpackung ohne Raten.
 *   2. Der Produktname, für Produkte aus dem alten Dashboard oder aus
 *      WordPress: ein regulärer Ausdruck über die bekannten Bezeichnungen.
 *
 * Kein "use client": reine Funktionen, laufen im Browser wie auf dem
 * Server. Die Liste hier ist die einzige im Projekt -- shop-sections.ts
 * (Gruppierung) und product-seo.ts (Meta-Beschreibungen) fragen beide hier.
 */

export type Packung = "mediabook" | "amaray" | "scanavo" | "sonstige";

export type ProduktAngaben = {
  /** Der Filmtitel ohne Verpackung und Cover, wie im Steuerpult eingegeben. */
  produktname: string;
  packung: Packung;
  /** Bei packung = "sonstige" die eingetragene Bezeichnung. */
  packungText: string;
};

export type MetaZeile = { key?: unknown; value?: unknown };

const PACKUNG_NAMEN: Record<Exclude<Packung, "sonstige">, string> = {
  mediabook: "Mediabook",
  amaray: "Amaray",
  scanavo: "Scanavo",
};

/** uncuttv_angaben lesen; null, wenn das Feld fehlt oder nicht lesbar ist. */
export function angabenAus(meta: MetaZeile[] | undefined | null): ProduktAngaben | null {
  const zeile = (meta ?? []).find((m) => m.key === "uncuttv_angaben");
  if (!zeile || typeof zeile.value !== "string" || !zeile.value.trim()) return null;
  try {
    const roh = JSON.parse(zeile.value) as { titel?: Record<string, unknown> } | null;
    const t = roh?.titel;
    if (!t || typeof t !== "object") return null;
    const produktname = typeof t.produktname === "string" ? t.produktname.trim() : "";
    const packungRoh = t.packung;
    const packung: Packung =
      packungRoh === "amaray" || packungRoh === "scanavo" || packungRoh === "sonstige"
        ? packungRoh
        : "mediabook";
    const packungText = typeof t.packungText === "string" ? t.packungText.trim() : "";
    if (!produktname) return null;
    return { produktname, packung, packungText };
  } catch {
    return null;
  }
}

/** Wie die Packung heißt -- bei "sonstige" die eingetragene Bezeichnung. */
export function packungName(angaben: ProduktAngaben): string {
  if (angaben.packung === "sonstige") return angaben.packungText || "Sonderverpackung";
  return PACKUNG_NAMEN[angaben.packung];
}

/**
 * Verpackungen, die im Produktnamen vorkommen, mit ihrer Schreibweise für
 * die Anzeige. Reihenfolge: speziellere zuerst (Retro-VHS-Box vor VHS).
 * "Medi?a" fängt die Schreibung "Medabook" mit ab.
 */
const VERPACKUNGEN_IM_NAMEN: Array<[RegExp, string]> = [
  [/retro-?vhs-?box/i, "Retro-VHS-Box"],
  [/\bvhs\b/i, "VHS"],
  [/medi?a\s?-?book/i, "Mediabook"],
  [/\bamaray\b/i, "Amaray"],
  [/\bscanavo\b/i, "Scanavo"],
  [/\bsteelbook\b/i, "Steelbook"],
  [/\bhartbox\b/i, "Hartbox"],
  [/\bholzbox\b|\bwoodbox\b/i, "Holzbox"],
  [/\bdigipa[ck]k?\b/i, "Digipak"],
  [/\bpappschuber\b/i, "Pappschuber"],
  [/\bfeelbook\b/i, "Feelbook"],
];

/** Die Verpackung aus dem Produktnamen, oder undefined. */
export function verpackungAusName(name: string): string | undefined {
  for (const [muster, anzeige] of VERPACKUNGEN_IM_NAMEN) {
    if (muster.test(name)) return anzeige;
  }
  return undefined;
}

/**
 * Die Verpackung eines Produkts: aus den Angaben des Steuerpults, sonst
 * aus dem Namen, sonst Mediabook -- das ist, was fast alles im Shop ist.
 */
export function verpackungVon(product: { name: string; meta_data?: MetaZeile[] }): string {
  const angaben = angabenAus(product.meta_data);
  if (angaben) return packungName(angaben);
  return verpackungAusName(product.name) ?? "Mediabook";
}
