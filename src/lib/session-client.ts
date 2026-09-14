"use client";

import type { AuthSessionPayload } from "@/app/api/auth/session/route";

/**
 * Eine Stelle für /api/auth/session im Browser.
 *
 * Beim Laden der Shopseite fragten Navbar, CartContext und ShopContent die
 * Route unabhängig voneinander ab, drei Funktionsaufrufe für dieselbe
 * Antwort. Hier teilen sich alle Aufrufer eine laufende Anfrage und für
 * kurze Zeit auch die Antwort. Nach einer Anmeldung oder Abmeldung setzen
 * die Formulare `uncuttv:session-changed` ab, dann wird frisch geholt.
 */

const EMPTY_SESSION: AuthSessionPayload = {
  isLoggedIn: false,
  type: null,
  name: null,
  dashboardHref: null,
  isWholesale: false,
  isNewsletterSubscribed: false,
};

/** So lange gilt eine Antwort als aktuell; deckt alle Aufrufer eines Seitenaufbaus ab. */
const FRESH_MS = 5000;

let cached: { at: number; data: AuthSessionPayload } | null = null;
let inFlight: Promise<AuthSessionPayload> | null = null;
let listening = false;

export function invalidateAuthSession(): void {
  cached = null;
}

function listenOnce(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("uncuttv:session-changed", invalidateAuthSession);
}

async function request(): Promise<AuthSessionPayload> {
  const res = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`session ${res.status}`);
  const data = (await res.json()) as Partial<AuthSessionPayload>;
  return {
    isLoggedIn: data.isLoggedIn === true,
    type: data.type ?? null,
    name: data.name ?? null,
    dashboardHref: data.dashboardHref ?? null,
    isWholesale: data.isWholesale === true,
    isNewsletterSubscribed: data.isNewsletterSubscribed === true,
  };
}

/**
 * Liefert die Sitzung. Innerhalb von FRESH_MS aus dem Speicher, sonst
 * frisch; parallele Aufrufer bekommen dieselbe laufende Anfrage. Bei
 * einem Fehler die leere Sitzung, nie eine Ausnahme.
 */
export async function loadAuthSession(
  options?: { fresh?: boolean }
): Promise<AuthSessionPayload> {
  listenOnce();
  const now = Date.now();
  if (!options?.fresh && cached && now - cached.at < FRESH_MS) {
    return cached.data;
  }
  if (!inFlight) {
    inFlight = request()
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .catch(() => {
        cached = null;
        return EMPTY_SESSION;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
