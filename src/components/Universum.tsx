"use client";

import { UncutTVUniverse } from "@philuncut/universe";
import { useLanguage } from "@/lib/LanguageContext";

/**
 * Der Verbund der drei UncutTV-Auftritte (streaming | shop | video):
 * Wisch am Handy, Pfeilflächen und Alt+Pfeiltasten am Desktop. Dieses
 * Projekt ist "shop" und liegt in der Mitte — links Streaming
 * (uncuttv.app), rechts Video (tv.uncuttv.at).
 *
 * Sichtbar wird davon nichts, solange NEXT_PUBLIC_UNIVERSE_ENABLED beim
 * Bau nicht exakt auf "true" steht; das Paket rendert dann von sich aus
 * nichts und fasst weder html noch body an. Hier gibt es bewusst keinen
 * zweiten Schalter, der das umgehen könnte.
 *
 * locale: Der Shop hält die Sprache nur clientseitig (localStorage,
 * LanguageContext). Streaming erwartet ein Sprachpräfix in der Adresse,
 * darum wird sie durchgereicht — ein englischer Besucher landet auf
 * uncuttv.app/en, nicht auf Deutsch.
 *
 * zIndex 45: über dem normalen Inhalt (klebende Kategorieleiste z-30,
 * Hero-Banner z-40), unter dem CartDrawer und der Altersprüfung (z-50),
 * der Video-Lightbox (z-200), dem mobilen Menü (9999), der Navbar
 * (10001), dem Vollbild-Menü (100000) und dem CookieConsent (199999).
 *
 * Bewusst keine Sitzungsübergabe: wer hinüberwechselt und dort nicht
 * angemeldet ist, meldet sich dort an.
 */
export default function Universum() {
  const { language } = useLanguage();
  return <UncutTVUniverse current="shop" locale={language} zIndex={45} />;
}
