"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

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

function videoQuelle(id: FeldId, orientierung: "hoch" | "quer"): string {
  return `/weiche/${id}-${orientierung}.mp4`;
}

export default function Weiche() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const reduziert = useMediaQuery(REDUCED_MOTION_QUERY, false);
  const orientierung = desktop ? "hoch" : "quer";

  const [aktiv, setAktiv] = useState(0);
  /** Der Nutzer hat eingegriffen (Zeiger, Scrollen, Berührung): die
      selbständige Hervorhebung hört auf. */
  const [interagiert, setInteragiert] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);

  const feldRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  /** Zeigerart des letzten pointerdown; entscheidet, ob ein Klick eine
      Berührung war. Tastatur hinterlässt hier nichts. */
  const zeigerTyp = useRef<string | null>(null);

  // Selbständige Hervorhebung, bis der Nutzer eingreift oder wählt.
  useEffect(() => {
    if (interagiert || gewaehlt !== null) return;
    const timer = window.setInterval(() => {
      setAktiv((a) => (a + 1) % FELDER.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [interagiert, gewaehlt]);

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
    const starte = () => {
      const video = videoRefs.current[ziel];
      if (!video || reduziert) return;
      const start = video.play();
      if (start) {
        start.catch(() => {
          // Autoplay verweigert, vom nächsten Wechsel unterbrochen oder vom
          // Browser im Hintergrund angehalten: das Standbild bleibt.
        });
      }
    };

    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index !== ziel || reduziert) {
        if (!video.paused) video.pause();
        return;
      }
      const quelle = videoQuelle(FELDER[index].id, orientierung);
      if (video.dataset.quelle !== quelle) {
        video.dataset.quelle = quelle;
        video.removeAttribute("data-bereit");
        video.src = quelle;
        video.load();
      } else if (video.readyState > 0) {
        video.currentTime = 0;
      }
    });
    starte();

    // Chrome hält tonlose Videos an, sobald die Seite in den Hintergrund
    // geht (Tab gewechselt, App verlassen), und startet sie nicht von
    // selbst wieder. Kommt die Seite zurück, läuft das aktive Video weiter.
    const sichtbar = () => {
      if (document.visibilityState === "visible") starte();
    };
    document.addEventListener("visibilitychange", sichtbar);
    return () => document.removeEventListener("visibilitychange", sichtbar);
  }, [aktiv, gewaehlt, orientierung, reduziert]);

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
      setGewaehlt(null);
      setInteragiert(false);
      setAktiv(0);
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
    // Ohne Bewegungswunsch gibt es auch keinen Zoom: sofort weiter.
    if (reduziert) {
      navigiere();
      return;
    }
    const timer = window.setTimeout(navigiere, ZOOM_MS);
    return () => window.clearTimeout(timer);
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
    [aktiv, gewaehlt]
  );

  return (
    <section
      className={"weiche" + (gewaehlt !== null ? " weiche--gewaehlt" : "")}
      aria-label={t("START_WEICHE_LABEL")}
    >
      {FELDER.map((feld, index) => {
        const istAktiv = gewaehlt === null ? index === aktiv : index === gewaehlt;
        const klassen = [
          "weiche__feld",
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
                onPlaying={(event) => {
                  event.currentTarget.dataset.bereit = "1";
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
    </section>
  );
}
