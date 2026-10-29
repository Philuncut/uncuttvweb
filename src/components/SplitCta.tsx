"use client";

import { useState, useEffect, useCallback } from "react";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/`;
}

export default function SplitCta() {
  const [showGate, setShowGate] = useState(false);
  const [hovered, setHovered] = useState<"streaming" | "shop" | null>(null);

  useEffect(() => {
    document.body.style.overflow = showGate ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showGate]);

  const handleShopClick = useCallback(() => {
    if (getCookie("agegate") === "confirmed") {
      window.location.href = "/shop";
    } else {
      setShowGate(true);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setCookie("agegate", "confirmed", 30);
    window.location.href = "/shop";
  }, []);

  const dividerGlow = hovered !== null;

  return (
    <>
      <section className="w-full bg-[#0a0a0a]">
        <div className="mx-auto flex h-[35vh] w-full max-w-5xl flex-row sm:h-[50vh] md:h-[32vh]">
        {/* Streaming */}
        <a
          id="home-streaming-link"
          href="https://uncuttv.app"
          onMouseEnter={() => setHovered("streaming")}
          onMouseLeave={() => setHovered(null)}
          className="relative flex h-full w-1/2 items-center justify-center bg-[#0a0a0a]"
          style={{
            transition: "all 0.3s ease",
            boxShadow: hovered === "streaming" ? "0 0 40px rgba(192, 57, 43, 0.6) inset" : "none",
            backgroundColor: hovered === "streaming" ? "rgba(192, 57, 43, 0.08)" : "#0a0a0a",
          }}
        >
          <div className="text-center">
            <span
              className="text-2xl font-black tracking-[0.15em] sm:text-4xl sm:tracking-[0.2em] md:text-4xl lg:text-5xl"
              style={{
                transition: "color 0.3s ease",
                color: hovered === "streaming" ? "#c0392b" : "rgba(255,255,255,0.9)",
              }}
            >
              STREAMING
            </span>
            <p
              className="mt-2 text-[10px] tracking-widest sm:mt-3 sm:text-sm"
              style={{
                transition: "color 0.3s ease",
                color: hovered === "streaming" ? "rgba(192, 57, 43, 0.7)" : "rgba(255,255,255,0.4)",
              }}
            >
              JETZT ANSEHEN
            </p>
          </div>
        </a>

        {/* Divider — vertical, always visible */}
        <div
          className="w-px"
          style={{
            transition: "all 0.3s ease",
            backgroundColor: dividerGlow ? "#c0392b" : "rgba(255,255,255,0.1)",
            boxShadow: dividerGlow ? "0 0 12px rgba(192, 57, 43, 0.8)" : "none",
          }}
        />

        {/* Shop */}
        <button
          id="home-shop-link"
          type="button"
          onClick={handleShopClick}
          onMouseEnter={() => setHovered("shop")}
          onMouseLeave={() => setHovered(null)}
          className="relative flex h-full w-1/2 cursor-pointer items-center justify-center"
          style={{
            transition: "all 0.3s ease",
            boxShadow: hovered === "shop" ? "0 0 40px rgba(192, 57, 43, 0.6) inset" : "none",
            backgroundColor: hovered === "shop" ? "rgba(192, 57, 43, 0.08)" : "#0a0a0a",
          }}
        >
          <div className="text-center">
            <span
              className="text-2xl font-black tracking-[0.15em] sm:text-4xl sm:tracking-[0.2em] md:text-4xl lg:text-5xl"
              style={{
                transition: "color 0.3s ease",
                color: hovered === "shop" ? "#c0392b" : "rgba(255,255,255,0.9)",
              }}
            >
              SHOP
            </span>
            <p
              className="mt-2 text-[10px] tracking-widest sm:mt-3 sm:text-sm"
              style={{
                transition: "color 0.3s ease",
                color: hovered === "shop" ? "rgba(192, 57, 43, 0.7)" : "rgba(255,255,255,0.4)",
              }}
            >
              MEDIABOOKS &amp; MEHR
            </p>
          </div>
        </button>
        </div>
      </section>

      {/* Vanilla JS — bypasses React for iOS Safari */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  function init() {
    var streaming = document.getElementById('home-streaming-link');
    var shop = document.getElementById('home-shop-link');

    if (streaming && !streaming.dataset.bound) {
      streaming.dataset.bound = '1';
      var streamHandler = function(e) {
        if (e) e.preventDefault();
        window.location.href = 'https://uncuttv.app';
      };
      streaming.addEventListener('touchend', streamHandler);
    }

    if (shop && !shop.dataset.bound) {
      shop.dataset.bound = '1';
      var shopHandler = function(e) {
        if (e) e.preventDefault();
        window.location.href = '/shop';
      };
      shop.addEventListener('touchend', shopHandler);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
        `,
        }}
      />

      {/* Age Gate Overlay */}
      {showGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowGate(false)}
        >
          <div
            className="mx-4 w-full max-w-md border border-white/10 bg-[#111] p-8 sm:p-10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
              Bist du 18 Jahre oder älter?
            </h2>
            <p className="mt-3 text-center text-sm text-white/50">
              Der Shop enthält Inhalte, die nur für Erwachsene bestimmt sind.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 cursor-pointer bg-[#c0392b] px-6 py-3 text-sm font-bold tracking-wider text-white transition-colors hover:bg-[#e74c3c]"
              >
                JA, WEITER ZUM SHOP
              </button>
              <button
                type="button"
                onClick={() => setShowGate(false)}
                className="flex-1 cursor-pointer border border-white/20 bg-transparent px-6 py-3 text-sm font-bold tracking-wider text-white transition-colors hover:border-white/40"
              >
                NEIN, ZURÜCK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
