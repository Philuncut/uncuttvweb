/**
 * POST /api/intern/shop-termine
 *
 * Geplante Termine des Shops ausführen (Vorverkauf zur Minute online). Die
 * Datenbank ruft diese Route: pg_cron -> public.shop_termine_takt() ->
 * pg_net (Steuerpult, sql/106). Angelegt werden die Termine im Steuerpult,
 * Reiter Shop.
 *
 * Auth: Authorization: Bearer SHOP_TERMINE_SECRET (dieselbe Folge liegt im
 * Supabase-Vault als shop_termine_secret).
 *
 * Rumpf: { aktion: "ausfuehren" | "melden", id: "<uuid>" }
 *
 *   ausfuehren  Der Takt hat den Termin auf "laeuft" gesetzt. Hier wird er
 *               ABGEHOLT (abgeholt_am, nur wenn noch nicht abgeholt): ein
 *               zweiter Aufruf mit derselben Nummer findet nichts und tut
 *               nichts. Dann veröffentlichen, nachprüfen, Banner, Cache der
 *               Website leeren, Status zurückschreiben, bei Fehler Mail.
 *   melden      Der Takt hat einen hängengebliebenen Termin auf
 *               "fehlgeschlagen" gesetzt und bittet um die Mail.
 *
 * Der Ablauf steht in src/lib/shop-termine.ts (ohne Netz geprüft).
 */

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { SHOP_CATALOG_TAG } from "@/lib/shop-catalog";
import {
  fehlermail,
  fuehreTerminAus,
  geheimnisStimmt,
  zuTermin,
  type TerminErgebnis,
} from "@/lib/shop-termine";
import {
  baueTerminWerkzeug,
  schickeTerminMail,
} from "@/lib/shop-termine-werkzeug";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mail schicken; gibt den Fehlertext zurück statt zu werfen. */
async function mailOderFehler(betreff: string, text: string): Promise<string | null> {
  try {
    await schickeTerminMail(betreff, text);
    return null;
  } catch (err) {
    console.error("[shop-termine] Mail gescheitert:", err);
    return err instanceof Error ? err.message : String(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  const beginn = Date.now();
  if (
    !geheimnisStimmt(
      request.headers.get("authorization"),
      process.env.SHOP_TERMINE_SECRET
    )
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rumpf = (await request.json().catch(() => null)) as {
    aktion?: unknown;
    id?: unknown;
  } | null;
  const id = typeof rumpf?.id === "string" ? rumpf.id : "";
  const aktion = rumpf?.aktion === "melden" ? "melden" : "ausfuehren";
  if (!UUID.test(id)) {
    return NextResponse.json({ ok: false, error: "id fehlt" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Supabase nicht eingerichtet" },
      { status: 500 }
    );
  }

  // ── melden: nur die Mail zu einem hängengebliebenen Termin ───────────────
  if (aktion === "melden") {
    const { data, error } = await db
      .from("shop_termine")
      .update({ meldung_offen: false })
      .eq("id", id)
      .eq("status", "fehlgeschlagen")
      .eq("meldung_offen", true)
      .select("*")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const termin = zuTermin(data as Record<string, unknown> | null);
    if (!termin) return NextResponse.json({ ok: true, uebersprungen: true });
    const text = typeof data?.fehler === "string" ? data.fehler : "ohne Fehlertext";
    const mail = fehlermail(termin, text);
    const mailFehler = await mailOderFehler(mail.betreff, mail.text);
    return NextResponse.json({ ok: true, gemeldet: mailFehler === null, mailFehler });
  }

  // ── ausfuehren: abholen, genau einmal ───────────────────────────────────
  const { data: zeile, error: abholFehler } = await db
    .from("shop_termine")
    .update({ abgeholt_am: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "laeuft")
    .is("abgeholt_am", null)
    .select("*")
    .maybeSingle();
  if (abholFehler) {
    return NextResponse.json({ ok: false, error: abholFehler.message }, { status: 500 });
  }
  const termin = zuTermin(zeile as Record<string, unknown> | null);
  if (!termin) {
    // Nicht "laeuft" oder schon abgeholt: ein doppelter Aufruf. Nichts tun.
    console.warn(`[shop-termine] ${id}: nicht abholbar, übersprungen`);
    return NextResponse.json({ ok: true, uebersprungen: true });
  }

  let ergebnis: TerminErgebnis;
  try {
    ergebnis = await fuehreTerminAus(termin, baueTerminWerkzeug(db, beginn));
  } catch (err) {
    // fuehreTerminAus wirft nicht; das hier ist der Gurt zum Hosenträger.
    ergebnis = {
      ok: false,
      veroeffentlicht: false,
      produkte: [],
      banner: null,
      fehler: `Unerwarteter Fehler: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Den Katalog der Website sofort verfallen lassen: Der nächste Aufruf
  // holt frisch aus WooCommerce, statt bis zu einer Minute (und länger,
  // wenn gerade niemand kommt) den alten Stand zu zeigen. `expire: 0`, weil
  // "max" erst noch einmal den alten Stand ausliefert. /start ist statisch
  // gebaut und braucht den eigenen Anstoß.
  if (ergebnis.veroeffentlicht || ergebnis.produkte.some((p) => p.ok)) {
    try {
      revalidateTag(SHOP_CATALOG_TAG, { expire: 0 });
      revalidatePath("/start");
    } catch (err) {
      console.error("[shop-termine] Cache nicht geleert:", err);
    }
  }

  let mailFehler: string | null = null;
  if (!ergebnis.ok) {
    const mail = fehlermail(termin, ergebnis.fehler ?? "ohne Fehlertext", ergebnis.produkte);
    mailFehler = await mailOderFehler(mail.betreff, mail.text);
  }

  const { error: schreibFehler } = await db
    .from("shop_termine")
    .update({
      status: ergebnis.ok ? "ausgefuehrt" : "fehlgeschlagen",
      erledigt_am: new Date().toISOString(),
      fehler: ergebnis.fehler,
      // Ging die Mail nicht hinaus, bittet der Takt noch einmal darum.
      meldung_offen: !ergebnis.ok && mailFehler !== null,
      ergebnis: {
        produkte: ergebnis.produkte,
        banner: ergebnis.banner,
        dauerMs: Date.now() - beginn,
        mailFehler,
      },
    })
    .eq("id", id)
    .eq("status", "laeuft");

  console.log(
    "[shop-termine]",
    JSON.stringify({ id, titel: termin.titel, ok: ergebnis.ok, fehler: ergebnis.fehler })
  );

  if (schreibFehler) {
    // Der Shop ist geändert, der Stand nicht: der Takt setzt den Termin nach
    // fünf Minuten auf "fehlgeschlagen" und meldet das.
    return NextResponse.json(
      { ok: false, error: `Status nicht geschrieben: ${schreibFehler.message}`, ergebnis },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: ergebnis.ok, ergebnis });
}
