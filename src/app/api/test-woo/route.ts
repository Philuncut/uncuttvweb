import { NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce";

export async function GET() {
  try {
    const products = await wooFetch("/products", { per_page: "5" });
    return NextResponse.json(products);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
