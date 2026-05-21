import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";

const LOG_PREFIX = "[Coupon]";

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

function wooAuthHeader(): string {
  const key = process.env.WOOCOMMERCE_KEY!;
  const secret = process.env.WOOCOMMERCE_SECRET!;
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

  const wooUrl = process.env.WOOCOMMERCE_URL?.replace(/\/$/, "");
  if (!wooUrl || !process.env.WOOCOMMERCE_KEY || !process.env.WOOCOMMERCE_SECRET) {
    throw new Error("WooCommerce credentials not configured");
  }

  const url = new URL(`${wooUrl}/wp-json/wc/v3/coupons`);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: wooAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      LOG_PREFIX,
      "WooCommerce coupon lookup failed:",
      res.status,
      text.slice(0, 200)
    );
    throw new Error(`WooCommerce API error: ${res.status}`);
  }

  const rows = (await res.json()) as WooCouponRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const match =
    rows.find(
      (row) =>
        typeof row.code === "string" &&
        normalizeCode(row.code) === code
    ) ?? rows[0];

  return match ?? null;
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
      return "Ungültiger Code.";
    }
  }

  const minCents = parseWooMoneyToCents(coupon.minimum_amount);
  if (
    minCents != null &&
    typeof cartTotalCents === "number" &&
    cartTotalCents < minCents
  ) {
    return "Ungültiger Code.";
  }

  const maxCents = parseWooMoneyToCents(coupon.maximum_amount);
  if (
    maxCents != null &&
    typeof cartTotalCents === "number" &&
    cartTotalCents > maxCents
  ) {
    return "Ungültiger Code.";
  }

  const productIds = coupon.product_ids ?? [];
  const excludedIds = coupon.excluded_product_ids ?? [];

  if (cartItems.length > 0 && productIds.length > 0) {
    const eligible = cartItems.some((line) =>
      productIds.includes(line.product_id)
    );
    if (!eligible) return "Ungültiger Code.";
  }

  if (cartItems.length > 0 && excludedIds.length > 0) {
    const hasExcluded = cartItems.some((line) =>
      excludedIds.includes(line.product_id)
    );
    if (hasExcluded) return "Ungültiger Code.";
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
  if (!coupon?.id) {
    return { valid: false, error: "Ungültiger Code." };
  }

  if (isExpired(coupon.date_expires)) {
    return { valid: false, error: "Ungültiger Code." };
  }

  const usageLimit = coupon.usage_limit;
  const usageCount = coupon.usage_count ?? 0;
  if (
    typeof usageLimit === "number" &&
    usageLimit > 0 &&
    usageCount >= usageLimit
  ) {
    return { valid: false, error: "Ungültiger Code." };
  }

  const cartError = validateCartConstraints(coupon, input);
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
    couponId: coupon.id!,
    couponCode,
    name,
    discountType,
    discountAmount,
    displayLabel,
  };

  if (discountType === "percent") {
    result.percent_off = discountAmount;
  } else {
    result.amount_off = displayLabel.replace(/^−/, "");
  }

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

  return validateWooCouponRow(coupon ?? {}, normalized, input);
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
  | { ok: false; error: string }
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
