import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";

const LOG_PREFIX = "[Coupon]";

/** Shown in API + checkout when usage_limit_per_user is exceeded for this email. */
export const COUPON_ALREADY_USED_MESSAGE =
  "Dieser Code wurde bereits eingelöst.";

export const COUPON_ERROR_ALREADY_USED = "already_used" as const;

type UsageLimitCacheEntry = { count: number; expiresAt: number };
const usageLimitCache = new Map<string, UsageLimitCacheEntry>();
const USAGE_LIMIT_CACHE_MS = 60_000;

const COUNTABLE_ORDER_STATUSES = new Set([
  "pending",
  "processing",
  "on-hold",
  "completed",
]);

type WooOrderCouponLine = { code?: string };
type WooOrderListRow = {
  id?: number;
  status?: string;
  billing?: { email?: string };
  coupon_lines?: WooOrderCouponLine[];
};

export type CartCouponLine = {
  product_id: number;
  quantity: number;
  price_cents: number;
};

export type CouponValidationInput = {
  code: string;
  cartTotalCents?: number;
  cartItems?: CartCouponLine[];
  customerEmail?: string;
};

export type CouponDiscountType = "percent" | "fixed_cart" | "fixed_product";

export type ValidCouponResult = {
  valid: true;
  couponId: number;
  couponCode: string;
  name: string;
  discountType: CouponDiscountType;
  discountAmount: number;
  displayLabel: string;
  /** Legacy: percent value for UI (e.g. 10) */
  percent_off?: number;
  /** Legacy: formatted fixed discount for UI */
  amount_off?: string | null;
};

export type CouponValidationFailure = {
  valid: false;
  error: string;
  errorCode?: typeof COUPON_ERROR_ALREADY_USED | "invalid" | "service_unavailable";
};

export type CouponValidationResponse = ValidCouponResult | CouponValidationFailure;

type WooCouponRow = {
  id?: number;
  code?: string;
  description?: string;
  discount_type?: string;
  amount?: string;
  date_expires?: string | null;
  usage_limit?: number | null;
  usage_count?: number;
  usage_limit_per_user?: number | null;
  minimum_amount?: string;
  maximum_amount?: string;
  product_ids?: number[];
  excluded_product_ids?: number[];
  email_restrictions?: string[];
  free_shipping?: boolean;
};

/** Same credential pattern as `coupon-generator.ts` (trimmed keys). */
function wooAuthHeader(): string {
  const key = (process.env.WOOCOMMERCE_KEY ?? "").trim();
  const secret = (process.env.WOOCOMMERCE_SECRET ?? "").trim();
  if (!key || !secret) {
    throw new Error("WooCommerce credentials not configured");
  }
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

function parseWooMoneyToCents(value: string | undefined): number | null {
  if (value == null || String(value).trim() === "") return null;
  const euros = parsePrice(String(value));
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

/** WC min/max: null, empty, or "0.00" means no limit (not zero euros). */
function effectiveMoneyLimitCents(value: string | undefined): number | null {
  const cents = parseWooMoneyToCents(value);
  if (cents == null || cents <= 0) return null;
  return cents;
}

function buildDisplayLabel(
  discountType: CouponDiscountType,
  amount: number
): string {
  if (discountType === "percent") {
    return `−${amount}%`;
  }
  return `−${formatPrice(amount)}`;
}

export async function fetchWooCouponByCode(
  rawCode: string
): Promise<WooCouponRow | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const wooUrl = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  if (!wooUrl) {
    throw new Error("WooCommerce credentials not configured");
  }

  if (!process.env.WOOCOMMERCE_KEY?.trim() || !process.env.WOOCOMMERCE_SECRET?.trim()) {
    throw new Error("WooCommerce credentials not configured");
  }

  const url = new URL(`${wooUrl}/wp-json/wc/v3/coupons`);
  url.searchParams.set("code", code);

  console.log(`${LOG_PREFIX} Fetching:`, url.toString());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: wooAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const bodyText = await res.text().catch(() => "");

  console.log(`${LOG_PREFIX} WC response status:`, res.status);
  console.log(`${LOG_PREFIX} WC response body:`, bodyText.slice(0, 400));

  if (!res.ok) {
    throw new Error(`WooCommerce API error: ${res.status}`);
  }

  let parsed: unknown;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : [];
  } catch {
    throw new Error("WooCommerce API error: invalid JSON");
  }

  if (!Array.isArray(parsed)) {
    const errCode =
      parsed &&
      typeof parsed === "object" &&
      "code" in parsed &&
      typeof (parsed as { code?: unknown }).code === "string"
        ? (parsed as { code: string }).code
        : "unexpected_response";
    throw new Error(`WooCommerce API error: ${errCode}`);
  }

  const rows = parsed as WooCouponRow[];
  if (rows.length === 0) {
    console.log(
      `${LOG_PREFIX} Validation result: invalid — coupon not found (empty WC list)`
    );
    return null;
  }

  const match =
    rows.find(
      (row) =>
        typeof row.code === "string" &&
        normalizeCode(row.code) === code
    ) ?? rows[0];

  if (match) {
    console.log(`${LOG_PREFIX} Found coupon:`, {
      id: match.id,
      code: match.code,
      status: (match as { status?: string }).status,
      discount_type: match.discount_type,
      date_expires: match.date_expires,
      usage_count: match.usage_count,
      usage_limit: match.usage_limit,
      product_ids: match.product_ids,
      minimum_amount: match.minimum_amount,
    });
  }

  return match ?? null;
}

