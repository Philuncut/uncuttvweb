import { metaValueToString } from "@/lib/persisted-cart";
import { fetchWooCustomer, updateWooCustomerMeta } from "@/lib/woo-customer-api";

export const NEWSLETTER_SUBSCRIBED_META_KEY = "_uncuttv_newsletter_subscribed";

export function isNewsletterSubscribedFromMeta(
  meta: Array<{ key?: string; value?: unknown }> | undefined
): boolean {
  const row = meta?.find((m) => m?.key === NEWSLETTER_SUBSCRIBED_META_KEY);
  return metaValueToString(row?.value).toLowerCase() === "yes";
}

export async function setNewsletterSubscribedCustomerMeta(
  customerId: string
): Promise<void> {
  const customer = await fetchWooCustomer(customerId);
  const next = (customer.meta_data ?? [])
    .filter((row) => row?.key)
    .map((row) => ({
      key: String(row.key),
      value: metaValueToString(row.value),
    }));

  const idx = next.findIndex((row) => row.key === NEWSLETTER_SUBSCRIBED_META_KEY);
  if (idx >= 0) next[idx] = { key: NEWSLETTER_SUBSCRIBED_META_KEY, value: "yes" };
  else next.push({ key: NEWSLETTER_SUBSCRIBED_META_KEY, value: "yes" });

  await updateWooCustomerMeta(customerId, next);
}
