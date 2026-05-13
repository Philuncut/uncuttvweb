import { NextResponse } from "next/server";

const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;

const REVALIDATE_SECONDS = 86400;

function wooAuthHeaders(): Headers {
  return new Headers({
    Authorization:
      "Basic " +
      Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString(
        "base64"
      ),
    "Content-Type": "application/json",
  });
}

function normalizeWooBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Woo returns `states` either as an object map (legacy) or as `{ code, name }[]` (current WC REST). */
function statesFromWooBody(statesRaw: unknown): { code: string; name: string }[] {
  if (statesRaw == null) return [];
  if (Array.isArray(statesRaw)) {
    const out: { code: string; name: string }[] = [];
    for (const row of statesRaw) {
      if (!row || typeof row !== "object") continue;
      const code = (row as { code?: unknown }).code;
      const name = (row as { name?: unknown }).name;
      if (code != null && name != null) {
        out.push({ code: String(code), name: String(name) });
      }
    }
    return out;
  }
  if (typeof statesRaw === "object" && !Array.isArray(statesRaw)) {
    return Object.entries(statesRaw as Record<string, string>).map(
      ([code, name]) => ({
        code,
        name: String(name),
      })
    );
  }
  return [];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ country: string }> }
) {
  const { country: raw } = await context.params;
  const code = (raw || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  }

  if (!WOOCOMMERCE_URL || !WOOCOMMERCE_KEY || !WOOCOMMERCE_SECRET) {
    console.error("[woo-states] missing WOOCOMMERCE_URL / KEY / SECRET env");
    return NextResponse.json({ states: [] }, { status: 200 });
  }

  const base = `${normalizeWooBase(WOOCOMMERCE_URL)}/wp-json/wc/v3`;
  const url = `${base}/data/countries/${encodeURIComponent(code)}`;

  try {
    const res = await fetch(url, {
      headers: wooAuthHeaders(),
      next: { revalidate: REVALIDATE_SECONDS },
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { _parseError: "invalid_json", rawSnippet: text.slice(0, 500) };
    }

    // Vercel / runtime logs: full Woo payload + status (debug)
    try {
      const serialized =
        typeof parsed === "object" && parsed !== null
          ? JSON.stringify(parsed)
          : String(parsed);
      const maxLen = 120_000;
      console.error(
        `[woo-states] WooCommerce GET /data/countries/${code} → HTTP ${res.status} ${res.statusText}`,
        serialized.length > maxLen
          ? `${serialized.slice(0, maxLen)}… (truncated ${serialized.length} chars)`
          : serialized
      );
    } catch (e) {
      console.error(
        `[woo-states] log stringify failed for ${code}`,
        res.status,
        e
      );
    }

    if (!res.ok) {
      return NextResponse.json({ states: [] }, { status: 200 });
    }

    const body = parsed as {
      states?: unknown;
      code?: string;
      name?: string;
    } | null;

    const states = statesFromWooBody(body?.states);
    states.sort((a, b) => a.name.localeCompare(b.name, "de"));

    return NextResponse.json({ states });
  } catch (e) {
    console.error(`[woo-states] fetch failed for ${code}`, e);
    return NextResponse.json({ states: [] }, { status: 200 });
  }
}
