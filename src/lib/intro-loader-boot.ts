/** Shared intro-loader localStorage logic (head boot script + client exit). */
export const INTRO_SEEN_KEY = "uncuttv_intro_seen";
export const INTRO_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Runs synchronously in <head> before body paint.
 * Adds intro-skip when user saw intro within 24h (overlay hidden via CSS).
 */
export const INTRO_LOADER_BOOT_SCRIPT = `(function(){try{var k='${INTRO_SEEN_KEY}';var s=localStorage.getItem(k);var n=Date.now();var t=${INTRO_TTL_MS};var skip=s&&(n-parseInt(s,10))<t;if(skip)document.documentElement.classList.add('intro-skip')}catch(e){}})();`;

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, String(Date.now()));
  } catch {
    /* private mode / blocked storage */
  }
}
