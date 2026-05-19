/** Shared intro-loader localStorage logic (boot script + React). */
export const INTRO_SEEN_KEY = "uncuttv_intro_seen";
export const INTRO_TTL_MS = 24 * 60 * 60 * 1000;

/** Runs synchronously in <head> before body paint to prevent content flash. */
export const INTRO_LOADER_BOOT_SCRIPT = `(function(){try{var k='${INTRO_SEEN_KEY}';var s=localStorage.getItem(k);var n=Date.now();var t=${INTRO_TTL_MS};var show=!s||(n-parseInt(s,10))>t;if(show)document.documentElement.classList.add('intro-loading')}catch(e){document.documentElement.classList.add('intro-loading')}})();`;

export function shouldShowIntroLoader(): boolean {
  try {
    const raw = localStorage.getItem(INTRO_SEEN_KEY);
    if (!raw) return true;
    const seenAt = Number(raw);
    if (!Number.isFinite(seenAt)) return true;
    return Date.now() - seenAt >= INTRO_TTL_MS;
  } catch {
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function setIntroLoading(active: boolean): void {
  document.documentElement.classList.toggle("intro-loading", active);
}

export function removeIntroOverlaySkeleton(): void {
  document.getElementById("intro-overlay-skeleton")?.remove();
}
