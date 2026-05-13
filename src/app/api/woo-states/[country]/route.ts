import { NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce";

type WooCountryResponse = {
  code?: string;
  states?: Record<string, string>;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ country: string }> }
) {
  const { country: raw } = await context.params;
  const code = (raw || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  }

  try {
    const data = await wooFetch<WooCountryResponse>(
      `/data/countries/${code}`,
      {},
      { revalidate: 86400 }
    );

    const rawStates = data?.states;
    const statesObj =
      rawStates && typeof rawStates === "object" && !Array.isArray(rawStates)
        ? (rawStates as Record<string, string>)
        : {};

    const states = Object.entries(statesObj).map(([c, name]) => ({
      code: c,
      name: String(name),
    }));
    states.sort((a, b) => a.name.localeCompare(b.name, "de"));

    return NextResponse.json({ states });
  } catch {
    return NextResponse.json({ states: [] });
  }
}
