import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export type AuthSessionPayload = {
  isLoggedIn: boolean;
  type: "haendler" | "customer" | null;
  name: string | null;
  dashboardHref: string | null;
  isWholesale: boolean;
};

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? email;
  return local.replace(/[._]+/g, " ").trim() || email;
}

export async function GET() {
  const empty: AuthSessionPayload = {
    isLoggedIn: false,
    type: null,
    name: null,
    dashboardHref: null,
    isWholesale: false,
  };

  const cookieStore = await cookies();

  const haendlerToken = cookieStore.get("haendler_token")?.value;
  const haendlerEmail = cookieStore.get("haendler_email")?.value;
  const haendlerRole = cookieStore.get("haendler_role")?.value?.toLowerCase() ?? "";
  const haendlerIsWholesale =
    haendlerRole === "wholesale" ||
    haendlerRole === "administrator" ||
    haendlerRole === "shop_manager";

  if (haendlerToken && haendlerEmail) {
    const nameCookie = cookieStore.get("haendler_name")?.value?.trim();
    const name = nameCookie || displayNameFromEmail(haendlerEmail);
    return NextResponse.json({
      isLoggedIn: true,
      type: "haendler",
      name,
      dashboardHref: "/konto",
      isWholesale: haendlerIsWholesale,
    } satisfies AuthSessionPayload);
  }

  const wooEmail = cookieStore.get("woo_customer_email")?.value;
  const wooToken = cookieStore.get("woo_token")?.value;

  if (wooEmail && wooToken) {
    const nameCookie = cookieStore.get("woo_customer_name")?.value?.trim();
    const wooRole = cookieStore.get("woo_customer_role")?.value?.toLowerCase() ?? "";
    const name = nameCookie || displayNameFromEmail(wooEmail);
    const isWholesale =
      wooRole === "wholesale" ||
      wooRole === "administrator" ||
      wooRole === "shop_manager";
    return NextResponse.json({
      isLoggedIn: true,
      type: "customer",
      name,
      dashboardHref: "/konto",
      isWholesale,
    } satisfies AuthSessionPayload);
  }

  return NextResponse.json(empty);
}
