import { NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/auth-session";
import {
  enrichHaendlerProductFromWoo,
  hasPositiveHaendlerPreis,
} from "@/lib/haendler-filter";
import type { WooProduct } from "@/lib/types";
import { wooFetch } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

const MAX_IDS = 50;

type WooProductRaw = WooProduct & {
  meta_data?: Array<{ key: string; value: unknown }>;
};

/**
 * Single Woo request: WC REST v3 `GET /products?include=id1,id2,...&orderby=include&per_page=N`.
 * If that fails, fallback: batches of concurrent `GET /products/{id}` (concurrency 3 — same throttle
 * pattern as elsewhere when Woo rejects request storms).
 */
const FALLBACK_CONCURRENCY = 3;

async function enrichEligibleProducts(
  uniqueIds: number[]
): Promise<
  Record<string, WooProductRaw & { haendler_preis: string; sales_kit_url: string }>
> {
  const eligible: Record<
    string,
    WooProductRaw & { haendler_preis: string; sales_kit_url: string }
  > = {};

  function tryPushFromRaw(raw: WooProductRaw | null | undefined) {
    if (!raw || typeof raw.id !== "number") return;
    const enriched = enrichHaendlerProductFromWoo(raw);
    if (!hasPositiveHaendlerPreis(enriched.haendler_preis)) return;
    eligible[String(raw.id)] = enriched;
  }

  if (uniqueIds.length === 0) return eligible;

  try {
    const bulk = await wooFetch<WooProductRaw[]>(
      "/products",
      {
        include: uniqueIds.join(","),
        orderby: "include",
        per_page: String(Math.min(Math.max(uniqueIds.length, 1), 100)),
      },
      { cache: "no-store" }
    );
    if (Array.isArray(bulk)) {
      for (const raw of bulk) tryPushFromRaw(raw);
      return eligible;
    }
  } catch (e) {
    console.warn("[cart/reprice-wholesale] bulk fetch failed; using batched fallback", e);
  }

  for (let offset = 0; offset < uniqueIds.length; offset += FALLBACK_CONCURRENCY) {
    const slice = uniqueIds.slice(offset, offset + FALLBACK_CONCURRENCY);
    await Promise.allSettled(
      slice.map(async (id) => {
        try {
          const raw = await wooFetch<WooProductRaw>(
            `/products/${id}`,
            {},
            { cache: "no-store" }
          );
          tryPushFromRaw(raw);
        } catch {
          /* skip unreadable SKU */
        }
      })
    );
  }

  return eligible;
}

/**
 * Resolve current wholesale line prices + full product payloads needed for `toHaendlerCartProduct`.
 */
export async function POST(request: Request) {
  // Vorher genuegten zwei selbst gesetzte Cookies mit beliebigem Inhalt,
  // um an die Haendlerpreise zu kommen. Die Rolle stammt jetzt aus
  // WordPress. An der Preisberechnung selbst aendert sich nichts.
  const auth = await requirePortalSession();
  if (auth.response) return auth.response;

  try {
    const body = (await request.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids)) {
      return NextResponse.json(
        { ok: false, error: "ids must be an array" },
        { status: 400 }
      );
    }

    const rawIds = body.ids.filter(
      (id): id is number =>
        typeof id === "number" && Number.isFinite(id) && id >= 1
    );
    const uniqueIds = [...new Set(rawIds)].slice(0, MAX_IDS);

    const eligible = await enrichEligibleProducts(uniqueIds);

    return NextResponse.json({ ok: true, eligible });
  } catch (err) {
    console.error("[cart/reprice-wholesale]", err);
    return NextResponse.json(
      { ok: false, error: "failed" },
      { status: 500 }
    );
  }
}
