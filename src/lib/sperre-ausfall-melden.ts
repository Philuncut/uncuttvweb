/**
 * Zahlung da, aber WordPress antwortet nicht auf Suche und Sperre.
 *
 * Ohne die Suche legt der Shop keine Bestellung an (sonst entstünden wieder
 * Doppelte). Damit die bezahlte Bestellung nicht liegen bleibt, geht nach dem
 * dritten gescheiterten Versuch sofort eine Mail ans Büro: Zahlungsreferenz,
 * Betrag, E-Mail des Kunden, Warenkorb. Gilt für Stripe und PayPal.
 *
 * Jede Zahlung wird nur einmal gemeldet:
 *   - Stripe: Metadaten-Feld uncuttv_sperre_gemeldet am PaymentIntent.
 *   - PayPal: Zeile in paypal_orphan_orders mit error_reason lock_unavailable.
 * Lässt sich das nicht prüfen, wird gemeldet (lieber doppelt als gar nicht).
 */

import { Resend } from "resend";

const ABSENDER = "UncutTV <office@uncuttv.at>";
const OFFICE_TO = "office@uncuttv.at";

export const SPERRE_GEMELDET_META = "uncuttv_sperre_gemeldet";
export const PAYPAL_AUSFALL_GRUND = "lock_unavailable";

/** Bei diesen Zuständen ist das Geld da oder unterwegs. */
export function stripeZahlungZaehlt(status: string): boolean {
  return (
    status === "succeeded" ||
    status === "processing" ||
    status === "requires_capture"
  );
}

export type SperreAusfallMeldung = {
  /** `pi_…` oder `paypal_…`. */
  zahlungsreferenz: string;
  /** null, wenn der Betrag nicht ermittelt werden konnte. */
  betragCent: number | null;
  /** Woher der Betrag stammt, z. B. "bei Stripe geprüft (succeeded)". */
  betragHerkunft: string;
  kundenEmail?: string;
  kundenName?: string;
  positionen: Array<{
    id: number;
    name?: string;
    qty: number;
    price?: string;
    variation_id?: number;
  }>;
  /** Fehlermeldung des letzten Versuchs. */
  fehler: string;
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

/** Betreff und Inhalt der Mail. Ohne Netz, testbar. */
export function sperreAusfallMail(m: SperreAusfallMeldung): {
  subject: string;
  html: string;
} {
  const paypal = m.zahlungsreferenz.startsWith("paypal_");
  const betrag = m.betragCent === null ? "unbekannt" : euro(m.betragCent);
  const zeilen = m.positionen
    .map((p) => {
      const variante = p.variation_id ? ` / Variante ${p.variation_id}` : "";
      const preis = p.price ? `, je ${escapeHtml(String(p.price))} €` : "";
      return `<li>${p.qty} × ${escapeHtml(p.name || "Artikel")} (Produkt ${p.id}${variante})${preis}</li>`;
    })
    .join("");
  return {
    subject: `Bezahlt, aber KEINE Bestellung angelegt: ${m.zahlungsreferenz} (${betrag})`,
    html: `
      <h2>Zahlung ohne Bestellung: WordPress antwortet nicht</h2>
      <p>Der Shop konnte in WordPress nicht prüfen, ob es zu dieser Zahlung
         schon eine Bestellung gibt (drei Versuche). Deshalb wurde
         <strong>keine Bestellung angelegt</strong>. Der Kunde hat eine
         Fehlermeldung mit der Zahlungsreferenz gesehen.</p>
      <p><strong>Zahlung:</strong> ${escapeHtml(m.zahlungsreferenz)} (${paypal ? "PayPal" : "Stripe"})<br>
         <strong>Betrag:</strong> ${betrag} – ${escapeHtml(m.betragHerkunft)}<br>
         <strong>Kunde:</strong> ${escapeHtml(m.kundenEmail || "unbekannt")}${m.kundenName ? ` (${escapeHtml(m.kundenName)})` : ""}<br>
         <strong>Zeit:</strong> ${new Date().toISOString()}</p>
      <h3>Warenkorb</h3>
      <ul>${zeilen || "<li>nicht übermittelt</li>"}</ul>
      <h3>Was zu tun ist</h3>
      <ol>
        <li>In WooCommerce nach der Zahlungsreferenz suchen. Schickt der
            Browser des Kunden den Auftrag später noch einmal, kann die
            Bestellung inzwischen entstanden sein.</li>
        <li>Gibt es keine: Bestellung von Hand anlegen und dem Kunden die
            Bestätigung schicken.</li>
        <li>Prüfen, ob wp.uncuttv.at erreichbar und das Snippet
            „UncutTV Kasse“ aktiv ist.</li>
      </ol>
      <p><strong>Fehler:</strong> ${escapeHtml(m.fehler)}</p>
    `,
  };
}

/** Schickt die Mail. Wirft nie; true, wenn Resend sie angenommen hat. */
export async function meldeSperreAusfall(
  m: SperreAusfallMeldung
): Promise<boolean> {
  console.error(
    `[sperre-ausfall] ${m.zahlungsreferenz}: keine Bestellung angelegt (${m.fehler})`
  );
  try {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key || key === "your_resend_api_key") {
      throw new Error("RESEND_API_KEY nicht gesetzt");
    }
    const mail = sperreAusfallMail(m);
    const ergebnis = await new Resend(key).emails.send({
      from: ABSENDER,
      to: [OFFICE_TO],
      subject: mail.subject,
      html: mail.html,
    });
    if (ergebnis.error) throw new Error(`Resend: ${ergebnis.error.message}`);
    return true;
  } catch (err) {
    console.error(
      `[sperre-ausfall] ${m.zahlungsreferenz}: Mail fehlgeschlagen:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
