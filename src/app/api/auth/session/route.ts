import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCartPersistAuth } from "@/lib/cart-persist-auth";
import {
  isNewsletterSubscribedFromMeta,
} from "@/lib/newsletter-customer-meta";
import { fetchWooCustomer } from "@/lib/woo-customer-api";
import { WHOLESALE_ROLE } from "@/lib/auth-constants";

export const dynamic = "force-dynamic";

export type AuthSessionPayload = {
  isLoggedIn: boolean;
  type: "haendler" | "customer" | null;
  name: string | null;
  dashboardHref: string | null;
  isWholesale: boolean;
  isNewsletterSubscribed: boolean;
};

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? email;
  return local.replace(/[._]+/g, " ").trim() || email;
}

async function resolveNewsletterSubscribed(): Promise<boolean> {
  const auth = await getCartPersistAuth();
  if (!auth) return false;
  try {
    const customer = await fetchWooCustomer(auth.customerId);
    return isNewsletterSubscribedFromMeta(customer.meta_data);
  } catch {
    return false;
  }
}

export async function GET() {
  const empty: AuthSessionPayload = {
    isLoggedIn: false,
    type: null,
    name: null,
    dashboardHref: null,
    isWholesale: false,
    isNewsletterSubscribed: false,
  };

  const cookieStore = await cookies();

  const haendlerToken = cookieStore.get("haendler_token")?.value;
  const haendlerEmail = cookieStore.get("haendler_email")?.value;
  const haendlerRole = cookieStore.get("haendler_role")?.value?.toLowerCase() ?? "";
  const haendlerIsWholesale = haendlerRole === WHOLESALE_ROLE;

  if (haendlerToken && haendlerEmail) {
    const nameCookie = cookieStore.get("haendler_name")?.value?.trim();
    const name = nameCookie || displayNameFromEmail(haendlerEmail);
    const isNewsletterSubscribed = await resolveNewsletterSubscribed();
    return NextResponse.json({
      isLoggedIn: true,
      type: "haendler",
      name,
      dashboardHref: "/konto",
      isWholesale: haendlerIsWholesale,
      isNewsletterSubscribed,
    } satisfies AuthSessionPayload);
  }

  const wooEmail = cookieStore.get("woo_customer_email")?.value;
  const wooToken = cookieStore.get("woo_token")?.value;

  if (wooEmail && wooToken) {
    const nameCookie = cookieStore.get("woo_customer_name")?.value?.trim();
    const wooRole = cookieStore.get("woo_customer_role")?.value?.toLowerCase() ?? "";
    const name = nameCookie || displayNameFromEmail(wooEmail);
    const isWholesale = wooRole === WHOLESALE_ROLE;
    const isNewsletterSubscribed = await resolveNewsletterSubscribed();
    return NextResponse.json({
      isLoggedIn: true,
      type: "customer",
      name,
      dashboardHref: "/konto",
      isWholesale,
      isNewsletterSubscribed,
    } satisfies AuthSessionPayload);
  }

  return NextResponse.json(empty);
}
