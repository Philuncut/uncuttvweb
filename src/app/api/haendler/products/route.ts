import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { wooFetchAll } from "@/lib/woocommerce";

interface WooProductRaw {
  meta_data?: Array<{ key: string; value: string }>;
  [key: string]: unknown;
}

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

    const products = await wooFetchAll<WooProductRaw>("/products", {
      per_page: "100",
    });

    // Extract haendler_preis from meta_data
    const enriched = products.map((p) => {
      const meta = p.meta_data || [];
      const haendlerMeta = meta.find(
        (m) =>
          m.key === "haendler_preis" ||
          m.key === "_haendler_preis" ||
          m.key === "wholesale_price" ||
          m.key === "_wholesale_price"
      );
      const salesKitMeta = meta.find(
        (m) => m.key === "sales_kit_url" || m.key === "_sales_kit_url"
      );
      const sk = salesKitMeta?.value;
      const sales_kit_url =
        typeof sk === "string"
          ? sk.trim()
          : sk != null
            ? String(sk).trim()
            : "";

      return {
        ...p,
        haendler_preis: haendlerMeta?.value || "",
        sales_kit_url,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fehler beim Laden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
