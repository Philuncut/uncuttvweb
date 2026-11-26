import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  baueHeroOverlay,
  overlayGilt,
  type HeroOverlay,
} from "@/lib/hero-overlay";

/**
 * Das gerade sichtbare Sale-Overlay, serverseitig geladen.
 *
 * Eine Abfrage an public.shop_hero_overlay() (Steuerpult, sql/107). Der
 * Stand wird je Serverinstanz HÖCHSTENS 60 Sekunden gehalten: Ein- und
 * Ausschalten im Steuerpult greift damit binnen einer Minute, ohne dass
 * jeder Seitenaufruf zur Datenbank geht.
 *
 * Bewusst nicht unstable_cache: das liefert nach Ablauf erst noch einmal
 * den alten Stand aus und holt im Hintergrund nach. Kommt eine Weile
 * niemand, wäre ein abgeschaltetes Overlay dann beliebig lange nach der
 * Minute noch einmal zu sehen. Hier wartet der erste Aufruf nach Ablauf
 * auf die frische Antwort (eine kleine Abfrage).
 *
 * Wirft nie: Fehlt die Funktion (sql/107 noch nicht eingespielt), ist die
 * Datenbank nicht erreichbar oder nicht eingerichtet, gibt es kein Overlay
 * und die Seite sieht aus wie immer. Ein Fehler wird nur kurz gemerkt.
 */

const HALTEN_MS = 60_000;
const HALTEN_NACH_FEHLER_MS = 10_000;
const ZEITLIMIT_MS = 4_000;

type Stand = { overlay: HeroOverlay | null; bisMs: number };

let stand: Stand | null = null;
let laeuft: Promise<HeroOverlay | null> | null = null;

async function lade(): Promise<HeroOverlay | null> {
  let overlay: HeroOverlay | null = null;
  let halten = HALTEN_MS;
  try {
    const db = getSupabaseAdmin();
    if (db) {
      const { data, error } = await db
        .rpc("shop_hero_overlay")
        .abortSignal(AbortSignal.timeout(ZEITLIMIT_MS));
      if (error) {
        console.warn("[hero-overlay] nicht lesbar:", error.message);
        halten = HALTEN_NACH_FEHLER_MS;
      } else {
        overlay = baueHeroOverlay(data);
      }
    }
  } catch (err) {
    console.warn(
      "[hero-overlay] nicht lesbar:",
      err instanceof Error ? err.message : err
    );
    halten = HALTEN_NACH_FEHLER_MS;
  }
  stand = { overlay, bisMs: Date.now() + halten };
  return overlay;
}

async function gehalten(): Promise<HeroOverlay | null> {
  if (stand && Date.now() < stand.bisMs) return stand.overlay;
  // Gleichzeitige Aufrufe teilen sich eine Abfrage.
  if (!laeuft) {
    laeuft = lade().finally(() => {
      laeuft = null;
    });
  }
  return laeuft;
}

/**
 * Das Overlay, das in diesem Augenblick gilt, oder null. Der gehaltene
 * Stand kann bis zu einer Minute alt sein; ob die Aktion noch läuft, wird
 * deshalb bei jedem Aufruf frisch gegen die Uhr geprüft.
 */
export async function getHeroOverlay(): Promise<HeroOverlay | null> {
  const overlay = await gehalten();
  return overlayGilt(overlay, Date.now()) ? overlay : null;
}
