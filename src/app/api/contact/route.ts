import { NextResponse } from "next/server";

interface ContactBody {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
}

export async function POST(request: Request) {
  try {
    const { firstName, lastName, email, subject, message } =
      (await request.json()) as ContactBody;

    if (!firstName || !lastName || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Alle Felder sind erforderlich." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key") {
      console.log("[Contact] No Resend API key, logging message:");
      console.log({ firstName, lastName, email, subject, message });
      return NextResponse.json({ success: true });
    }

    const emailSubject = `[Kontakt] ${subject} - ${firstName} ${lastName}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #c0392b; border-left: 4px solid #c0392b; padding-left: 12px;">
          Neue Kontaktanfrage
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 120px;">Name:</td>
            <td style="padding: 8px 0;">${firstName} ${lastName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">E-Mail:</td>
            <td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Betreff:</td>
            <td style="padding: 8px 0;">${subject}</td>
          </tr>
        </table>
        <h3 style="margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Nachricht:</h3>
        <p style="white-space: pre-wrap; line-height: 1.6;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #888;">Gesendet über uncuttv.at Kontaktformular</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "UncutTV Kontakt <kontakt@uncuttv.at>",
        to: ["office@uncuttv.at"],
        reply_to: email,
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Contact] Resend API error:", res.status, errBody.slice(0, 300));
      return NextResponse.json(
        { error: "Nachricht konnte nicht gesendet werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Contact] Error:", error);
    const message =
      error instanceof Error ? error.message : "Senden fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
