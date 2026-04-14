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

export async function wooFetch<T = unknown>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders,
    cache: "no-store",
  });

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
  params: Record<string, string> = {}
): Promise<T[]> {
  const firstUrl = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    firstUrl.searchParams.set(key, value);
  }
  if (!firstUrl.searchParams.has("per_page")) {
    firstUrl.searchParams.set("per_page", "100");
  }
  firstUrl.searchParams.set("page", "1");

  const firstRes = await fetch(firstUrl.toString(), {
    headers: authHeaders,
    cache: "no-store",
  });

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
      fetch(url.toString(), { headers: authHeaders, cache: "no-store" })
        .then((res) => {
          if (!res.ok) return [] as T[];
          return res.json() as Promise<T[]>;
        })
    );
  }

  const remainingPages = await Promise.all(pagePromises);
  return firstData.concat(...remainingPages);
}
