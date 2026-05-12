/** Successful VIES checkVat response (used for Reverse Charge + audit). */
export type ViesValidated = {
  valid: true;
  country: string | null;
  name: string | null;
  address: string | null;
  requestDate: string;
  consultationNumber: string;
};

/** POST /api/validate-vat JSON shapes */
export type ValidateVatResponse =
  | ViesValidated
  | { valid: false }
  | { valid: null; error: "vies_unavailable" | "vies_timeout" };
