"use client";

import { useEffect } from "react";
import { markIntroSeen, shouldRunIntroClient } from "@/lib/intro-loader-boot";

const MIN_DURATION_MS = 2500;
const READY_PAUSE_MS = 300;
const EXIT_ANIMATION_MS = 400;

export default function IntroLoaderClient() {
  useEffect(() => {
    if (!shouldRunIntroClient()) return;

    const startTime = Date.now();

    const finishIntro = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_DURATION_MS - elapsed);

      window.setTimeout(() => {
        document.documentElement.classList.add("intro-ready");

        window.setTimeout(() => {
          const overlay = document.querySelector(".intro-overlay");
          overlay?.classList.add("intro-exiting");

          window.setTimeout(() => {
            document.documentElement.classList.add("intro-done");
            markIntroSeen();
          }, EXIT_ANIMATION_MS);
        }, READY_PAUSE_MS);
      }, remaining);
    };

    if (document.readyState === "complete") {
      finishIntro();
    } else {
      window.addEventListener("load", finishIntro, { once: true });
    }
  }, []);

  return null;
}
