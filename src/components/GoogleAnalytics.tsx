"use client";

import { GoogleAnalytics as NextGoogleAnalytics } from "@next/third-parties/google";
import { useEffect, useState } from "react";

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("cookie_consent") === "all";
  } catch {
    return false;
  }
}

export default function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!gaId) return;

    setEnabled(hasAnalyticsConsent());

    const onGrant = () => setEnabled(true);
    const onRevoke = () => setEnabled(false);

    window.addEventListener("analytics-grant", onGrant);
    window.addEventListener("analytics-revoke", onRevoke);

    return () => {
      window.removeEventListener("analytics-grant", onGrant);
      window.removeEventListener("analytics-revoke", onRevoke);
    };
  }, [gaId]);

  if (!gaId || !enabled) {
    return null;
  }

  return <NextGoogleAnalytics gaId={gaId} />;
}
