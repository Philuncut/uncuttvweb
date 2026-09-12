import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requirePortalSession } from "@/lib/auth-session";
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
  // Vorher genügte ein beliebiger Inhalt im Cookie `haendler_token`, um den
  // Händlerkatalog samt Einkaufspreisen zu lesen. Jetzt zählt die geprüfte
  // Rolle aus WordPress.
  const auth = await requirePortalSession();
  if (auth.response) return auth.response;

  try {
    const filtered = await getCachedHaendlerProducts();
    return NextResponse.json(filtered);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fehler beim Laden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
