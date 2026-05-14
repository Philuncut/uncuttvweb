import { NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce";
import type { WooProduct } from "@/lib/types";
import { parsePrice } from "@/lib/parse-price";
import { MAX_FILLER_PRICE_EUR } from "@/lib/free-shipping-suggestion";

const RESULT_LIMIT = 6;
const FETCH_PER_PAGE = "40";

function shuffleInPlace<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function unitGrossForFilter(p: WooProduct): number {
  const sale = parsePrice(p.sale_price);
  if (p.on_sale && sale > 0) return sale;
  const reg = parsePrice(p.regular_price);
  if (reg > 0) return reg;
  return parsePrice(p.price);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const excludeRaw = searchParams.get("excludeIds") ?? "";
    const exclude = new Set(
      excludeRaw
        .split(/[,;\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    );

    const raw = await wooFetch<WooProduct[]>(
      "/products",
      {
        per_page: FETCH_PER_PAGE,
        status: "publish",
        orderby: "price",
        order: "asc",
      },
      { cache: "no-store" }
    );

    const filtered = raw.filter((p) => {
      if (p.stock_status === "outofstock") return false;
      if (exclude.has(p.id)) return false;
      const u = unitGrossForFilter(p);
      return u > 0 && u <= MAX_FILLER_PRICE_EUR;
    });

    const products = shuffleInPlace(filtered).slice(0, RESULT_LIMIT);

    return NextResponse.json({ products });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
