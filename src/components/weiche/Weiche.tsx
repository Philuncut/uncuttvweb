"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import { TEXTTEIL_ID } from "./StartContent";
import {
  AUFTAKT_ATTRIBUT,
  AUFTAKT_HOECHSTDAUER_MS,
  AUFTAKT_ENDE_ANIMATION,
} from "./auftakt";

/**
 * Die Weiche: drei Felder, je eines für Streaming, Shop und Social.
 *
 * Desktop: nebeneinander, je ein Drittel, volle Höhe; das Feld unter dem
 * Zeiger ist aktiv. Handy: übereinander, das Band, dessen Mitte der
 * Bildschirmmitte am nächsten liegt, ist aktiv und etwas höher. Solange
 * niemand eingreift, wandert die Hervorhebung alle vier Sekunden weiter.
 *
 * In jedem Feld sitzt das Video als Kachel mit weichem Rand, nicht
 * flächendeckend; darunter steht das Logo auf einem Verlauf ins Schwarz.
 * Die Maße dazu stehen als CSS-Variablen in globals.css (.weiche).
 *
 * Bewegung nur im aktiven Feld: Nur sein Video spielt, die beiden anderen
 * stehen. Ein Video wird beim ersten Aktivwerden geladen (preload="none",
 * src erst dann gesetzt) und bei jedem weiteren an den Anfang gesetzt und
 * neu gestartet; das vorher aktive wird pausiert. Bei
 * prefers-reduced-motion läuft gar keines, es bleiben die Standbilder.
 *
 * Jedes Feld ist ein echter Link. Am Desktop navigiert der Klick. Am Handy
 * aktiviert die erste Berührung das Feld, ein Tippen auf das bereits
 * aktive Feld navigiert -- sonst spränge man beim Aktivieren schon fort.
 * Beim Navigieren fährt das gewählte Feld auf volle Größe, die anderen
 * blenden aus, dann wird gewechselt. Klicks mit Zusatztaste (neuer Tab)
 * bleiben beim Browser.
 *
 * Unabhängig von @philuncut/universe: Die Weiche steht außerhalb der
 * Reihe, das Bauteil ist auf /start ausgeblendet (siehe Universum.tsx).
 * Der Schalter NEXT_PUBLIC_UNIVERSE_ENABLED hat hier keine Wirkung.
 */

type FeldId = "streaming" | "shop" | "social";

type Feld = {
  id: FeldId;
  href: string;
  extern: boolean;
  labelKey: string;
  /**
   * Alle drei Dateien sind randlos auf den Inhalt beschnitten, damit die
   * Unterkante des Bildes die Unterkante des Zeichens ist und alle drei
   * ohne Versatz auf derselben Grundlinie stehen. Streaming kam so
   * geliefert (Wortmarke 4,5:1); Shop und Social sind mit `sharp` auf den
   * Inhalt beschnittene Kopien (`*-beschnitten.*`) der gelieferten Dateien,
   * die 16 bis 18 % bzw. 6 % Leerrand hatten.
   */
  logo: { src: string; width: number; height: number };
  /**
   * Zwei Wortmarken (Streaming 4,5:1, Shop 1,8:1) und ein fast
   * quadratisches Zeichen (Social 1,1:1). Die Breiten je Form stehen in
   * globals.css (--logo-wortmarke-*, --logo-quadrat-*); die Wortmarken
   * bekommen dort rund die anderthalbfache Breite des Quadrats.
   */
  wortmarke: boolean;
};

const FELDER: readonly Feld[] = [
  {
    id: "streaming",
    href: "https://uncuttv.app",
    extern: true,
    labelKey: "START_LINK_STREAMING",
    logo: { src: "/weiche/logo-streaming.png", width: 2310, height: 516 },
    wortmarke: true,
  },
  {
    id: "shop",
    href: "/shop",
    extern: false,
    labelKey: "START_LINK_SHOP",
    logo: { src: "/weiche/logo-shop-beschnitten.png", width: 1078, height: 602 },
    wortmarke: true,
  },
  {
    id: "social",
    href: "https://tv.uncuttv.at",
    extern: true,
    labelKey: "START_LINK_SOCIAL",
    logo: { src: "/weiche/logo-social-beschnitten.webp", width: 800, height: 733 },
    wortmarke: false,
  },
];

/** Takt der selbständigen Hervorhebung. */
const ROTATION_MS = 4000;
/** Dauer des Zooms nach der Wahl, danach wird navigiert. */
const ZOOM_MS = 500;
/** Abstand des einen zweiten Versuchs, wenn play() abgelehnt wurde. */
const NEUSTART_VERZOEGERUNG_MS = 250;
/** Takt der Wiedergabe-Wache, siehe den Effekt dazu in Weiche(). */
const WACHE_INTERVALL_MS = 1000;
/** Ab so viel eigener Scrollbewegung blendet der Pfeil unter der Weiche aus. */
const PFEIL_SCROLL_SCHWELLE_PX = 8;
/** Ab hier Desktop: Felder nebeneinander, Hochkant-Videos. */
const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Media Query als Zustand, ohne setState in einem Effekt. Auf dem Server
 * gilt der Rückfall; nach der Hydration der echte Wert.
 */
