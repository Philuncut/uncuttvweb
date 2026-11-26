/**
 * PayPal-Zahlung serverseitig nachprüfen.
 *
 * Die PayPal-Order entsteht im Browser und wird dort auch eingezogen
 * (Capture). Der Server erfuhr davon bisher nur durch den Aufruf von
 * /api/sync-order und glaubte ihm ungeprüft. Hier lädt der Server die
 * Order selbst bei PayPal und liest Status, Betrag und Währung der
 * abgeschlossenen Capture. Nur damit darf eine Bestellung entstehen.
 *
 * Zugangsdaten: NEXT_PUBLIC_PAYPAL_CLIENT_ID (dieselbe wie im Browser) und
 * PAYPAL_SECRET. PAYPAL_API_BASE optional, Standard ist Live; für die
 * Sandbox https://api-m.sandbox.paypal.com setzen.
 */

import type { ZahlungsName } from "@/lib/bestellname";

const STANDARD_BASIS ="https://api-m.paypal.com";
const ZEITLIMIT_MS = 10_000;

/** PayPal-Order-IDs sind 17 Zeichen, Großbuchstaben und Ziffern; etwas Luft lassen. */
const ORDER_ID_MUSTER = /^[A-Z0-9]{8,32}$/;

export type PayPalOrderAntwort = {
  id?: string;
  status?: string;
  payer?: {
    name?: { given_name?: string; surname?: string };
  };
  purchase_units?: Array<{
    shipping?: { name?: { full_name?: string } };
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
      }>;
    };
  }>;
};

export type PayPalPruefung =
  | {
      ok: true;
      paypalOrderId: string;
      captureId: string;
      bezahltCent: number;
      waehrung: string;
      /**
       * Name aus der PayPal-Order. Nur Ersatz, wenn Formular und Kundenkonto
       * keinen Namen haben (bestellname.ts).
       */
      name?: ZahlungsName;
    }
  | {
      ok: false;
      /**
       * `nicht_bezahlt`: PayPal kennt die Order nicht oder sie ist nicht
       * eingezogen. `nicht_pruefbar`: PayPal nicht erreichbar oder nicht
       * eingerichtet; ein späterer Versuch kann gelingen.
       */
      grund: "ungueltige_id" | "nicht_bezahlt" | "nicht_pruefbar";
      detail: string;
    };

/**
 * Name aus der PayPal-Order: payer.name (schon geteilt), dazu der volle
 * Name der Lieferung als Ersatz. Ohne Netz, testbar.
 */
export function nameAusPayPalOrder(order: PayPalOrderAntwort): ZahlungsName {
  const sauber = (wert: unknown) => (typeof wert === "string" ? wert.trim() : "");
  return {
    vorname: sauber(order.payer?.name?.given_name),
    nachname: sauber(order.payer?.name?.surname),
    vollerName: sauber(order.purchase_units?.[0]?.shipping?.name?.full_name),
  };
}

/** Wertet die Antwort von GET /v2/checkout/orders/{id} aus. Ohne Netz, testbar. */
export function wertePayPalOrderAus(
  paypalOrderId: string,
  order: PayPalOrderAntwort
): PayPalPruefung {
  if ((order.id ?? "") !== paypalOrderId) {
    return {
      ok: false,
      grund: "nicht_bezahlt",
      detail: "PayPal lieferte eine andere Order",
    };
  }
  if (order.status !== "COMPLETED") {
    return {
      ok: false,
      grund: "nicht_bezahlt",
      detail: `Order-Status ${order.status ?? "unbekannt"}`,
    };
  }
  const captures = (order.purchase_units ?? []).flatMap(
    (u) => u.payments?.captures ?? []
  );
  const fertig = captures.filter((c) => c.status === "COMPLETED");
  if (fertig.length === 0) {
    return {
      ok: false,
      grund: "nicht_bezahlt",
      detail: `keine abgeschlossene Capture (${captures.map((c) => c.status).join(",") || "keine"})`,
    };
  }
  const waehrungen = new Set(
    fertig.map((c) => (c.amount?.currency_code ?? "").toLowerCase())
  );
  if (waehrungen.size !== 1) {
    return {
      ok: false,
      grund: "nicht_bezahlt",
      detail: "Captures in mehreren Währungen",
    };
  }
  let bezahltCent = 0;
  for (const c of fertig) {
    const wert = Number.parseFloat(c.amount?.value ?? "");
    if (!Number.isFinite(wert) || wert < 0) {
      return {
        ok: false,
        grund: "nicht_bezahlt",
        detail: "Capture ohne lesbaren Betrag",
      };
    }
    bezahltCent += Math.round(wert * 100);
  }
  return {
    ok: true,
    paypalOrderId,
    captureId: fertig[0].id ?? "",
    bezahltCent,
    waehrung: [...waehrungen][0],
  };
}

function basis(): string {
  return (process.env.PAYPAL_API_BASE?.trim() || STANDARD_BASIS).replace(
    /\/$/,
    ""
  );
}

let tokenCache: { token: string; gueltigBis: number } | null = null;

async function zugangstoken(): Promise<string> {
  const jetzt = Date.now();
  if (tokenCache && tokenCache.gueltigBis > jetzt + 60_000) {
    return tokenCache.token;
  }
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? "";
  const secret = process.env.PAYPAL_SECRET?.trim() ?? "";
  if (!clientId || !secret) {
    throw new Error("PAYPAL_SECRET oder NEXT_PUBLIC_PAYPAL_CLIENT_ID fehlt");
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
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`PayPal-Token: ${json.error ?? res.status}`);
  }
  tokenCache = {
    token: json.access_token,
    gueltigBis: jetzt + (json.expires_in ?? 300) * 1000,
  };
  return json.access_token;
}

/**
 * Lädt die Order bei PayPal und prüft, ob sie eingezogen ist. Wirft nicht;
 * jede Störung kommt als `nicht_pruefbar` zurück.
 */
export async function pruefePayPalZahlung(
  paypalOrderIdRoh: string
): Promise<PayPalPruefung> {
  const paypalOrderId = (paypalOrderIdRoh || "").trim();
  if (!ORDER_ID_MUSTER.test(paypalOrderId)) {
    return {
      ok: false,
      grund: "ungueltige_id",
      detail: "keine PayPal-Order-ID",
    };
  }
  try {
    const token = await zugangstoken();
    const res = await fetch(
      `${basis()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      }
    );
    if (res.status === 404) {
      return {
        ok: false,
        grund: "nicht_bezahlt",
        detail: "PayPal kennt diese Order nicht",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        grund: "nicht_pruefbar",
        detail: `PayPal antwortet mit ${res.status}`,
      };
    }
    const order = (await res.json()) as PayPalOrderAntwort;
    const ergebnis = wertePayPalOrderAus(paypalOrderId, order);
    return ergebnis.ok
      ? { ...ergebnis, name: nameAusPayPalOrder(order) }
      : ergebnis;
  } catch (err) {
    return {
      ok: false,
      grund: "nicht_pruefbar",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
