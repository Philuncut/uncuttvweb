"use client";

import { useEffect } from "react";
import { markIntroSeen } from "@/lib/intro-loader-boot";

const MIN_INTRO_MS = 1500;
const PROGRESS_COMPLETE_MS = 200;
const EXIT_ANIMATION_MS = 250;
const OVERLAY_REMOVE_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function IntroLoaderClient() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("intro-skip")) return;

    const overlay = document.getElementById("intro-overlay");
    if (!overlay) return;

    let finished = false;
    const minEndTime = Date.now() + MIN_INTRO_MS;
    let pageReady = document.readyState === "complete";

    const onLoad = () => {
      pageReady = true;
      tryComplete();
    };

    const tryComplete = () => {
      if (finished || !pageReady || Date.now() < minEndTime) return;
      finished = true;
      void completeIntro(overlay, root);
    };

    window.addEventListener("load", onLoad);
    const pollId = window.setInterval(tryComplete, 50);
    tryComplete();

    return () => {
      window.removeEventListener("load", onLoad);
      window.clearInterval(pollId);
    };
  }, []);

  return null;
}

async function completeIntro(
  overlay: HTMLElement,
  root: HTMLElement
): Promise<void> {
  root.classList.add("intro-ready");
  await delay(PROGRESS_COMPLETE_MS);

  overlay.classList.add("intro-exiting");
  await delay(EXIT_ANIMATION_MS);

  root.classList.add("intro-done");
  markIntroSeen();

  await delay(OVERLAY_REMOVE_MS);
  overlay.remove();
}
