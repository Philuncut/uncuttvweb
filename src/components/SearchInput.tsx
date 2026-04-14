"use client";

import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

export default function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { language } = useLanguage();
  const t = createT(language);

  return (
    <div className="mx-auto max-w-[600px] px-4 py-4 sm:px-6">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("SUCHE_PLACEHOLDER")}
          className="w-full border border-[#333] bg-[#111] py-3 pl-4 pr-12 text-sm tracking-wider text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer bg-transparent p-1 text-white/30 transition-colors hover:text-white/70"
            aria-label="Clear"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="square" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="square" d="M21 21l-5.197-5.197M15.803 15.803A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
