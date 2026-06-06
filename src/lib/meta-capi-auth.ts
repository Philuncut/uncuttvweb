import crypto from "crypto";

function siteHosts(): string[] {
  const hosts = new Set<string>();
  for (const raw of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ]) {
    if (!raw?.trim()) continue;
    try {
      hosts.add(new URL(raw.trim()).host.toLowerCase());
    } catch {
      // ignore invalid URL
    }
  }
  return [...hosts];
}

/** Same-origin guard for browser-initiated /api/meta-capi/event (no secret in client bundle). */
export function isAllowedMetaCapiEventOrigin(req: Request): boolean {
  const allowed = siteHosts();
  if (allowed.length === 0) return true;

  for (const header of ["origin", "referer"]) {
    const value = req.headers.get(header);
    if (!value?.trim()) continue;
    try {
      const host = new URL(value.trim()).host.toLowerCase();
      if (allowed.includes(host)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

/** WooCommerce stores secrets with htmlspecialchars; HMAC uses decoded value. */
function decodeWooWebhookSecret(secret: string): string {
  return secret
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * WooCommerce deliver_ping(): body `webhook_id={id}`, no signature header.
 * Must return 2xx so Woo marks the webhook active.
 */
export function isWooWebhookConnectivityPing(
  rawBody: string,
  signatureHeader: string | null,
  topicHeader: string | null
): boolean {
  const topic = (topicHeader ?? "").trim().toLowerCase();
  if (topic === "action.ping") return true;

  const body = rawBody.trim();
  return !signatureHeader?.trim() && /^webhook_id=\d+$/.test(body);
}

/**
 * WooCommerce: Base64( HMAC-SHA256( rawBody, secret ) ) in x-wc-webhook-signature.
 * Body must be the exact raw request text (never re-stringified JSON).
 */
export function verifyWooWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.trim() || !secret.trim()) return false;

  const expectedMac = crypto
    .createHmac("sha256", decodeWooWebhookSecret(secret.trim()))
    .update(rawBody, "utf8")
    .digest();

  let receivedMac: Buffer;
  try {
    receivedMac = Buffer.from(signatureHeader.trim(), "base64");
  } catch {
    return false;
  }

  if (receivedMac.length !== expectedMac.length) return false;
  return crypto.timingSafeEqual(receivedMac, expectedMac);
}
