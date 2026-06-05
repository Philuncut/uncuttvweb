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

/** WooCommerce webhook HMAC (x-wc-webhook-signature, base64). */
export function verifyWooWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.trim() || !secret.trim()) return false;
  const expected = crypto
    .createHmac("sha256", secret.trim())
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader.trim());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
