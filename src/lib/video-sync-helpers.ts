import { Resend } from "resend";
import { parseIso8601Duration } from "@/lib/youtube-duration";

export function verifyVideoSyncCronAuth(request: Request): boolean {
  const expected =
    typeof process.env.YOUTUBE_SYNC_CRON_SECRET === "string" &&
    process.env.YOUTUBE_SYNC_CRON_SECRET.trim()
      ? `Bearer ${process.env.YOUTUBE_SYNC_CRON_SECRET.trim()}`
      : null;
  const authHeaderIn = request.headers.get("authorization");
  return !!expected && authHeaderIn === expected;
}

export function resendConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return !!k && k !== "your_resend_api_key";
}

export function formatSyncDurationMs(startedAt: number): string {
  const seconds = (Date.now() - startedAt) / 1000;
  return `${seconds.toFixed(1)}s`;
}

export async function sendVideoSyncSummaryEmail(
  subject: string,
  body: string
): Promise<void> {
  if (!resendConfigured()) {
    console.log("[video-sync] Summary (no Resend):", subject, body);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "UncutTV Cron <office@uncuttv.at>",
    to: "office@uncuttv.at",
    subject,
    text: body,
  });
}

export { parseIso8601Duration };
