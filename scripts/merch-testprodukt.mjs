#!/usr/bin/env node
/**
 * Verstecktes variables Testprodukt in Merch für die Preview-Testbestellung.
 *
 *   node scripts/merch-testprodukt.mjs anlegen
 *     -> veröffentlicht, catalog_visibility "hidden" (nicht im Raster, nicht
 *        in der Suche, nur über die Adresse), Kategorie Merch, Attribut
 *        Größe mit S und M, je Variante manage_stock true, Bestand 1.
 *        Gibt ID, Slug und Varianten aus.
 *   node scripts/merch-testprodukt.mjs zeigen <id>
 *     -> Produkt und Varianten (Bestand!) rücklesen.
 *   node scripts/merch-testprodukt.mjs papierkorb <id>
 *     -> Produkt in den Papierkorb (DELETE ohne force).
 *
 * Zugang aus .env.local.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ENV_DATEI = path.resolve(HIER, "..", ".env.local");
const ATTRIBUT_SLUG = "pa_groesse";
const KATEGORIE_MERCH = 52;

function ladeEnv() {
  const env = {};
  for (const zeile of fs.readFileSync(ENV_DATEI, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(zeile);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
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
  const daten = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${methode} ${pfad} -> ${res.status}: ${daten?.message ?? ""}`);
  }
  return daten;
}

function groesse(v) {
  const a = (v.attributes ?? []).find((x) => x.slug === ATTRIBUT_SLUG || x.name === "Größe");
  return a ? String(a.option) : "";
}

async function zeigen(id) {
  const p = await woo("GET", `/products/${id}`);
  console.log(
    `#${p.id} ${p.name} | slug ${p.slug} | type ${p.type} | status ${p.status} | sichtbarkeit ${p.catalog_visibility} | stock ${p.stock_status} | Kategorien ${(p.categories ?? []).map((c) => c.slug).join(",")}`
  );
  const v = await woo("GET", `/products/${id}/variations`, { suche: { per_page: "100", status: "any" } });
  for (const x of v) {
    console.log(
      `  Variante ${x.id} ${groesse(x)} price ${x.price} manage_stock ${x.manage_stock} qty ${x.stock_quantity} ${x.stock_status} ${x.status} purchasable ${x.purchasable}`
    );
  }
  return p;
}

async function anlegen() {
  const attribute = await woo("GET", "/products/attributes");
  const attribut = attribute.find((a) => a.slug === ATTRIBUT_SLUG);
  if (!attribut) throw new Error("Attribut pa_groesse fehlt");
  const stempel = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const p = await woo("POST", "/products", {
    rumpf: {
      name: `TEST Merch Größen ${stempel} – nicht kaufen`,
      type: "variable",
      status: "publish",
      catalog_visibility: "hidden",
      description: "<p>Testprodukt für die Größenwahl. Wird nach dem Test gelöscht.</p>",
      categories: [{ id: KATEGORIE_MERCH }],
      attributes: [
        { id: attribut.id, position: 0, visible: true, variation: true, options: ["S", "M"] },
      ],
      meta_data: [{ key: "haendler_preis", value: "3.00" }],
    },
  });
  console.log(`Produkt angelegt: #${p.id} slug ${p.slug}`);
  const batch = await woo("POST", `/products/${p.id}/variations/batch`, {
    rumpf: {
      create: [
        { attributes: [{ id: attribut.id, option: "S" }], regular_price: "5.00", manage_stock: true, stock_quantity: 1, status: "publish" },
        { attributes: [{ id: attribut.id, option: "M" }], regular_price: "6.00", manage_stock: true, stock_quantity: 1, status: "publish" },
      ],
    },
  });
  const fehler = (batch.create ?? []).filter((e) => e.error);
  if (fehler.length) throw new Error(fehler.map((e) => e.error.message).join(" | "));
  await zeigen(p.id);
}

async function papierkorb(id) {
  const p = await woo("DELETE", `/products/${id}`);
  console.log(`#${p.id} -> status ${p.status}`);
}

const [befehl, idRoh] = process.argv.slice(2);
const id = Number(idRoh);
(async () => {
  if (befehl === "anlegen") return anlegen();
  if (befehl === "zeigen" && id) return zeigen(id);
  if (befehl === "papierkorb" && id) return papierkorb(id);
  console.log("Aufruf: anlegen | zeigen <id> | papierkorb <id>");
  process.exit(1);
})().catch((err) => {
  console.error("FEHLER:", err.message);
  process.exit(1);
});
