/**
 * UncutTV Abandoned-Cart Email Templates (B2C)
 */

import type { CartItem } from "@/lib/CartContext";
import { parsePrice } from "@/lib/parse-price";
import { formatPrice } from "@/lib/format-price";

export type AbandonedCartLocale = "de" | "en";

export type AbandonedCartEmailData = {
  firstName: string;
  productName: string;
  moreProductsHint: string;
  cartItemsBlock: string;
  cartTotal: string;
  cartTotalWithDiscount: string;
  couponCode?: string;
  expiryDate?: string;
  ctaUrl: string;
};

const FONT_STACK_HEADING = `'Playfair Display', Georgia, 'Times New Roman', serif`;
const FONT_STACK_BODY = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

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

export const ABANDONED_CART_SHOP_URL = "https://uncuttv.at/shop";
export const ABANDONED_CART_CHECKOUT_URL = "https://uncuttv.at/checkout";

export function cartTotalFromItems(items: CartItem[]): number {
  return items.reduce(
    (sum, i) => sum + parsePrice(i.product.price || "0") * i.quantity,
    0
  );
}

export function moreProductsHint(
  itemCount: number,
  locale: AbandonedCartLocale
): string {
  if (itemCount <= 1) return "";
  if (itemCount === 2) {
    return locale === "en" ? "and 1 more" : "und 1 weiteres";
  }
  const n = itemCount - 1;
  return locale === "en" ? `and ${n} more` : `und ${n} weitere`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function buildCartItemsBlockHtml(items: CartItem[]): string {
  const rows = items
    .map(({ product, quantity }) => {
      const image = product.images[0]?.src ?? "";
      const price = parsePrice(product.price || "0");
      const lineTotal = formatPrice(price * quantity);
      const thumb = image
        ? `<img src="${escapeAttr(image)}" alt="" width="80" height="80" style="display:block; width:80px; height:80px; object-fit:cover; background:#1a1a1a;" />`
        : `<div style="width:80px;height:80px;background:#1a1a1a;"></div>`;
      return `
      <tr>
        <td width="96" style="padding:12px 12px 12px 0; vertical-align:top; border-bottom:1px solid ${COLORS.border};">${thumb}</td>
        <td style="padding:12px 8px; vertical-align:top; border-bottom:1px solid ${COLORS.border};">
          <p style="margin:0 0 4px; font-size:14px; font-weight:700; color:${COLORS.textPrimary};">${escapeHtml(product.name)}</p>
          <p style="margin:0; font-size:12px; color:${COLORS.textMuted};">× ${quantity}</p>
        </td>
        <td align="right" style="padding:12px 0 12px 8px; vertical-align:top; border-bottom:1px solid ${COLORS.border}; white-space:nowrap;">
          <p style="margin:0; font-size:14px; font-weight:700; color:${COLORS.redBright};">${lineTotal}</p>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0; background-color:${COLORS.surfaceAlt}; border:1px solid ${COLORS.border};">
      ${rows}
    </table>`;
}

function emailHead(subject: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    a { color: ${COLORS.redBright}; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .pad { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.bg}; font-family:${FONT_STACK_BODY};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background-color:${COLORS.surface}; border:1px solid ${COLORS.border};">`;
}

function emailHeader(): string {
  return `
        <tr>
          <td align="center" class="pad" style="padding:36px 40px 28px; border-bottom:1px solid ${COLORS.border};">
            <div style="font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; letter-spacing:2px; color:${COLORS.textPrimary};">
              UNCUT<span style="color:${COLORS.red};">TV</span>
            </div>
          </td>
        </tr>`;
}

function emailFooter(locale: AbandonedCartLocale): string {
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
                  <a href="${escapeAttr(href)}" style="display:inline-block; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textPrimary}; text-decoration:none;">
                    ${escapeHtml(label)}
                  </a>
                </td>
              </tr>
            </table>`;
}

function wrapEmail(
  subject: string,
  locale: AbandonedCartLocale,
  body: string
): string {
  return `${emailHead(subject)}${emailHeader()}
        <tr>
          <td class="pad" style="padding:40px 40px 32px;">
            ${body}
          </td>
        </tr>
        ${emailFooter(locale)}`;
}

// --- Mail 1 DE ---

export function buildMail1DeSubject(): string {
  return "Da war doch noch was";
}

export function buildMail1DeHtml(d: AbandonedCartEmailData): string {
  const subject = buildMail1DeSubject();
  const hint = d.moreProductsHint
    ? ` ${escapeHtml(d.moreProductsHint)}`
    : "";
  return wrapEmail(
    subject,
    "de",
    `
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">DEIN WARENKORB</p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">Da war doch noch was</h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Hallo ${escapeHtml(d.firstName)},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              du hattest gerade noch was im Warenkorb. <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.productName)}</strong>${hint}.
            </p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Vielleicht hat dich was abgelenkt. Vielleicht wolltest du nur kurz nachdenken wo du das alles in deine Filmsammlung packst. Vielleicht warten deine Sachen einfach nur darauf, abgeholt zu werden.
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Wir halten alles für dich bereit.</p>
            ${d.cartItemsBlock}
            <p style="margin:16px 0 0; font-size:14px; color:${COLORS.textMuted};">Gesamt: <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.cartTotal)}</strong></p>
            ${ctaButton("ZURÜCK ZUM WARENKORB", d.ctaUrl)}
            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">Bis später,<br/><strong style="color:${COLORS.textPrimary};">UncutTV</strong></p>`
  );
}

