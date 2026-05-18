import { NextRequest, NextResponse } from "next/server";
import { WHOLESALE_ROLE } from "@/lib/auth-constants";

const WHOLESALE_ROLES = new Set([WHOLESALE_ROLE]);

function isWholesaleUser(request: NextRequest): boolean {
  const c = request.cookies;

  // Haendler session takes priority (same precedence as the session route)
  const haendlerToken = c.get("haendler_token")?.value;
  const haendlerEmail = c.get("haendler_email")?.value;
  if (haendlerToken && haendlerEmail) {
    const role = c.get("haendler_role")?.value?.toLowerCase() ?? "";
    return WHOLESALE_ROLES.has(role);
  }

  // Woo customer session
  const wooEmail = c.get("woo_customer_email")?.value;
  const wooToken = c.get("woo_token")?.value;
  if (wooEmail && wooToken) {
    const role = c.get("woo_customer_role")?.value?.toLowerCase() ?? "";
    return WHOLESALE_ROLES.has(role);
  }

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isB2cRoute =
    pathname === "/" ||
    pathname === "/shop" ||
    pathname.startsWith("/shop/");

  if (isB2cRoute && isWholesaleUser(request)) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Middleware] Wholesale redirect: ${pathname} → /haendler/dashboard`
      );
    }
    const target = request.nextUrl.clone();
    target.pathname = "/haendler/dashboard";
    return NextResponse.redirect(target, 307);
  }

  return NextResponse.next();
}

export const config = {
  // Only run on the three B2C entry-points; skip /api, /_next, static files, etc.
  matcher: ["/", "/shop", "/shop/:path*"],
};
