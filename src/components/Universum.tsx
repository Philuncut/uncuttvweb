"use client";

import { usePathname } from "next/navigation";
import { UncutTVUniverse } from "@philuncut/universe";
import { useLanguage } from "@/lib/LanguageContext";

/**
 * Pfade, auf denen die Leiste nicht erscheint: Die Weiche unter / und
 * /start steht außerhalb der Reihe Streaming | Shop | Social und wählt
 * selbst zwischen den Auftritten. Ohne Leiste setzt das Paket auch keine
 * CSS-Variable; --universe-bar-height fällt dort auf 0 zurück, und die
 * Weiche beginnt wie bisher am oberen Rand.
 */
const OHNE_UNIVERSUM = /^\/$|^\/start(?:\/|$)/;

/**
 * Die Leiste des Verbunds der drei UncutTV-Auftritte, ganz oben: drei
 * gleich breite Links Streaming | Shop | Social. Dieses Projekt ist "shop".
 *
 * Seit 0.6.0 des Pakets gibt es keine Wischnavigation mehr: Kunden landeten
 * beim Scrollen versehentlich auf einem anderen Auftritt, oder die Seite
 * blieb halb verschoben stehen und der Warenkorb war nicht mehr erreichbar.
 *
 * Sichtbar wird davon nichts, solange NEXT_PUBLIC_UNIVERSE_ENABLED beim
 * Bau nicht exakt auf "true" steht; das Paket rendert dann nichts. Hier
 * gibt es bewusst keinen zweiten Schalter, der das umgehen könnte.
 *
 * Das Paket reserviert den Platz selbst (padding-top auf html) und stellt
 * die Höhe als --universe-bar-height bereit. Navbar, mobiles Menü,
 * Vollbild-Menü, Warenkorb-Schublade, Ladebalken und die klebende
 * Kategorieleiste setzen ihr top darauf.
 *
 * locale: nur für die aria-label der Leiste; die Knopftexte sind in beiden
 * Sprachen gleich.
 *
 * zIndex 10002: über der Navbar (10001) und dem mobilen Menü (9999), damit
 * die Leiste immer sichtbar bleibt. Vollbild-Menü (100000) und
 * CookieConsent (199999) liegen darüber; das Vollbild-Menü beginnt
 * unterhalb der Leiste, der CookieConsent dockt unten an.
 *
 * Bewusst keine Sitzungsübergabe: wer hinüberwechselt und dort nicht
 * angemeldet ist, meldet sich dort an.
 */
export default function Universum() {
  const { language } = useLanguage();
  const pathname = usePathname();
  if (pathname && OHNE_UNIVERSUM.test(pathname)) return null;
  return <UncutTVUniverse current="shop" locale={language} zIndex={10002} />;
}
