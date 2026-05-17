import { NextResponse } from "next/server";

interface FilmmakerBody {
  name: string;
  email: string;
  filmTitle: string;
  message: string;
}

export async function POST(request: Request) {
  try {
    const { name, email, filmTitle, message } =
      (await request.json()) as FilmmakerBody;

    if (!name || !email || !filmTitle || !message) {
      return NextResponse.json(
        { ok: false, error: "Alle Felder sind erforderlich." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key") {
      console.log("[filmmaker-submission] No Resend API key — logging submission:");
      console.log({ name, email, filmTitle, message });
      return NextResponse.json({ ok: true });
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #c0392b; border-left: 4px solid #c0392b; padding-left: 12px;">
          Neue Filmeinreichung
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 120px;">Name:</td>
            <td style="padding: 8px 0;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Email:</td>
            <td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Filmtitel:</td>
            <td style="padding: 8px 0;">${filmTitle}</td>
          </tr>
        </table>
        <h3 style="margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Nachricht:</h3>
        <p style="white-space: pre-wrap; line-height: 1.6;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #888;">Gesendet über uncuttv.at — Filmeinreichung</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "UncutTV Website <kontakt@uncuttv.at>",
        to: ["office@uncuttv.at"],
        reply_to: email,
        subject: `Filmeinreichung: ${filmTitle} – ${name}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[filmmaker-submission] Resend error:", res.status, errBody.slice(0, 300));
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[filmmaker-submission] Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
