"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Meldet jeden Seitenaufruf an /api/statistik — die cookiefreie
 * Besucherzählung (lib/visitor-stats.ts).
 *
 * Setzt kein Cookie, schreibt nichts in localStorage oder sessionStorage
 * und liest dort nichts. Mitgeschickt werden nur der Pfad, beim ersten
 * Aufruf der Verweis einer fremden Seite und die Kampagnenparameter aus der
 * Adresse. Läuft deshalb unabhängig vom Cookie-Banner — anders als GA4
 * und Meta Pixel.
 */
export default function VisitorCounter() {
  const pathname = usePathname();
  const first = useRef(true);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;

    const body: Record<string, string> = { p: pathname };

    if (first.current) {
      first.current = false;
      // Der Verweis zählt nur beim Eintritt und nur von einer fremden Seite.
      try {
        if (document.referrer && new URL(document.referrer).host !== window.location.host) {
          body.r = document.referrer;
        }
      } catch {
        // Unlesbarer Verweis: dann eben ohne.
      }
    }

    const search = new URLSearchParams(window.location.search);
    const us = search.get("utm_source");
    const um = search.get("utm_medium");
    const uc = search.get("utm_campaign");
    if (us) body.us = us;
    if (um) body.um = um;
    if (uc) body.uc = uc;

    // keepalive: Die Meldung geht auch dann hinaus, wenn die Seite gleich
    // darauf verlassen wird. Fehler sind gleichgültig.
    void fetch("/api/statistik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
