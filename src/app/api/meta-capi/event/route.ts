import { NextRequest, NextResponse } from "next/server";
import { sendCapiEvent } from "@/lib/meta-capi";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  console.log("[CAPI route] POST received");
  try {
    const body = await req.json();
    console.log("[CAPI route] parsed body:", JSON.stringify(body));
    const { event_name, event_id, event_source_url, custom_data } = body;

    if (!event_name) {
      return NextResponse.json({ ok: false, error: "event_name required" }, { status: 400 });
    }

    const headers = req.headers;
    const clientIpAddress =
      (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined;
    const clientUserAgent = headers.get("user-agent") ?? undefined;

    const cookieHeader = headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim().split("="))
        .filter((p) => p.length === 2) as [string, string][]
    );

    console.log("[CAPI route] calling sendCapiEvent for:", event_name);
    const success = await sendCapiEvent({
      event_name,
      event_id,
      event_source_url,
      user_data: {
        clientIpAddress,
        clientUserAgent,
        fbc: cookies._fbc,
        fbp: cookies._fbp,
      },
      custom_data,
    });

    console.log("[CAPI route] sendCapiEvent returned:", success);
    return NextResponse.json({ ok: success });
  } catch (err) {
    console.error("[CAPI route] error:", err);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
