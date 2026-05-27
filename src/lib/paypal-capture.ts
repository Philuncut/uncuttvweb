/** Client-safe PayPal capture helpers (no server secrets). */

export function isValidCheckoutEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizeCheckoutEmail(email: string): string {
  return email.trim().toLowerCase();
}

type PayPalCaptureDetails = Record<string, unknown>;

function asTrimmedString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

export function extractPayPalOrderId(
  details: PayPalCaptureDetails | undefined
): string {
  return asTrimmedString(details?.id);
}

export function extractPayPalCaptureId(
  details: PayPalCaptureDetails | undefined
): string {
  const units = details?.purchase_units as
    | Array<{
        payments?: { captures?: Array<{ id?: string }> };
      }>
    | undefined;
  return asTrimmedString(units?.[0]?.payments?.captures?.[0]?.id);
}

export function extractPayPalCaptureAmount(
  details: PayPalCaptureDetails | undefined
): string {
  const units = details?.purchase_units as
    | Array<{ amount?: { value?: string } }>
    | undefined;
  return asTrimmedString(units?.[0]?.amount?.value);
}

/** PayPal payer email → shipping email → checkout form email. */
export function resolvePayPalCheckoutEmail(
  details: PayPalCaptureDetails | undefined,
  formEmail: string
): string {
  const payer = details?.payer as { email_address?: string } | undefined;
  const units = details?.purchase_units as
    | Array<{ shipping?: { email_address?: string } }>
    | undefined;

  const fromPayer = asTrimmedString(payer?.email_address);
  if (fromPayer) return normalizeCheckoutEmail(fromPayer);

  const fromShipping = asTrimmedString(
    units?.[0]?.shipping?.email_address
  );
  if (fromShipping) return normalizeCheckoutEmail(fromShipping);

  const fromForm = asTrimmedString(formEmail);
  if (fromForm) return normalizeCheckoutEmail(fromForm);

  return "";
}
