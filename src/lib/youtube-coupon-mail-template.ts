/**
 * Email template for YouTube subscriber 10% coupon.
 * Follows the same structure as abandoned-cart-templates.ts.
 */

type Locale = "de" | "en";

const FONT_HEADING = `'Playfair Display', Georgia, 'Times New Roman', serif`;
const FONT_BODY = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
const COLORS = {
  bg: "#0a0a0a",
  surface: "#111111",
  surfaceAlt: "#1a1a1a",
  border: "#2a2a2a",
  red: "#c0392b",
  redBright: "#e84040",
  textPrimary: "#ffffff",
  textSecondary: "#cccccc",
  textMuted: "#888888",
};

const SHOP_URL = "https://uncuttv.at/shop";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function head(subject: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    a { color:${COLORS.redBright}; text-decoration:none; }
    @media only screen and (max-width:600px) {
      .container { width:100% !important; }
      .pad { padding:24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.bg}; font-family:${FONT_BODY};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background-color:${COLORS.surface}; border:1px solid ${COLORS.border};">`;
}

function header(): string {
  return `
        <tr>
          <td align="center" class="pad" style="padding:36px 40px 28px; border-bottom:1px solid ${COLORS.border};">
            <div style="font-family:${FONT_HEADING}; font-size:28px; font-weight:900; letter-spacing:2px; color:${COLORS.textPrimary};">
              UNCUT<span style="color:${COLORS.red};">TV</span>
            </div>
          </td>
        </tr>`;
}

function footer(locale: Locale): string {
  const auto =
    locale === "en"
      ? "This email was sent automatically. Replies go directly to our team."
      : "Diese Mail wurde automatisch generiert. Antworten gehen direkt an unser Team.";
  return `
        <tr>
          <td class="pad" style="padding:32px 40px; background-color:${COLORS.surfaceAlt}; border-top:1px solid ${COLORS.border};">
            <p style="margin:0 0 8px; font-size:12px; line-height:1.6; color:${COLORS.textMuted};">
              UncutTV GmbH &middot; Kalchgruben 4/11 &middot; 6094 Axams &middot; Austria<br/>
              ATU 81526957 &middot; <a href="mailto:office@uncuttv.at" style="color:${COLORS.textMuted}; text-decoration:underline;">office@uncuttv.at</a>
            </p>
            <p style="margin:12px 0 0; font-size:11px; line-height:1.5; color:${COLORS.textMuted};">${auto}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
              <tr>
                <td style="background-color:${COLORS.red};">
                  <a href="${esc(href)}" style="display:inline-block; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textPrimary}; text-decoration:none;">
                    ${esc(label)}
                  </a>
                </td>
              </tr>
            </table>`;
}

export type YouTubeCouponMailData = {
  couponCode: string;
  expiryDate: string;
  locale: Locale;
};

export function youtubeCouponMailSubject(locale: Locale): string {
  return locale === "en"
    ? "Your 10% discount code for UncutTV"
    : "Dein 10% Rabatt-Code für UncutTV";
}

export function youtubeCouponMailHtml(data: YouTubeCouponMailData): string {
  const { couponCode, expiryDate, locale } = data;
  const subject = youtubeCouponMailSubject(locale);
  const redeemUrl = `${SHOP_URL}?coupon=${encodeURIComponent(couponCode)}`;

  const body =
    locale === "en"
      ? `
            <p style="margin:0 0 16px; font-size:18px; font-weight:700; color:${COLORS.textPrimary}; font-family:${FONT_HEADING};">
              Your 10% discount code
            </p>
            <p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:${COLORS.textSecondary};">
              Thank you for being part of the UncutTV community! Here&rsquo;s your personal discount code &mdash; valid on any order in our shop.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:24px; background-color:${COLORS.surfaceAlt}; border:1px solid ${COLORS.border};">
                  <p style="margin:0 0 8px; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textMuted};">Your code</p>
                  <p style="margin:0; font-size:28px; font-weight:900; letter-spacing:4px; color:${COLORS.redBright}; font-family:${FONT_HEADING};">${esc(couponCode)}</p>
                  <p style="margin:8px 0 0; font-size:12px; color:${COLORS.textMuted};">Valid until ${esc(expiryDate)} &middot; Single use &middot; Email-restricted</p>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              The code is already linked to this email address and can only be used once.
            </p>
            ${ctaButton("Redeem now", redeemUrl)}`
      : `
            <p style="margin:0 0 16px; font-size:18px; font-weight:700; color:${COLORS.textPrimary}; font-family:${FONT_HEADING};">
              Dein 10% Rabatt-Code
            </p>
            <p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:${COLORS.textSecondary};">
              Danke, dass du Teil der UncutTV-Community bist! Hier ist dein persönlicher Rabattcode &mdash; gültig auf jede Bestellung in unserem Shop.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:24px; background-color:${COLORS.surfaceAlt}; border:1px solid ${COLORS.border};">
                  <p style="margin:0 0 8px; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textMuted};">Dein Code</p>
                  <p style="margin:0; font-size:28px; font-weight:900; letter-spacing:4px; color:${COLORS.redBright}; font-family:${FONT_HEADING};">${esc(couponCode)}</p>
                  <p style="margin:8px 0 0; font-size:12px; color:${COLORS.textMuted};">Gültig bis ${esc(expiryDate)} &middot; Einmalverwendung &middot; Email-gebunden</p>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Der Code ist bereits mit dieser Email-Adresse verknüpft und kann nur einmal eingelöst werden.
            </p>
            ${ctaButton("Jetzt einlösen", redeemUrl)}`;

  return `${head(subject)}${header()}
        <tr>
          <td class="pad" style="padding:40px 40px 32px;">
            ${body}
          </td>
        </tr>
        ${footer(locale)}`;
}
