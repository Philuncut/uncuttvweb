import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  const opts = { path: "/" } as const;

  // B2C cookies
  cookieStore.delete({ name: "woo_customer_id", ...opts });
  cookieStore.delete({ name: "woo_customer_email", ...opts });
  cookieStore.delete({ name: "woo_customer_role", ...opts });
  cookieStore.delete({ name: "woo_token", ...opts });
  cookieStore.delete({ name: "woo_customer_name", ...opts });

  // Haendler cookies — also cleared so wholesale users who logged in via
  // B2C (/konto/login) are fully signed out from both sessions at once.
  cookieStore.delete({ name: "haendler_token", ...opts });
  cookieStore.delete({ name: "haendler_id", ...opts });
  cookieStore.delete({ name: "haendler_email", ...opts });
  cookieStore.delete({ name: "haendler_role", ...opts });
  cookieStore.delete({ name: "haendler_name", ...opts });

  return NextResponse.json({ success: true });
}
