"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import { trackLead } from "@/lib/meta-pixel";

type NewsletterStatus = "idle" | "success" | "already" | "error";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<NewsletterStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNewsletterSubscribed, setIsNewsletterSubscribed] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const { language } = useLanguage();
  const t = createT(language);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { isNewsletterSubscribed?: boolean };
        if (!cancelled) {
          setIsNewsletterSubscribed(data.isNewsletterSubscribed === true);
        }
      } catch {
        /* guest */
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrorMsg("");
      setLoading(true);

      try {
        const res = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        let data: {
          success?: boolean;
          alreadySubscribed?: boolean;
          error?: string;
        } = {};

        try {
          data = (await res.json()) as typeof data;
        } catch {
          setStatus("error");
          setErrorMsg(
            language === "en"
              ? "Signup failed. Please try again."
              : "Anmeldung fehlgeschlagen. Bitte erneut versuchen."
          );
          return;
        }

        if (data.success === true) {
          trackLead("Newsletter");
          setIsNewsletterSubscribed(true);
          setStatus("success");
        } else if (data.alreadySubscribed === true) {
          setIsNewsletterSubscribed(true);
          setStatus("already");
        } else {
          setStatus("error");
          setErrorMsg(
            data.error ||
              (language === "en"
                ? "Signup failed. Please try again."
                : "Anmeldung fehlgeschlagen. Bitte erneut versuchen.")
          );
        }
      } catch {
        setStatus("error");
        setErrorMsg(
          language === "en"
            ? "Signup failed. Please try again."
            : "Anmeldung fehlgeschlagen. Bitte erneut versuchen."
        );
      } finally {
        setLoading(false);
      }
    },
    [email, language]
  );

  const renderRightColumn = () => {
    if (sessionChecked && isNewsletterSubscribed && status === "idle") {
      return (
        <div className="text-center lg:text-left">
          <p className="text-sm leading-relaxed text-white/45">
            {t("NEWSLETTER_ALREADY_MEMBER")}
          </p>
        </div>
      );
    }

    switch (status) {
      case "idle":
        return (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                language === "en" ? "your@email.com" : "deine@email.com"
              }
              className="w-full border border-[#333] bg-[#111] px-4 py-4 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:opacity-60"
            >
              {loading
                ? "..."
                : language === "en"
                  ? "SUBSCRIBE NOW"
                  : t("ANMELDEN")}
            </button>
          </form>
        );

      case "success":
        return (
          <div className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              {language === "en"
                ? "YOUR DISCOUNT CODE:"
                : "DEIN RABATTCODE:"}
            </p>
            <p
              className="mt-3 text-4xl font-black tracking-widest text-[#c0392b]"
              style={{
                textShadow:
                  "0 0 20px rgba(192,57,43,0.6), 0 0 40px rgba(192,57,43,0.3)",
              }}
            >
              WELCOME10
            </p>
            <p className="mt-4 text-sm text-white/40">
              {language === "en"
                ? "Check your email"
                : "Schau in dein Postfach"}
            </p>
          </div>
        );

      case "already":
        return (
          <div className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              {language === "en"
                ? "ALREADY SUBSCRIBED"
                : "BEREITS ANGEMELDET"}
            </p>
            <p className="mt-3 text-4xl font-black tracking-wider text-white">
              {language === "en"
                ? "This email is already on our list."
                : "Diese E-Mail ist bereits angemeldet."}
            </p>
            <p className="mt-4 text-sm text-white/40">
              {language === "en"
                ? "Already received your code? Check your inbox."
                : "Code schon erhalten? Schau in dein Postfach."}
            </p>
          </div>
        );

      case "error":
        return (
          <div className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              {language === "en"
                ? "SOMETHING WENT WRONG"
                : "ETWAS LIEF SCHIEF"}
            </p>
            <p className="mt-3 text-base leading-relaxed text-[#c0392b]">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setErrorMsg("");
              }}
              className="mt-4 cursor-pointer border-none bg-transparent p-0 text-xs text-white/40 underline transition-colors hover:text-white/60"
            >
              {language === "en" ? "Try again" : "Erneut versuchen"}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <section className="w-full border-l-4 border-[#c0392b] bg-[#0d0d0d] px-6 py-16 sm:px-8 sm:py-20 md:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:items-center lg:gap-16">
          {/* Left — Copy */}
          <div className="text-center lg:text-left">
            <h2 className="text-4xl font-black tracking-wider text-white sm:text-5xl md:text-6xl">
              {language === "en" ? "SAVE 10%" : "SPARE 10%"}
            </h2>
            <p className="mt-2 text-xl font-bold tracking-wider text-[#c0392b] sm:text-2xl">
              {language === "en"
                ? "on your first purchase"
                : "bei deinem ersten Einkauf"}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              {language === "en"
                ? "Sign up for our newsletter and instantly receive your personal discount code."
                : "Melde dich für unseren Newsletter an und erhalte sofort deinen persönlichen Rabattcode."}
            </p>
            <p className="mt-3 text-[11px] text-white/20">
              {language === "en"
                ? "No spam. Unsubscribe anytime."
                : "Kein Spam. Jederzeit abmeldbar."}
            </p>
          </div>

          {/* Right — Form / outcomes */}
          <div>{renderRightColumn()}</div>
        </div>
      </div>
    </section>
  );
}
