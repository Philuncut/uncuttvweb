import { cookies } from "next/headers";

export type CartPersistAuth = {
  customerId: string;
};

/** Same customer identification as /api/auth/me and profile routes. */
export async function getCartPersistAuth(): Promise<CartPersistAuth | null> {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("woo_customer_id")?.value?.trim();
  const wooToken = cookieStore.get("woo_token")?.value;
  const haendlerToken = cookieStore.get("haendler_token")?.value;

  if (!customerId) return null;
  if (!wooToken && !haendlerToken) return null;

  return { customerId };
}
