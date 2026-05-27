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

/** On app load: retry sync for captures that never reached the server. */
export async function retryPendingPayPalRecoveries(): Promise<void> {
  if (retryInFlight || typeof window === "undefined") return;
  retryInFlight = true;

  try {
    const records = listPayPalRecoveryRecords();
    if (records.length === 0) return;

    for (const record of records) {
      try {
        const syncRes = await fetch("/api/sync-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record.syncBody),
        });

        if (syncRes.ok) {
          clearPayPalRecoveryRecord(record.paypalOrderId);
          console.info(
            "[PayPal recovery] sync succeeded on retry:",
            record.paypalOrderId
          );
          continue;
        }

        let errorData: unknown = null;
        try {
          errorData = await syncRes.json();
        } catch {
          errorData = await syncRes.text().catch(() => "");
        }

        await alertRecoveryFailure(record, {
          status: syncRes.status,
          error: errorData,
        });
      } catch (networkErr) {
        console.warn(
          "[PayPal recovery] retry still offline:",
          record.paypalOrderId,
          networkErr
        );
      }
    }
  } finally {
    retryInFlight = false;
  }
}