// --- Mail 1 EN ---

export function buildMail1EnSubject(): string {
  return "Wasn't there something else?";
}

export function buildMail1EnHtml(d: AbandonedCartEmailData): string {
  const subject = buildMail1EnSubject();
  const hint = d.moreProductsHint
    ? ` ${escapeHtml(d.moreProductsHint)}`
    : "";
  return wrapEmail(
    subject,
    "en",
    `
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">YOUR CART</p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">Wasn't there something else?</h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Hi ${escapeHtml(d.firstName)},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              you had something in your cart just now. <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.productName)}</strong>${hint}.
            </p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Maybe something distracted you. Maybe you just needed a moment to think about where to fit it all into your film collection. Maybe your things are just waiting to be picked up.
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">We've kept everything ready for you.</p>
            ${d.cartItemsBlock}
            <p style="margin:16px 0 0; font-size:14px; color:${COLORS.textMuted};">Total: <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.cartTotal)}</strong></p>
            ${ctaButton("BACK TO CART", d.ctaUrl)}
            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">See you soon,<br/><strong style="color:${COLORS.textPrimary};">UncutTV</strong></p>`
  );
}

// --- Mail 2 DE ---

export function buildMail2DeSubject(): string {
  return "Hast du uns vergessen?";
}

export function buildMail2DeHtml(d: AbandonedCartEmailData): string {
  const subject = buildMail2DeSubject();
  const hint = d.moreProductsHint
    ? ` ${escapeHtml(d.moreProductsHint)}`
    : "";
  return wrapEmail(
    subject,
    "de",
    `
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">DEIN WARENKORB · TAG 2</p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">Hast du uns vergessen?</h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Hallo ${escapeHtml(d.firstName)},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              dein <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.productName)}</strong>${hint} wartet noch.
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Ist das was für dich? Wenn ja, dann schnapp dir's bevor's weg ist. Wir wollten dich nur erinnern.
            </p>
            ${d.cartItemsBlock}
            <p style="margin:16px 0 0; font-size:14px; color:${COLORS.textMuted};">Gesamt: <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.cartTotal)}</strong></p>
            ${ctaButton("BESTELLUNG ABSCHLIESSEN", d.ctaUrl)}
            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">Du weißt wo wir sind. <strong style="color:${COLORS.textPrimary};">UncutTV</strong></p>`
  );
}

// --- Mail 2 EN ---

export function buildMail2EnSubject(): string {
  return "Did you forget about us?";
}

export function buildMail2EnHtml(d: AbandonedCartEmailData): string {
  const subject = buildMail2EnSubject();
  const hint = d.moreProductsHint
    ? ` ${escapeHtml(d.moreProductsHint)}`
    : "";
  return wrapEmail(
    subject,
    "en",
    `
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">YOUR CART · DAY 2</p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">Did you forget about us?</h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Hi ${escapeHtml(d.firstName)},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              your <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.productName)}</strong>${hint} is still waiting.
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Is this for you? If yes, grab it before it's gone. Just wanted to remind you.
            </p>
            ${d.cartItemsBlock}
            <p style="margin:16px 0 0; font-size:14px; color:${COLORS.textMuted};">Total: <strong style="color:${COLORS.textPrimary};">${escapeHtml(d.cartTotal)}</strong></p>
            ${ctaButton("COMPLETE YOUR ORDER", d.ctaUrl)}
            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">You know where to find us. <strong style="color:${COLORS.textPrimary};">UncutTV</strong></p>`
  );
}

// --- Mail 3 DE ---

export function buildMail3DeSubject(): string {
  return "10% auf deinen Warenkorb — 24 Stunden gültig";
}

