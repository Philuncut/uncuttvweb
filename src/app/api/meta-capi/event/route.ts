import { NextRequest, NextResponse } from "next/server";
import { isAllowedMetaCapiEventOrigin } from "@/lib/meta-capi-auth";
import { sendCapiEvent, type CapiUserData } from "@/lib/meta-capi";

export const runtime = "nodejs";

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    cookies[key] = value;
  }
  return cookies;
}

export async function POST(req: NextRequest) {
  if (!isAllowedMetaCapiEventOrigin(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { event_name, event_id, event_source_url, custom_data, user_data } =
      body as {
        event_name?: string;
        event_id?: string;
        event_source_url?: string;
        custom_data?: Record<string, unknown>;
        user_data?: CapiUserData;
      };

    if (!event_name) {
      return NextResponse.json({ ok: false, error: "event_name required" }, { status: 400 });
    }

    const headers = req.headers;
    const clientIpAddress =
      (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined;
    const clientUserAgent = headers.get("user-agent") ?? undefined;

    const cookies = parseCookies(headers.get("cookie") ?? "");

    const mergedUserData: CapiUserData = {
      ...(user_data ?? {}),
      clientIpAddress: user_data?.clientIpAddress ?? clientIpAddress,
      clientUserAgent: user_data?.clientUserAgent ?? clientUserAgent,
      fbc: user_data?.fbc ?? cookies._fbc,
      fbp: user_data?.fbp ?? cookies._fbp,
    };

    const success = await sendCapiEvent({
      event_name,
      event_id,
      event_source_url,
      user_data: mergedUserData,
      custom_data,
    });

    return NextResponse.json({ ok: success });
  } catch (err) {
    console.error("[CAPI route] error:", err);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
