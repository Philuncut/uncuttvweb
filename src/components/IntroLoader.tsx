"use client";

import { useEffect, useRef, useState } from "react";
import {
  markIntroSeen,
  removeIntroOverlaySkeleton,
  setIntroLoading,
  shouldShowIntroLoader,
} from "@/lib/intro-loader-boot";

const MIN_INTRO_MS = 1500;
const RAMP_MIN_MS = 1500;
const RAMP_MAX_MS = 2500;
const EXIT_GLITCH_MS = 100;

export default function IntroLoader() {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [exitGlitch, setExitGlitch] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    const shouldShow = shouldShowIntroLoader();
    const hasLoadingClass =
      document.documentElement.classList.contains("intro-loading");

    if (!shouldShow) {
      if (hasLoadingClass) setIntroLoading(false);
      return;
    }

    if (!hasLoadingClass) setIntroLoading(true);
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    removeIntroOverlaySkeleton();
  }, [active]);

  useEffect(() => {
    if (!active) return;

    let pageReady = document.readyState === "complete";
    const onLoad = () => {
      pageReady = true;
    };
    window.addEventListener("load", onLoad);

    const minEndTime = performance.now() + MIN_INTRO_MS;
    const rampDuration =
      RAMP_MIN_MS + Math.random() * (RAMP_MAX_MS - RAMP_MIN_MS);
    const startTime = performance.now();
    let rafId = 0;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setProgress(100);
      setExitGlitch(true);

      window.setTimeout(() => {
        markIntroSeen();
        setIntroLoading(false);
        setActive(false);
        window.removeEventListener("load", onLoad);
      }, EXIT_GLITCH_MS);
    };

    const tick = (now: number) => {
      if (finishedRef.current) return;

      const elapsed = now - startTime;
      const ramped =
        elapsed < rampDuration ? (elapsed / rampDuration) * 90 : 90;
      setProgress(ramped);

      if (pageReady && now >= minEndTime) {
        finish();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("load", onLoad);
    };
  }, [active]);

  useEffect(() => {
    if (!active || exitGlitch) return;

    let glitchTimeout: ReturnType<typeof setTimeout> | undefined;
    let clearGlitchTimeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleGlitch = () => {
      const delay = 600 + Math.random() * 600;
      glitchTimeout = setTimeout(() => {
        if (finishedRef.current) return;
        setGlitching(true);
        const duration = 80 + Math.random() * 70;
        clearGlitchTimeout = setTimeout(() => {
          setGlitching(false);
          scheduleGlitch();
        }, duration);
      }, delay);
    };

    scheduleGlitch();

    return () => {
      if (glitchTimeout) clearTimeout(glitchTimeout);
      if (clearGlitchTimeout) clearTimeout(clearGlitchTimeout);
    };
  }, [active, exitGlitch]);

  if (!active) return null;

  const barGlitch = glitching || exitGlitch;

  return (
    <div
      className="intro-overlay intro-loader fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
      role="presentation"
      aria-hidden
    >
      <div
        className={[
          "intro-logo relative inline-block select-none text-center font-black tracking-wider",
          glitching || exitGlitch ? "intro-logo--glitch" : "",
          exitGlitch ? "intro-logo--exit-cut" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ fontSize: "clamp(4rem, 14vw, 6rem)", lineHeight: 1 }}
      >
        <span className="intro-logo__layer-main relative z-[2]">
          <span className="text-white">UNCUT</span>
          <span className="text-[#c0392b]">TV</span>
        </span>
        <span
          className="intro-logo__ghost intro-logo__ghost--red pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
          aria-hidden
        >
          <span className="text-[#ff0040]">UNCUT</span>
          <span className="text-[#ff6b6b]">TV</span>
        </span>
        <span
          className="intro-logo__ghost intro-logo__ghost--cyan pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
          aria-hidden
        >
          <span className="text-[#00d4ff]">UNCUT</span>
          <span className="text-[#5ec8ff]">TV</span>
        </span>
      </div>

      <div
        className={[
          "intro-bar mt-10 h-1 w-[min(280px,80vw)] overflow-hidden bg-[#1a1a1a]",
          barGlitch ? "intro-bar--glitch" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className="intro-bar__fill h-full bg-white"
          style={{
            width: `${progress}%`,
            transition:
              progress >= 100
                ? "width 80ms ease-out"
                : "width 120ms linear",
          }}
        />
      </div>
    </div>
  );
}
