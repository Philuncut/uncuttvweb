"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/lib/LanguageContext";

const COOKIE_NAME = "cookie_consent";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/`;
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setVisible(true);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    setCookie(COOKIE_NAME, "all", 365);
    setVisible(false);
  }, []);

  const handleNecessaryOnly = useCallback(() => {
    setCookie(COOKIE_NAME, "necessary", 365);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg border-t border-[#222] bg-[#111] p-6 sm:border sm:p-8">
        <h3 className="text-lg font-black tracking-wider text-white">
          {language === "en" ? "COOKIES" : "COOKIES"}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          {language === "en"
            ? "We use cookies for essential website functions (age verification, cart, session). Analytics and marketing cookies are only set with your consent."
            : "Wir verwenden Cookies für wesentliche Website-Funktionen (Altersverifikation, Warenkorb, Sitzung). Analyse- und Marketing-Cookies werden nur mit deiner Zustimmung gesetzt."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleAcceptAll}
            className="flex-1 cursor-pointer bg-[#c0392b] py-3 text-sm font-bold tracking-[0.15em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_15px_rgba(192,57,43,0.5)]"
          >
            {language === "en" ? "ACCEPT ALL" : "AKZEPTIEREN"}
          </button>
          <button
            type="button"
            onClick={handleNecessaryOnly}
            className="flex-1 cursor-pointer border border-[#333] bg-transparent py-3 text-sm font-bold tracking-[0.15em] text-white/50 transition-colors hover:border-white/40 hover:text-white"
          >
            {language === "en" ? "NECESSARY ONLY" : "NUR NOTWENDIGE"}
          </button>
        </div>
      </div>
    </div>
  );
}
