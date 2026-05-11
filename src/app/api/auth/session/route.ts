import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export type AuthSessionPayload = {
  isLoggedIn: boolean;
  type: "haendler" | "customer" | null;
  name: string | null;
  dashboardHref: string | null;
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
  };

  const cookieStore = await cookies();

  const haendlerToken = cookieStore.get("haendler_token")?.value;
  const haendlerEmail = cookieStore.get("haendler_email")?.value;

  if (haendlerToken && haendlerEmail) {
    const nameCookie = cookieStore.get("haendler_name")?.value?.trim();
    const name = nameCookie || displayNameFromEmail(haendlerEmail);
    return NextResponse.json({
      isLoggedIn: true,
      type: "haendler",
      name,
      dashboardHref: "/haendler/dashboard",
    } satisfies AuthSessionPayload);
  }

  const wooEmail = cookieStore.get("woo_customer_email")?.value;
  const wooToken = cookieStore.get("woo_token")?.value;

  if (wooEmail && wooToken) {
    const nameCookie = cookieStore.get("woo_customer_name")?.value?.trim();
    const name = nameCookie || displayNameFromEmail(wooEmail);
    return NextResponse.json({
      isLoggedIn: true,
      type: "customer",
      name,
      dashboardHref: "/konto",
    } satisfies AuthSessionPayload);
  }

  return NextResponse.json(empty);
}
