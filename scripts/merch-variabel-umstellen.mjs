#!/usr/bin/env node
/**
 * Merch-Artikel von "simple" auf "variable" mit Größen umstellen.
 *
 * Die sechs Shirts und Hoodies vom Halloween-Vorverkauf 2026 behalten ID,
 * Name, Beschreibung, Bilder, Slug und bisherige Verkäufe. Je Artikel:
 *
 *   1. PUT /products/{id}: type "variable", Attribut Größe (pa_groesse,
 *      variation + visible, Optionen in Attribut-Reihenfolge), Kategorien
 *      Merch + Vorverkauf (ohne "Jetzt erhältlich!"), Meta
 *      uncuttv_verkauf_bis = 2026-11-06T17:00:00Z (= 06.11. 18:00 Wien).
 *   2. POST /products/{id}/variations/batch: je Größe eine Variante mit
 *      regular_price des Elternprodukts, manage_stock false, stock_status
 *      instock, status publish. KEIN haendler_preis an den Varianten.
 *   3. Rücklesen: Typ, Varianten, Preise, Kategorien, Meta.
 *
 * Standard ist der TROCKENLAUF: zeigt je Artikel, was sich ändern würde.
 *   node scripts/merch-variabel-umstellen.mjs
 * Ausführen (erst nach Freigabe und wenn der neue Shop live ist):
 *   node scripts/merch-variabel-umstellen.mjs --ausfuehren
 * Nur einzelne Artikel:
 *   node scripts/merch-variabel-umstellen.mjs --nur 6545,6544
 * Zusätzlich uncuttv_angaben (typ merch) schreiben, damit das Steuerpult
 * den Artikel als Merch öffnen kann (siehe Bericht zu Aufgabe D):
 *   node scripts/merch-variabel-umstellen.mjs --ausfuehren --mit-angaben
 *
 * Zugang aus .env.local (WOOCOMMERCE_URL, WOOCOMMERCE_KEY, WOOCOMMERCE_SECRET).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ENV_DATEI = path.resolve(HIER, "..", ".env.local");

const ATTRIBUT_SLUG = "pa_groesse";
const KATEGORIE_MERCH = 52;
const KATEGORIE_VORVERKAUF = 29;
const KATEGORIE_INSTOCK = 32;
const VERKAUF_BIS = "2026-11-06T17:00:00Z";

const HERREN = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const DAMEN = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];

/** Die Artikel und ihre Größen (Reihenfolge wird aus dem Attribut genommen). */
const ARTIKEL = [
  { id: 6545, kurz: "Atroz Herren-Shirt", groessen: HERREN },
  { id: 6544, kurz: "Septic & Fetus Herren-Shirt", groessen: HERREN },
  { id: 6576, kurz: "Atroz Damen-Shirt", groessen: DAMEN },
  { id: 6543, kurz: "Septic & Fetus Damen-Shirt", groessen: DAMEN },
  { id: 6542, kurz: "Atroz Hoodie", groessen: HERREN },
  { id: 6539, kurz: "Septic & Fetus Hoodie", groessen: HERREN },
];

// ── Aufruf ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const AUSFUEHREN = args.includes("--ausfuehren");
const MIT_ANGABEN = args.includes("--mit-angaben");
const nurIdx = args.indexOf("--nur");
const NUR =
  nurIdx >= 0 && args[nurIdx + 1]
    ? new Set(args[nurIdx + 1].split(",").map((s) => Number(s.trim())))
    : null;

