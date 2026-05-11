const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;

const baseUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3`;

const authHeaders = new Headers({
  Authorization:
    "Basic " +
    Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString(
      "base64"
    ),
  "Content-Type": "application/json",
});

/** Default: 60s Data Cache. `cache: "no-store"` überschreibt (z. B. Debug-Routen). */
export type WooFetchOptions = {
  revalidate?: number;
  cache?: "no-store";
};

const DEFAULT_REVALIDATE = 60;

function buildFetchInit(options?: WooFetchOptions): RequestInit {
  if (options?.cache === "no-store") {
    return { headers: authHeaders, cache: "no-store" };
  }
  const revalidate = options?.revalidate ?? DEFAULT_REVALIDATE;
  return {
    headers: authHeaders,
    next: { revalidate },
  };
}

export async function wooFetch<T = unknown>(
  endpoint: string,
  params: Record<string, string> = {},
  options?: WooFetchOptions
): Promise<T> {
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), buildFetchInit(options));

  if (!res.ok) {
    throw new Error(
      `WooCommerce API error: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch all pages from a paginated WooCommerce endpoint.
 * Uses x-wp-totalpages header to determine page count.
 */
export async function wooFetchAll<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options?: WooFetchOptions
): Promise<T[]> {
  const firstUrl = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    firstUrl.searchParams.set(key, value);
  }
  if (!firstUrl.searchParams.has("per_page")) {
    firstUrl.searchParams.set("per_page", "100");
  }
  firstUrl.searchParams.set("page", "1");

  const init = buildFetchInit(options);

  const firstRes = await fetch(firstUrl.toString(), init);

  if (!firstRes.ok) {
    throw new Error(
      `WooCommerce API error: ${firstRes.status} ${firstRes.statusText}`
    );
  }

  const totalPages = parseInt(
    firstRes.headers.get("x-wp-totalpages") || "1",
    10
  );
  const firstData = (await firstRes.json()) as T[];

  if (totalPages <= 1) {
    return firstData;
  }

  // Fetch remaining pages in parallel
  const pagePromises: Promise<T[]>[] = [];
  for (let page = 2; page <= totalPages; page++) {
    const url = new URL(firstUrl.toString());
    url.searchParams.set("page", String(page));
    pagePromises.push(
      fetch(url.toString(), init).then((res) => {
        if (!res.ok) return [] as T[];
        return res.json() as Promise<T[]>;
      })
    );
  }

  const remainingPages = await Promise.all(pagePromises);
  return firstData.concat(...remainingPages);
}
