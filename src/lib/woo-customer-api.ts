const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;

const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

export type WooCustomerMetaRow = { key?: string; value?: unknown };

export type WooCustomerRecord = {
  meta_data?: WooCustomerMetaRow[];
};

export async function fetchWooCustomer(
  customerId: string
): Promise<WooCustomerRecord> {
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3/customers/${customerId}`, {
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `WooCommerce customer ${customerId} fetch failed`);
  }

  return (await res.json()) as WooCustomerRecord;
}

export async function updateWooCustomerMeta(
  customerId: string,
  meta_data: Array<{ key: string; value: string }>
): Promise<void> {
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3/customers/${customerId}`, {
    method: "PUT",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ meta_data }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "WooCommerce customer update failed");
  }
}
