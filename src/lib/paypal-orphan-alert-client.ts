import type { CartMeta } from "@/lib/wc-order-from-payment";

export type PayPalOrphanAlertClientPayload = {
  reason: string;
  paypalOrderId: string;
  captureId?: string;
  amount?: string;
  email?: string;
  payerEmail?: string;
  formEmail?: string;
  syncStatus?: number;
  syncError?: unknown;
  cartItems?: CartMeta[];
  rawBody?: unknown;
};

const ALERT_URL = "/api/admin/paypal-orphan-alert";

function serializePayload(payload: PayPalOrphanAlertClientPayload): string {
  return JSON.stringify(payload);
}

/** Fire-and-forget admin alert; prefers sendBeacon when the page may unload. */
export function reportPayPalOrphanAlertBestEffort(
  payload: PayPalOrphanAlertClientPayload,
  options?: { preferBeacon?: boolean }
): boolean {
  const body = serializePayload(payload);
  const preferBeacon = options?.preferBeacon === true;

  if (
    preferBeacon &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    try {
      const sent = navigator.sendBeacon(
        ALERT_URL,
        new Blob([body], { type: "application/json" })
      );
      if (sent) return true;
    } catch (err) {
      console.error("[PayPal] sendBeacon orphan alert failed:", err);
    }
  }

  void fetch(ALERT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((err) => {
    console.error("[PayPal] fetch orphan alert failed:", err);
  });

  return false;
}

/** Awaitable alert for cases where the checkout page stays open (e.g. empty email). */
export async function reportPayPalOrphanAlert(
  payload: PayPalOrphanAlertClientPayload
): Promise<void> {
  try {
    await fetch(ALERT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serializePayload(payload),
    });
  } catch (err) {
    reportPayPalOrphanAlertBestEffort(payload, { preferBeacon: true });
    console.error("[PayPal] orphan alert failed:", err);
  }
}
