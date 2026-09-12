import { getSession } from "@/lib/auth-session";

export type CartPersistAuth = {
  customerId: string;
};

/**
 * Dieselbe Kundenzuordnung wie überall sonst, jetzt aus dem geprüften
 * Token statt aus dem Cookie `woo_customer_id`. Vorher genügte eine
 * beliebige Nummer in diesem Cookie, um den gespeicherten Warenkorb eines
 * fremden Kontos zu lesen und zu überschreiben.
 */
export async function getCartPersistAuth(): Promise<CartPersistAuth | null> {
  const session = await getSession();
  if (!session) return null;

  return { customerId: String(session.customerId) };
}