function useMediaQuery(query: string, serverFallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverFallback
  );
}

/**
 * Läuft der Auftakt? Die Wahrheit ist das Attribut am html-Element, das
 * das Inline-Skript vor React setzt und diese Komponente am Ende wieder
 * entfernt. Auf dem Server gibt es keinen Auftakt.
 */
function abonniereAuftakt(onChange: () => void) {
  const beobachter = new MutationObserver(onChange);
  beobachter.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [AUFTAKT_ATTRIBUT],
  });
  return () => beobachter.disconnect();
}

function auftaktImDokument(): boolean {
  return document.documentElement.hasAttribute(AUFTAKT_ATTRIBUT);
}

function beendeAuftakt() {
  document.documentElement.removeAttribute(AUFTAKT_ATTRIBUT);
}

function useAuftakt(): boolean {
  return useSyncExternalStore(abonniereAuftakt, auftaktImDokument, () => false);
}

function videoQuelle(id: FeldId, orientierung: "hoch" | "quer"): string {
  return `/weiche/${id}-${orientierung}.mp4`;
}

/** Kurve des Zooms nach der Wahl. */
const ZOOM_KURVE = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Der Zoom nach der Wahl, als EINE Bewegung der Kachel.
 *
 * Bis September 2026 bestand er aus zwei: Die Kachel skalierte per CSS auf
 * 1,15, und gleichzeitig wuchs das Feld über flex-grow auf die volle
 * Fläche. Der Flächenanteil eines Feldes steigt dabei nicht gleichmäßig,
 * sondern schießt gegen Ende hoch (Anteil = g / (g + 2 * 0,001) erreicht
 * erst im letzten Zehntel die volle Größe). Man sah die Kachel zuerst etwas
 * wachsen und dann auf ihre Zielgröße springen.
 *
 * Jetzt bleibt das Layout stehen, und nur die Kachel bewegt sich: von ihrem
 * aktuell gerenderten Zustand -- auch mitten in der Hervorhebung, etwa bei
 * scale 1,01 auf dem Weg zu 1,03 -- zur Mitte der Weiche und so groß, dass
 * ihr deckender Kern (ohne den weich auslaufenden Rand) die ganze Fläche
 * füllt. Standbild und Video liegen beide in der Kachel und folgen damit
 * zwangsläufig derselben Bewegung.
 *
 * Zur selben Bewegung gehören, mit derselben Dauer und Kurve: Die Kachel
 * wird unscharf und dunkler (--zoom-unschaerfe, --zoom-helligkeit), und das
 * Logo wandert von seiner Grundlinie in die Mitte der Weiche und wächst
 * dabei leicht (--zoom-logo-scale). Am Ende steht das Logo mittig auf einem
 * weichen, dunklen Bild, dann wird navigiert.
 *
 * Über die Web Animations API mit ausdrücklichem Startwert: Sie liegt über
 * der laufenden CSS-Transition und setzt auf deren aktuellem Wert auf,
 * ohne Sprung.
 */
