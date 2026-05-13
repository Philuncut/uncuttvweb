/**
 * Optional fields for POST /api/sync-order (and bank order) so form values
 * override Woo profile when non-empty.
 */

export type CheckoutCustomerPayload = {
  email: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  /** WooCommerce state / province code (ISO subdivision), required for some countries (IT, ES, FR, …). */
  state?: string;
};

export function buildCheckoutOrderExtras(company: string, vat: string) {
  const trimmedCompany = company.trim();
  const trimmedVat = vat.trim().toUpperCase();
  const extras: {
    billing?: Record<string, string>;
    meta_data?: Array<{ key: string; value: string }>;
  } = {};
  if (trimmedCompany) extras.billing = { company: trimmedCompany };
  if (trimmedVat) {
    extras.meta_data = [
      { key: "_billing_vat", value: trimmedVat },
      { key: "_eu_vat_guard_order_vat_number", value: trimmedVat },
    ];
  }
  return extras;
}

/** Shipped to /api/sync-order, /api/create-bank-order, and Klarna sessionStorage payload. */
export type CheckoutShippingForWoo = {
  rate: number;
  label: string;
  method_id: string;
  rate_id?: string;
  instance_id?: number;
};

export function buildCheckoutShippingBody(
  shipping: CheckoutShippingForWoo | null | undefined
): { checkoutShipping?: CheckoutShippingForWoo } {
  if (!shipping || typeof shipping.rate !== "number" || Number.isNaN(shipping.rate)) {
    return {};
  }
  if (shipping.method_id === "none" && shipping.rate === 0) {
    return {};
  }
  return { checkoutShipping: shipping };
}

export type StoredCheckoutSyncPayload = CheckoutCustomerPayload &
  ReturnType<typeof buildCheckoutOrderExtras> & {
    checkoutShipping?: CheckoutShippingForWoo;
    isReverseCharge?: boolean;
    isWholesale?: boolean;
  };

const PAYLOAD_PREFIX = "checkout_pi_payload_";
const SYNCED_PREFIX = "checkout_pi_synced_";

export function checkoutPayloadStorageKey(paymentIntentId: string) {
  return `${PAYLOAD_PREFIX}${paymentIntentId}`;
}

export function checkoutSyncedStorageKey(paymentIntentId: string) {
  return `${SYNCED_PREFIX}${paymentIntentId}`;
}

/** Stripe client_secret is `pi_xxx_secret_yyy`. */
export function parsePiIdFromClientSecret(clientSecret: string): string | null {
  const m = clientSecret.match(/^(pi_[a-zA-Z0-9]+)_secret_/);
  return m?.[1] ?? null;
}

export function persistCheckoutSyncPayload(
  piId: string,
  payload: StoredCheckoutSyncPayload
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(checkoutPayloadStorageKey(piId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function markCheckoutPiSynced(piId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(checkoutSyncedStorageKey(piId), "1");
  } catch {
    /* ignore */
  }
}

export function readCheckoutSyncPayload(
  piId: string
): StoredCheckoutSyncPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(checkoutPayloadStorageKey(piId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredCheckoutSyncPayload;
  } catch {
    return null;
  }
}

export function consumeCheckoutSyncPayload(
  piId: string
): StoredCheckoutSyncPayload | null {
  const data = readCheckoutSyncPayload(piId);
  if (typeof window === "undefined") return data;
  try {
    sessionStorage.removeItem(checkoutPayloadStorageKey(piId));
  } catch {
    /* ignore */
  }
  return data;
}

export function wasCheckoutPiSynced(piId: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(checkoutSyncedStorageKey(piId)) === "1";
}

export function clearCheckoutPiSynced(piId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(checkoutSyncedStorageKey(piId));
  } catch {
    /* ignore */
  }
}
