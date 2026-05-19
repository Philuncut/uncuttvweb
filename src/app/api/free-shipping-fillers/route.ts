import { NextResponse } from "next/server";
import { wooFetchAll } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";
import {
  FILLER_TARGET_COUNT,
  isFillerExcluded,
  pickFillerProducts,
  splitFillerPools,
} from "@/lib/cart-filler-pools";

function parseExcludeIds(raw: string): Set<number> {
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
}

function parseIdsParam(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function loadCatalog(): Promise<WooProduct[]> {
  return wooFetchAll<WooProduct>(
    "/products",
    { status: "publish" },
    { cache: "no-store" }
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const exclude = parseExcludeIds(searchParams.get("excludeIds") ?? "");
    const pick = searchParams.get("pick") === "1";
    const idsParam = searchParams.get("ids") ?? "";
    const requestedIds = parseIdsParam(idsParam);

    const catalog = await loadCatalog();

    if (requestedIds.length > 0) {
      const byId = new Map(catalog.map((p) => [p.id, p]));
      const products = requestedIds
        .map((id) => byId.get(id))
        .filter((p): p is WooProduct => !!p && !isFillerExcluded(p, exclude));

      return NextResponse.json({ products });
    }

    const { salePool, regularPool } = splitFillerPools(catalog, exclude);

    if (pick) {
      const products = pickFillerProducts(salePool, regularPool);
      return NextResponse.json({ products });
    }

    return NextResponse.json({
      products: pickFillerProducts(salePool, regularPool).slice(
        0,
        FILLER_TARGET_COUNT
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
