/**
 * UncutTV Wholesale Bank-Order Reminder Email Templates
 *
 * Vier HTML-Templates für den 14-Tage-Reminder-Workflow:
 * - Tag 7  → Reminder 1 (sanft)
 * - Tag 12 → Reminder 2 (dringender)
 * - Tag 13 → Reminder 3 (letzte Warnung)
 * - Tag 14 → Storno-Bestätigung
 *
 * Alle Templates verwenden Inline-CSS und Tabellen-Layout für
 * Outlook/Gmail/Apple Mail Kompatibilität.
 *
 * Styling: UncutTV-DNA (dunkel, rot #c0392b, Playfair Display + DM Sans).
 * Web-Fonts werden via Google Fonts geladen mit System-Font-Fallback.
 */

export type ReminderEmailData = {
  orderId: number;
  orderDate: string;         // Format: "15.05.2026"
  orderTotal: string;        // Format: "€ 1.234,56"
  greeting: string;          // "Hallo Max," | "Hallo zusammen," | "Guten Tag,"
  iban: string;              // aus UNCUTTV_BANK_IBAN env
  bic: string;               // aus UNCUTTV_BANK_BIC env
  deadlineDate?: string;     // Tag 12: Spätestes Zahlungsdatum (Format: "27.05.2026")
  cancelDate?: string;       // Tag 12/13: Storno-Datum
  haendlerUrl: string;       // immer "https://uncuttv.at/haendler"
};

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

const FONT_STACK_HEADING = `'Playfair Display', Georgia, 'Times New Roman', serif`;
const FONT_STACK_BODY = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

const COLORS = {
  bg: '#0a0a0a',
  surface: '#111111',
  surfaceAlt: '#1a1a1a',
  border: '#2a2a2a',
  red: '#c0392b',
  redBright: '#e84040',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  textMuted: '#888888',
};

