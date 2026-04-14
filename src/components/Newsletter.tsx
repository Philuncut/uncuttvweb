"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { language } = useLanguage();
  const t = createT(language);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (res.ok) {
          setSubmitted(true);
        } else {
          const data = await res.json();
          setError(data.error || "Anmeldung fehlgeschlagen.");
        }
      } catch {
        setError("Verbindungsfehler.");
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

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

          {/* Right — Form / Success */}
          <div>
            {submitted ? (
              <div className="text-center lg:text-left">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
                  {language === "en"
                    ? "Your discount code:"
                    : "Dein Rabattcode:"}
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
                    ? "Have fun browsing!"
                    : "Viel Spaß beim Stöbern!"}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    language === "en"
                      ? "your@email.com"
                      : "deine@email.com"
                  }
                  className="w-full border border-[#333] bg-[#111] px-4 py-4 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
                />
                {error && (
                  <p className="text-xs text-[#c0392b]">{error}</p>
                )}
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
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
