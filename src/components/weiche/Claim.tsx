"use client";

import { useEffect, useMemo, useState } from "react";
import { Bebas_Neue } from "next/font/google";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

/**
 * Der Claim über den Kacheln der Weiche, in drei Fassungen zum Vergleich:
 *
 *   ?claim=1  Titelkarte   drei Ebenen, Bebas Neue, rote Linien, Flackern
 *   ?claim=2  Stempel      eine Zeile Geist, "#1" als roter Stempel
 *   ?claim=3  Glitch       zwei Zeilen Bebas Neue, VHS-Glitch, Filmkorn
 *
 * Ohne Parameter Fassung 1. Der Parameter wird erst im Browser gelesen:
 * /start ist statisch gebaut, und useSearchParams würde die Seite in den
 * dynamischen Betrieb zwingen. Bis der Effekt gelaufen ist, steht nichts
 * da; das fällt mit dem Auftakt zusammen, in dem der Claim ohnehin erst ab
 * --auftakt-logo-start erscheint.
 *
 * Der Text ist in beiden Sprachen Englisch (translations.ts, START_CLAIM).
 * Sichtbar sind die Zeilen unten; der ganze Satz steht für Vorleser als
 * sr-only-Text am Anfang, die sichtbaren Teile sind aria-hidden.
 *
 * Bebas Neue ist die Display-Schrift der Streaming-Plattform; hier über
 * next/font nur in diesem Modul geladen, der Shop bleibt bei Geist.
 *
 * Alle Maße, Farben und Animationen in globals.css, Block ".claim".
 */

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bebas",
});

type Variante = 1 | 2 | 3;

function varianteAusAdresse(): Variante {
  try {
    const wert = new URLSearchParams(window.location.search).get("claim");
    if (wert === "2") return 2;
    if (wert === "3") return 3;
  } catch {
    // Keine Adresse lesbar: Fassung 1.
  }
  return 1;
}

/** Zwei Zeilen der Glitch-Fassung; als eine Zeichenkette für die Geisterbilder. */
const GLITCH_ZEILE_1 = "The #1 Portal for Independent,";
const GLITCH_ZEILE_2 = "Arthouse and Underground Movies.";

export default function Claim() {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);
  const [variante, setVariante] = useState<Variante | null>(null);

  useEffect(() => {
    setVariante(varianteAusAdresse());
  }, []);

  if (variante === null) return null;

  const klassen = `claim claim--${variante} ${bebas.variable}`;

  if (variante === 2) {
    return (
      <div className={klassen}>
        {/* Der ganze Satz für Vorleser; die sichtbaren Teile sind aria-hidden. */}
        <span className="sr-only">{t("START_CLAIM")}</span>
        {/* Rauer Rand für den Stempel: Rauschen verschiebt die Kanten um
            wenige Pixel. Der Filter liegt im Dokument, damit filter: url()
            ihn findet; das SVG selbst hat keine Ausdehnung. */}
        <svg width="0" height="0" aria-hidden="true" focusable="false" className="claim__filter">
          <filter id="claim-stempel-rau" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="rausch" />
            <feDisplacementMap in="SourceGraphic" in2="rausch" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <p className="claim__zeile" aria-hidden="true">
          <span className="claim__stempel">#1</span>
          <span className="claim__text">
            The Portal for Independent, Arthouse and Underground Movies.
          </span>
        </p>
      </div>
    );
  }

  if (variante === 3) {
    return (
      <div className={klassen}>
        {/* Der ganze Satz für Vorleser; die sichtbaren Teile sind aria-hidden. */}
        <span className="sr-only">{t("START_CLAIM")}</span>
        <p
          className="claim__zeilen"
          aria-hidden="true"
          data-text={`${GLITCH_ZEILE_1}\n${GLITCH_ZEILE_2}`}
        >
          <span className="claim__zeile">
            The <em>#1</em> Portal for Independent,
          </span>
          <span className="claim__zeile">Arthouse and Underground Movies.</span>
        </p>
      </div>
    );
  }

  return (
    <div className={klassen}>
        {/* Der ganze Satz für Vorleser; die sichtbaren Teile sind aria-hidden. */}
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
