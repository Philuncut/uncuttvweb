/**
 * Bezahlt, aber der Betrag passt nicht zum Warenkorb.
 *
 * Die Bestellung ist dann auf "on-hold" angelegt (wc-order-from-payment.ts).
 * Hier bekommt sie eine Bestellnotiz mit erwartetem und bezahltem Betrag,
 * und das Büro eine Mail. Beides darf scheitern, ohne dass die Bestellung
 * verloren geht: Diese Funktion wirft nie.
 */

import { Resend } from "resend";

const ABSENDER = "UncutTV <office@uncuttv.at>";
const OFFICE_TO = "office@uncuttv.at";
const ZEITLIMIT_MS = 10_000;

export type BetragsabweichungMeldung = {
  orderId: number;
  orderNumber: string;
  /** `pi_…` oder `paypal_…`. */
  zahlungsreferenz: string;
  kundenEmail?: string;
  erwartetCent: number;
  bezahltCent: number;
};

function euro(cent: number): string {
  return `${(cent / 100).toFixed(2).replace(".", ",")} €`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Text der Bestellnotiz; auch Kern der Mail. Ohne Netz, testbar. */
export function betragsabweichungText(m: BetragsabweichungMeldung): string {
  const differenz = m.bezahltCent - m.erwartetCent;
  return (
    `Zahlung eingegangen, aber der Betrag passt nicht zum Warenkorb: ` +
    `erwartet ${euro(m.erwartetCent)}, bezahlt ${euro(m.bezahltCent)} ` +
    `(${differenz > 0 ? "+" : "−"}${euro(Math.abs(differenz))}). ` +
    `Zahlung ${m.zahlungsreferenz}. Bestellung steht auf "Wartend" und ` +
    `muss von Hand geprüft werden.`
  );
}

async function schreibeBestellnotiz(orderId: number, text: string): Promise<void> {
  const basis = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  const auth =
    "Basic " +
    Buffer.from(
      `${process.env.WOOCOMMERCE_KEY}:${process.env.WOOCOMMERCE_SECRET}`
    ).toString("base64");
  const res = await fetch(`${basis}/wp-json/wc/v3/orders/${orderId}/notes`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ note: text, customer_note: false }),
    cache: "no-store",
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (!res.ok) {
    throw new Error(`Bestellnotiz: WooCommerce antwortet mit ${res.status}`);
  }
}

async function schickeMail(m: BetragsabweichungMeldung, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || key === "your_resend_api_key") {
    throw new Error("RESEND_API_KEY nicht gesetzt");
  }
  const resend = new Resend(key);
  const basis = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  const link = `${basis}/wp-admin/admin.php?page=wc-orders&action=edit&id=${m.orderId}`;
  const ergebnis = await resend.emails.send({
    from: ABSENDER,
    to: [OFFICE_TO],
    subject: `Bestellung #${m.orderNumber} wartet: bezahlt ${euro(m.bezahltCent)}, erwartet ${euro(m.erwartetCent)}`,
    html: `
      <h2>Betrag der Zahlung passt nicht zur Bestellung</h2>
      <p>${escapeHtml(text)}</p>
      <p><strong>Bestellung:</strong> <a href="${escapeHtml(link)}">#${escapeHtml(m.orderNumber)}</a></p>
      <p><strong>Erwartet:</strong> ${euro(m.erwartetCent)}<br>
         <strong>Bezahlt:</strong> ${euro(m.bezahltCent)}<br>
         <strong>Zahlung:</strong> ${escapeHtml(m.zahlungsreferenz)}<br>
         <strong>Kunde:</strong> ${escapeHtml(m.kundenEmail || "unbekannt")}</p>
      <p>Die Bestellung wurde angelegt, damit der Kunde nicht ohne Bestellung
         bleibt. Der Kunde hat die übliche Bestellbestätigung erhalten.
         Stimmt die Zahlung, die Bestellung in WooCommerce auf
         „In Bearbeitung“ stellen.</p>
    `,
  });
  if (ergebnis.error) {
    throw new Error(`Resend: ${ergebnis.error.message}`);
  }
}

export async function meldeBetragsabweichung(
  m: BetragsabweichungMeldung
): Promise<void> {
  const text = betragsabweichungText(m);
  console.error(`[betragsabweichung] #${m.orderNumber}: ${text}`);
  const ergebnisse = await Promise.allSettled([
    schreibeBestellnotiz(m.orderId, text),
    schickeMail(m, text),
  ]);
  for (const e of ergebnisse) {
    if (e.status === "rejected") {
      console.error(
        `[betragsabweichung] #${m.orderNumber}: Meldung fehlgeschlagen:`,
        e.reason instanceof Error ? e.reason.message : e.reason
      );
    }
  }
}