function starteZoom(feld: HTMLAnchorElement | null): Animation[] {
  const kachel = feld?.querySelector<HTMLElement>(".weiche__medien");
  // Die Bühne ist die ganze Weiche, nicht die Kachelreihe darin: Unter der
  // Reihe liegt die Hinweiszeile, und der Zoom soll den ganzen Bildschirm
  // füllen. Die Variablen (--kachel-rand, --zoom-*) erbt die Reihe ohnehin.
  const buehne = feld?.closest<HTMLElement>(".weiche");
  if (!kachel || !buehne || typeof kachel.animate !== "function") return [];

  const stil = getComputedStyle(kachel);
  // "none" oder ein ungültiger Wert ergibt NaN, das heißt: nicht skaliert.
  const jetztScale = Number.parseFloat(stil.scale) || 1;
  // Aktueller Filter der Kachel, etwa "saturate(0) brightness(0.38)" in
  // Ruhe, "none" im aktiven Zustand oder ein Zwischenwert der Hervorhebung.
  const jetztFilter = stil.filter;

  const kachelRect = kachel.getBoundingClientRect();
  const buehneRect = buehne.getBoundingClientRect();
  // --kachel-rand steht in Prozent an .weiche; der deckende Kern ist die
  // Kachel ohne diesen Rand auf beiden Seiten.
  const rand =
    (Number.parseFloat(getComputedStyle(buehne).getPropertyValue("--kachel-rand")) || 0) / 100;
  const kern = Math.max(0.01, 1 - 2 * rand);
  // Welcher Anteil der Kachel am Ende die Weiche deckt. Desktop: der
  // deckende Kern ohne den weichen Rand. Handy: --zoom-deckung-handy aus
  // globals.css; der quer liegende Clip müsste sonst seitlich ein
  // Vielfaches der Bildschirmbreite aufziehen, um den hohen Bildschirm mit
  // seinem Kern zu füllen. Fehlt der Wert, gilt auch am Handy der Kern.
  const handyDeckung = Number.parseFloat(
    getComputedStyle(buehne).getPropertyValue("--zoom-deckung-handy")
  );
  const deckung =
    window.matchMedia(DESKTOP_QUERY).matches || !(handyDeckung > 0) ? kern : handyDeckung;
  // offsetWidth/offsetHeight sind die Maße ohne scale und translate.
  const zielScale = Math.max(
    jetztScale,
    buehneRect.width / (kachel.offsetWidth * deckung),
    buehneRect.height / (kachel.offsetHeight * deckung)
  );
  // translate wirkt nach scale und damit in Bildschirmpixeln.
  const dx = buehneRect.left + buehneRect.width / 2 - (kachelRect.left + kachelRect.width / 2);
  const dy = buehneRect.top + buehneRect.height / 2 - (kachelRect.top + kachelRect.height / 2);

  const buehnenStil = getComputedStyle(buehne);
  const zahl = (name: string, rueckfall: number) => {
    const wert = Number.parseFloat(buehnenStil.getPropertyValue(name));
    return Number.isFinite(wert) ? wert : rueckfall;
  };

  // Weichzeichner und Abdunklung. filter wirkt im eigenen Maßstab der
  // Kachel, also vor scale: 24 px bei 4,6-facher Vergrößerung wären auf dem
  // Bildschirm über 100 px. Der Zielwert wird deshalb durch die
  // Zielvergrößerung geteilt, damit am Ende die eingestellte Unschärfe auf
  // dem Bildschirm steht. --zoom-unschaerfe ist je Breakpoint aufgelöst.
  const zielUnschaerfe = zahl("--zoom-unschaerfe", 0) / zielScale;
  const zielHelligkeit = zahl("--zoom-helligkeit", 1);

  // Filterlisten werden nur dann stufenlos überblendet, wenn beide Enden
  // dieselben Funktionen in derselben Reihenfolge haben; sonst springt der
  // Browser in der Mitte um. Der Startwert kommt deshalb in dieselbe Form
  // wie das Ziel. Fehlt eine Funktion ("none"), gilt ihr neutraler Wert.
  const filterWert = (name: string, rueckfall: number) => {
    const treffer = jetztFilter.match(new RegExp(`${name}\\(([-\\d.]+)`));
    return treffer ? Number.parseFloat(treffer[1]) : rueckfall;
  };
  const startFilter = `saturate(${filterWert("saturate", 1)}) brightness(${filterWert("brightness", 1)}) blur(0px)`;
  const zielFilter = `saturate(1) brightness(${zielHelligkeit}) blur(${zielUnschaerfe}px)`;

  const optionen: KeyframeAnimationOptions = {
    duration: ZOOM_MS,
    easing: ZOOM_KURVE,
    fill: "forwards",
  };

  const animationen: Animation[] = [
    kachel.animate(
      [
        { translate: "-50% -50%", scale: String(jetztScale), filter: startFilter },
        {
          translate: `calc(-50% + ${dx}px) calc(-50% + ${dy}px)`,
          scale: String(zielScale),
          filter: zielFilter,
        },
      ],
      optionen
    ),
  ];

  // Das Logo wandert von seiner Grundlinie in die Mitte der Weiche. Es
  // liegt außerhalb der Kachel und bewegt sich deshalb nicht von selbst mit.
  const logo = feld?.querySelector<HTMLElement>(".weiche__logo");
  if (feld && logo && typeof logo.animate === "function") {
    const logoStil = getComputedStyle(logo);

    // Aktueller transform als Matrix, etwa matrix(1.08, 0, 0, 1.08, -171.6, 0):
    // a ist die Vergrößerung, e und f die Verschiebung. Der Startwert wird
    // daraus in dieselbe Form wie das Ziel gebracht, damit die Bewegung
    // stufenlos und ohne Sprung beginnt.
    const matrix = logoStil.transform.match(/matrix\(([^)]+)\)/);
    const [a, , , , e, f] = matrix
      ? matrix[1].split(",").map((teil) => Number.parseFloat(teil))
      : [1, 0, 0, 1, -logo.offsetWidth / 2, 0];

    // Lage der Logobox ohne transform: offsetLeft/offsetTop beziehen sich
    // auf das Feld (position: relative).
    const feldRect = feld.getBoundingClientRect();
    const breite = logo.offsetWidth;
    const hoehe = logo.offsetHeight;
    const boxMitteX = feldRect.left + logo.offsetLeft + breite / 2;
    const boxUnten = feldRect.top + logo.offsetTop + hoehe;

    // Der Versatz auf die Schrift-Grundlinie (translate in Prozent der
    // Logohöhe, bei Shop und Social) bleibt als eigene Eigenschaft wirksam
    // und verschiebt die Mitte mit; er wird hier herausgerechnet.
    const versatzTeil = logoStil.translate.trim().split(/\s+/)[1] ?? "0px";
    const versatz = versatzTeil.endsWith("%")
      ? (Number.parseFloat(versatzTeil) / 100) * hoehe
      : Number.parseFloat(versatzTeil) || 0;

    // transform-origin liegt unten mittig. Mit translate(tx, ty) scale(k)
    // liegt die Mitte der Logobox danach bei
    //   x = boxMitteX + tx
    //   y = boxUnten + ty - k * hoehe / 2 + versatz
    const k = zahl("--zoom-logo-scale", 1);
    const tx = buehneRect.left + buehneRect.width / 2 - boxMitteX;
    const ty = buehneRect.top + buehneRect.height / 2 - boxUnten + (k * hoehe) / 2 - versatz;

    animationen.push(
      logo.animate(
        [
          { transform: `translate(${e}px, ${f}px) scale(${a})`, opacity: logoStil.opacity },
          // Sichtbar bis zur Navigation: volle Deckkraft, auch wenn das Feld
          // vorher nicht hervorgehoben war (Wahl per Tastatur).
          { transform: `translate(${tx}px, ${ty}px) scale(${k})`, opacity: "1" },
        ],
        optionen
      )
    );
  }

  return animationen;
}

