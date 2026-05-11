import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  const opts = { path: "/" } as const;

  cookieStore.delete({ name: "haendler_token", ...opts });
  cookieStore.delete({ name: "haendler_id", ...opts });
  cookieStore.delete({ name: "haendler_email", ...opts });
  cookieStore.delete({ name: "haendler_role", ...opts });
  cookieStore.delete({ name: "haendler_name", ...opts });

  return NextResponse.json({ success: true });
}
