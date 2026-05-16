import { createHash } from "crypto";

const MIN_LENGTH_TO_TRANSLATE = 30;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export function hashDescription(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

/**
 * Translates German video description to English via Claude Haiku.
 * Never throws — returns "" on any failure so the sync continues.
 */
export async function translateDescriptionToEnglish(
  text: string
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length < MIN_LENGTH_TO_TRANSLATE) return trimmed;

  const apiKey = process.env.ANTHROPIC_API_KEY2?.trim();
  if (!apiKey || apiKey === "your_anthropic_api_key") {
    console.warn("[translate-description] ANTHROPIC_API_KEY2 not set, skipping translation");
    return "";
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system:
          "You are a translator. Translate the following German text to English. " +
          "Maintain the casual/edgy tone if present. Keep film titles, brand names " +
          "(UncutTV, etc.), and proper nouns unchanged. " +
          "Return ONLY the translated text, no preamble, no quotes.",
        messages: [{ role: "user", content: trimmed }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[translate-description] API error", res.status, body.slice(0, 200));
      return "";
    }

    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    const translated = data.content?.[0]?.text?.trim() ?? "";

    if (!translated) {
      console.warn("[translate-description] Empty response from API");
      return "";
    }

    if (translated.length < trimmed.length * 0.3) {
      console.warn(
        "[translate-description] Suspiciously short translation — keeping partial result",
        { originalLength: trimmed.length, translatedLength: translated.length }
      );
    }

    return translated;
  } catch (err) {
    console.error(
      "[translate-description] Unexpected error",
      err instanceof Error ? err.message : String(err)
    );
    return "";
  }
}