export default function Weiche() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const reduziert = useMediaQuery(REDUCED_MOTION_QUERY, false);
  const orientierung = desktop ? "hoch" : "quer";
  const auftakt = useAuftakt();

  const [aktiv, setAktiv] = useState(0);
  /** Der Nutzer hat eingegriffen (Zeiger, Scrollen, Berührung): die
      selbständige Hervorhebung hört auf. */
  const [interagiert, setInteragiert] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  /**
   * Erzwingt einen Neustart des aktiven Videos, auch wenn sich aktiv und
   * gewaehlt nicht ändern. Erhöht beim Zurückkommen aus dem
   * Rück-Vorwärts-Zwischenspeicher, siehe pageshow unten.
   */
  const [neustart, setNeustart] = useState(0);

  const feldRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  /** Hinweiszeile unter den Kacheln; ihre Einblendung beendet den Auftakt. */
  const hinweisRef = useRef<HTMLDivElement | null>(null);
  /** Der Nutzer hat gescrollt oder den Pfeil benutzt: Pfeil bleibt weg. */
  const [pfeilWeg, setPfeilWeg] = useState(false);
  /** Zeigerart des letzten pointerdown; entscheidet, ob ein Klick eine
      Berührung war. Tastatur hinterlässt hier nichts. */
  const zeigerTyp = useRef<string | null>(null);
  /** Gewählt während des Auftakts: ohne Zoom sofort zum Ziel. */
  const sofort = useRef(false);
  /** Feld, dessen Video zuletzt gestartet wurde; null, wenn keines läuft. */
  const laufendesVideo = useRef<number | null>(null);
  /** Laufende Zoom-Animation der gewählten Kachel, zum Abbrechen. */
  const zoomAnimationen = useRef<Animation[]>([]);

  // Selbständige Hervorhebung, bis der Nutzer eingreift oder wählt. Sie
  // beginnt erst nach dem Auftakt. Das Attribut wird zusätzlich direkt
  // gelesen: Bei der Hydration liefert useAuftakt zunächst den Wert des
  // Servers (kein Auftakt), und der Takt liefe sonst einen Durchgang zu früh.
  useEffect(() => {
    if (interagiert || gewaehlt !== null) return;
    if (auftakt || auftaktImDokument()) return;
    const timer = window.setInterval(() => {
      setAktiv((a) => (a + 1) % FELDER.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [interagiert, gewaehlt, auftakt]);

  // Ende des Auftakts: wenn die Logo-Animation im letzten Feld fertig ist,
  // mit einer Obergrenze als Netz. Das Entfernen des Attributs lässt die
  // Hervorhebung des ersten Feldes einsetzen und startet über useAuftakt
  // Takt und Video.
  useEffect(() => {
    if (!auftakt) return;
    // Die Hinweiszeile blendet als Letztes ein, nach den Logos. Erst wenn sie
    // steht, ist der Auftakt vorbei; endete er schon mit dem letzten Logo,
    // würde ihre Einblendung abgeschnitten.
    const hinweis = hinweisRef.current;
    const amEnde = (event: AnimationEvent) => {
      if (event.animationName === AUFTAKT_ENDE_ANIMATION) beendeAuftakt();
    };
    hinweis?.addEventListener("animationend", amEnde);
    const netz = window.setTimeout(beendeAuftakt, AUFTAKT_HOECHSTDAUER_MS);
    return () => {
      hinweis?.removeEventListener("animationend", amEnde);
      window.clearTimeout(netz);
    };
  }, [auftakt]);

  // Pfeil unter der Hinweiszeile: Scrollt der Nutzer selbst nach unten,
  // blendet er aus und kommt nicht wieder. Gezählt wird nur Scrollen nach
  // unten, das auf eine eigene Eingabe folgt (Finger, Mausrad, Taste). Die
  // Scrollposition, die der Browser beim Neuladen wiederherstellt, zählt
  // nicht: Am Handy lag der Pfeil sonst schon beim Laden versteckt da, und
  // wer danach nach oben scrollte, sah ihn nie.
  useEffect(() => {
    if (pfeilWeg) return;
    let eingabe = false;
    let letzteY = window.scrollY;
    const merkeEingabe = () => {
      eingabe = true;
    };
    const pruefe = () => {
      const y = window.scrollY;
      if (eingabe && y > letzteY && y > PFEIL_SCROLL_SCHWELLE_PX) setPfeilWeg(true);
      letzteY = y;
    };
    const eingaben = ["touchstart", "wheel", "keydown", "pointerdown"] as const;
    eingaben.forEach((typ) => window.addEventListener(typ, merkeEingabe, { passive: true }));
    window.addEventListener("scroll", pruefe, { passive: true });
    return () => {
      eingaben.forEach((typ) => window.removeEventListener(typ, merkeEingabe));
      window.removeEventListener("scroll", pruefe);
    };
  }, [pfeilWeg]);

  // Verlässt man /start, darf das Attribut nicht am html-Element hängen
  // bleiben.
  useEffect(() => beendeAuftakt, []);

  // Handy: Scrollen oder Berühren gilt als Eingriff.
  useEffect(() => {
    if (desktop) return;
    const eingriff = () => setInteragiert(true);
    window.addEventListener("scroll", eingriff, { once: true, passive: true });
    window.addEventListener("touchstart", eingriff, { once: true, passive: true });
    return () => {
      window.removeEventListener("scroll", eingriff);
      window.removeEventListener("touchstart", eingriff);
    };
  }, [desktop]);

  // Handy: nach dem Eingriff ist das Band aktiv, dessen Mitte der
  // Bildschirmmitte am nächsten liegt. Ausgewertet beim Scrollen, nicht
  // über einen IntersectionObserver: Das aktive Band wird höher und
  // verschiebt damit die Nachbarn; ein Beobachter auf die Mittellinie
  // feuerte darauf erneut und die Wahl sprang hin und her. Der Abstand
  // der Bandmitte ist dagegen stabil, weil ein wachsendes Band seine
  // Mitte in Richtung Bildschirmmitte schiebt. Bewusst keine Auswertung
  // beim Einrichten: Ein Tippen auf ein Band soll dieses aktivieren und
  // nicht sofort vom Band in der Mitte überstimmt werden.
  useEffect(() => {
    if (desktop || !interagiert || gewaehlt !== null) return;
    // Direkt im Scroll-Ereignis, nicht über requestAnimationFrame: drei
    // getBoundingClientRect sind billig, und rAF feuert in einem
    // verdeckten Dokument gar nicht -- ein einmal gesetzter Frame-Zeiger
    // blockierte dann jede weitere Auswertung.
    const waehleMitte = () => {
      const mitte = window.innerHeight / 2;
      let bester = -1;
      let abstand = Number.POSITIVE_INFINITY;
      feldRefs.current.forEach((el, index) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - mitte);
        if (d < abstand) {
          abstand = d;
          bester = index;
        }
      });
      if (bester >= 0) setAktiv(bester);
    };
    window.addEventListener("scroll", waehleMitte, { passive: true });
    window.addEventListener("resize", waehleMitte);
    // Der Eingriff war ein Scrollen, das schon vor dem Anhängen dieses
    // Zuhörers begonnen hat: dann einmal nachmessen. Nach einem Tippen
    // steht die Seite oben, und das getippte Band bleibt.
    if (window.scrollY > 0) waehleMitte();
    return () => {
      window.removeEventListener("scroll", waehleMitte);
      window.removeEventListener("resize", waehleMitte);
    };
  }, [desktop, interagiert, gewaehlt]);

  // Nur das aktive Video spielt. Bei jedem Wechsel: das neue laden (falls
  // noch nicht geschehen), an den Anfang setzen und starten; alle anderen
  // anhalten. src ist kein React-Attribut, sondern wird hier gesetzt, damit
  // die beiden anderen Felder nichts herunterladen. Ein Wechsel der
  // Orientierung (Fenster über die Bruchstelle gezogen) lädt die passende
  // Fassung nach.
  useEffect(() => {
    const ziel = gewaehlt ?? aktiv;
    // Während des Auftakts ist keine Kachel aktiv, also läuft auch kein
    // Video; es wird nicht einmal geladen.
    const stillhalten = reduziert || auftakt || auftaktImDokument();
    let aufgeraeumt = false;
    let wiederholt = false;
    let wiederholTimer = 0;
    const starte = () => {
      const video = videoRefs.current[ziel];
      if (!video || stillhalten || aufgeraeumt) return;
      const start = video.play();
      if (!start) return;
      start
        .then(() => {
          // Nicht allein auf das Ereignis "playing" verlassen: Beim
          // Wiederherstellen einer Seite kann die Wiedergabe laufen, ohne
          // dass es noch einmal kommt, und das Standbild bliebe davor stehen.
          if (!aufgeraeumt && !video.paused) {
            video.parentElement?.setAttribute("data-video-laeuft", "");
          }
        })
        .catch(() => {
          // Abgelehnt oder unterbrochen. Liegt die Seite im Hintergrund,
          // startet der visibilitychange-Zuhörer unten neu, sobald sie
          // sichtbar wird. Ist sie sichtbar, genau ein zweiter Versuch kurz
          // danach: Beim Zurückkommen aus dem Rück-Vorwärts-Zwischenspeicher
          // fällt der erste Aufruf mitunter noch in die Phase, in der der
          // Browser Medien angehalten hält. Früher wurde die Ablehnung
          // verschluckt, und am Desktop lief bis zur nächsten Mausbewegung
          // kein Video.
          if (aufgeraeumt || wiederholt || document.visibilityState !== "visible") return;
          wiederholt = true;
          wiederholTimer = window.setTimeout(starte, NEUSTART_VERZOEGERUNG_MS);
        });
    };

    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index !== ziel || stillhalten) {
        if (!video.paused) video.pause();
        return;
      }
      const quelle = videoQuelle(FELDER[index].id, orientierung);
      if (video.dataset.quelle !== quelle) {
        video.dataset.quelle = quelle;
        video.src = quelle;
        video.load();
      } else if (laufendesVideo.current !== index && video.readyState > 0) {
        // Nur bei einem echten Wechsel an den Anfang. Wird das bereits
        // laufende Feld gewählt, spielt der Clip weiter; vorher sprang das
        // Bild hier mitten im Zoom auf sein erstes Bild zurück.
        video.currentTime = 0;
      }
    });
    laufendesVideo.current = stillhalten ? null : ziel;
    starte();

    // Chrome hält tonlose Videos an, sobald die Seite in den Hintergrund
    // geht (Tab gewechselt, App verlassen), und startet sie nicht von
    // selbst wieder. Kommt die Seite zurück, läuft das aktive Video weiter.
    const sichtbar = () => {
      if (document.visibilityState === "visible") starte();
    };
    document.addEventListener("visibilitychange", sichtbar);
    return () => {
      aufgeraeumt = true;
      window.clearTimeout(wiederholTimer);
      document.removeEventListener("visibilitychange", sichtbar);
    };
  }, [aktiv, gewaehlt, orientierung, reduziert, auftakt, neustart]);

  // Wiedergabe-Wache: eine schlichte Absicherung statt weiterer
  // Sonderfälle. Solange die Seite sichtbar ist, prüft sie jede Sekunde, ob
  // das Video des Feldes, das laufen soll, auch wirklich läuft -- also nicht
  // pausiert ist und seine Zeit seit der letzten Prüfung weitergelaufen ist.
  // Wenn nicht, ruft sie play().
  //
  // Anlass: Firefox setzt tonlose Videos beim Wiederherstellen aus dem
  // Rück-Vorwärts-Zwischenspeicher nicht von selbst fort, und je nach Weg
  // (Zwischenspeicher, Neuladen, clientseitige Navigation) kommt dabei kein
  // Ereignis, an dem sich zuverlässig ansetzen ließe. Die Wache fragt nicht,
  // wie die Seite zurückkam, sondern nur, ob das Video läuft.
  //
  // Sie greift nur, wo der Video-Effekt oben ohnehin abspielen würde: nicht
  // bei reduzierter Bewegung, nicht während des Auftakts, und nur für ein
  // Video, dessen Quelle schon gesetzt ist. Laden bleibt Sache des
  // Video-Effekts. Im Hintergrund läuft kein Intervall.
  useEffect(() => {
    const ziel = gewaehlt ?? aktiv;
    let intervall = 0;
    let letzteZeit = -1;

    const pruefe = () => {
      if (reduziert || auftakt || auftaktImDokument()) return;
      const video = videoRefs.current[ziel];
      if (!video || !video.dataset.quelle) return;

      const steht = video.paused || video.currentTime === letzteZeit;
      letzteZeit = video.currentTime;
      if (!steht) return;

      const start = video.play();
      if (!start) return;
      start
        .then(() => {
          if (!video.paused) video.parentElement?.setAttribute("data-video-laeuft", "");
        })
        .catch(() => {
          // Abgelehnt: die nächste Prüfung versucht es erneut.
        });
    };

    const starteWache = () => {
      window.clearInterval(intervall);
      letzteZeit = -1;
      intervall = window.setInterval(pruefe, WACHE_INTERVALL_MS);
    };
    const stoppeWache = () => {
      window.clearInterval(intervall);
      intervall = 0;
    };
    const sichtbarkeit = () => {
      if (document.visibilityState === "visible") starteWache();
      else stoppeWache();
    };

    sichtbarkeit();
    document.addEventListener("visibilitychange", sichtbarkeit);
    return () => {
      stoppeWache();
      document.removeEventListener("visibilitychange", sichtbarkeit);
    };
  }, [aktiv, gewaehlt, reduziert, auftakt]);

  // Zurück-Knopf des Browsers: Die Seite kommt aus dem Rück-Vorwärts-
  // Zwischenspeicher samt Zustand zurück, ohne dass die Komponente neu
  // aufgebaut wird -- die gewählte Kachel stünde aufgezogen, die anderen
  // fehlten, das Video liefe. pageshow mit persisted ist der Moment, in
  // dem das passiert; dann beginnt die Weiche von vorn. Ein reiner
  // Reiterwechsel löst das nicht aus, dort bleibt der Zustand ohnehin
  // unverändert, und gewählt wird nur unmittelbar vor der Navigation.
  useEffect(() => {
    const zurueck = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      videoRefs.current.forEach((video) => {
        if (video && !video.paused) video.pause();
      });
      sofort.current = false;
      laufendesVideo.current = null;
      setGewaehlt(null);
      setInteragiert(false);
      setAktiv(0);
      // Ausdrücklicher Neustart des Videos. Ohne ihn lief der Video-Effekt
      // nur, wenn sich aktiv oder gewaehlt tatsächlich änderten. Am Handy
      // fiel das nicht auf, weil jede Scrollbewegung die Auswahl neu setzt;
      // am Desktop lief bis zur nächsten Mausbewegung nichts.
      setNeustart((n) => n + 1);
    };
    window.addEventListener("pageshow", zurueck);
    return () => window.removeEventListener("pageshow", zurueck);
  }, []);

  // Navigation als Effekt an der Wahl, nicht als Zeitgeber im Handler:
  // Der Zeitgeber hängt so am Zustand und kann nicht zwischen Render und
  // Aufräumen verloren gehen.
  useEffect(() => {
    if (gewaehlt === null) return;
    const feld = FELDER[gewaehlt];
    const navigiere = () => {
      if (feld.extern) {
        window.location.assign(feld.href);
      } else {
        router.push(feld.href);
      }
    };
    // Ohne Bewegungswunsch gibt es auch keinen Zoom, und wer den Auftakt
    // unterbricht, will nicht noch einen Zoom abwarten: sofort weiter.
    if (reduziert || sofort.current) {
      navigiere();
      return;
    }
    zoomAnimationen.current = starteZoom(feldRefs.current[gewaehlt]);
    const timer = window.setTimeout(navigiere, ZOOM_MS);
    return () => {
      window.clearTimeout(timer);
      // Zurück aus dem Rück-Vorwärts-Zwischenspeicher setzt gewaehlt auf
      // null: Die Kachel kehrt dann an ihren Platz zurück.
      zoomAnimationen.current.forEach((animation) => animation.cancel());
      zoomAnimationen.current = [];
    };
  }, [gewaehlt, reduziert, router]);

  const zeigerBetritt = useCallback(
    (index: number, event: PointerEvent<HTMLAnchorElement>) => {
      // Nur der Mauszeiger: Am Handy löst eine Berührung ebenfalls
      // pointerenter aus, dort entscheidet Bildschirmmitte oder Tippen.
      if (event.pointerType !== "mouse") return;
      setInteragiert(true);
      setAktiv(index);
    },
    []
  );

  const fokus = useCallback((index: number, event: FocusEvent<HTMLAnchorElement>) => {
    // Nur Tastaturfokus aktiviert. Eine Berührung fokussiert den Link
    // ebenfalls, und das darf das Feld nicht schon vor dem Tippen aktiv
    // machen, sonst navigierte das erste Tippen.
    if (!event.currentTarget.matches(":focus-visible")) return;
    setInteragiert(true);
    setAktiv(index);
  }, []);

  const waehle = useCallback(
    (index: number, event: MouseEvent<HTMLAnchorElement>) => {
      // Neuer Tab, neues Fenster, Mittelklick: dem Browser überlassen.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      if (gewaehlt !== null) return;

      // Klick oder Tipp während des Auftakts: abbrechen und sofort zum
      // Ziel, auch am Handy ohne den Zwischenschritt "erst aktivieren" --
      // wer so früh tippt, hat sich entschieden.
      if (auftakt || auftaktImDokument()) {
        beendeAuftakt();
        sofort.current = true;
        setInteragiert(true);
        setGewaehlt(index);
        return;
      }

      // Berührung auf ein nicht aktives Feld: nur aktivieren. Tastatur
      // (detail 0) und Maus navigieren sofort.
      const beruehrung =
        event.detail !== 0 &&
        (zeigerTyp.current === "touch" || zeigerTyp.current === "pen");
      if (beruehrung && index !== aktiv) {
        setInteragiert(true);
        setAktiv(index);
        return;
      }

      setGewaehlt(index);
    },
    [aktiv, gewaehlt, auftakt]
  );

  // Klick auf den Pfeil: weich zum Textteil. Ohne Bewegungswunsch springt
  // die Seite. Der Pfeil hat damit seinen Zweck erfüllt und bleibt weg.
  const zumTextteil = useCallback(() => {
    setPfeilWeg(true);
    document
      .getElementById(TEXTTEIL_ID)
      ?.scrollIntoView({ behavior: reduziert ? "auto" : "smooth", block: "start" });
  }, [reduziert]);

  return (
    <section
      className={"weiche" + (gewaehlt !== null ? " weiche--gewaehlt" : "")}
      aria-label={t("START_WEICHE_LABEL")}
    >
      {/* Die Kachelreihe. Sie ist um die Hinweiszeile kürzer als der
          Bildschirm; die Kacheln behalten trotzdem ihre Größe, siehe
          --kachel-hoehe in globals.css. */}
      <div className="weiche__felder">
      {FELDER.map((feld, index) => {
        const istAktiv = gewaehlt === null ? index === aktiv : index === gewaehlt;
        const klassen = [
          "weiche__feld",
          // Je Auftritt eine Klasse: für Werte, die nur ein Logo betreffen,
          // etwa den Versatz auf die Schrift-Grundlinie in globals.css.
          `weiche__feld--${feld.id}`,
          feld.wortmarke ? "weiche__feld--wortmarke" : "",
          istAktiv ? "weiche__feld--aktiv" : "",
          gewaehlt === index ? "weiche__feld--ziel" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            key={feld.id}
            ref={(el) => {
              feldRefs.current[index] = el;
            }}
            href={feld.href}
            rel={feld.extern ? "noopener" : undefined}
            className={klassen}
            // --i: Platz in der Reihe, für den Versatz im Auftakt.
            style={{ "--i": index } as CSSProperties}
            aria-label={t(feld.labelKey)}
            aria-current={istAktiv ? "true" : undefined}
            onPointerDown={(event) => {
              zeigerTyp.current = event.pointerType;
            }}
            onPointerEnter={(event) => zeigerBetritt(index, event)}
            onFocus={(event) => fokus(index, event)}
            onClick={(event) => waehle(index, event)}
          >
            {/* Die Kachel: Standbild vom ersten Bild an, passend zur
                Orientierung und ohne JavaScript. Das Video liegt darüber und
                wird erst sichtbar, wenn es wirklich spielt. Der weiche Rand
                kommt aus der Maske in globals.css. */}
            <div className="weiche__medien" aria-hidden="true">
              <picture>
                <source media={DESKTOP_QUERY} srcSet={`/weiche/${feld.id}-hoch.webp`} />
                <img src={`/weiche/${feld.id}-quer.webp`} alt="" />
              </picture>
              <video
                ref={(el) => {
                  videoRefs.current[index] = el;
                }}
                muted
                playsInline
                loop
                preload="none"
                poster={`/weiche/${feld.id}-${orientierung}.webp`}
                disablePictureInPicture
                // Genau eine Bildebene: Läuft das Video, trägt die Kachel
                // data-video-laeuft, und das Standbild ist ausgeblendet. Hält
                // es an oder wird neu geladen, kehrt das Standbild zurück.
                // Hart umgeschaltet, ohne Überblendung: Standbild und Clip
                // zeigen verschiedene Momente, jede Überblendung wäre ein
                // sichtbares Doppelbild.
                onPlaying={(event) => {
                  event.currentTarget.parentElement?.setAttribute("data-video-laeuft", "");
                }}
                onPause={(event) => {
                  event.currentTarget.parentElement?.removeAttribute("data-video-laeuft");
                }}
                onEmptied={(event) => {
                  event.currentTarget.parentElement?.removeAttribute("data-video-laeuft");
                }}
                // Selbstheilung: Läuft das Video, ohne dass die Kachel es
                // weiß (etwa nach dem Wiederherstellen aus dem
                // Rück-Vorwärts-Zwischenspeicher), wird das Attribut beim
                // nächsten Zeitfortschritt nachgetragen.
                onTimeUpdate={(event) => {
                  const video = event.currentTarget;
                  const kachel = video.parentElement;
                  if (!video.paused && kachel && !kachel.hasAttribute("data-video-laeuft")) {
                    kachel.setAttribute("data-video-laeuft", "");
                  }
                }}
              />
            </div>
            {/* Verlauf und Logo liegen außerhalb der Kachel, sonst würde die
                Maske der Kachel auch das Logo an den Rändern ausblenden. Die
                Grundlinie ergibt sich aus der Kachelhöhe, siehe CSS. */}
            <div className="weiche__verlauf" aria-hidden="true" />
            <Image
              className="weiche__logo"
              src={feld.logo.src}
              alt=""
              width={feld.logo.width}
              height={feld.logo.height}
              sizes="(max-width: 767px) 70vw, 30vw"
              priority
            />
          </a>
        );
      })}
      </div>

      {/* Hinweis, dass darunter Inhalt folgt: zwei Zeilen und ein ruhig
          atmender Pfeil. Liegt im schwarzen Bereich unter den Kacheln und
          blendet im Auftakt als Letztes ein. */}
      <div ref={hinweisRef} className="weiche__hinweis">
        <p className="weiche__hinweis-zeile1">{t("START_HINWEIS_ZEILE1")}</p>
        <p className="weiche__hinweis-zeile2">{t("START_HINWEIS_ZEILE2")}</p>
        <button
          type="button"
          className={"weiche__pfeil" + (pfeilWeg ? " weiche__pfeil--weg" : "")}
          aria-label={t("START_HINWEIS_WEITER")}
          aria-hidden={pfeilWeg ? true : undefined}
          tabIndex={pfeilWeg ? -1 : undefined}
          onClick={zumTextteil}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v15M6 13l6 6 6-6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
