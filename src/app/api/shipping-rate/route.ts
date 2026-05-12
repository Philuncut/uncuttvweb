import { NextResponse } from "next/server";

const WHOLESALE_FLAT_EUR = 10;

type RequestBody = {
  items: { id: number; quantity: number }[];
  country: string;
  postcode?: string;
  city?: string;
  address_1?: string;
  isWholesale?: boolean;
};

type StoreShippingOption = {
  rate_id: string;
  name: string;
  price: string;
  method_id: string;
  selected?: boolean;
  instance_id?: number;
};

type StorePackage = {
  shipping_rates?: StoreShippingOption[];
};

function normalizeWooBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function pickRate(packages: StorePackage[]): {
  rateEur: number;
  label: string;
  method_id: string;
  rate_id: string;
  instance_id?: number;
} | null {
  const options: StoreShippingOption[] = [];
  for (const pkg of packages) {
    if (pkg?.shipping_rates?.length) {
      options.push(...pkg.shipping_rates);
    }
  }
  if (options.length === 0) return null;
  const selected = options.find((o) => o.selected);
  const chosen =
    selected ||
    options.reduce((best, o) => {
      const a = parseInt(o.price, 10);
      const b = parseInt(best.price, 10);
      if (Number.isNaN(a)) return best;
      if (Number.isNaN(b)) return o;
      return a < b ? o : best;
    });
  const minor = parseInt(chosen.price, 10);
  if (Number.isNaN(minor)) return null;
  return {
    rateEur: minor / 100,
    label: chosen.name,
    method_id: chosen.method_id,
    rate_id: chosen.rate_id,
    instance_id: chosen.instance_id,
  };
}

async function fetchStoreShipping(
  wooBase: string,
  items: { id: number; quantity: number }[],
  country: string,
  postcode: string,
  city: string,
  address1: string
): Promise<
  | { ok: true; rate: number; label: string; method_id: string; rate_id: string; instance_id?: number }
  | { ok: false; reason: "no_zone" | "upstream" }
> {
  const base = `${normalizeWooBase(wooBase)}/wp-json/wc/store/v1`;
  let nonce = "";
  let cartToken = "";

  const readHeaders = (res: Response) => {
    const n = res.headers.get("nonce") || res.headers.get("Nonce");
    if (n) nonce = n;
    const ct = res.headers.get("cart-token") || res.headers.get("Cart-Token");
    if (ct) cartToken = ct;
  };

  const headers = (): HeadersInit => ({
    "Content-Type": "application/json",
    ...(nonce ? { Nonce: nonce } : {}),
    ...(cartToken ? { "Cart-Token": cartToken } : {}),
  });

  let res = await fetch(`${base}/cart`, { cache: "no-store" });
  readHeaders(res);
  if (!res.ok) return { ok: false, reason: "upstream" };

  for (const it of items) {
    res = await fetch(`${base}/cart/add-item`, {
      method: "POST",
      headers: headers(),
      cache: "no-store",
      body: JSON.stringify({ id: it.id, quantity: it.quantity }),
    });
    readHeaders(res);
    if (!res.ok) return { ok: false, reason: "upstream" };
  }

  res = await fetch(`${base}/cart/update-customer`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      shipping_address: {
        country: country || "AT",
        postcode: postcode || "",
        city: city || "—",
        address_1: address1 || "—",
      },
    }),
  });
  readHeaders(res);
  if (!res.ok) return { ok: false, reason: "upstream" };

  res = await fetch(`${base}/cart`, { headers: headers(), cache: "no-store" });
  readHeaders(res);
  if (!res.ok) return { ok: false, reason: "upstream" };

  const cart = (await res.json()) as {
    needs_shipping?: boolean;
    shipping_rates?: StorePackage[];
    errors?: unknown[];
  };

  if (cart.errors && Array.isArray(cart.errors) && cart.errors.length > 0) {
    return { ok: false, reason: "upstream" };
  }

  if (!cart.needs_shipping) {
    return {
      ok: true,
      rate: 0,
      label: "Kein Versand",
      method_id: "none",
      rate_id: "none",
    };
  }

  const picked = pickRate(cart.shipping_rates || []);
  if (!picked) {
    return { ok: false, reason: "no_zone" };
  }

  return {
    ok: true,
    rate: picked.rateEur,
    label: picked.label,
    method_id: picked.method_id,
    rate_id: picked.rate_id,
    instance_id: picked.instance_id,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { items, country, postcode, city, address_1, isWholesale } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "invalid_body", message: "items required" },
        { status: 400 }
      );
    }
    if (!country || typeof country !== "string") {
      return NextResponse.json(
        { error: "invalid_body", message: "country required" },
        { status: 400 }
      );
    }

    if (isWholesale === true) {
      return NextResponse.json({
        rate: WHOLESALE_FLAT_EUR,
        label: "Wholesale-Versand",
        method_id: "flat_rate",
        rate_id: "wholesale_flat",
        taxable: false,
        source: "wholesale-flat",
      });
    }

    const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL;
    if (!WOOCOMMERCE_URL) {
      return NextResponse.json(
        { error: "shipping_unavailable" },
        { status: 503 }
      );
    }

    try {
      const result = await fetchStoreShipping(
        WOOCOMMERCE_URL,
        items,
        country.trim().toUpperCase(),
        (postcode || "").trim(),
        (city || "").trim(),
        (address_1 || "").trim()
      );

      if (!result.ok) {
        if (result.reason === "no_zone") {
          return NextResponse.json({
            rate: null,
            label: "Versand nicht verfügbar",
            source: "no-zone",
          });
        }
        return NextResponse.json(
          { error: "shipping_unavailable" },
          { status: 503 }
        );
      }

      return NextResponse.json({
        rate: result.rate,
        label: result.label,
        method_id: result.method_id,
        rate_id: result.rate_id,
        instance_id: result.instance_id,
        source: "woo-store-api",
      });
    } catch {
      return NextResponse.json(
        { error: "shipping_unavailable" },
        { status: 503 }
      );
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
}