function emailHead(subject: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no" />
  <title>${subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    a { color: ${COLORS.redBright}; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .pad { padding: 24px 20px !important; }
      .order-table td { display: block !important; width: 100% !important; padding: 4px 0 !important; }
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

function emailFooter(): string {
  return `
        <tr>
          <td class="pad" style="padding:32px 40px; background-color:${COLORS.surfaceAlt}; border-top:1px solid ${COLORS.border};">
            <p style="margin:0 0 8px; font-size:12px; line-height:1.6; color:${COLORS.textMuted};">
              UncutTV GmbH &middot; Kalchgruben 4/11 &middot; 6094 Axams &middot; Austria<br/>
              ATU 81526957 &middot; <a href="mailto:office@uncuttv.at" style="color:${COLORS.textMuted}; text-decoration:underline;">office@uncuttv.at</a>
            </p>
            <p style="margin:12px 0 0; font-size:11px; line-height:1.5; color:${COLORS.textMuted};">
              Diese Mail wurde automatisch generiert. Antworten gehen direkt an unser Team.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function bankBlock(d: ReminderEmailData): string {
  return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.surfaceAlt}; border-left:3px solid ${COLORS.red}; margin:24px 0;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">
                    Bankverbindung
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px; line-height:1.7; color:${COLORS.textSecondary};">
                    <tr>
                      <td width="120" style="padding:4px 0; color:${COLORS.textMuted};">Empfänger</td>
                      <td style="padding:4px 0; color:${COLORS.textPrimary};">UncutTV GmbH</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0; color:${COLORS.textMuted};">IBAN</td>
                      <td style="padding:4px 0; color:${COLORS.textPrimary}; font-family:'Courier New', monospace;">${d.iban}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0; color:${COLORS.textMuted};">BIC</td>
                      <td style="padding:4px 0; color:${COLORS.textPrimary}; font-family:'Courier New', monospace;">${d.bic}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0; color:${COLORS.textMuted};">Verwendungszweck</td>
                      <td style="padding:4px 0; color:${COLORS.textPrimary}; font-weight:700;">#${d.orderId}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>`;
}

function orderBlock(d: ReminderEmailData): string {
  return `
            <table role="presentation" class="order-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0; border-top:1px solid ${COLORS.border}; border-bottom:1px solid ${COLORS.border};">
              <tr>
                <td width="50%" style="padding:14px 0; vertical-align:top;">
                  <p style="margin:0 0 4px; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${COLORS.textMuted};">Bestellnummer</p>
                  <p style="margin:0; font-size:16px; font-weight:700; color:${COLORS.textPrimary};">#${d.orderId}</p>
                </td>
                <td width="50%" style="padding:14px 0; vertical-align:top;">
                  <p style="margin:0 0 4px; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${COLORS.textMuted};">Bestelldatum</p>
                  <p style="margin:0; font-size:16px; font-weight:700; color:${COLORS.textPrimary};">${d.orderDate}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:14px 0; border-top:1px solid ${COLORS.border};">
                  <p style="margin:0 0 4px; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${COLORS.textMuted};">Gesamtbetrag</p>
                  <p style="margin:0; font-size:22px; font-weight:700; color:${COLORS.redBright}; font-family:${FONT_STACK_HEADING};">${d.orderTotal}</p>
                </td>
              </tr>
            </table>`;
}

// =============================================================================
// TEMPLATE 1 — TAG 7
// =============================================================================

export function buildDay7Subject(orderId: number): string {
  return `Erinnerung: Deine Bestellung #${orderId} wartet auf Zahlungseingang`;
}

export function buildDay7Html(d: ReminderEmailData): string {
  const subject = buildDay7Subject(d.orderId);
  return `${emailHead(subject)}${emailHeader()}
        <tr>
          <td class="pad" style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">
              Zahlungserinnerung &middot; Tag 7 von 14
            </p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">
              Noch 7 Tage Zeit für deine Banküberweisung
            </h1>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              ${d.greeting}
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              wir wollten dich kurz daran erinnern, dass deine Wholesale-Bestellung <strong style="color:${COLORS.textPrimary};">#${d.orderId}</strong> vom ${d.orderDate} noch offen ist und wir bisher keinen Zahlungseingang verzeichnen konnten.
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Kein Stress &mdash; das passiert oft im Tagesgeschäft. Wir wollten dich nur informieren, dass die Bestellung <strong style="color:${COLORS.textPrimary};">insgesamt 14 Tage</strong> für die Banküberweisung geöffnet bleibt. Du hast also <strong style="color:${COLORS.redBright};">noch 7 Tage Zeit</strong>, um die Zahlung zu veranlassen.
            </p>

            ${orderBlock(d)}
            ${bankBlock(d)}

            <p style="margin:24px 0 20px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Falls die Zahlung bereits unterwegs ist, kannst du diese Mail einfach ignorieren &mdash; Banküberweisungen können je nach Bank 1–3 Werktage dauern, bis sie bei uns sichtbar sind.
            </p>

            <p style="margin:0 0 32px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Bei Fragen oder falls du eine längere Zahlungsfrist benötigst, antworte einfach auf diese Mail.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${COLORS.red};">
                  <a href="${d.haendlerUrl}" style="display:inline-block; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textPrimary}; text-decoration:none;">
                    Zum Händler-Konto
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">
              Beste Grüße<br/>
              <strong style="color:${COLORS.textPrimary};">Dein UncutTV-Team</strong>
            </p>
          </td>
        </tr>
        ${emailFooter()}`;
}

// =============================================================================
// TEMPLATE 2 — TAG 12
// =============================================================================

export function buildDay12Subject(orderId: number): string {
  return `Wichtig: Noch 2 Tage für deine Bestellung #${orderId}`;
}

export function buildDay12Html(d: ReminderEmailData): string {
  const subject = buildDay12Subject(d.orderId);
  return `${emailHead(subject)}${emailHeader()}
        <tr>
          <td class="pad" style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">
              Zahlungserinnerung &middot; Tag 12 von 14
            </p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">
              Noch 2 Tage bis zur automatischen Stornierung
            </h1>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              ${d.greeting}
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              deine Wholesale-Bestellung <strong style="color:${COLORS.textPrimary};">#${d.orderId}</strong> vom ${d.orderDate} ist weiterhin offen &mdash; und die Zahlungsfrist läuft in <strong style="color:${COLORS.redBright};">2 Tagen ab</strong>.
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Falls die Banküberweisung bereits angewiesen ist und nur noch auf dem Weg, alles gut &mdash; gib uns kurz Bescheid, dann halten wir die Bestellung sicher offen.
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Falls die Zahlung noch nicht raus ist, möchten wir dich darum bitten, sie <strong style="color:${COLORS.textPrimary};">bis spätestens ${d.deadlineDate}</strong> zu veranlassen. Andernfalls werden wir die Bestellung am <strong style="color:${COLORS.textPrimary};">${d.cancelDate}</strong> automatisch stornieren und die Ware wieder freigeben.
            </p>

            ${orderBlock(d)}
            ${bankBlock(d)}

            <p style="margin:24px 0 32px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Solltest du Schwierigkeiten haben oder mehr Zeit brauchen &mdash; eine kurze Antwort auf diese Mail reicht, und wir finden eine Lösung.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${COLORS.red};">
                  <a href="${d.haendlerUrl}" style="display:inline-block; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textPrimary}; text-decoration:none;">
                    Zum Händler-Konto
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">
              Beste Grüße<br/>
              <strong style="color:${COLORS.textPrimary};">Dein UncutTV-Team</strong>
            </p>
          </td>
        </tr>
        ${emailFooter()}`;
}

// =============================================================================
// TEMPLATE 3 — TAG 13
// =============================================================================

export function buildDay13Subject(orderId: number): string {
  return `Letzter Tag: Bestellung #${orderId} wird morgen storniert`;
}

export function buildDay13Html(d: ReminderEmailData): string {
  const subject = buildDay13Subject(d.orderId);
  return `${emailHead(subject)}${emailHeader()}
        <tr>
          <td class="pad" style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.redBright};">
              Letzte Erinnerung &middot; Tag 13 von 14
            </p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:30px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">
              Morgen läuft die Frist ab
            </h1>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              ${d.greeting}
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              das ist unsere letzte Erinnerung zu deiner Wholesale-Bestellung <strong style="color:${COLORS.textPrimary};">#${d.orderId}</strong> vom ${d.orderDate}.
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Wenn die Zahlung <strong style="color:${COLORS.redBright};">bis morgen, ${d.cancelDate}</strong>, nicht bei uns eingeht, wird die Bestellung automatisch storniert und die reservierte Ware wieder für andere Händler freigegeben.
            </p>

            ${orderBlock(d)}
            ${bankBlock(d)}

            <p style="margin:24px 0 20px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Wenn die Überweisung bereits unterwegs ist, schick uns kurz eine Bestätigung (Screenshot vom Online-Banking oder Überweisungsbeleg) an <a href="mailto:office@uncuttv.at" style="color:${COLORS.redBright}; text-decoration:underline;">office@uncuttv.at</a> &mdash; dann halten wir die Bestellung offen, bis die Zahlung physisch bei uns ankommt.
            </p>

            <p style="margin:0 0 32px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Falls die Bestellung doch nicht mehr aktuell ist, freuen wir uns trotzdem über eine kurze Rückmeldung.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${COLORS.red};">
                  <a href="${d.haendlerUrl}" style="display:inline-block; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textPrimary}; text-decoration:none;">
                    Zum Händler-Konto
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">
              Beste Grüße<br/>
              <strong style="color:${COLORS.textPrimary};">Dein UncutTV-Team</strong>
            </p>
          </td>
        </tr>
        ${emailFooter()}`;
}

// =============================================================================
// TEMPLATE 4 — TAG 14 (STORNO)
// =============================================================================

export function buildDay14Subject(orderId: number): string {
  return `Bestellung #${orderId} storniert`;
}

export function buildDay14Html(d: ReminderEmailData): string {
  const subject = buildDay14Subject(d.orderId);
  return `${emailHead(subject)}${emailHeader()}
        <tr>
          <td class="pad" style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textMuted};">
              Bestellung storniert
            </p>
            <h1 style="margin:0 0 28px; font-family:${FONT_STACK_HEADING}; font-size:28px; font-weight:900; line-height:1.2; color:${COLORS.textPrimary};">
              Deine Bestellung wurde automatisch storniert
            </h1>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              ${d.greeting}
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              deine Wholesale-Bestellung <strong style="color:${COLORS.textPrimary};">#${d.orderId}</strong> vom ${d.orderDate} wurde heute automatisch storniert, da innerhalb der 14-tägigen Zahlungsfrist kein Zahlungseingang verzeichnet werden konnte.
            </p>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.75; color:${COLORS.textSecondary};">
              Die reservierte Ware steht nun wieder anderen Händlern zur Verfügung.
            </p>

            ${orderBlock(d)}

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.surfaceAlt}; border-left:3px solid ${COLORS.redBright}; margin:28px 0;">
              <tr>
                <td style="padding:24px 24px;">
                  <p style="margin:0 0 12px; font-size:14px; font-weight:700; color:${COLORS.textPrimary};">
                    Du möchtest die Ware doch noch?
                  </p>
                  <p style="margin:0 0 12px; font-size:14px; line-height:1.7; color:${COLORS.textSecondary};">
                    Kein Problem &mdash; bestelle einfach erneut über dein Händler-Konto. Solange die Titel verfügbar sind, kannst du sie sofort wieder ordern. Bei bereits ausverkauften Editionen melde dich gerne direkt bei uns &mdash; wir prüfen, was möglich ist.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 32px; font-size:14px; line-height:1.7; color:${COLORS.textMuted};">
              Falls die ursprüngliche Zahlung doch noch bei uns eingehen sollte, werden wir sie selbstverständlich erstatten oder mit einer neuen Bestellung verrechnen &mdash; gib uns dafür einfach kurz Bescheid.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${COLORS.red};">
                  <a href="${d.haendlerUrl}" style="display:inline-block; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${COLORS.textPrimary}; text-decoration:none;">
                    Neue Bestellung aufgeben
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">
              Beste Grüße<br/>
              <strong style="color:${COLORS.textPrimary};">Dein UncutTV-Team</strong>
            </p>
          </td>
        </tr>
        ${emailFooter()}`;
}

// =============================================================================
// EXPORT BUNDLE
// =============================================================================

/** Subject = nur Woo-Order-ID; HTML braucht das volle `ReminderEmailData`. */
export type WholesaleReminderMailBundle = {
  subject: (orderId: number) => string;
  html: (d: ReminderEmailData) => string;
};

export const WHOLESALE_REMINDER_TEMPLATES: {
  day7: WholesaleReminderMailBundle;
  day12: WholesaleReminderMailBundle;
  day13: WholesaleReminderMailBundle;
  day14: WholesaleReminderMailBundle;
} = {
  day7: { subject: buildDay7Subject, html: buildDay7Html },
  day12: { subject: buildDay12Subject, html: buildDay12Html },
  day13: { subject: buildDay13Subject, html: buildDay13Html },
  day14: { subject: buildDay14Subject, html: buildDay14Html },
};
