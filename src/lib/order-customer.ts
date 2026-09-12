import { readSession } from "@/lib/auth-session";
import {
  orderCustomerFor,
  type OrderCustomer,
  type OrderCustomerReason,
} from "@/lib/session-core";

/**
 * Wem wird eine Bestellung zugeordnet?
 *
 * Die Regel, und nur sie:
 *
 * - Geprüfte Sitzung vorhanden: die Kundennummer aus dem Token.
 * - Keine geprüfte Sitzung: Gastbestellung mit Nummer 0.
 * - WordPress nicht erreichbar: ebenfalls Gastbestellung, und eine Zeile
 *   ins Log.
 *
 * Ein Cookie mit einer Kundennummer ohne gültiges Token wird ignoriert,
 * nicht abgelehnt. Die Bestellung geht durch, sie landet nur als
 * Gastbestellung. Vorher genügte genau dieses Cookie, um eine Bestellung
 * im Konto eines Fremden abzulegen.
 *
 * An Beträgen, Steuerlogik, Länderregeln, Reverse Charge und Zahlungswegen
 * ändert das nichts. Es ändert sich ausschließlich, wem eine Bestellung
 * gehört. Die Zuordnung selbst steht in session-core.ts und ist dort ohne
 * laufendes Next prüfbar.
 */

export type { OrderCustomer, OrderCustomerReason };

/** Gründe, die eine Zeile ins Log wert sind. Der Alltag schweigt. */
const LAUT: ReadonlySet<OrderCustomerReason> = new Set([
  "invalid-token",
  "wordpress-unavailable",
]);

const MELDUNG: Record<OrderCustomerReason, string> = {
  verified: "",
  anonymous: "",
  "invalid-token":
    "Token ungültig oder abgelaufen, Nummern aus Cookies werden ignoriert. Bestellung wird als Gastbestellung angelegt.",
  "wordpress-unavailable":
    "WordPress nicht erreichbar. Bestellung wird als Gastbestellung angelegt.",
  "no-request-context":
    "Kein Anfragekontext. Bestellung wird als Gastbestellung angelegt.",
};

export async function resolveOrderCustomer(): Promise<OrderCustomer> {
  let customer: OrderCustomer;

  try {
    customer = orderCustomerFor(await readSession());
  } catch (err) {
    // cookies() steht nicht überall zur Verfügung, etwa in einem Webhook.
    // Dann gibt es schlicht keine Sitzung, und die Bestellung läuft weiter.
    console.warn(
      `[order-customer] ${MELDUNG["no-request-context"]}`,
      err instanceof Error ? err.message : err
    );
    return { customerId: 0, reason: "no-request-context" };
  }

  if (LAUT.has(customer.reason)) {
    console.warn(`[order-customer] ${MELDUNG[customer.reason]}`);
  }

  return customer;
}
