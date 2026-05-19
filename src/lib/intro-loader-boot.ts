/** Intro loader boot script (head) + localStorage on exit. */
export const INTRO_SEEN_KEY = "uncuttv_intro_seen";
export const INTRO_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Runs synchronously in <head> before body paint.
 * ?intro=force always shows intro; else skip if seen within 24h.
 */
export const INTRO_LOADER_BOOT_SCRIPT = `(function(){try{var p=new URLSearchParams(window.location.search);if(p.get('intro')==='force')return;var k='${INTRO_SEEN_KEY}';var s=localStorage.getItem(k);var n=Date.now();var t=${INTRO_TTL_MS};var skip=s&&(n-parseInt(s,10))<t;if(skip)document.documentElement.classList.add('intro-skip')}catch(e){}})();`;

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, String(Date.now()));
  } catch {
    /* private mode / blocked storage */
  }
}

export function shouldRunIntroClient(): boolean {
  if (typeof document === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("intro") === "force") return true;
  if (document.documentElement.classList.contains("intro-skip")) return false;
  if (document.documentElement.classList.contains("intro-done")) return false;
  return true;
}