function ladeEnv() {
  if (!fs.existsSync(ENV_DATEI)) {
    throw new Error(`.env.local nicht gefunden: ${ENV_DATEI}`);
  }
  const env = {};
  for (const zeile of fs.readFileSync(ENV_DATEI, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(zeile);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  for (const k of ["WOOCOMMERCE_URL", "WOOCOMMERCE_KEY", "WOOCOMMERCE_SECRET"]) {
    if (!env[k]) throw new Error(`${k} fehlt in .env.local`);
  }
  return env;
}

const env = ladeEnv();
const BASE = `${env.WOOCOMMERCE_URL.replace(/\/+$/, "")}/wp-json/wc/v3`;
const AUTH =
  "Basic " +
  Buffer.from(`${env.WOOCOMMERCE_KEY}:${env.WOOCOMMERCE_SECRET}`).toString("base64");

async function woo(methode, pfad, { suche, rumpf } = {}) {
  const url = new URL(`${BASE}${pfad}`);
  for (const [k, v] of Object.entries(suche ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: methode,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: rumpf ? JSON.stringify(rumpf) : undefined,
  });
  const text = await res.text();
  let daten = null;
  try {
    daten = text ? JSON.parse(text) : null;
  } catch {
    daten = text;
  }
  if (!res.ok) {
    const meldung =
      daten && typeof daten === "object" && daten.message
        ? daten.message
        : String(text).slice(0, 300);
    throw new Error(`${methode} ${pfad} -> ${res.status}: ${meldung}`);
  }
  return daten;
}

function preisZahl(wert) {
  const n = parseFloat(String(wert ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function metaWert(produkt, key) {
  const z = (produkt.meta_data ?? []).find((m) => m.key === key);
  return z ? (typeof z.value === "string" ? z.value : JSON.stringify(z.value)) : "";
}

function groesseAusVariante(v) {
  const a = (v.attributes ?? []).find(
    (x) => x.slug === ATTRIBUT_SLUG || String(x.name).toLowerCase() === "größe"
  );
  return a ? String(a.option ?? "") : "";
}

async function ladeAlleVarianten(produktId) {
  const alle = [];
  for (let seite = 1; seite <= 5; seite++) {
    const url = new URL(`${BASE}/products/${produktId}/variations`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(seite));
    url.searchParams.set("status", "any");
    const res = await fetch(url, { headers: { Authorization: AUTH } });
    if (!res.ok) throw new Error(`Varianten von ${produktId}: ${res.status}`);
    const daten = await res.json();
    alle.push(...daten);
    const seiten = Number(res.headers.get("x-wp-totalpages") || "1");
    if (seite >= seiten) break;
  }
  return alle;
}

function zeile(text = "") {
  console.log(text);
}

// ── Ablauf ─────────────────────────────────────────────────────────────────

async function main() {
  zeile(AUSFUEHREN ? "=== AUSFÜHRUNG ===" : "=== TROCKENLAUF (nichts wird geändert) ===");
  zeile(`WooCommerce: ${env.WOOCOMMERCE_URL}`);
  zeile();

  // Das Attribut und seine Begriffe (Reihenfolge = menu_order).
  const attribute = await woo("GET", "/products/attributes");
  const attribut = attribute.find((a) => a.slug === ATTRIBUT_SLUG);
  if (!attribut) throw new Error(`Attribut ${ATTRIBUT_SLUG} gibt es nicht.`);
  const begriffe = await woo("GET", `/products/attributes/${attribut.id}/terms`, {
    suche: { per_page: "100" },
  });
  const reihenfolge = [...begriffe]
    .sort((a, b) => a.menu_order - b.menu_order || a.name.localeCompare(b.name, "de"))
    .map((b) => b.name);
  zeile(`Attribut "${attribut.name}" (ID ${attribut.id}), Begriffe: ${reihenfolge.join(", ")}`);
  zeile();

  const kategorien = await woo("GET", "/products/categories", {
    suche: { per_page: "100", hide_empty: "false" },
  });
  const katName = (id) => kategorien.find((k) => k.id === id)?.name ?? `#${id}`;
  for (const id of [KATEGORIE_MERCH, KATEGORIE_VORVERKAUF]) {
    if (!kategorien.some((k) => k.id === id)) throw new Error(`Kategorie ${id} fehlt.`);
  }

  const auswahl = ARTIKEL.filter((a) => !NUR || NUR.has(a.id));
  const bericht = [];

  for (const artikel of auswahl) {
    zeile(`──── ${artikel.kurz} (ID ${artikel.id}) ────`);
    const p = await woo("GET", `/products/${artikel.id}`);
    const vorhanden = p.type === "variable" ? await ladeAlleVarianten(p.id) : [];

    const fehlend = artikel.groessen.filter((g) => !reihenfolge.includes(g));
    if (fehlend.length) {
      throw new Error(`Größen ohne Begriff im Attribut: ${fehlend.join(", ")}`);
    }
    const optionen = reihenfolge.filter((g) => artikel.groessen.includes(g));
    const grundpreis = preisZahl(p.regular_price || p.price).toFixed(2);
    const haendlerPreis = metaWert(p, "haendler_preis");

    const kategorienNeu = [{ id: KATEGORIE_MERCH }, { id: KATEGORIE_VORVERKAUF }];
    const kategorienAlt = (p.categories ?? []).map((c) => c.id);

    zeile(`Name:        ${p.name}`);
    zeile(`Typ:         ${p.type}  ->  variable`);
    zeile(`Status:      ${p.status} (bleibt)`);
    zeile(`Grundpreis:  ${grundpreis} (regular_price des Elternprodukts, je Variante übernommen)`);
    zeile(`Händlerpreis am Produkt: ${haendlerPreis || "–"} (bleibt am Produkt, nicht an den Varianten)`);
    zeile(
      `Kategorien:  ${kategorienAlt.map(katName).join(", ") || "–"}  ->  ${kategorienNeu
        .map((k) => katName(k.id))
        .join(", ")}${kategorienAlt.includes(KATEGORIE_INSTOCK) ? `  (entfernt: ${katName(KATEGORIE_INSTOCK)})` : ""}`
    );
    zeile(`Attribut:    ${attribut.name} variation=true visible=true, Optionen: ${optionen.join(", ")}`);
    zeile(
      `Meta:        uncuttv_verkauf_bis ${metaWert(p, "uncuttv_verkauf_bis") || "–"}  ->  ${VERKAUF_BIS} (06.11.2026 18:00 Wien)`
    );
    zeile(`Verkäufe:    total_sales ${p.total_sales ?? 0} (bleibt)`);

    const vorhandenNachGroesse = new Map(
      vorhanden.map((v) => [groesseAusVariante(v).toLowerCase(), v])
    );
    const anlegen = optionen.filter((g) => !vorhandenNachGroesse.has(g.toLowerCase()));
    const schonDa = optionen.filter((g) => vorhandenNachGroesse.has(g.toLowerCase()));
    zeile(
      `Varianten:   anlegen ${anlegen.length ? anlegen.join(", ") : "–"}${
        schonDa.length ? `; vorhanden (unverändert) ${schonDa.join(", ")}` : ""
      }`
    );
    zeile(
      `             je: regular_price ${grundpreis}, manage_stock false, stock_status instock, status publish, kein haendler_preis`
    );

    let angaben = null;
    if (MIT_ANGABEN) {
      angaben = JSON.stringify({
        version: 1,
        typ: "merch",
        merch: {
          produktname: p.name,
          beschreibung: String(p.description ?? "").replace(/<[^>]*>/g, "").trim(),
          regularPreis: grundpreis,
          haendlerPreis: haendlerPreis.replace(",", "."),
          kategorieId: KATEGORIE_MERCH,
        },
      });
      zeile(`Meta:        uncuttv_angaben (typ merch) wird geschrieben, ${angaben.length} Zeichen`);
    }

    if (!AUSFUEHREN) {
      zeile();
      continue;
    }

    // 1. Produkt
    const metaNeu = [{ key: "uncuttv_verkauf_bis", value: VERKAUF_BIS }];
    if (angaben) metaNeu.push({ key: "uncuttv_angaben", value: angaben });
    const rumpf = {
      type: "variable",
      categories: kategorienNeu,
      attributes: [
        {
          id: attribut.id,
          position: 0,
          visible: true,
          variation: true,
          options: optionen,
        },
      ],
      meta_data: metaNeu,
    };
    const nachPut = await woo("PUT", `/products/${p.id}`, { rumpf });
    if (nachPut.type !== "variable") {
      throw new Error(`Produkt ${p.id} ist nach dem PUT "${nachPut.type}", nicht variable.`);
    }
    zeile(`PUT ok: type ${nachPut.type}`);

    // 2. Varianten
    if (anlegen.length) {
      const create = anlegen.map((g) => ({
        attributes: [{ id: attribut.id, option: g }],
        regular_price: grundpreis,
        manage_stock: false,
        stock_status: "instock",
        status: "publish",
      }));
      const batch = await woo("POST", `/products/${p.id}/variations/batch`, {
        rumpf: { create },
      });
      const fehler = (batch.create ?? []).filter((e) => e.error);
      if (fehler.length) {
        throw new Error(
          `Varianten mit Fehler: ${fehler.map((e) => e.error?.message).join(" | ")}`
        );
      }
      zeile(`Batch ok: ${(batch.create ?? []).length} Varianten angelegt`);
    }

    // 3. Rücklesen
    const frisch = await woo("GET", `/products/${p.id}`);
    const varianten = await ladeAlleVarianten(p.id);
    const sortiert = [...varianten].sort(
      (a, b) =>
        reihenfolge.indexOf(groesseAusVariante(a)) -
        reihenfolge.indexOf(groesseAusVariante(b))
    );
    zeile(`Rücklesen:   type ${frisch.type}, status ${frisch.status}, purchasable ${frisch.purchasable}, stock_status ${frisch.stock_status}`);
    zeile(`             Kategorien: ${(frisch.categories ?? []).map((c) => c.name).join(", ")}`);
    zeile(
      `             Attribut: ${(frisch.attributes ?? [])
        .map((a) => `${a.name} [${(a.options ?? []).join(", ")}] variation=${a.variation}`)
        .join("; ")}`
    );
    zeile(`             Meta uncuttv_verkauf_bis: ${metaWert(frisch, "uncuttv_verkauf_bis")}`);
    zeile(`             Meta haendler_preis: ${metaWert(frisch, "haendler_preis")}`);
    for (const v of sortiert) {
      zeile(
        `             Variante ${String(v.id).padEnd(6)} ${groesseAusVariante(v).padEnd(4)} ` +
          `regular ${v.regular_price} price ${v.price} sale "${v.sale_price}" ` +
          `manage_stock ${v.manage_stock} stock_status ${v.stock_status} status ${v.status} ` +
          `purchasable ${v.purchasable} haendler_preis "${metaWert(v, "haendler_preis")}"`
      );
    }
    bericht.push({
      id: p.id,
      name: frisch.name,
      type: frisch.type,
      varianten: sortiert.length,
      kategorien: (frisch.categories ?? []).map((c) => c.slug),
    });
    zeile();
  }

  if (AUSFUEHREN) {
    zeile("=== Zusammenfassung ===");
    for (const b of bericht) {
      zeile(`#${b.id} ${b.type} ${b.varianten} Varianten [${b.kategorien.join(", ")}] ${b.name}`);
    }
  } else {
    zeile("Trockenlauf beendet. Zum Ausführen: --ausfuehren (optional --mit-angaben).");
  }
}

main().catch((err) => {
  console.error("FEHLER:", err instanceof Error ? err.message : err);
  process.exit(1);
});
