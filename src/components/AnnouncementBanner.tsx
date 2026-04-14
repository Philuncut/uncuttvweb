"use client";

import { useState, useEffect } from "react";

const COOKIE_NAME = "banner_dismissed_v1";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/`;
}

export default function AnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookie(COOKIE_NAME) !== "true") {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setCookie(COOKIE_NAME, "true", 7);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="w-full border-l-4 border-[#c0392b] bg-[#111]">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 sm:py-0 sm:h-[80px]">
        {/* Product image — hidden on mobile */}
        <div className="hidden shrink-0 sm:block">
          <div className="h-[60px] w-[60px] overflow-hidden bg-[#222]">
            <img
              src="/images/banner-product.jpg"
              alt="What Lurks Beneath"
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wider text-white sm:text-sm">
            VORVERKAUF — WHAT LURKS BENEATH
          </p>
          <p className="mt-0.5 text-[11px] tracking-wider text-white/40 sm:text-xs">
            Ab €20.90 &middot; Limitierte Auflage
          </p>
        </div>

        {/* CTA */}
        <a
          href="/shop#vorbestellen"
          className="shrink-0 bg-[#c0392b] px-5 py-2 text-[11px] font-bold tracking-wider text-white transition-colors duration-200 hover:bg-[#a93226] sm:text-xs"
        >
          JETZT SICHERN
        </a>

        {/* Close */}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 cursor-pointer bg-transparent p-1 text-white/30 transition-colors hover:text-white/70"
          aria-label="Banner schließen"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="square" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
