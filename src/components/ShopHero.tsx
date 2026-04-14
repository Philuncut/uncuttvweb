"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";

interface PromoItem {
  image: string;
  label: string;
}

interface PromoConfig {
  active: boolean;
  title: string;
  subtitle: string;
  label: string;
  image: string;
  link: string;
  ctaText: string;
  items?: PromoItem[];
}

export default function ShopHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [promo, setPromo] = useState<PromoConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onPlaying() {
      setVideoReady(true);
    }
    function onEnded() {
      video!.currentTime = 0;
      video!.play();
    }

    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    if (!video.paused) setVideoReady(true);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  // Fetch promo config
  useEffect(() => {
    console.log("[Banner] Fetching promo config...");
    fetch("/api/promo-banner")
      .then((res) => res.json())
      .then((data: PromoConfig) => {
        console.log("[Banner] Config received:", data);
        console.log("[Banner] active:", data?.active);
        console.log("[Banner] Will show banner:", data?.active);
        if (data.active) {
          setPromo(data);
        }
      })
      .catch((err) => {
        console.log("[Banner] Fetch error:", err);
      });
  }, []);

  return (
    <section className="relative flex h-[25vh] w-full items-center justify-center overflow-visible">
      {/* Video */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        disablePictureInPicture
        controlsList="nofullscreen nodownload noremoteplayback"
        className="absolute inset-0 z-10 h-full w-full object-cover object-center"
        style={{ objectFit: "cover", objectPosition: "center center", pointerEvents: "none" }}
      >
        <source src="https://uncuttv.at/wp-content/uploads/2026/04/hero.mp4" type="video/mp4" />
      </video>

      {/* Gradient fallback */}
      <div
        className={`absolute inset-0 animate-hero-gradient bg-[length:400%_400%] bg-gradient-to-br from-[#0a0a0a] via-[#1a0a0a] to-[#0a0a0a] transition-opacity duration-700 ${
          videoReady ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Dark overlay — minimal, soft gradient into page background */}
      <div
        className="absolute inset-0 z-20"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.4) 80%, rgba(10,10,10,0.85) 95%, #0a0a0a 100%)",
        }}
      />


      {/* Promo banner — bottom-left overlay, hidden on mobile */}
      {/* Promo banner — mobile: fixed bottom, desktop: absolute bottom-left of hero */}
      {!dismissed && promo && (
        <>
          {/* Desktop banner — absolute bottom-left */}
          <div
            className="absolute bottom-6 left-6 z-40 hidden max-w-[380px] border-l-[3px] border-[#c0392b] md:block"
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              padding: "14px 16px",
            }}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#c0392b]">
                {promo.label}
              </p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="ml-4 shrink-0 cursor-pointer bg-transparent p-0.5 text-white/30 transition-colors hover:text-white/70"
                aria-label="Schließen"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="square" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-[16px] font-black leading-tight text-white">
              {promo.title}
            </p>
            <p className="mt-0.5 text-[12px] text-[#888]">
              {promo.subtitle}
            </p>
            {promo.items && promo.items.length > 0 && (
              <div className="mt-3 flex gap-3">
                {promo.items.map((item: PromoItem, i: number) => (
                  <div key={i} className="text-center">
                    <div className="h-[77px] w-[55px] overflow-hidden bg-[#1a1a1a]">
                      {item.image ? (
                        <img src={item.image} alt={item.label} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-white/15">
                          {item.label}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-[#888]">{item.label}</p>
                  </div>
                ))}
              </div>
            )}
            <Link
              href={promo.link}
              className="mt-3 block w-full bg-[#c0392b] py-2 text-center text-[11px] font-bold tracking-[0.15em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_15px_rgba(192,57,43,0.5)]"
            >
              {promo.ctaText} →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
