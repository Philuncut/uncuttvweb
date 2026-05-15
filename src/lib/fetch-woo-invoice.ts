const WOO_URL = process.env.WOOCOMMERCE_URL ?? "";
const WOO_KEY = process.env.WOOCOMMERCE_KEY ?? "";
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET ?? "";

const AUTH_HEADER =
  WOO_KEY && WOO_SECRET
    ? "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64")
    : "";

const DEFAULT_API_STYLE = "wc";

export class WooInvoiceFetchError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export type WooOrderOwnership = {
  id: number;
  number: string;
  billing: { email: string };
};

function assertWooConfigured(): void {
  if (!WOO_URL || !AUTH_HEADER) {
    throw new WooInvoiceFetchError("WooCommerce nicht konfiguriert.", 500);
  }
}

function isPdfBuffer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function buildInvoicePdfUrl(orderId: number): string {
  const style = process.env.WOO_INVOICE_API_STYLE ?? DEFAULT_API_STYLE;

  if (style === "wpo") {
    return `${WOO_URL.replace(/\/$/, "")}/wp-json/wpo/v1/documents/invoice/${orderId}/pdf`;
  }

  const url = new URL(
    `${WOO_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders/${orderId}/documents`
  );
  url.searchParams.set("type", "invoice");
  if (process.env.WOO_INVOICE_GENERATE === "true") {
    url.searchParams.set("generate", "true");
  }
  return url.toString();
}

export async function fetchWooOrderForOwnership(
  orderId: number
): Promise<WooOrderOwnership | null> {
  assertWooConfigured();

  const res = await fetch(`${WOO_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders/${orderId}`, {
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new WooInvoiceFetchError("Bestellung nicht abrufbar.", 502);
  }

  return res.json() as Promise<WooOrderOwnership>;
}

export async function fetchWooInvoicePdf(
  orderId: number,
  opts?: { orderNumber?: string }
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  assertWooConfigured();

  let res: Response;
  try {
    res = await fetch(buildInvoicePdfUrl(orderId), {
      headers: {
        Authorization: AUTH_HEADER,
        Accept: "application/pdf, application/octet-stream",
      },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[fetch-woo-invoice] network error", orderId, err);
    throw new WooInvoiceFetchError(
      "WooCommerce nicht erreichbar. Bitte später erneut versuchen.",
      502
    );
  }

  if (res.status === 404) {
    throw new WooInvoiceFetchError(
      "Rechnung wurde noch nicht generiert. Bitte später erneut versuchen.",
      404
    );
  }
  if (res.status === 403) {
    throw new WooInvoiceFetchError("Kein Zugriff auf diese Rechnung.", 403);
  }
  if (res.status === 401) {
    console.error("[fetch-woo-invoice] Woo auth failed for order", orderId);
    throw new WooInvoiceFetchError(
      "Fehler beim Abrufen der Rechnung. Bitte später erneut versuchen.",
      500
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      "[fetch-woo-invoice]",
      orderId,
      res.status,
      body.slice(0, 200)
    );
    throw new WooInvoiceFetchError(
      "Fehler beim Abrufen der Rechnung. Bitte später erneut versuchen.",
      500
    );
  }

  const buffer = await res.arrayBuffer();
  if (!isPdfBuffer(new Uint8Array(buffer))) {
    throw new WooInvoiceFetchError(
      "Ungültige Antwort vom Rechnungsserver.",
      500
    );
  }

  const num = opts?.orderNumber ?? String(orderId);
  return {
    buffer,
    filename: `Rechnung-RE-${num}.pdf`,
  };
}

export function invoicePdfResponse(
  buffer: ArrayBuffer,
  filename: string
): Response {
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
