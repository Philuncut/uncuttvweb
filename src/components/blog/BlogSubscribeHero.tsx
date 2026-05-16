"use client";

import { useEffect, useRef, useState } from "react";
import { formatTranslation } from "@/lib/translations";

// TODO: raise SUBSCRIBER_GOAL to 10000 once 6000 is reached
const SUBSCRIBER_GOAL = 6000;
const COUNT_UP_DURATION = 1500;
const PROGRESS_DURATION = 2000;
const SESSION_FLAG = "blog_hero_animated";

const FONT_HEADING = `'Playfair Display', Georgia, serif`;
const FONT_BODY = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

type CouponFormStatus = "idle" | "loading" | "success" | "alreadyClaimed" | "error";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function parseSubscriberCount(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type Props = {
  subscriberCount: string;
  subscribeUrl: string;
  language: "de" | "en";
  t: (k: string) => string;
};

export default function BlogSubscribeHero({
  subscriberCount,
  subscribeUrl,
  language,
  t,
}: Props) {
  const actualCount = parseSubscriberCount(subscriberCount);
  const goalReached = actualCount >= SUBSCRIBER_GOAL;
  const targetPct = goalReached
    ? 100
    : Math.min(99.5, (actualCount / SUBSCRIBER_GOAL) * 100);

  const [displayCount, setDisplayCount] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [glowing, setGlowing] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (actualCount === 0) return;

    const alreadyAnimated = sessionStorage.getItem(SESSION_FLAG);
    if (alreadyAnimated) {
      setDisplayCount(actualCount);
      setProgressPct(targetPct);
      return;
    }

    sessionStorage.setItem(SESSION_FLAG, "1");
    setGlowing(true);

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / COUNT_UP_DURATION);
      const eased = easeOutCubic(progress);
      setDisplayCount(Math.round(eased * actualCount));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayCount(actualCount);
        setTimeout(() => setGlowing(false), 500);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    // Slight delay so React paints 0% first, then transitions to targetPct
    const progressTimer = setTimeout(() => setProgressPct(targetPct), 80);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      clearTimeout(progressTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locale = language === "de" ? "de-DE" : "en-US";
  const formattedCount =
    actualCount > 0
      ? new Intl.NumberFormat(locale).format(displayCount)
      : "—";
  const formattedGoal = new Intl.NumberFormat(locale).format(SUBSCRIBER_GOAL);

  const eyebrow = goalReached
    ? t("BLOG_HERO_GOAL_REACHED")
    : t("BLOG_HERO_BANNER_EYEBROW");

  const subscriberLabel = formatTranslation(
    "BLOG_HERO_SUBSCRIBER_COUNT",
    language,
    { count: formattedCount, goal: formattedGoal }
  );

  return (
    <>
      <style>{`
        @keyframes yt-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .yt-hero-shimmer {
          background: linear-gradient(
            90deg,
            #c0392b 0%,
            rgba(255,255,255,0.28) 50%,
            #c0392b 100%
          );
          background-size: 200% 100%;
          animation: yt-shimmer 3s infinite linear;
        }
      `}</style>

      <section
        className="border-y border-[#c0392b]/20 bg-[#0a0a0a] px-4 py-12 sm:py-16"
        style={{ fontFamily: FONT_BODY }}
      >
        <div className="mx-auto max-w-4xl text-center">
          {/* Eyebrow */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#c0392b]">
            {eyebrow}
          </p>

          {/* Headline */}
          <h2
            className="mb-4 text-3xl font-bold text-white sm:text-4xl md:text-5xl"
            style={{
              fontFamily: FONT_HEADING,
              textShadow: glowing
                ? "0 0 16px rgba(192, 57, 43, 0.5)"
                : "none",
              transition: "text-shadow 500ms ease",
            }}
          >
            {t("BLOG_HERO_BANNER_TITLE")}
          </h2>

          {/* Sub */}
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            {t("BLOG_HERO_BANNER_SUB")}
          </p>

          {/* Progress bar */}
          <div className="mx-auto mb-10 max-w-md">
            <p className="mb-2 text-xs uppercase tracking-wider text-white/50">
              {subscriberLabel}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10 sm:h-3">
              <div
                className="yt-hero-shimmer h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  transition: `width ${PROGRESS_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) 0.3s`,
                }}
              />
            </div>
          </div>

          {/* Two-step layout */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
            {/* Step 1 */}
            <div className="flex-1 rounded-lg border border-white/10 p-6 text-left">
              <p className="mb-1 text-xs uppercase tracking-wider text-white/40">
                {t("BLOG_HERO_STEP_1_TITLE")}
              </p>
              <p
                className="mb-5 text-xl font-semibold text-white"
                style={{ fontFamily: FONT_HEADING }}
              >
                {t("BLOG_HERO_STEP_1_LABEL")}
              </p>
              <a
                href={subscribeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded bg-[#c0392b] py-3 text-center text-sm font-semibold tracking-wide text-white transition hover:bg-[#a93226]"
              >
                {t("BLOG_HERO_STEP_1_BUTTON")}
              </a>
            </div>

            {/* Arrow separator */}
            <div
              className="flex items-center justify-center text-white/25 sm:mt-14"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 rotate-90 sm:rotate-0"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Step 2 */}
            <div className="flex-1 rounded-lg border border-white/10 p-6 text-left">
              <p className="mb-1 text-xs uppercase tracking-wider text-white/40">
                {t("BLOG_HERO_STEP_2_TITLE")}
              </p>
              <p
                className="mb-5 text-xl font-semibold text-white"
                style={{ fontFamily: FONT_HEADING }}
              >
                {t("BLOG_HERO_STEP_2_LABEL")}
              </p>
              <YouTubeCouponForm language={language} t={t} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function YouTubeCouponForm({
  language,
  t,
}: {
  language: "de" | "en";
  t: (k: string) => string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<CouponFormStatus>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading" || status === "success") return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !trimmed.includes(".")) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/youtube-subscribe-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, locale: language }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        alreadyClaimed?: boolean;
        error?: string;
      };
      if (data.ok) {
        setStatus("success");
      } else if (data.alreadyClaimed) {
        setStatus("alreadyClaimed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("BLOG_SUBSCRIBE_HOOK_PLACEHOLDER")}
          disabled={status === "loading" || status === "success"}
          className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#c0392b] focus:ring-1 focus:ring-[#c0392b] disabled:opacity-50"
          style={{ fontFamily: FONT_BODY }}
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="w-full rounded bg-[#c0392b] py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-[#a93226] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ fontFamily: FONT_BODY }}
        >
          {status === "loading"
            ? t("BLOG_SUBSCRIBE_HOOK_LOADING")
            : t("BLOG_HERO_STEP_2_LABEL")}
        </button>
      </div>
      {status === "success" && (
        <p className="mt-3 text-sm text-green-400">
          {t("BLOG_SUBSCRIBE_HOOK_SUCCESS")}
        </p>
      )}
      {status === "alreadyClaimed" && (
        <p className="mt-3 text-sm text-yellow-400">
          {t("BLOG_SUBSCRIBE_HOOK_ALREADY")}
        </p>
      )}
      {status === "error" && (
        <p className="mt-3 text-sm text-red-400">
          {t("BLOG_SUBSCRIBE_HOOK_ERROR")}
        </p>
      )}
    </form>
  );
}
