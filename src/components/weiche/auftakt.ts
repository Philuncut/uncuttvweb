/**
 * Auftakt der Weiche: Beim ersten Besuch steigen die drei Kacheln und ihre
 * Logos nacheinander aus dem Schwarz auf, danach steht die Weiche bei jedem
 * weiteren Aufruf sofort da.
 *
 * Die Choreografie selbst ist reines CSS (globals.css, Block .weiche,
 * Variablen --auftakt-*). Ausgelöst wird sie über ein Attribut am
 * html-Element, das ein kleines Inline-Skript in src/app/start/page.tsx
 * setzt, BEVOR die Weiche geparst und gezeichnet wird. Nur so beginnt die
 * Seite wirklich schwarz: Entschiede erst React nach der Hydration, stünde
 * die Weiche einen Moment vollständig da und verschwände dann.
 *
 * Gemerkt wird der Besuch in sessionStorage, bewusst nur für die Sitzung:
 * Wer die Seite später in einem neuen Tab oder am nächsten Tag öffnet,
 * bekommt den Auftakt noch einmal, wer innerhalb einer Sitzung zurückkehrt
 * oder neu lädt, nicht. localStorage würde ihn für immer abschalten.
 *
 * Kein Auftakt bei prefers-reduced-motion und wenn sessionStorage nicht
 * zugänglich ist (privater Modus mancher Browser): dann steht die Weiche
 * sofort.
 */

/** Attribut am html-Element, solange der Auftakt läuft. */
export const AUFTAKT_ATTRIBUT = "data-weiche-auftakt";

/** Schlüssel in sessionStorage. */
export const AUFTAKT_SCHLUESSEL = "uncuttv:weiche-auftakt-gesehen";

/**
 * Name der Logo-Animation in globals.css. Endet sie im letzten Feld, ist
 * der Auftakt vorbei.
 */
export const AUFTAKT_LOGO_ANIMATION = "weiche-auftakt-logo";

/**
 * Sicherheitsnetz, falls animationend nie kommt (etwa weil der Reiter
 * während des Auftakts im Hintergrund lag). Deutlich über der geplanten
 * Dauer von rund 1,3 s, damit es den regulären Ablauf nie abschneidet.
 */
export const AUFTAKT_HOECHSTDAUER_MS = 3000;

/**
 * Das Inline-Skript. Klein und ohne Abhängigkeiten, es läuft vor React.
 * Der Besuch wird schon beim Start vermerkt: Ein Neuladen mitten im
 * Auftakt spielt ihn nicht ein zweites Mal.
 */
export const AUFTAKT_SKRIPT = `(function(){try{var k=${JSON.stringify(
  AUFTAKT_SCHLUESSEL
)};if(window.sessionStorage.getItem(k))return;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;window.sessionStorage.setItem(k,"1");document.documentElement.setAttribute(${JSON.stringify(
  AUFTAKT_ATTRIBUT
)},"1")}catch(e){}})();`;
