/**
 * Wiederanlauf fuer PayPal-Zahlungen, deren Serverantwort den Browser nicht
 * erreicht hat (Webview geschlossen, Netz weg).
 *
 * Diese Datei war die Mechanik hinter #6391 und #6392: Bei jedem Seitenaufruf
 * schickte sie den gespeicherten Body erneut an /api/sync-order, und
 * sync-order legte jedes Mal eine neue Bestellung an. Jetzt ruft sie fuer
 * neue Datensaetze /api/paypal/capture-order auf, das die Capture
 * serverseitig ausfuehrt bzw. wiederfindet und dieselbe Bestellung liefert,
 * egal wie oft es gerufen wird. Alte Datensaetze (mit syncBody) gehen weiter
 * an sync-order, das inzwischen bei PayPal prueft und Duplikate erkennt.
 *
 * Endgueltige Fehler (4xx ausser 5xx/Netz) loeschen den Datensatz nach dem
 * Alarm, damit nicht bei jedem Seitenaufruf erneut gegen eine Wand gelaufen
 * wird; 5xx und Netzfehler lassen ihn fuer den naechsten Versuch stehen.
 */

import {
  clearPayPalRecoveryRecord,
  listPayPalRecoveryRecords,
  markPayPalRecoveryAlertSent,
  type PayPalRecoveryRecord,
} from "@/lib/paypal-recovery-storage";
import { reportPayPalOrphanAlert } from "@/lib/paypal-orphan-alert-client";
import type { CartMeta } from "@/lib/wc-order-from-payment";

let retryInFlight = false;

async function alertRecoveryFailure(record: PayPalRecoveryRecord, detail: unknown) {
  if (record.alertSent) return;

  await reportPayPalOrphanAlert({
    reason: "recovery_boot_retry_failed",
    paypalOrderId: record.paypalOrderId,
    captureId: record.captureId,
    amount: record.captureAmount,
    syncError: detail,
    cartItems: extractCartItems(record.syncBody),
    rawBody: record.syncBody,
  });
  markPayPalRecoveryAlertSent(record.paypalOrderId);
}

function extractCartItems(syncBody: unknown): CartMeta[] | undefined {
  if (!syncBody || typeof syncBody !== "object") return undefined;
  const items = (syncBody as { items?: CartMeta[] }).items;
  return Array.isArray(items) ? items : undefined;
}

async function wiederanlauf(record: PayPalRecoveryRecord): Promise<Response> {
  if (record.syncBody && typeof record.syncBody === "object") {
    return fetch("/api/sync-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record.syncBody),
    });
  }
  return fetch("/api/paypal/capture-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paypalOrderId: record.paypalOrderId,
      ...(record.wooOrderId ? { orderIdHint: record.wooOrderId } : {}),
    }),
  });
}

/** Beim Laden der Seite: Zahlungen nachtragen, deren Antwort verloren ging. */
export async function retryPendingPayPalRecoveries(): Promise<void> {
  if (retryInFlight || typeof window === "undefined") return;
  retryInFlight = true;

  try {
    const records = listPayPalRecoveryRecords();
    if (records.length === 0) return;

    for (const record of records) {
      try {
        const res = await wiederanlauf(record);

        if (res.ok) {
          clearPayPalRecoveryRecord(record.paypalOrderId);
          console.info("[PayPal recovery] Zahlung nachgetragen:", record.paypalOrderId);
          continue;
        }

        let errorData: unknown = null;
        try {
          errorData = await res.json();
        } catch {
          errorData = await res.text().catch(() => "");
        }

        await alertRecoveryFailure(record, { status: res.status, error: errorData });

        if (res.status >= 400 && res.status < 500) {
          // Endgueltig (Order nicht gecaptured, Zuordnung unklar, 409 bereits
          // erledigt): nicht bei jedem Seitenaufruf wiederholen.
          clearPayPalRecoveryRecord(record.paypalOrderId);
        }
      } catch (networkErr) {
        console.warn(
          "[PayPal recovery] weiterhin keine Verbindung:",
          record.paypalOrderId,
          networkErr
        );
      }
    }
  } finally {
    retryInFlight = false;
  }
}