/** WC: null / 0 / negative / empty = unlimited uses. */
function effectiveUsageLimit(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function usageLimitCacheKey(email: string, couponCode: string): string {
  return `${email}:${normalizeCode(couponCode)}`;
}

function orderUsedCoupon(order: WooOrderListRow, couponCode: string): boolean {
  const status = (order.status ?? "").trim().toLowerCase();
  if (status && !COUNTABLE_ORDER_STATUSES.has(status)) return false;

  const billEmail = order.billing?.email?.trim().toLowerCase();
  if (!billEmail) return false;

  const lines = order.coupon_lines ?? [];
  return lines.some(
    (line) =>
      typeof line.code === "string" &&
      normalizeCode(line.code) === couponCode
  );
}

/**
 * Count prior Woo orders for this billing email that redeemed the coupon (case-insensitive).
 */
export async function countCustomerCouponRedemptions(
  couponCode: string,
  customerEmail: string
): Promise<number> {
  const email = customerEmail.trim().toLowerCase();
  const code = normalizeCode(couponCode);
  if (!email || !code) return 0;

  const cacheKey = usageLimitCacheKey(email, code);
  const cached = usageLimitCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  const wooUrl = (process.env.WOOCOMMERCE_URL ?? "").replace(/\/$/, "");
  if (!wooUrl || !process.env.WOOCOMMERCE_KEY?.trim() || !process.env.WOOCOMMERCE_SECRET?.trim()) {
    throw new Error("WooCommerce credentials not configured");
  }

  const url = new URL(`${wooUrl}/wp-json/wc/v3/orders`);
  url.searchParams.set("search", email);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: wooAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`WooCommerce API error: ${res.status}`);
  }

  const rows = (await res.json()) as WooOrderListRow[];
  if (!Array.isArray(rows)) {
    throw new Error("WooCommerce API error: invalid orders response");
  }

  let count = 0;
  for (const order of rows) {
    const billEmail = order.billing?.email?.trim().toLowerCase();
    if (billEmail !== email) continue;
    if (orderUsedCoupon(order, code)) count++;
  }

  usageLimitCache.set(cacheKey, {
    count,
    expiresAt: Date.now() + USAGE_LIMIT_CACHE_MS,
  });

  console.log(`${LOG_PREFIX} usage_limit_per_user lookup`, {
    email,
    code,
    priorUses: count,
  });

  return count;
}

export async function hasCustomerExceededUsageLimit(
  coupon: WooCouponRow,
  customerEmail: string | undefined,
  couponCode: string
): Promise<boolean> {
  const limit = effectiveUsageLimit(coupon.usage_limit_per_user);
  if (limit == null) return false;

  const email = customerEmail?.trim().toLowerCase();
  if (!email) return false;

  const priorUses = await countCustomerCouponRedemptions(couponCode, email);
  return priorUses >= limit;
}

async function usageLimitPerUserFailure(
  coupon: WooCouponRow,
  input: CouponValidationInput,
  normalizedCode: string
): Promise<CouponValidationFailure | null> {
  try {
    const exceeded = await hasCustomerExceededUsageLimit(
      coupon,
      input.customerEmail,
      normalizedCode
    );
    if (!exceeded) return null;
    console.log(
      `${LOG_PREFIX} usage_limit_per_user exceeded:`,
      normalizedCode,
      input.customerEmail
    );
    return {
      valid: false,
      error: COUPON_ALREADY_USED_MESSAGE,
      errorCode: COUPON_ERROR_ALREADY_USED,
    };
  } catch (err) {
    console.error(LOG_PREFIX, "usage_limit_per_user check failed:", err);
    return {
      valid: false,
      error: "Coupon-Service nicht erreichbar",
      errorCode: "service_unavailable",
    };
  }
}

