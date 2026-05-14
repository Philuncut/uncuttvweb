import { NextResponse } from "next/server";

const WHOLESALE_FLAT_EUR = 10;

const B2C_MULTI_SHIP_COUNTRIES = new Set(["AT", "DE"]);

type RequestBody = {
  items: { id: number; quantity: number }[];
  country: string;
  state?: string;
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

export type PublicShippingRate = {
  rate_id: string;
  method_id: string;
  name: string;
  /** Brutto in EUR (Store API liefert Minor Units; hier als Euro-Zahl) */
  price: number;
  instance_id?: number;
};

function normalizeWooBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function collectRatesSorted(packages: StorePackage[]): StoreShippingOption[] {
  const options: StoreShippingOption[] = [];
  for (const pkg of packages) {
    if (pkg?.shipping_rates?.length) {
      options.push(...pkg.shipping_rates);
    }
  }
  const byId = new Map<string, StoreShippingOption>();
  for (const o of options) {
    if (!o?.rate_id) continue;
    if (!byId.has(o.rate_id)) byId.set(o.rate_id, o);
  }
  const unique = [...byId.values()];
  unique.sort((a, b) => {
    const pa = parseInt(a.price, 10);
    const pb = parseInt(b.price, 10);
    if (Number.isNaN(pa)) return 1;
    if (Number.isNaN(pb)) return -1;
    return pa - pb;
  });
  return unique;
}

function toPublicRates(options: StoreShippingOption[]): PublicShippingRate[] {
  return options.map((o) => {
    const minor = parseInt(o.price, 10);
    const price = Number.isNaN(minor) ? 0 : minor / 100;
    return {
      rate_id: o.rate_id,
      method_id: o.method_id,
      name: o.name,
      price,
      ...(typeof o.instance_id === "number" ? { instance_id: o.instance_id } : {}),
    };
  });
}

async function fetchStoreShipping(
  wooBase: string,
  items: { id: number; quantity: number }[],
  country: string,
  state: string,
  postcode: string,
  city: string,
  address1: string
): Promise<
  | {
      ok: true;
      mode: "multi";
      rates: PublicShippingRate[];
      selectedRateId: string;
    }
  | {
      ok: true;
      mode: "single";
      rate: number;
      label: string;
      method_id: string;
      rate_id: string;
      instance_id?: number;
    }
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
        ...(state ? { state } : {}),
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
      mode: "single",
      rate: 0,
      label: "Kein Versand",
      method_id: "none",
      rate_id: "none",
    };
  }

  const rawOptions = collectRatesSorted(cart.shipping_rates || []);
  if (rawOptions.length === 0) {
    return { ok: false, reason: "no_zone" };
  }

  const cc = country.trim().toUpperCase();
  const publicRates = toPublicRates(rawOptions);

  if (B2C_MULTI_SHIP_COUNTRIES.has(cc) && publicRates.length > 1) {
    const selectedRateId = publicRates[0].rate_id;
    return {
      ok: true,
      mode: "multi",
      rates: publicRates,
      selectedRateId,
    };
  }

  const selected = rawOptions.find((o) => o.selected) ?? rawOptions[0];
  const minor = parseInt(selected.price, 10);
  if (Number.isNaN(minor)) return { ok: false, reason: "no_zone" };

  return {
    ok: true,
    mode: "single",
    rate: minor / 100,
    label: selected.name,
    method_id: selected.method_id,
    rate_id: selected.rate_id,
    ...(typeof selected.instance_id === "number"
      ? { instance_id: selected.instance_id }
      : {}),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { items, country, state, postcode, city, address_1, isWholesale } =
      body;

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
        rates: [
          {
            rate_id: "wholesale_flat",
            method_id: "flat_rate",
            name: "Wholesale-Versand",
            price: WHOLESALE_FLAT_EUR,
          },
        ],
        selectedRateId: "wholesale_flat",
        multiple: false,
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
      const stateVal =
        typeof state === "string" && state.trim()
          ? state.trim().toUpperCase()
          : "";

      const result = await fetchStoreShipping(
        WOOCOMMERCE_URL,
        items,
        country.trim().toUpperCase(),
        stateVal,
        (postcode || "").trim(),
        (city || "").trim(),
        (address_1 || "").trim()
      );

      if (!result.ok) {
        if (result.reason === "no_zone") {
          return NextResponse.json({
            rates: [],
            selectedRateId: "",
            multiple: false,
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

      if (result.mode === "multi") {
        const first = result.rates[0];
        return NextResponse.json({
          rates: result.rates,
          selectedRateId: result.selectedRateId,
          multiple: true,
          rate: first.price,
          label: first.name,
          method_id: first.method_id,
          rate_id: first.rate_id,
          ...(first.instance_id != null ? { instance_id: first.instance_id } : {}),
          source: "woo-store-api-multi",
        });
      }

      return NextResponse.json({
        rates: [
          {
            rate_id: result.rate_id,
            method_id: result.method_id,
            name: result.label,
            price: result.rate,
            ...(result.instance_id != null
              ? { instance_id: result.instance_id }
              : {}),
          },
        ],
        selectedRateId: result.rate_id,
        multiple: false,
        rate: result.rate,
        label: result.label,
        method_id: result.method_id,
        rate_id: result.rate_id,
        ...(result.instance_id != null
          ? { instance_id: result.instance_id }
          : {}),
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
