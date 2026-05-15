/**
 * Discovers WP Overnight PDF invoice REST endpoints on the live WooCommerce store.
 *
 * Usage: npx tsx src/scripts/discover-pdf-endpoint.ts
 *
 * Requires .env.local with WOOCOMMERCE_URL, WOOCOMMERCE_KEY, WOOCOMMERCE_SECRET.
 * Optional: WP_USER, WP_APP_PASSWORD for Application Password auth.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── Env loading (.env.local) ────────────────────────────────────────────────

function loadEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };

const WOO_URL = (env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
const WOO_KEY = env.WOOCOMMERCE_KEY ?? "";
const WOO_SECRET = env.WOOCOMMERCE_SECRET ?? "";
const WP_USER = env.WP_USER ?? env.WOOCOMMERCE_USER ?? "";
const WP_APP_PASSWORD = env.WP_APP_PASSWORD ?? env.WOOCOMMERCE_APP_PASSWORD ?? "";

function mask(value: string): string {
  if (!value) return "(missing)";
  if (value.length <= 6) return "******";
  return `${value.slice(0, 6)}…`;
}

// ── Types ───────────────────────────────────────────────────────────────────

type AuthMethod = "woo-consumer" | "wp-app-password" | "none";

type TestRow = {
  endpoint: string;
  auth: AuthMethod;
  status: number | "ERR";
  contentType: string;
  size: number;
  success: boolean;
  note: string;
};

// ── HTTP helpers ────────────────────────────────────────────────────────────

function authHeader(method: AuthMethod): string | undefined {
  if (method === "woo-consumer" && WOO_KEY && WOO_SECRET) {
    return (
      "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64")
    );
  }
  if (method === "wp-app-password" && WP_USER && WP_APP_PASSWORD) {
    return (
      "Basic " +
      Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64")
    );
  }
  return undefined;
}

async function probe(
  url: string,
  auth: AuthMethod
): Promise<{
  status: number | "ERR";
  contentType: string;
  size: number;
  isPdf: boolean;
  note: string;
}> {
  const headers: Record<string, string> = {
    Accept: "application/pdf, application/json, */*",
  };
  const authorization = authHeader(auth);
  if (authorization) headers.Authorization = authorization;

  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const isPdf =
      bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46; // %PDF

    let note = "";
    if (res.status === 401) {
      try {
        const json = JSON.parse(new TextDecoder().decode(bytes)) as {
          code?: string;
          message?: string;
        };
        note = `Auth rejected (${json.code ?? "401"}): ${(json.message ?? "").replace(/<[^>]+>/g, "").slice(0, 80)}`;
      } catch {
        note = "Auth rejected — check keys or Application Password";
      }
    } else if (res.status === 404) {
      note = "Not found";
    } else if (res.status === 200 && !isPdf) {
      const preview = new TextDecoder()
        .decode(bytes.slice(0, 120))
        .replace(/\s+/g, " ")
        .slice(0, 80);
      note = `200 but not PDF (preview: ${preview}…)`;
    } else if (res.status === 200 && isPdf) {
      note = "Valid PDF";
    } else if (res.status >= 500) {
      note = "Server error";
    }

    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "(none)",
      size: buf.byteLength,
      isPdf,
      note,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "ERR",
      contentType: "(network error)",
      size: 0,
      isPdf: false,
      note: msg,
    };
  }
}

// ── REST index discovery ────────────────────────────────────────────────────

const ROUTE_FILTERS = ["wpo", "documents", "invoice", "pdf"] as const;

