/**
 * GET /api/cron/reservierung-aufraeumen  (Vercel Cron, alle 5 Minuten)
 *
 * Stößt in WordPress das Zurückbuchen abgelaufener Einzelstück-
 * Reservierungen an (docs/wordpress/uncuttv-kasse.php, Stand 2). Ohne
 * diesen Lauf käme abgelaufener Bestand erst zurück, wenn der nächste
 * Kunde reserviert. Unbezahlte Vorkasse-Bestellungen, deren Frist um ist,
 * storniert WordPress dabei.
 *
 * Auth wie die anderen Crons: Authorization: Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { raeumeReservierungenAuf } from "@/lib/reservierung";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // Läuft auch bei EINZELSTUECK_RESERVIERUNG=aus weiter: Reservierungen von
  // vor dem Abschalten müssen noch ablaufen, sonst bliebe ihr Bestand weg.
  try {
    const ergebnis = await raeumeReservierungenAuf();
    console.log("[reservierung-aufraeumen]", JSON.stringify(ergebnis));
    return NextResponse.json({ ok: true, ergebnis });
  } catch (err) {
    console.error("[reservierung-aufraeumen]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
