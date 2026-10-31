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

/**
 * Handy-Fassung des Header-Videos (public/videos/hero-mobile.*): Ausschnitt
 * 500x270 aus hero.mp4 (1920x270) um das UNCUT.TV-Logo (x 1170..1670),
 * 9,5 s, Loop ueberblendet, ohne Ton. Das Standbild ist das erste Bild davon.
 */
const MOBILE_POSTER = "/videos/hero-mobile.webp";
const MOBILE_WEBM = "/videos/hero-mobile.webm";
const MOBILE_MP4 = "/videos/hero-mobile.mp4";

/** 1x1 durchsichtiges GIF: am Desktop laedt <picture> kein Standbild. */
const LEERES_BILD =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Soll am Handy das Video nachgeladen werden? Nein bei Datensparmodus
 * (navigator.connection.saveData) und bei "Bewegung reduzieren".
 */
function darfHandyVideoLaden(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData === true) return false;
  return true;
}

/** Nach dem Laden der Seite, dann in einer Leerlaufzeit. */
function nachSeitenladen(cb: () => void): () => void {
  let idle: number | null = null;
  let abgebrochen = false;
  const w = window as Window & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const imLeerlauf = () => {
    if (abgebrochen) return;
    if (typeof w.requestIdleCallback === "function") {
      idle = w.requestIdleCallback(() => !abgebrochen && cb(), { timeout: 2500 });
    } else {
      idle = window.setTimeout(() => !abgebrochen && cb(), 1200);
    }
  };
  if (document.readyState === "complete") {
    imLeerlauf();
  } else {
    window.addEventListener("load", imLeerlauf, { once: true });
  }
  return () => {
    abgebrochen = true;
    window.removeEventListener("load", imLeerlauf);
    if (idle !== null) {
      if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idle);
      window.clearTimeout(idle);
    }
  };
}

export default function ShopHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  /** Handy: das Video-Element erst nach dem Seitenladen einhaengen. */
  const [mobileVideo, setMobileVideo] = useState(false);
  const [mobileVideoReady, setMobileVideoReady] = useState(false);
  const [promo, setPromo] = useState<PromoConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Am Handy wird das Desktop-Video (2,9 MB) gar nicht erst geladen: Das
    // Element steht mit preload="none" und ohne autoplay im HTML. Erst ab
    // Tablet-Breite wird nachgeladen und abgespielt. Das Handy bekommt
    // unten seine eigene, kleine Fassung.
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    if (!desktop) return;

    function onPlaying() {
      setVideoReady(true);
    }
    function onEnded() {
      video!.currentTime = 0;
      video!.play();
    }

    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    video.preload = "auto";
    video.muted = true;
    video.play().catch(() => {
      /* Autoplay verweigert: der Verlauf bleibt sichtbar */
    });
    if (!video.paused) setVideoReady(true);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  // Handy: Zuerst steht nur das Standbild (im HTML, mit hoher Prioritaet).
  // Das Video (0,4 MB MP4 / 0,25 MB WebM) kommt erst nach dem Laden der
  // Seite in einer Leerlaufzeit dazu und blendet ueber das Standbild, sobald
  // es laeuft. Bei Datensparmodus oder "Bewegung reduzieren" bleibt es beim
  // Standbild.
  useEffect(() => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (!darfHandyVideoLaden()) return;
    return nachSeitenladen(() => setMobileVideo(true));
  }, []);

  useEffect(() => {
    if (!mobileVideo) return;
    const video = mobileVideoRef.current;
    if (!video) return;
    function onPlaying() {
      setMobileVideoReady(true);
    }
    video.addEventListener("playing", onPlaying);
    video.muted = true;
    video.preload = "auto";
    video
      .play()
      .then(() => setMobileVideoReady(true))
      .catch(() => {
        /* Autoplay verweigert: das Standbild bleibt */
      });
    return () => {
      video.removeEventListener("playing", onPlaying);
    };
  }, [mobileVideo]);

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
      {/* Handy: Standbild sofort aus dem HTML; am Desktop (<source> mit
          leerem GIF, dazu md:hidden) wird nichts geladen. */}
      <picture className="absolute inset-0 z-10 block md:hidden">
        <source media="(min-width: 768px)" srcSet={LEERES_BILD} />
        {/* Bewusst kein next/image: dessen Vorab-Laden wuerde das Standbild
            auch am Desktop holen; die WebP ist 3,7 KB und fertig skaliert. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MOBILE_POSTER}
          alt=""
          width={500}
          height={270}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-center"
          style={{ pointerEvents: "none" }}
        />
      </picture>

      {/* Handy-Video, erst nach dem Seitenladen eingehaengt. */}
      {mobileVideo && (
        <video
          ref={mobileVideoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster={MOBILE_POSTER}
          disablePictureInPicture
          controlsList="nofullscreen nodownload noremoteplayback"
          className={`absolute inset-0 z-[11] h-full w-full object-cover object-center transition-opacity duration-500 md:hidden ${
            mobileVideoReady ? "opacity-100" : "opacity-0"
          }`}
          style={{ pointerEvents: "none" }}
        >
          <source src={MOBILE_WEBM} type="video/webm" />
          <source src={MOBILE_MP4} type="video/mp4" />
        </video>
      )}

      {/* Video (Desktop) */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        preload="none"
        muted
        loop
        playsInline
        disablePictureInPicture
        controlsList="nofullscreen nodownload noremoteplayback"
        className="absolute inset-0 z-10 h-full w-full object-cover object-center"
        style={{ objectFit: "cover", objectPosition: "center center", pointerEvents: "none" }}
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
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
                {promo.items.map((item: PromoItem, i: number) => {
                  const thumb = (
                    <div className="mx-auto h-[77px] w-[55px] overflow-hidden bg-[#1a1a1a]">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-white/15">
                          {item.label}
                        </div>
                      )}
                    </div>
                  );
                  const caption = (
                    <p className="mt-1 text-[10px] text-[#888]">{item.label}</p>
                  );
                  const itemClass =
                    "mx-auto inline-block text-center transition-opacity";

                  return (
                    <div key={i} className="text-center">
                      {promo.link ? (
                        <Link
                          href={promo.link}
                          className={`${itemClass} cursor-pointer hover:opacity-90`}
                        >
                          {thumb}
                          {caption}
                        </Link>
                      ) : (
                        <div className={itemClass}>
                          {thumb}
                          {caption}
                        </div>
                      )}
                    </div>
                  );
                })}
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
