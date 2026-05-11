import { NextResponse } from "next/server";
import type { HaendlerAnfrageBody } from "@/types/haendlerAnfrage";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DOMAIN_PATTERN =
  /^(https?:\/\/)?(www\.)?[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}([\/\?#].*)?$/;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWebsiteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function validateBody(body: Partial<HaendlerAnfrageBody>): string | null {
  const requiredFields: Array<keyof HaendlerAnfrageBody> = [
    "firmenname",
    "vorname",
    "nachname",
    "email",
    "telefon",
    "land",
    "adresse",
    "uid",
    "website",
    "verkaufskanal",
  ];

  for (const field of requiredFields) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      return "Bitte alle Pflichtfelder ausfüllen.";
    }
  }

  if (!isValidEmail(body.email!)) {
    return "Ungültige E-Mail-Adresse.";
  }

  if (!DOMAIN_PATTERN.test(body.website!)) {
    return "Bitte gib eine gültige Domain ein (z.B. example.de oder www.example.com).";
  }

  return null;
}

async function sendInternalEmail(payload: HaendlerAnfrageBody) {
  const fullName = `${payload.vorname} ${payload.nachname}`;
  const subject = `[Händler-Anfrage] ${payload.firmenname} - ${fullName}`;

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="color-scheme" content="dark light">
        <meta name="supported-color-schemes" content="dark light">
      </head>
      <body style="margin:0;padding:0;background:#0a0a0a !important;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a !important;">
          <tr>
            <td align="center" style="padding:24px;">
              <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:680px;background:#0a0a0a !important;border:1px solid #222;">
                <tr>
                  <td style="padding:24px;">
                    <h2 style="margin:0 0 16px 0;font-size:24px;font-weight:900;letter-spacing:0.05em;color:#ffffff !important;">
                      <span style="color:#ffffff !important;">UNCUT</span><span style="color:#c0392b !important;">TV</span> Händler-Anfrage
                    </h2>
                    <p style="margin:0 0 18px 0;line-height:1.6;color:#ffffff !important;">
                      Neue Bewerbung als autorisierter Fachhändler.
                    </p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#111 !important;border:1px solid #333;">
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;width:40%;">Firmenname</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.firmenname)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">Ansprechpartner Vorname</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.vorname)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">Ansprechpartner Nachname</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.nachname)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">E-Mail</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;"><a href="mailto:${escapeHtml(payload.email)}" style="color:#c0392b !important;">${escapeHtml(payload.email)}</a></td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">Telefon</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.telefon)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">Land</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.land)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">Adresse</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.adresse)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">UID-Nummer</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;">${escapeHtml(payload.uid)}</td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #222;">Website / Online-Shop</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;border-bottom:1px solid #222;"><a href="${escapeHtml(payload.website)}" style="color:#c0392b !important;">${escapeHtml(payload.website)}</a></td></tr>
                      <tr><td style="padding:12px 16px;color:#ffffff !important;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Verkaufskanal</td><td style="padding:12px 16px;color:#ffffff !important;font-size:15px;">${escapeHtml(payload.verkaufskanal)}</td></tr>
                    </table>

                    <p style="margin:18px 0 0;font-size:12px;color:#ffffff !important;">
                      Antworten an: <a href="mailto:${escapeHtml(payload.email)}" style="color:#c0392b !important;">${escapeHtml(payload.email)}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "UncutTV Kontakt <kontakt@uncuttv.at>",
      to: ["office@uncuttv.at"],
      reply_to: payload.email,
      subject,
      html,
    }),
  });
}

async function sendApplicantConfirmation(payload: HaendlerAnfrageBody) {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="color-scheme" content="dark light">
        <meta name="supported-color-schemes" content="dark light">
      </head>
      <body style="margin:0;padding:0;background:#0a0a0a !important;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a !important;">
          <tr>
            <td align="center" style="padding:24px;">
              <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#0a0a0a !important;border:1px solid #222;">
                <tr>
                  <td style="padding:40px 32px;font-family:Arial,Helvetica,sans-serif;">
                    <h1 style="font-size:28px;font-weight:900;letter-spacing:0.05em;margin:0;color:#ffffff !important;">
                      <span style="color:#ffffff !important;">UNCUT</span><span style="color:#c0392b !important;">TV</span>
                    </h1>
                    <p style="font-size:14px;margin-top:8px;color:#ffffff !important;">Europas kompromissloseste Horror-Plattform.</p>
                    <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#111 !important;border:1px solid #333;">
                      <tr>
                        <td style="padding:16px;color:#ffffff !important;font-size:16px;line-height:1.7;">
                          Hallo ${escapeHtml(payload.vorname)},<br/><br/>
                          wir haben deine Händler-Anfrage erhalten. Wir melden uns innerhalb von 48 Stunden.<br/><br/>
                          — Dein UncutTV Team
                        </td>
                      </tr>
                    </table>

                    <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
                    <p style="font-size:11px;line-height:1.5;color:#ffffff !important;">
                      UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "UncutTV Kontakt <kontakt@uncuttv.at>",
      to: [payload.email],
      subject: "Deine Händler-Anfrage bei UncutTV",
      html,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<HaendlerAnfrageBody>;
    const error = validateBody(body);

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    const payload: HaendlerAnfrageBody = {
      firmenname: body.firmenname!.trim(),
      vorname: body.vorname!.trim(),
      nachname: body.nachname!.trim(),
      email: body.email!.trim(),
      telefon: body.telefon!.trim(),
      land: body.land!.trim(),
      adresse: body.adresse!.trim(),
      uid: body.uid!.trim(),
      website: normalizeWebsiteUrl(body.website!.trim()),
      verkaufskanal: body.verkaufskanal!.trim() as HaendlerAnfrageBody["verkaufskanal"],
    };

    if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key") {
      console.log("[Haendler-Anfrage] RESEND_API_KEY missing - request logged only.");
      console.log(payload);
      return NextResponse.json({ success: true });
    }

    const [internalRes, applicantRes] = await Promise.all([
      sendInternalEmail(payload),
      sendApplicantConfirmation(payload),
    ]);

    if (!internalRes.ok || !applicantRes.ok) {
      const internalError = internalRes.ok ? "" : await internalRes.text();
      const applicantError = applicantRes.ok ? "" : await applicantRes.text();
      console.error("[Haendler-Anfrage] Resend error", {
        internalStatus: internalRes.status,
        applicantStatus: applicantRes.status,
        internalError: internalError.slice(0, 300),
        applicantError: applicantError.slice(0, 300),
      });
      return NextResponse.json(
        { success: false, error: "Anfrage konnte nicht gesendet werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Haendler-Anfrage] Error:", err);
    return NextResponse.json(
      { success: false, error: "Anfrage konnte nicht gesendet werden." },
      { status: 500 }
    );
  }
}