async function discoverPluginRoutes(baseUrl: string): Promise<void> {
  const indexUrl = `${baseUrl}/wp-json/`;
  console.log("\n## Plugin REST routes (filtered)\n");
  console.log(`Fetching: ${indexUrl}\n`);

  try {
    const res = await fetch(indexUrl, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.log(`Failed to fetch REST index: HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as {
      routes?: Record<string, unknown>;
      namespaces?: string[];
    };

    const namespaces = (data.namespaces ?? []).filter((ns) =>
      ROUTE_FILTERS.some((f) => ns.toLowerCase().includes(f))
    );
    if (namespaces.length) {
      console.log("Matching namespaces:", namespaces.join(", "));
    }

    const routes = Object.keys(data.routes ?? {})
      .filter((route) =>
        ROUTE_FILTERS.some((f) => route.toLowerCase().includes(f))
      )
      .sort();

    if (!routes.length) {
      console.log(
        "No routes matched filters (wpo, documents, invoice, pdf). Listing all namespaces for reference:"
      );
      console.log((data.namespaces ?? []).slice(0, 40).join("\n"));
      return;
    }

    console.log(`Found ${routes.length} matching route(s):\n`);
    for (const route of routes) {
      const meta = data.routes?.[route];
      console.log(`- \`${route}\``);
      if (meta && typeof meta === "object") {
        const methods = (meta as { methods?: string[] }).methods;
        if (methods?.length) console.log(`  methods: ${methods.join(", ")}`);
      }
    }
  } catch (err) {
    console.log("REST index error:", err instanceof Error ? err.message : err);
  }
}

// ── Order ID resolution ───────────────────────────────────────────────────────

async function resolveTestOrderId(): Promise<number | null> {
  if (!WOO_URL || !WOO_KEY || !WOO_SECRET) return null;

  for (const status of ["completed", "processing", "on-hold"]) {
    const url = `${WOO_URL}/wp-json/wc/v3/orders?status=${status}&per_page=1&orderby=date&order=desc`;
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader("woo-consumer")!,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.log(`Order lookup (${status}): HTTP ${res.status}`);
      continue;
    }
    const orders = (await res.json()) as Array<{ id: number; number: string; status: string }>;
    if (orders[0]?.id) {
      console.log(
        `\nUsing order #${orders[0].number} (id=${orders[0].id}, status=${orders[0].status}) for PDF tests.\n`
      );
      return orders[0].id;
    }
  }
  return null;
}

// ── Endpoint matrix ─────────────────────────────────────────────────────────

