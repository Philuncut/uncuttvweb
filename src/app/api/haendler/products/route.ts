import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import {
  enrichHaendlerProductFromWoo,
  isProductVisibleForHaendler,
} from "@/lib/haendler-filter";
import { wooFetchAll } from "@/lib/woocommerce";

interface WooProductRaw {
  meta_data?: Array<{ key: string; value: string }>;
  stock_status?: string;
  [key: string]: unknown;
}

const getCachedHaendlerProducts = unstable_cache(
  async () => {
    const products = await wooFetchAll<WooProductRaw>("/products", {
      per_page: "100",
    });

    const enriched = products.map((p) => enrichHaendlerProductFromWoo(p));

    const filtered = enriched.filter((p) =>
      isProductVisibleForHaendler(p, String(p.haendler_preis ?? ""))
    );

    return filtered;
  },
  ["haendler-products"],
  {
    revalidate: 86400,
    tags: ["haendler-products"],
  }
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("haendler_token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const filtered = await getCachedHaendlerProducts();

    return NextResponse.json(filtered);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fehler beim Laden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
