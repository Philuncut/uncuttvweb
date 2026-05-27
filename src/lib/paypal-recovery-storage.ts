const RECOVERY_KEY_PREFIX = "pending-paypal-recovery-";

export type PayPalRecoveryRecord = {
  paypalOrderId: string;
  captureId?: string;
  captureAmount?: string;
  savedAt: string;
  syncBody: unknown;
  alertSent?: boolean;
};

function recoveryKey(paypalOrderId: string): string {
  return `${RECOVERY_KEY_PREFIX}${paypalOrderId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function savePayPalRecoveryRecord(record: PayPalRecoveryRecord): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(
      recoveryKey(record.paypalOrderId),
      JSON.stringify(record)
    );
  } catch (err) {
    console.error("[PayPal recovery] save failed:", err);
  }
}

export function clearPayPalRecoveryRecord(paypalOrderId: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(recoveryKey(paypalOrderId));
  } catch (err) {
    console.error("[PayPal recovery] clear failed:", err);
  }
}

export function markPayPalRecoveryAlertSent(paypalOrderId: string): void {
  if (!canUseStorage()) return;
  try {
    const raw = localStorage.getItem(recoveryKey(paypalOrderId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as PayPalRecoveryRecord;
    localStorage.setItem(
      recoveryKey(paypalOrderId),
      JSON.stringify({ ...parsed, alertSent: true })
    );
  } catch (err) {
    console.error("[PayPal recovery] mark alert failed:", err);
  }
}

export function listPayPalRecoveryRecords(): PayPalRecoveryRecord[] {
  if (!canUseStorage()) return [];
  const records: PayPalRecoveryRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(RECOVERY_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PayPalRecoveryRecord;
      if (parsed.paypalOrderId) records.push(parsed);
    }
  } catch (err) {
    console.error("[PayPal recovery] list failed:", err);
  }
  return records;
}
