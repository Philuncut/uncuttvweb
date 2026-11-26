/**
 * Das echte Werkzeug der Shop-Termine: WooCommerce (schreibend, ohne Cache),
 * die Banner-Tabelle und die Fehlermail. Der Ablauf selbst steht in
 * shop-termine.ts und kennt nur die Formen aus `TerminWerkzeug`.
 */

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BannerBild, TerminWerkzeug, WooStand } from "@/lib/shop-termine";

const ZEITLIMIT_MS = 15_000;
const ABSENDER = "UncutTV <office@uncuttv.at>";
const OFFICE_TO = "office@uncuttv.at";

type WooAntwort = { status: number; daten: unknown };

async function woo(
  methode: "GET" | "PUT" | "POST",
  pfad: string,
  rumpf?: unknown
): Promise<WooAntwort> {
  const basis = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  const key = process.env.WOOCOMMERCE_KEY ?? "";
  const secret = process.env.WOOCOMMERCE_SECRET ?? "";
  if (!basis || !key || !secret) {
    throw new Error("WooCommerce-Zugang fehlt in der Umgebung");
  }
  const res = await fetch(`${basis}/wp-json/wc/v3${pfad}`, {
    method: methode,
    headers: {
      Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf),
    cache: "no-store",
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  const daten = await res.json().catch(() => null);
  return { status: res.status, daten };
}

function fehlertext(a: WooAntwort): string {
  const d = a.daten as { message?: unknown } | null;
  const text = typeof d?.message === "string" ? d.message : "";
  return `WooCommerce antwortet mit ${a.status}${text ? `: ${text}` : ""}`;
}

type WooProdukt = {
  id?: number;
  name?: string;
  status?: string;
  type?: string;
  images?: { src?: string }[];
};

type WooVariante = { id?: number; status?: string };

async function ladeVarianten(id: number): Promise<WooVariante[]> {
  const a = await woo(
    "GET",
    `/products/${id}/variations?per_page=100&status=any&_fields=id,status`
  );
  if (a.status !== 200 || !Array.isArray(a.daten)) throw new Error(fehlertext(a));
  return a.daten as WooVariante[];
}

export function baueTerminWerkzeug(
  db: SupabaseClient,
  beginnMs: number
): TerminWerkzeug {
  return {
    vergangenMs: () => Date.now() - beginnMs,

    holeProdukt: async (id): Promise<WooStand | null> => {
      const a = await woo("GET", `/products/${id}?_fields=id,name,status,type,images`);
      if (a.status === 404) return null;
      if (a.status !== 200 || !a.daten) throw new Error(fehlertext(a));
      const p = a.daten as WooProdukt;
      return {
        id,
        name: typeof p.name === "string" ? p.name : "",
        status: typeof p.status === "string" ? p.status : "",
        type: typeof p.type === "string" ? p.type : "simple",
        bild: typeof p.images?.[0]?.src === "string" ? p.images[0].src : "",
      };
    },

    veroeffentliche: async (id) => {
      const a = await woo("PUT", `/products/${id}`, { status: "publish" });
      if (a.status !== 200 || !a.daten) throw new Error(fehlertext(a));
      const status = (a.daten as WooProdukt).status;
      return typeof status === "string" ? status : "";
    },

    veroeffentlicheVarianten: async (id) => {
      const offen = (await ladeVarianten(id)).filter(
        (v) => typeof v.id === "number" && v.status !== "publish"
      );
      if (offen.length === 0) return null;
      const a = await woo("POST", `/products/${id}/variations/batch`, {
        update: offen.map((v) => ({ id: v.id, status: "publish" })),
      });
      if (a.status !== 200) {
        return `Produkt ist live, aber ${offen.length} Größe(n) nicht: ${fehlertext(a)}`;
      }
      const nachher = (await ladeVarianten(id)).filter((v) => v.status !== "publish");
      return nachher.length === 0
        ? null
        : `Produkt ist live, aber ${nachher.length} Größe(n) stehen weiter auf „${nachher[0].status}“.`;
    },

    aktiviereBanner: async (bannerId) => {
      const { data, error } = await db.rpc("shop_termin_banner_aktivieren", {
        p_id: bannerId,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },

    aktiverBanner: async () => {
      const { data, error } = await db
        .from("banners")
        .select("id, items")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const items = Array.isArray(data.items) ? (data.items as BannerBild[]) : [];
      return { id: String(data.id), items };
    },

    setzeBannerBilder: async (bannerId, items) => {
      const { error } = await db
        .from("banners")
        .update({ items, updated_at: new Date().toISOString() })
        .eq("id", bannerId);
      if (error) throw new Error(error.message);
    },
  };
}

/** Mail an das Büro. Wirft, wenn Resend nicht eingerichtet ist oder ablehnt. */
export async function schickeTerminMail(betreff: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || key === "your_resend_api_key") {
    throw new Error("RESEND_API_KEY nicht gesetzt");
  }
  const ergebnis = await new Resend(key).emails.send({
    from: ABSENDER,
    to: [OFFICE_TO],
    subject: betreff,
    text,
  });
  if (ergebnis.error) throw new Error(`Resend: ${ergebnis.error.message}`);
}
