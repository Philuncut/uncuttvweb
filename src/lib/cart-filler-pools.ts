import type { WooProduct } from "@/lib/types";
import { productHasOutOfPrintCategory } from "@/lib/haendler-filter";
import { parsePrice } from "@/lib/parse-price";
import { productHasPreOrderCategory } from "@/lib/stock-display";

export const FILLER_TARGET_COUNT = 4;
export const FILLER_SALE_PICK = 2;
export const FILLER_REGULAR_PICK = 2;
export const FILLER_REGULAR_MIN_EUR = 15;
export const FILLER_REGULAR_MAX_EUR = 30;

export const CART_FILLER_SESSION_KEY = "cart_filler_product_ids";

/** Shop filter pill + Woo category „Im Angebot und Bundles“. */
const SALE_SLUG_PARTS = ["sale", "im-angebot", "angebot", "bundle"];

const INSTOCK_SLUG_PARTS = ["jetzt-erhaeltlich", "instock"];

export function unitGrossPrice(p: WooProduct): number {
  const sale = parsePrice(p.sale_price);
  if (p.on_sale && sale > 0) return sale;
  const reg = parsePrice(p.regular_price);
  if (reg > 0) return reg;
  return parsePrice(p.price);
}

export function isFillerExcluded(
  p: WooProduct,
  excludeIds: ReadonlySet<number>
): boolean {
  if (excludeIds.has(p.id)) return true;
  if (p.stock_status === "outofstock") return true;
  if (productHasPreOrderCategory(p.categories)) return true;
  if (productHasOutOfPrintCategory(p)) return true;
  return false;
}

export function isSaleFillerCandidate(p: WooProduct): boolean {
  if (p.on_sale) return true;
  const slugs = (p.categories ?? []).map((c) =>
    String(c.slug ?? "").toLowerCase()
  );
  return slugs.some((s) =>
    SALE_SLUG_PARTS.some((part) => s.includes(part))
  );
}

export function isRegularFillerCandidate(p: WooProduct): boolean {
  if (p.on_sale) return false;
  if (p.stock_status !== "instock") return false;

  const unit = unitGrossPrice(p);
  if (unit < FILLER_REGULAR_MIN_EUR || unit > FILLER_REGULAR_MAX_EUR) {
    return false;
  }

  const slugs = (p.categories ?? []).map((c) =>
    String(c.slug ?? "").toLowerCase()
  );
  return slugs.some((s) =>
    INSTOCK_SLUG_PARTS.some((part) => s === part || s.includes(part))
  );
}

export function splitFillerPools(
  products: WooProduct[],
  excludeIds: ReadonlySet<number>
): { salePool: WooProduct[]; regularPool: WooProduct[] } {
  const salePool: WooProduct[] = [];
  const regularPool: WooProduct[] = [];

  for (const p of products) {
    if (isFillerExcluded(p, excludeIds)) continue;
    if (isSaleFillerCandidate(p)) {
      salePool.push(p);
    } else if (isRegularFillerCandidate(p)) {
      regularPool.push(p);
    }
  }

  return { salePool, regularPool };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function takeUnique(
  source: WooProduct[],
  count: number,
  used: Set<number>
): WooProduct[] {
  const out: WooProduct[] = [];
  for (const p of source) {
    if (used.has(p.id)) continue;
    out.push(p);
    used.add(p.id);
    if (out.length >= count) break;
  }
  return out;
}

/** Picks up to 4 fillers: 2 sale + 2 regular when possible, then graceful fill. */
export function pickFillerProducts(
  salePool: WooProduct[],
  regularPool: WooProduct[],
  targetCount = FILLER_TARGET_COUNT,
  salePick = FILLER_SALE_PICK,
  regularPick = FILLER_REGULAR_PICK
): WooProduct[] {
  const used = new Set<number>();
  const shuffledSale = shuffle(salePool);
  const shuffledRegular = shuffle(regularPool);

  const pickedSale = takeUnique(shuffledSale, salePick, used);
  const pickedRegular = takeUnique(shuffledRegular, regularPick, used);

  let combined = [...pickedSale, ...pickedRegular];

  if (pickedSale.length < salePick) {
    const need = targetCount - combined.length;
    combined = [
      ...combined,
      ...takeUnique(shuffledRegular, need, used),
    ];
  }

  if (pickedRegular.length < regularPick) {
    const need = targetCount - combined.length;
    combined = [...combined, ...takeUnique(shuffledSale, need, used)];
  }

  if (combined.length < targetCount) {
    const fallback = shuffle([...salePool, ...regularPool]);
    const need = targetCount - combined.length;
    combined = [...combined, ...takeUnique(fallback, need, used)];
  }

  return shuffle(combined).slice(0, targetCount);
}

export function readCartFillerSessionIds(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CART_FILLER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed
      .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
      .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function writeCartFillerSessionIds(ids: number[]): void {
  try {
    sessionStorage.setItem(CART_FILLER_SESSION_KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

export function clearCartFillerSessionIds(): void {
  try {
    sessionStorage.removeItem(CART_FILLER_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
