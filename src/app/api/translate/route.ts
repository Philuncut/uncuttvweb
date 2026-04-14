import { NextResponse } from "next/server";

// Read at request time to pick up .env.local changes without restart
function getApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

// In-memory translation cache
const cache = new Map<string, string>();

function cacheKey(text: string, lang: string) {
  return `${lang}:${text.slice(0, 200)}`;
}

export async function POST(request: Request) {
  try {
    const { text, targetLang } = (await request.json()) as {
      text: string;
      targetLang: string;
    };

    if (!text || !targetLang) {
      return NextResponse.json({ error: "Missing params." }, { status: 400 });
    }

    if (targetLang === "de") {
      return NextResponse.json({ translated: text });
    }

    const key = cacheKey(text, targetLang);
    const cached = cache.get(key);
    if (cached) {
      return NextResponse.json({ translated: cached });
    }

    const apiKey = getApiKey();
    console.log("[Translate] API key exists:", !!apiKey, "prefix:", apiKey?.slice(0, 20));
    if (!apiKey || apiKey === "your_anthropic_api_key") {
      console.log("[Translate] No valid ANTHROPIC_API_KEY set, returning original text");
      return NextResponse.json({ translated: text });
    }

    console.log("[Translate] Calling Anthropic API, text length:", text.length);
    console.log("[Translate] API key prefix:", apiKey.slice(0, 15));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system:
          "You are a translator. Translate the following German text to English. Return ONLY the translated text, nothing else. Preserve HTML tags if present.",
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Translate] API error:", res.status, errBody.slice(0, 300));
      return NextResponse.json({ translated: text });
    }

    const data = await res.json();
    const translated =
      data.content?.[0]?.text || text;

    cache.set(key, translated);

    return NextResponse.json({ translated });
  } catch (error) {
    console.error("[Translate] Error:", error);
    return NextResponse.json({ translated: "" }, { status: 500 });
  }
}
