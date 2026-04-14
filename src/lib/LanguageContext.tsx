"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type Language = "de" | "en";

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "uncuttv_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage immediately on client mount
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      console.log("[Language] Loaded from localStorage:", saved);
      if (saved === "en" || saved === "de") return saved;
    }
    return "de";
  });

  // Re-sync on mount in case localStorage changed between SSR and hydration
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log("[Language] useEffect re-check:", stored, "current:", language);
    if ((stored === "en" || stored === "de") && stored !== language) {
      setLanguage(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll localStorage every 300ms — works on iOS Safari where storage events
  // don't fire for same-page changes
  useEffect(() => {
    const interval = setInterval(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if ((stored === "de" || stored === "en") && stored !== language) {
        setLanguage(stored);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === "de" ? "en" : "de";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setLanguageExternal = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  return (
    <LanguageContext.Provider
      value={{ language, toggleLanguage, setLanguage: setLanguageExternal }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
