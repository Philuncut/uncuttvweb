import type { VerifiedSession } from "@/lib/session-core";
import type { WooOrderOwnership } from "@/lib/fetch-woo-invoice";

/**
 * Darf diese Sitzung die Rechnung zu dieser Bestellung abrufen?
 *
 * Bisher wurde allein die Mailadresse aus einem Cookie mit der
 * Rechnungsadresse der Bestellung verglichen. Wer die Adresse eines anderen
 * kannte, konnte dessen Rechnungen herunterladen.
 *
 * Maßgeblich ist jetzt die Kundennummer aus dem geprüften Token. Der
 * Vergleich über die Mailadresse bleibt nur für Gastbestellungen, die in
 * WooCommerce gar keine Kundennummer tragen — sonst käme niemand mehr an
 * die Rechnung einer Bestellung, die er vor der Registrierung aufgegeben
 * hat. Auch diese Adresse stammt jetzt aus dem Token, nicht aus einem
 * Cookie.
 *
 * Am Inhalt der Rechnung ändert das nichts, nur daran, wer sie bekommt.
 */
export function maySeeInvoice(
  order: WooOrderOwnership,
  session: VerifiedSession
): boolean {
  const orderCustomerId = Number(order.customer_id) || 0;

  if (orderCustomerId > 0) {
    return orderCustomerId === session.customerId;
  }

  const orderEmail = (order.billing?.email ?? "").trim().toLowerCase();
  const sessionEmail = session.email.trim().toLowerCase();

  return orderEmail !== "" && orderEmail === sessionEmail;
}
