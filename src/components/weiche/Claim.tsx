"use client";

import { useMemo } from "react";
import { Bebas_Neue } from "next/font/google";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

/**
 * Der Claim über den Kacheln der Weiche, als Titelkarte in drei Ebenen:
 * oben klein und weit gesperrt "The #1 Portal for", in der Mitte die
 * Hauptzeile in Bebas Neue mit roten Schrägstrichen und je einer feinen
 * roten Linie links und rechts, unten klein "Movies".
 *
 * Der Text ist in beiden Sprachen Englisch (translations.ts, START_CLAIM).
 * Sichtbar sind die drei Ebenen; für Vorleser steht der ganze Satz einmal
 * als sr-only-Text am Anfang, die sichtbaren Teile sind aria-hidden.
 *
 * Bebas Neue ist die Display-Schrift der Streaming-Plattform; hier über
 * next/font nur in diesem Modul geladen, der Shop bleibt bei Geist.
 *
 * Wird mit der Seite gerendert, nicht erst im Browser: Suchmaschinen sehen
 * den Claim. Alle Maße, Farben und der Auftakt (Projektor-Flackern, die
 * Linien fahren von außen nach innen) in globals.css, Block ".claim".
 */

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bebas",
});

export default function Claim() {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  return (
    <div className={`claim ${bebas.variable}`}>
      <span className="sr-only">{t("START_CLAIM")}</span>
      <p className="claim__klein" aria-hidden="true">
        The <em>#1</em> Portal for
      </p>
      <p className="claim__haupt" aria-hidden="true">
        <span className="claim__titel">
          Independent <em>/</em> Arthouse <em>/</em> Underground
        </span>
      </p>
      <p className="claim__klein" aria-hidden="true">
        Movies
      </p>
    </div>
  );
}