export function buildMail3DeHtml(d: AbandonedCartEmailData): string {
  const subject = buildMail3DeSubject();
  const code = d.couponCode ?? "";
  const expiry = d.expiryDate ?? "";
  return wrapEmail(
    subject,
    "de",
    `
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">EXKLUSIVER RABATT · 24 STUNDEN</p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">Dein persönlicher Rabattcode</h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Hallo ${escapeHtml(d.firstName)},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              deine Bestellung ist nach wie vor unvollständig — wir haben deshalb einen Rabatt für dich vorbereitet.
            </p>
            <p style="margin:0 0 12px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};"><strong style="color:${COLORS.textPrimary};">Dein persönlicher Code:</strong></p>
            <p style="margin:0 0 24px; font-family:'Courier New', monospace; font-size:28px; font-weight:700; letter-spacing:3px; color:${COLORS.redBright}; text-align:center; padding:16px; background:${COLORS.surfaceAlt}; border:1px solid ${COLORS.border};">${escapeHtml(code)}</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              <strong style="color:${COLORS.textPrimary};">10% Rabatt auf deinen aktuellen Warenkorb. Gültig bis ${escapeHtml(expiry)} um 23:59 Uhr.</strong>
            </p>
            <p style="margin:0 0 20px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Der Code ist einmalig einlösbar und an deine E-Mail-Adresse gebunden. Mindestbestellwert: €30. Nach Ablauf der 24 Stunden verliert er seine Gültigkeit — danach gilt der reguläre Preis.
            </p>
            ${d.cartItemsBlock}
            <p style="margin:16px 0 0; font-size:14px; color:${COLORS.textMuted};">
              Gesamt: <span style="text-decoration:line-through;">${escapeHtml(d.cartTotal)}</span>
              &nbsp;→&nbsp; <strong style="color:${COLORS.redBright};">${escapeHtml(d.cartTotalWithDiscount)}</strong> mit Code
            </p>
            ${ctaButton("CODE EINLÖSEN UND BESTELLEN", d.ctaUrl)}
            <p style="margin:24px 0 0; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">Bei Fragen kannst du jederzeit auf diese E-Mail antworten.</p>
            <p style="margin:20px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">Beste Grüße,<br/><strong style="color:${COLORS.textPrimary};">Dein UncutTV-Team</strong></p>`
  );
}

// --- Mail 3 EN ---

export function buildMail3EnSubject(): string {
  return "10% off your cart — valid for 24 hours";
}

export function buildMail3EnHtml(d: AbandonedCartEmailData): string {
  const subject = buildMail3EnSubject();
  const code = d.couponCode ?? "";
  const expiry = d.expiryDate ?? "";
  return wrapEmail(
    subject,
    "en",
    `
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">EXCLUSIVE DISCOUNT · 24 HOURS</p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">Your personal discount code</h1>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">Hi ${escapeHtml(d.firstName)},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              your order is still incomplete — that's why we've prepared a discount for you.
            </p>
            <p style="margin:0 0 12px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};"><strong style="color:${COLORS.textPrimary};">Your personal code:</strong></p>
            <p style="margin:0 0 24px; font-family:'Courier New', monospace; font-size:28px; font-weight:700; letter-spacing:3px; color:${COLORS.redBright}; text-align:center; padding:16px; background:${COLORS.surfaceAlt}; border:1px solid ${COLORS.border};">${escapeHtml(code)}</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              <strong style="color:${COLORS.textPrimary};">10% off your current cart. Valid until ${escapeHtml(expiry)} at 23:59.</strong>
            </p>
            <p style="margin:0 0 20px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              The code is single-use and tied to your email address. Minimum order value: €30. After 24 hours it expires — then regular prices apply.
            </p>
            ${d.cartItemsBlock}
            <p style="margin:16px 0 0; font-size:14px; color:${COLORS.textMuted};">
              Total: <span style="text-decoration:line-through;">${escapeHtml(d.cartTotal)}</span>
              &nbsp;→&nbsp; <strong style="color:${COLORS.redBright};">${escapeHtml(d.cartTotalWithDiscount)}</strong> with code
            </p>
            ${ctaButton("REDEEM CODE AND ORDER", d.ctaUrl)}
            <p style="margin:24px 0 0; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">Feel free to reply to this email if you have questions.</p>
            <p style="margin:20px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">Best regards,<br/><strong style="color:${COLORS.textPrimary};">The UncutTV Team</strong></p>`
  );
}

export type AbandonedCartMailBundle = {
  subject: () => string;
  html: (d: AbandonedCartEmailData) => string;
};

export const ABANDONED_CART_TEMPLATES: {
  mail1De: AbandonedCartMailBundle;
  mail1En: AbandonedCartMailBundle;
  mail2De: AbandonedCartMailBundle;
  mail2En: AbandonedCartMailBundle;
  mail3De: AbandonedCartMailBundle;
  mail3En: AbandonedCartMailBundle;
} = {
  mail1De: { subject: buildMail1DeSubject, html: buildMail1DeHtml },
  mail1En: { subject: buildMail1EnSubject, html: buildMail1EnHtml },
  mail2De: { subject: buildMail2DeSubject, html: buildMail2DeHtml },
  mail2En: { subject: buildMail2EnSubject, html: buildMail2EnHtml },
  mail3De: { subject: buildMail3DeSubject, html: buildMail3DeHtml },
  mail3En: { subject: buildMail3EnSubject, html: buildMail3EnHtml },
};