function resolveCouponId(coupon: WooCouponRow): number | null {
  const id = coupon.id as unknown;
  if (typeof id === "number" && Number.isFinite(id) && id > 0) return id;
  if (typeof id === "string" && id.trim()) {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isExpired(dateExpires: string | null | undefined): boolean {
  if (!dateExpires || !String(dateExpires).trim()) return false;
  const exp = new Date(dateExpires);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() < Date.now();
}

function validateCartConstraints(
  coupon: WooCouponRow,
  input: CouponValidationInput
): string | null {
  const cartTotalCents = input.cartTotalCents;
  const cartItems = input.cartItems ?? [];
  const customerEmail = input.customerEmail?.trim().toLowerCase();

  if (customerEmail && Array.isArray(coupon.email_restrictions)) {
    const restrictions = coupon.email_restrictions
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (
      restrictions.length > 0 &&
      !restrictions.includes(customerEmail)
    ) {
      console.log(`${LOG_PREFIX} Cart constraint failed: email_restrictions`);
      return "Ungültiger Code.";
    }
  }

  const minCents = effectiveMoneyLimitCents(coupon.minimum_amount);
  if (minCents == null) {
    console.log(`${LOG_PREFIX} Check min_amount skipped (no minimum)`);
  } else if (
    typeof cartTotalCents === "number" &&
    cartTotalCents > 0 &&
    cartTotalCents < minCents
  ) {
    console.log(`${LOG_PREFIX} Cart constraint failed: minimum_amount`, {
      cartTotalCents,
      minCents,
    });
    return "Ungültiger Code.";
  }

  const maxCents = effectiveMoneyLimitCents(coupon.maximum_amount);
  if (maxCents == null) {
    console.log(`${LOG_PREFIX} Check max_amount skipped (no limit)`);
  } else if (
    typeof cartTotalCents === "number" &&
    cartTotalCents > 0 &&
    cartTotalCents > maxCents
  ) {
    console.log(`${LOG_PREFIX} Cart constraint failed: maximum_amount`, {
      cartTotalCents,
      maxCents,
    });
    return "Ungültiger Code.";
  }

  const productIds = coupon.product_ids ?? [];
  const excludedIds = coupon.excluded_product_ids ?? [];

  if (cartItems.length > 0 && productIds.length > 0) {
    const eligible = cartItems.some((line) =>
      productIds.includes(line.product_id)
    );
    if (!eligible) {
      console.log(`${LOG_PREFIX} Cart constraint failed: product_ids`, productIds);
      return "Ungültiger Code.";
    }
  }

  if (cartItems.length > 0 && excludedIds.length > 0) {
    const hasExcluded = cartItems.some((line) =>
      excludedIds.includes(line.product_id)
    );
    if (hasExcluded) {
      console.log(
        `${LOG_PREFIX} Cart constraint failed: excluded_product_ids`,
        excludedIds
      );
      return "Ungültiger Code.";
    }
  }

  return null;
}

export function computeDiscountCents(
  coupon: WooCouponRow,
  cartSubtotalCents: number,
  cartItems: CartCouponLine[]
): number {
  const discountType = coupon.discount_type ?? "percent";
  const amountRaw = parsePrice(String(coupon.amount ?? "0"));
  if (!Number.isFinite(amountRaw) || amountRaw < 0) return 0;

  if (discountType === "percent") {
    return Math.round(cartSubtotalCents * (amountRaw / 100));
  }

  if (discountType === "fixed_cart") {
    const fixedCents = Math.round(amountRaw * 100);
    return Math.min(cartSubtotalCents, fixedCents);
  }

  if (discountType === "fixed_product") {
    const productIds = coupon.product_ids ?? [];
    const fixedCents = Math.round(amountRaw * 100);
    let discount = 0;
    for (const line of cartItems) {
      if (productIds.length > 0 && !productIds.includes(line.product_id)) {
        continue;
      }
      const qty = Math.max(1, line.quantity);
      const lineTotal = line.price_cents * qty;
      discount += Math.min(lineTotal, fixedCents * qty);
    }
    return Math.min(cartSubtotalCents, discount);
  }

  console.warn(LOG_PREFIX, "Unknown discount_type:", discountType);
  return 0;
}

function validateWooCouponRow(
  coupon: WooCouponRow,
  normalized: string,
  input: CouponValidationInput
): CouponValidationResponse {
  const couponId = resolveCouponId(coupon);
  const status = (coupon as { status?: string }).status;
  const idCheckPassed = couponId != null;
  console.log(`${LOG_PREFIX} Check id passed:`, idCheckPassed);

  if (!idCheckPassed) {
    return { valid: false, error: "Ungültiger Code." };
  }

  const expiryPassed = !isExpired(coupon.date_expires);
  console.log(`${LOG_PREFIX} Check expiry passed:`, expiryPassed, {
    date_expires: coupon.date_expires,
  });
  if (!expiryPassed) {
    return { valid: false, error: "Ungültiger Code." };
  }

  const usageLimit = effectiveUsageLimit(coupon.usage_limit);
  const usageCount =
    typeof coupon.usage_count === "number"
      ? coupon.usage_count
      : Number(coupon.usage_count) || 0;
  const usagePassed =
    usageLimit == null || usageCount < usageLimit;
  console.log(`${LOG_PREFIX} Check usage_limit passed:`, usagePassed, {
    usage_count: usageCount,
    usage_limit: coupon.usage_limit,
    effective_limit: usageLimit,
  });
  if (!usagePassed) {
    return { valid: false, error: "Ungültiger Code." };
  }

  const cartError = validateCartConstraints(coupon, input);
  console.log(`${LOG_PREFIX} Check cart_constraints passed:`, cartError == null);

  if (cartError) {
    return { valid: false, error: cartError };
  }

  const discountType = (coupon.discount_type ??
    "percent") as CouponDiscountType;
  const discountAmount = parsePrice(String(coupon.amount ?? "0"));
  const displayLabel = buildDisplayLabel(discountType, discountAmount);
  const couponCode =
    typeof coupon.code === "string" && coupon.code.trim()
      ? normalizeCode(coupon.code)
      : normalized;
  const name =
    (typeof coupon.description === "string" && coupon.description.trim()) ||
    couponCode.toUpperCase();

  const result: ValidCouponResult = {
    valid: true,
    couponId: couponId!,
    couponCode,
    name,
    discountType,
    discountAmount,
    displayLabel,
  };

  if (discountType === "percent") {
    result.percent_off = Math.round(discountAmount);
  } else {
    result.amount_off = displayLabel.replace(/^−/, "");
  }

  console.log(`${LOG_PREFIX} Check status passed:`, true, { status });

  return result;
}

export async function validateWooCoupon(
  input: CouponValidationInput
): Promise<CouponValidationResponse> {
  const normalized = normalizeCode(input.code);
  if (!normalized) {
    return { valid: false, error: "Kein Code angegeben." };
  }

  let coupon: WooCouponRow | null;
  try {
    coupon = await fetchWooCouponByCode(normalized);
  } catch (err) {
    console.error(LOG_PREFIX, "Service error:", err);
    return {
      valid: false,
      error: "Coupon-Service nicht erreichbar",
    };
  }

  if (!coupon || !resolveCouponId(coupon)) {
    console.log(
      `${LOG_PREFIX} Validation result: invalid — coupon not found after fetch`
    );
    return { valid: false, error: "Ungültiger Code." };
  }

  const result = validateWooCouponRow(coupon, normalized, input);
  if (!result.valid) {
    console.log(
      `${LOG_PREFIX} Validation result: invalid —`,
      result.error
    );
    return result;
  }

  const usageFailure = await usageLimitPerUserFailure(coupon, input, normalized);
  if (usageFailure) {
    return usageFailure;
  }

  console.log(
    `${LOG_PREFIX} Validation result: valid —`,
    result.couponCode,
    result.displayLabel
  );
  return result;
}

export type ApplyCouponResult = {
  discountCents: number;
  validation: ValidCouponResult;
};

/**
 * Validates a coupon and returns discount in cents for the cart subtotal (pre-shipping).
 */
export async function validateAndComputeCouponDiscount(
  input: CouponValidationInput & { cartSubtotalCents: number }
): Promise<
  | { ok: true; data: ApplyCouponResult }
  | {
      ok: false;
      error: string;
      errorCode?: CouponValidationFailure["errorCode"];
    }
> {
  const normalized = normalizeCode(input.code);
  if (!normalized) {
    return { ok: false, error: "Ungültiger Code." };
  }

  let coupon: WooCouponRow | null;
  try {
    coupon = await fetchWooCouponByCode(normalized);
  } catch (err) {
    console.error(LOG_PREFIX, "Service error:", err);
    return { ok: false, error: "Coupon-Service nicht erreichbar" };
  }

  const validation = validateWooCouponRow(coupon ?? {}, normalized, {
    ...input,
    cartTotalCents: input.cartSubtotalCents,
  });

  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  const usageFailure = await usageLimitPerUserFailure(
    coupon!,
    {
      code: input.code,
      cartTotalCents: input.cartSubtotalCents,
      cartItems: input.cartItems,
      customerEmail: input.customerEmail,
    },
    normalized
  );
  if (usageFailure) {
    return {
      ok: false,
      error: usageFailure.error,
      errorCode: usageFailure.errorCode,
    };
  }

  const discountCents = computeDiscountCents(
    coupon!,
    input.cartSubtotalCents,
    input.cartItems ?? []
  );

  return {
    ok: true,
    data: {
      discountCents,
      validation,
    },
  };
}

export function cartItemsFromCartLines(
  items: Array<{
    product: { id: number; price: string };
    quantity: number;
  }>
): CartCouponLine[] {
  return items.map((item) => ({
    product_id: Number(item.product.id),
    quantity: Math.max(1, item.quantity),
    price_cents: Math.round(parsePrice(item.product.price) * 100),
  }));
}
