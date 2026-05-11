import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  const secret = request.headers.get("x-revalidate-secret");
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("haendler-products", "max");
  return NextResponse.json({ revalidated: true });
}
