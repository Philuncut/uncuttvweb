"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

/**
 * Altersabfrage, nur auf der Weiche (/start).
 *
 * Beim ersten Besuch liegt ein Overlay über der Weiche: dahinter
 * abgedunkelt, nichts bedienbar. "Ja" merkt die Bestätigung 30 Tage in
 * localStorage, "Nein" führt zu Google.
 *
 * Rein clientseitig: Auf dem Server und bis zum ersten Effekt rendert die
 * Komponente nichts, Suchmaschinen sehen die Weiche also unverändert. Der
 * kurze Moment, in dem die Weiche vor dem Overlay steht, fällt mit dem
 * Auftakt zusammen (die Kacheln steigen erst aus dem Schwarz auf).
 *
 * Speicher mit try/catch: Im privaten Modus mancher Browser wirft
 * localStorage. Dann erscheint die Abfrage bei jedem Besuch, was der
 * ehrlichere Ausfall ist -- ein "Ja", das nicht gespeichert werden kann,
 * darf die Abfrage nicht dauerhaft abschalten.
 */

/** Schlüssel in localStorage. Wert: JSON mit `bis` als Unix-Millisekunden. */
const SCHLUESSEL = "uncuttv:weiche-alter-bestaetigt";

/** Wie lange die Bestätigung gilt. */
const GUELTIG_MS = 30 * 24 * 60 * 60 * 1000;

const WEITERLEITUNG_NEIN = "https://www.google.com";

function bestaetigungGilt(): boolean {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    if (!roh) return false;
    const wert = JSON.parse(roh) as { bis?: unknown };
    return typeof wert.bis === "number" && Date.now() < wert.bis;
  } catch {
    return false;
  }
}

function bestaetigungMerken(): void {
  try {
    window.localStorage.setItem(SCHLUESSEL, JSON.stringify({ bis: Date.now() + GUELTIG_MS }));
  } catch {
    // Kein Speicher: die Abfrage kommt beim nächsten Besuch wieder.
  }
}

export default function Altersabfrage() {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);
  const [sichtbar, setSichtbar] = useState(false);
  const jaRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!bestaetigungGilt()) setSichtbar(true);
  }, []);

  // Solange das Overlay steht: kein Scrollen dahinter, Fokus auf "Ja".
  useEffect(() => {
    if (!sichtbar) return;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    jaRef.current?.focus();
    return () => {
      document.body.style.overflow = vorher;
    };
  }, [sichtbar]);

  const ja = useCallback(() => {
    bestaetigungMerken();
    setSichtbar(false);
  }, []);

  const nein = useCallback(() => {
    window.location.href = WEITERLEITUNG_NEIN;
  }, []);

  if (!sichtbar) return null;

  return (
    <div className="altersabfrage" role="presentation">
      <div
        className="altersabfrage__feld"
        role="dialog"
        aria-modal="true"
        aria-labelledby="altersabfrage-titel"
        aria-describedby="altersabfrage-text"
      >
        <p className="altersabfrage__marke" aria-hidden="true">
          UNCUTTV
        </p>
        <h2 id="altersabfrage-titel" className="altersabfrage__titel">
          {t("START_ALTER_TITEL")}
        </h2>
        <p id="altersabfrage-text" className="altersabfrage__text">
          {t("START_ALTER_TEXT")}
        </p>
        <div className="altersabfrage__knoepfe">
          <button
            ref={jaRef}
            type="button"
            className="altersabfrage__knopf altersabfrage__knopf--ja"
            onClick={ja}
          >
            {t("START_ALTER_JA")}
          </button>
          <button
            type="button"
            className="altersabfrage__knopf altersabfrage__knopf--nein"
            onClick={nein}
          >
            {t("START_ALTER_NEIN")}
          </button>
        </div>
      </div>
    </div>
  );
}
