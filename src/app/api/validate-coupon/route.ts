import { NextResponse } from "next/server";
import {
  validateWooCoupon,
  type CartCouponLine,
  type CouponValidationInput,
} from "@/lib/coupon-validator";

export const dynamic = "force-dynamic";

function parseGetInput(request: Request): CouponValidationInput {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? "";
  const cartTotalRaw = searchParams.get("cartTotal");
  const customerEmail = searchParams.get("customerEmail") ?? undefined;

  let cartTotalCents: number | undefined;
  if (cartTotalRaw != null && cartTotalRaw !== "") {
    const n = Number(cartTotalRaw);
    if (Number.isFinite(n) && n >= 0) cartTotalCents = Math.round(n);
  }

  return { code, cartTotalCents, customerEmail };
}

function parsePostBody(body: unknown): CouponValidationInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const code = typeof b.code === "string" ? b.code : "";
  const cartTotalCents =
    typeof b.cartTotal === "number" && Number.isFinite(b.cartTotal)
      ? Math.round(b.cartTotal)
      : undefined;
  const customerEmail =
    typeof b.customerEmail === "string" ? b.customerEmail : undefined;

  let cartItems: CartCouponLine[] | undefined;
  if (Array.isArray(b.cartItems)) {
    cartItems = b.cartItems
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const product_id = Number(r.product_id);
        const quantity = Number(r.quantity);
        const price_cents = Number(r.price_cents);
        if (
          !Number.isFinite(product_id) ||
          !Number.isFinite(quantity) ||
          !Number.isFinite(price_cents)
        ) {
          return null;
        }
        return {
          product_id,
          quantity: Math.max(1, quantity),
          price_cents: Math.max(0, Math.round(price_cents)),
        };
      })
      .filter((x): x is CartCouponLine => x != null);
  }

  return { code, cartTotalCents, cartItems, customerEmail };
}

async function handleValidation(input: CouponValidationInput) {
  if (!input.code?.trim()) {
    return NextResponse.json(
      { valid: false, error: "Kein Code angegeben." },
      { status: 400 }
    );
  }

  const result = await validateWooCoupon(input);
  if (!result.valid) {
    const status =
      result.error === "Coupon-Service nicht erreichbar" ? 503 : 200;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  try {
    return await handleValidation(parseGetInput(request));
  } catch (err) {
    console.error("[Coupon] GET error:", err);
    return NextResponse.json(
      { valid: false, error: "Coupon-Service nicht erreichbar" },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parsePostBody(body);
    if (!input) {
      return NextResponse.json(
        { valid: false, error: "Ungültige Anfrage." },
        { status: 400 }
      );
    }
    return await handleValidation(input);
  } catch (err) {
    console.error("[Coupon] POST error:", err);
    return NextResponse.json(
      { valid: false, error: "Coupon-Service nicht erreichbar" },
      { status: 503 }
    );
  }
}
