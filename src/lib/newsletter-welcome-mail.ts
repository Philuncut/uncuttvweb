/**
 * Die Willkommensmail mit dem Rabattcode WELCOME10. Bis Oktober 2026 ging
 * sie sofort bei der Anmeldung raus; seit dem Double-Opt-in schickt sie der
 * Ghost-Webhook member.added (api/newsletter/ghost-webhook), also erst, wenn
 * die Person die Anmeldung bestätigt hat.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export function welcomeMailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && RESEND_API_KEY !== "your_resend_api_key");
}

export async function sendWelcomeEmail(email: string): Promise<boolean> {
  if (!welcomeMailConfigured()) return false;

  const html = `
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#0a0a0a;color:#fff;padding:40px 32px;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:0.05em;margin:0;">
        <span style="color:#fff;">UNCUT</span><span style="color:#c0392b;">TV</span>
      </h1>
      <p style="color:#888;font-size:14px;margin-top:8px;">Europas kompromissloseste Horror-Plattform.</p>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:16px;line-height:1.6;color:#ccc;">
        Danke, dass du deine Anmeldung zum UncutTV Newsletter bestätigt hast!
        Hier ist dein Rabattcode für <strong style="color:#fff;">10% auf deine erste Bestellung</strong>:
      </p>

      <div style="margin:32px 0;text-align:center;padding:24px;border:2px solid #c0392b;background:#111;">
        <p style="font-size:12px;color:#888;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.15em;">Dein Rabattcode</p>
        <p style="font-size:32px;font-weight:900;color:#c0392b;margin:0;letter-spacing:0.1em;">WELCOME10</p>
        <p style="font-size:11px;color:#555;margin:8px 0 0;">Einmal pro Kunde gültig · Beim Checkout einlösbar auf uncuttv.at</p>
      </div>

      <p style="font-size:14px;line-height:1.6;color:#888;">
        Gib den Code beim Checkout ein und spare sofort 10%.
      </p>

      <a href="https://uncuttv.at/shop"
         style="display:block;margin:32px 0 16px;padding:14px 24px;background:#c0392b;color:#fff;text-align:center;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:0.1em;">
        JETZT STÖBERN →
      </a>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:11px;color:#555;line-height:1.5;">
        UncutTV GmbH · Kalchgruben 4/11 · 6094 Axams · Österreich<br/>
        Du erhältst diese E-Mail, weil du dich für den UncutTV Newsletter angemeldet und die Anmeldung bestätigt hast.
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "UncutTV <office@uncuttv.at>",
        to: [email],
        subject: "Dein 10% Rabattcode für UncutTV",
        html,
      }),
    });

    if (res.ok) {
      console.log("[Newsletter] Welcome email sent to:", email);
      return true;
    }
    const err = await res.text();
    console.error("[Newsletter] Resend error:", res.status, err.slice(0, 200));
    return false;
  } catch (err) {
    console.error("[Newsletter] Failed to send welcome email:", err);
    return false;
  }
}
