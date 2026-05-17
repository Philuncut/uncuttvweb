"use client";

import { useEffect, useRef, useState } from "react";
import { formatTranslation } from "@/lib/translations";

// TODO: raise SUBSCRIBER_GOAL to 10000 once 6000 is reached
const SUBSCRIBER_GOAL = 6000;
const COUNT_UP_DURATION = 1500;
const PROGRESS_DURATION = 2000;
const SESSION_FLAG = "blog_hero_animated";

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function parseSubscriberCount(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type CouponFormStatus = "idle" | "loading" | "success" | "alreadyClaimed" | "error";

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

  const subscriberLabel = formatTranslation(
    "BLOG_HERO_SUBSCRIBER_COUNT",
    language,
    { count: formattedCount, goal: formattedGoal }
  );

  const goalLabel = formatTranslation("BLOG_HERO_PROGRESS_GOAL_LABEL", language, {
    goal: formattedGoal,
  });

  const eyebrow = goalReached
    ? t("BLOG_HERO_GOAL_REACHED")
    : t("BLOG_HERO_BANNER_EYEBROW");

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

      <section className="relative overflow-hidden bg-[#0a0a0a]">
        {/* Grain overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: GRAIN_SVG,
            backgroundRepeat: "repeat",
            backgroundSize: "200px 200px",
            opacity: 0.08,
            mixBlendMode: "overlay",
          }}
        />

        {/* Radial vignette */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)",
          }}
        />

        {/* Subtle red glow behind progress area */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 600px 200px at center 60%, rgba(192,57,43,0.08), transparent 70%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-20 sm:py-28">

          {/* Block A — Library statement */}
          <div className="mb-16 flex items-baseline gap-3 border-l-2 border-[#c0392b] pl-4">
            <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              300+
            </span>
            <span className="text-xs uppercase tracking-[0.25em] text-white/50">
              {t("BLOG_HERO_LIBRARY_LABEL")}
            </span>
          </div>

          {/* Block B — Headline */}
          <h1
            className="mb-3 text-5xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl md:text-7xl"
            style={{
              textShadow: glowing
                ? "0 0 20px rgba(192, 57, 43, 0.4)"
                : "none",
              transition: "text-shadow 500ms ease",
            }}
          >
            {t("BLOG_HERO_BANNER_TITLE_LINE_1")}
            <br />
            <span className="text-[#c0392b]">
              {t("BLOG_HERO_BANNER_TITLE_HIGHLIGHT")}
            </span>
            {t("BLOG_HERO_BANNER_TITLE_LINE_2_AFTER")}
          </h1>

          <p className="mb-12 max-w-xl text-base text-white/60">
            {t("BLOG_HERO_BANNER_SUB")}
          </p>

          {/* Block C — Progress bar */}
          <div className="mb-12 max-w-2xl">
            <div className="mb-3 flex items-baseline justify-between font-mono text-xs uppercase tracking-widest">
              <span className="text-[#c0392b]">{subscriberLabel}</span>
              <span className="text-white/40">{goalLabel}</span>
            </div>

            <div className="relative h-4 w-full overflow-hidden border border-white/15">
              {/* Halftone dot track */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
                  backgroundSize: "4px 4px",
                }}
              />
              {/* Shimmer fill */}
              <div
                className="yt-hero-shimmer absolute inset-y-0 left-0"
                style={{
                  width: `${progressPct}%`,
                  transition: `width ${PROGRESS_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) 0.3s`,
                }}
              />
            </div>

            <p className="mt-3 text-xs uppercase tracking-wider text-white/40">
              {eyebrow}
            </p>
          </div>

          {/* Block D — Two-step sequence */}
          <div className="flex flex-col gap-8 md:flex-row md:items-stretch md:gap-0">

            {/* Step 01 */}
            <div className="flex flex-1 flex-col gap-4 border-t-2 border-[#c0392b] bg-black/30 p-6 md:border-l-2 md:border-t-0">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-[#c0392b]">01 /</span>
                <span className="text-xs uppercase tracking-widest text-white/40">
                  {language === "de" ? "Abonnieren" : "Subscribe"}
                </span>
              </div>
              <p className="text-lg font-bold uppercase tracking-tight text-white">
                {t("BLOG_HERO_STEP_1_HEADING")}
              </p>
              <a
                href={subscribeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-between border border-white/15 bg-transparent px-5 py-4 text-sm font-bold uppercase tracking-wider text-white transition hover:border-[#c0392b] hover:bg-[#c0392b]"
              >
                <span>{t("BLOG_HERO_STEP_1_BUTTON")}</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 transition group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            </div>

            {/* Step 02 */}
            <div className="flex flex-1 flex-col gap-4 border-t-2 border-[#c0392b] bg-black/30 p-6 md:border-l-2 md:border-t-0">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-[#c0392b]">02 /</span>
                <span className="text-xs uppercase tracking-widest text-white/40">
                  {language === "de" ? "Code erhalten" : "Get code"}
                </span>
              </div>
              <p className="text-lg font-bold uppercase tracking-tight text-white">
                {t("BLOG_HERO_STEP_2_HEADING")}
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("BLOG_SUBSCRIBE_HOOK_PLACEHOLDER")}
          disabled={status === "loading" || status === "success"}
          className="flex-1 border border-white/15 bg-black/40 px-4 py-4 text-sm text-white placeholder-white/30 outline-none focus:border-[#c0392b] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="bg-[#c0392b] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-[#a93226] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading"
            ? t("BLOG_SUBSCRIBE_HOOK_LOADING")
            : t("BLOG_HERO_STEP_2_HEADING")}
        </button>
      </div>
      {status === "success" && (
        <p className="text-xs text-green-400">{t("BLOG_SUBSCRIBE_HOOK_SUCCESS")}</p>
      )}
      {status === "alreadyClaimed" && (
        <p className="text-xs text-yellow-400">{t("BLOG_SUBSCRIBE_HOOK_ALREADY")}</p>
      )}
      {status === "error" && (
        <p className="text-xs text-red-400">{t("BLOG_SUBSCRIBE_HOOK_ERROR")}</p>
      )}
    </form>
  );
}
