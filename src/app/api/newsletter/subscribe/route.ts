import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const GHOST_API_URL = process.env.GHOST_API_URL;
const GHOST_ADMIN_API_KEY = process.env.GHOST_ADMIN_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const WOO_AUTH =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WELCOME-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createGhostToken(): string | null {
  if (!GHOST_ADMIN_API_KEY) return null;
  const parts = GHOST_ADMIN_API_KEY.split(":");
  const id = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  const secret = parts[parts.length - 1];
  if (!id || !secret) return null;

  const iat = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat, exp: iat + 5 * 60, aud: "/admin/" },
    Buffer.from(secret, "hex"),
    { algorithm: "HS256", header: { alg: "HS256", kid: id, typ: "JWT" } }
  );
}

async function createWooCoupon(email: string): Promise<string | null> {
  const code = generateCode();
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  try {
    const res = await fetch(`${WOO_URL}/wp-json/wc/v3/coupons`, {
      method: "POST",
      headers: {
        Authorization: WOO_AUTH,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        discount_type: "percent",
        amount: "10",
        individual_use: true,
        usage_limit: 1,
        usage_limit_per_user: 1,
        email_restrictions: [email],
        date_expires: expiryDate,
        description: `Newsletter Willkommensrabatt für ${email}`,
      }),
    });

    if (res.ok) {
      console.log("[Newsletter] WooCommerce coupon created:", code);
      return code;
    }
    const err = await res.text();
    console.error("[Newsletter] WooCommerce coupon error:", res.status, err.slice(0, 200));
    return null;
  } catch (err) {
    console.error("[Newsletter] Failed to create coupon:", err);
    return null;
  }
}

async function sendWelcomeEmail(email: string, couponCode: string) {
  if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key") return;

  const html = `
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#0a0a0a;color:#fff;padding:40px 32px;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:0.05em;margin:0;">
        <span style="color:#fff;">UNCUT</span><span style="color:#c0392b;">TV</span>
      </h1>
      <p style="color:#888;font-size:14px;margin-top:8px;">Europas kompromissloseste Horror-Plattform.</p>

      <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />

      <p style="font-size:16px;line-height:1.6;color:#ccc;">
        Danke für deine Anmeldung zum UncutTV Newsletter!
        Hier ist dein persönlicher Rabattcode für <strong style="color:#fff;">10% auf deine erste Bestellung</strong>:
      </p>

      <div style="margin:32px 0;text-align:center;padding:24px;border:2px solid #c0392b;background:#111;">
        <p style="font-size:12px;color:#888;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.15em;">Dein persönlicher Rabattcode</p>
        <p style="font-size:32px;font-weight:900;color:#c0392b;margin:0;letter-spacing:0.1em;">${couponCode}</p>
        <p style="font-size:11px;color:#555;margin:8px 0 0;">Einmalig gültig · 30 Tage · Nur für ${email}</p>
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
        Du erhältst diese E-Mail, weil du dich für den UncutTV Newsletter angemeldet hast.
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
    } else {
      const err = await res.text();
      console.error("[Newsletter] Resend error:", res.status, err.slice(0, 200));
    }
  } catch (err) {
    console.error("[Newsletter] Failed to send welcome email:", err);
  }
}

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }

    // Subscribe to Ghost
    let isNewSubscriber = false;

    if (GHOST_API_URL && GHOST_ADMIN_API_KEY) {
      const token = createGhostToken();
      if (token) {
        const res = await fetch(
          `${GHOST_API_URL}/ghost/api/admin/members/`,
          {
            method: "POST",
            headers: {
              Authorization: `Ghost ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              members: [
                { email, subscribed: true, labels: [{ name: "shop-subscriber" }] },
              ],
            }),
          }
        );

        if (res.ok) {
          isNewSubscriber = true;
          console.log("[Newsletter] New subscriber:", email);
        } else if (res.status === 409 || res.status === 422) {
          console.log("[Newsletter] Already subscribed:", email);
          return NextResponse.json({
            success: false,
            alreadySubscribed: true,
            error: "Du bist bereits angemeldet.",
          });
        }
      }
    } else {
      // Ghost not configured — treat as new subscriber for coupon generation
      isNewSubscriber = true;
    }

    if (!isNewSubscriber) {
      return NextResponse.json({ success: true });
    }

    // Create unique WooCommerce coupon
    const couponCode = await createWooCoupon(email);

    // Send welcome email with the unique code
    if (couponCode) {
      await sendWelcomeEmail(email, couponCode);
    }

    return NextResponse.json({
      success: true,
      couponCode: couponCode || null,
    });
  } catch (error) {
    console.error("[Newsletter] Error:", error);
    return NextResponse.json(
      { error: "Anmeldung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
