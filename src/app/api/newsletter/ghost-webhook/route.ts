import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { NEWSLETTER_LABEL } from "@/lib/newsletter";
import { sendWelcomeEmail } from "@/lib/newsletter-welcome-mail";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * POST /api/newsletter/ghost-webhook -- Ghost ruft hier bei "member.added".
 *
 * Erst wenn jemand den Bestätigungslink geklickt hat, legt Ghost das
 * Mitglied an und feuert diesen Webhook. Trägt das Mitglied das Label
 * "shop-subscriber", geht die Willkommensmail mit WELCOME10 raus.
 *
 * Signatur: Ghost schickt "X-Ghost-Signature: sha256=<hmac>, t=<ms>", der
 * HMAC-SHA256 mit dem Webhook-Secret (GHOST_WEBHOOK_SECRET) über
 * Rohkörper + Zeitstempel. Ohne gültige Signatur passiert nichts.
 *
 * Doppelte Zustellung: Ghost wartet nur 2 Sekunden auf die Antwort und
 * wiederholt bis zu fünfmal. Deshalb antwortet die Route sofort und
 * verschickt die Mail danach (after), und vor dem Versand wird die
 * Mitgliedskennung in shop_newsletter_welcome_log eingetragen; ein zweiter
 * Eintrag scheitert an der Eindeutigkeit, und die Mail bleibt aus.
 */

type GhostMember = {
  id?: unknown;
  email?: unknown;
  labels?: unknown;
};

function signatureValid(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const sig = /sha256=([a-f0-9]+)/i.exec(header)?.[1];
  const ts = /t=(\d+)/.exec(header)?.[1];
  if (!sig || !ts) return false;
  // Mehr als zehn Minuten alt: nicht mehr gültig, auch wenn der HMAC stimmt.
  if (Math.abs(Date.now() - Number(ts)) > 10 * 60_000) return false;

  const expected = createHmac("sha256", secret).update(`${raw}${ts}`).digest("hex");
  const a = Buffer.from(sig.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasShopLabel(labels: unknown): boolean {
  if (!Array.isArray(labels)) return false;
  return labels.some((label) => {
    const name =
      typeof label === "string"
        ? label
        : label && typeof label === "object"
          ? String((label as { name?: unknown; slug?: unknown }).name ?? (label as { slug?: unknown }).slug ?? "")
          : "";
    return name.toLowerCase() === NEWSLETTER_LABEL;
  });
}

/** true, wenn diese Kennung neu ist; false, wenn die Mail schon einmal raus ist oder gerade rausgeht. */
async function claimWelcome(memberId: string, email: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[Newsletter] Supabase nicht konfiguriert, Willkommensmail ohne Doppelschutz");
    return true;
  }
  const { error } = await supabase
    .from("shop_newsletter_welcome_log")
    .insert({ ghost_member_id: memberId, email });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[Newsletter] Welcome-Log:", error.message);
  // Lieber eine Mail zu viel als gar keine? Nein: ohne Log kein Versand,
  // sonst schickt jede Wiederholung von Ghost die Mail noch einmal.
  return false;
}

export async function POST(request: Request) {
  const secret = process.env.GHOST_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[Newsletter] GHOST_WEBHOOK_SECRET fehlt");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get("x-ghost-signature"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let member: GhostMember | null = null;
  try {
    const payload = JSON.parse(raw) as { member?: { current?: GhostMember } };
    member = payload.member?.current ?? null;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const memberId = typeof member?.id === "string" ? member.id : "";
  const email = typeof member?.email === "string" ? member.email.trim().toLowerCase() : "";

  // Alles andere (andere Labels, Import im Backend, unvollständige Daten)
  // wird bestätigt und ignoriert.
  if (!memberId || !email || !hasShopLabel(member?.labels)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  after(async () => {
    if (await claimWelcome(memberId, email)) {
      await sendWelcomeEmail(email);
    }
  });

  return NextResponse.json({ ok: true });
}
