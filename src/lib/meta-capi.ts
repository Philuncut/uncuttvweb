import crypto from "crypto";

export interface CapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}

export interface CapiCustomData {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  num_items?: number;
  order_id?: string;
  search_string?: string;
}

export interface CapiEvent {
  event_name: string;
  event_time?: number;
  event_id?: string;
  event_source_url?: string;
  action_source?: "website" | "email" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
  user_data: CapiUserData;
  custom_data?: CapiCustomData;
}

function sha256(value: string): string {
  return crypto.createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

function hashUserData(user: CapiUserData): Record<string, unknown> {
  const hashed: Record<string, unknown> = {};
  if (user.email) hashed.em = sha256(user.email);
  if (user.phone) hashed.ph = sha256(user.phone.replace(/[^0-9]/g, ""));
  if (user.firstName) hashed.fn = sha256(user.firstName);
  if (user.lastName) hashed.ln = sha256(user.lastName);
  if (user.externalId) hashed.external_id = sha256(user.externalId);
  if (user.clientIpAddress) hashed.client_ip_address = user.clientIpAddress;
  if (user.clientUserAgent) hashed.client_user_agent = user.clientUserAgent;
  if (user.fbc) hashed.fbc = user.fbc;
  if (user.fbp) hashed.fbp = user.fbp;
  return hashed;
}

export async function sendCapiEvent(event: CapiEvent): Promise<boolean> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    console.warn("[CAPI] Missing pixelId or accessToken, skipping:", event.event_name);
    return false;
  }

  const payload = {
    data: [{
      event_name: event.event_name,
      event_time: event.event_time ?? Math.floor(Date.now() / 1000),
      event_id: event.event_id,
      event_source_url: event.event_source_url,
      action_source: event.action_source ?? "website",
      user_data: hashUserData(event.user_data),
      custom_data: event.custom_data,
    }],
    ...(testEventCode && { test_event_code: testEventCode }),
  };

  console.log("[CAPI] sending event:", event.event_name);
  console.log("[CAPI] pixelId:", pixelId, "tokenStart:", accessToken?.slice(0, 6));
  console.log("[CAPI] testEventCode:", testEventCode);
  console.log("[CAPI] payload:", JSON.stringify(payload));

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const responseText = await res.text();
    console.log("[CAPI] response status:", res.status);
    if (!res.ok) {
      console.error("[CAPI]", event.event_name, "failed:", responseText);
      return false;
    }
    console.log("[CAPI]", event.event_name, "success:", responseText);
    return true;
  } catch (err) {
    console.error("[CAPI] network error:", err);
    return false;
  }
}
