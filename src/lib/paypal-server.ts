/**
 * PayPal Orders API v2, serverseitig.
 *
 * Bis Oktober 2026 lief PayPal komplett im Browser: Das JS-SDK legte die
 * PayPal-Order mit einem im Browser gerechneten Betrag an und fuehrte auch
 * die Capture im Browser aus. Der Server erfuhr davon nur ueber einen
 * Aufruf des Frontends und konnte weder Betrag noch Capture pruefen
 * (Beleg: #6389 wurde mit 123,12 EUR gecaptured, die Bestellung lautet auf
 * 123,11 EUR). Jetzt legt der Server die PayPal-Order mit dem Betrag der
 * Woo-Bestellung an (custom_id = Woo-Bestellnummer) und fuehrt die Capture
 * selbst aus. Beide Aufrufe tragen eine PayPal-Request-Id; PayPal behandelt
 * Wiederholungen mit derselben Id als denselben Aufruf.
 *
 * Zugangsdaten: NEXT_PUBLIC_PAYPAL_CLIENT_ID (dieselbe wie im Browser) und
 * PAYPAL_SECRET. PAYPAL_API_BASE optional, Standard ist Live; fuer die
 * Sandbox https://api-m.sandbox.paypal.com setzen.
 */

const STANDARD_BASIS = "https://api-m.paypal.com";

export type PayPalBetrag = { currency_code: string; value: string };

export type PayPalCapture = {
  id: string;
  status: string;
  amount?: PayPalBetrag;
  final_capture?: boolean;
  create_time?: string;
};

export type PayPalOrder = {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: PayPalBetrag;
    payments?: { captures?: PayPalCapture[] };
  }>;
  payer?: {
    email_address?: string;
    name?: { given_name?: string; surname?: string };
    address?: { country_code?: string };
  };
};

export class PayPalFehler extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly issue: string,
    public readonly debugId: string
  ) {
    super(message);
    this.name = "PayPalFehler";
  }
}

let tokenCache: { token: string; gueltigBis: number } | null = null;

export function paypalKonfiguriert(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() &&
      process.env.PAYPAL_SECRET?.trim()
  );
}

function basis(): string {
  return (process.env.PAYPAL_API_BASE?.trim() || STANDARD_BASIS).replace(/\/$/, "");
}

async function zugangstoken(): Promise<string> {
  const jetzt = Date.now();
  if (tokenCache && tokenCache.gueltigBis > jetzt + 60_000) {
    return tokenCache.token;
  }
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? "";
  const secret = process.env.PAYPAL_SECRET?.trim() ?? "";
  if (!clientId || !secret) {
    throw new PayPalFehler("PayPal-Zugangsdaten fehlen", 500, "not_configured", "");
  }
  const res = await fetch(`${basis()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new PayPalFehler(
      `PayPal-Token fehlgeschlagen: ${json.error ?? res.status}`,
      res.status,
      "token_failed",
      res.headers.get("paypal-debug-id") ?? ""
    );
  }
  tokenCache = {
    token: json.access_token,
    gueltigBis: jetzt + (json.expires_in ?? 300) * 1000,
  };
  return json.access_token;
}

async function paypalAufruf<T>(
  methode: "GET" | "POST",
  pfad: string,
  body?: unknown,
  requestId?: string
): Promise<T> {
  const token = await zugangstoken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId.slice(0, 108);

  const res = await fetch(`${basis()}${pfad}`, {
    method: methode,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const fehler = json as {
      name?: string;
      message?: string;
      details?: Array<{ issue?: string; description?: string }>;
    };
    const issue = fehler.details?.[0]?.issue ?? fehler.name ?? `http_${res.status}`;
    throw new PayPalFehler(
      `PayPal ${methode} ${pfad}: ${issue} ${fehler.details?.[0]?.description ?? fehler.message ?? ""}`.trim(),
      res.status,
      issue,
      res.headers.get("paypal-debug-id") ?? ""
    );
  }
  return json as T;
}

export type PayPalOrderAnlegenEingabe = {
  /** Betrag mit zwei Nachkommastellen, z. B. "61.80". */
  betrag: string;
  waehrung?: string;
  /** Woo-Bestellnummer, landet in custom_id und ist der Rueckweg zur Bestellung. */
  wooOrderId: number;
  beschreibung: string;
  /** Idempotenz: gleiche Id = gleiche PayPal-Order. */
  requestId: string;
};

export async function paypalOrderAnlegen(
  eingabe: PayPalOrderAnlegenEingabe
): Promise<PayPalOrder> {
  return paypalAufruf<PayPalOrder>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "default",
          custom_id: String(eingabe.wooOrderId),
          description: eingabe.beschreibung.slice(0, 127),
          amount: {
            currency_code: (eingabe.waehrung ?? "EUR").toUpperCase(),
            value: eingabe.betrag,
          },
        },
      ],
    },
    eingabe.requestId
  );
}

export async function paypalOrderLaden(paypalOrderId: string): Promise<PayPalOrder> {
  return paypalAufruf<PayPalOrder>(
    "GET",
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`
  );
}

/**
 * Capture ausfuehren. Ist die Order bereits gecaptured (Wiederholung nach
 * Verbindungsabbruch), liefert PayPal ORDER_ALREADY_CAPTURED; dann wird die
 * Order geladen und wie ein Erfolg behandelt.
 */
export async function paypalOrderErfassen(
  paypalOrderId: string,
  requestId: string
): Promise<PayPalOrder> {
  try {
    return await paypalAufruf<PayPalOrder>(
      "POST",
      `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      {},
      requestId
    );
  } catch (err) {
    if (err instanceof PayPalFehler && err.issue === "ORDER_ALREADY_CAPTURED") {
      return paypalOrderLaden(paypalOrderId);
    }
    throw err;
  }
}

/** Erste abgeschlossene Capture der Order, sonst null. */
export function abgeschlosseneCapture(order: PayPalOrder): PayPalCapture | null {
  for (const unit of order.purchase_units ?? []) {
    for (const capture of unit.payments?.captures ?? []) {
      if (capture.status === "COMPLETED") return capture;
    }
  }
  return null;
}

/** Woo-Bestellnummer aus custom_id, 0 wenn nicht gesetzt (alte Orders aus dem Browser). */
export function wooOrderIdAusPayPalOrder(order: PayPalOrder): number {
  const raw = order.purchase_units?.[0]?.custom_id ?? "";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function paypalBetragInCent(betrag: PayPalBetrag | undefined): number {
  if (!betrag?.value) return 0;
  return Math.round(parseFloat(betrag.value) * 100);
}