function buildCandidateUrls(baseUrl: string, orderId: number): string[] {
  const enc = String(orderId);
  return [
    `${baseUrl}/wp-json/wpo/v1/documents/invoice/${enc}/pdf`,
    `${baseUrl}/wp-json/wpo/v1/orders/${enc}/invoice/pdf`,
    `${baseUrl}/wp-json/wpo/v1/invoice/${enc}`,
    `${baseUrl}/wp-json/wc/v3/orders/${enc}/documents`,
    `${baseUrl}/wp-json/wc/v3/orders/${enc}/documents?type=invoice`,
    `${baseUrl}/wp-json/wc/v3/orders/${enc}/documents?type=invoice&generate=true`,
    `${baseUrl}/?wpo_wcpdf_action=generate&document_type=invoice&order_ids=${enc}`,
    `${baseUrl}/wp-json/wpo/v1/documents/invoice/${enc}`,
    `${baseUrl}/wp-json/wpo/v1/documents/${enc}/invoice`,
    `${baseUrl}/wp-json/wpo/v1/documents/${enc}/invoice/pdf`,
  ];
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function printMarkdownTable(rows: TestRow[]): void {
  console.log("\n## Endpoint probe results\n");
  console.log(
    "| Endpoint | Auth-Methode | Status | Content-Type | Größe | Erfolg |"
  );
  console.log(
    "|----------|--------------|--------|--------------|-------|--------|"
  );
  for (const r of rows) {
    const path = r.endpoint.replace(WOO_URL, "");
    const ok = r.success ? "✅" : "❌";
    const ct = r.contentType.replace(/\|/g, "\\|").slice(0, 40);
    console.log(
      `| \`${path}\` | ${r.auth} | ${r.status} | ${ct} | ${formatSize(r.size)} | ${ok} |`
    );
  }

  const winners = rows.filter((r) => r.success);
  console.log("\n### Notes per row\n");
  for (const r of rows) {
    if (r.note) {
      const path = r.endpoint.replace(WOO_URL, "");
      console.log(`- \`${path}\` (${r.auth}): ${r.note}`);
    }
  }

  if (winners.length) {
    console.log("\n### ✅ Working PDF endpoint(s)\n");
    for (const w of winners) {
      console.log(`- **${w.endpoint.replace(WOO_URL, "")}** via \`${w.auth}\` (${formatSize(w.size)})`);
    }
  } else {
    console.log(
      "\n### ⚠️ No endpoint returned a valid PDF. Check plugin REST API setting and credentials.\n"
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("# WooCommerce PDF Invoice — Endpoint Discovery\n");
  console.log("Configuration:");
  console.log(`- WOOCOMMERCE_URL: ${WOO_URL || "(missing)"}`);
  console.log(`- WOOCOMMERCE_KEY: ${mask(WOO_KEY)}`);
  console.log(`- WOOCOMMERCE_SECRET: ${mask(WOO_SECRET)}`);
  console.log(`- WP_USER: ${WP_USER ? mask(WP_USER) : "(not set)"}`);
  console.log(`- WP_APP_PASSWORD: ${mask(WP_APP_PASSWORD)}`);

  if (!WOO_URL) {
    console.error("\nERROR: WOOCOMMERCE_URL missing in .env.local");
    process.exit(1);
  }

  await discoverPluginRoutes(WOO_URL);

  if (!WOO_KEY || !WOO_SECRET) {
    console.error("\nERROR: WOOCOMMERCE_KEY/SECRET missing — cannot resolve order or test woo-consumer auth.");
    process.exit(1);
  }

  const orderId = await resolveTestOrderId();
  if (!orderId) {
    console.error("\nERROR: Could not find a completed/processing order for tests.");
    process.exit(1);
  }

  const orderDetailRes = await fetch(
    `${WOO_URL}/wp-json/wc/v3/orders/${orderId}`,
    {
      headers: {
        Authorization: authHeader("woo-consumer")!,
        Accept: "application/json",
      },
    }
  );
  if (orderDetailRes.ok) {
    const orderDetail = (await orderDetailRes.json()) as Record<string, unknown>;
    const hasDocuments = "documents" in orderDetail;
    console.log(
      `WC order ${orderId}: "documents" field present = ${hasDocuments} (Professional REST extension ${hasDocuments ? "active" : "NOT active"})`
    );
    if (hasDocuments) {
      console.log("documents:", JSON.stringify(orderDetail.documents, null, 2));
    }
  }

  const urls = buildCandidateUrls(WOO_URL, orderId);
  const authMethods: AuthMethod[] = ["woo-consumer"];
  if (WP_USER && WP_APP_PASSWORD) {
    authMethods.push("wp-app-password");
  } else {
    console.log(
      "\n(Skip wp-app-password: set WP_USER + WP_APP_PASSWORD in .env.local to test Application Password auth.)\n"
    );
  }

  console.log("## Systematic endpoint probes\n");
  console.log(`Testing ${urls.length} URL(s) × ${authMethods.length} auth method(s)…\n`);

  const rows: TestRow[] = [];

  for (const url of urls) {
    for (const auth of authMethods) {
      if (auth === "woo-consumer" && (!WOO_KEY || !WOO_SECRET)) continue;
      if (auth === "wp-app-password" && (!WP_USER || !WP_APP_PASSWORD)) continue;

      const shortPath = url.replace(WOO_URL, "");
      process.stdout.write(`→ ${shortPath} [${auth}] … `);

      const result = await probe(url, auth);
      const success = result.status === 200 && result.isPdf;

      console.log(
        `${result.status} ${result.contentType.split(";")[0]} ${formatSize(result.size)}${success ? " PDF✓" : ""}`
      );

      rows.push({
        endpoint: url,
        auth,
        status: result.status,
        contentType: result.contentType,
        size: result.size,
        success,
        note: result.note,
      });
    }
  }

  printMarkdownTable(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
