import { NextResponse } from "next/server";
import { getCartPersistAuth } from "@/lib/cart-persist-auth";
import type { CartItem } from "@/lib/CartContext";
import {
  PERSISTED_CART_META_KEY,
  PERSISTED_CART_UPDATED_META_KEY,
  MAX_PERSISTED_CART_ITEMS,
  parsePersistedCartPayload,
  serializePersistedCart,
  mergeCartMeta,
  clearCartMeta,
  metaValueToString,
} from "@/lib/persisted-cart";
import { fetchWooCustomer, updateWooCustomerMeta } from "@/lib/woo-customer-api";

export const dynamic = "force-dynamic";

function notLoggedIn() {
  return NextResponse.json({ ok: false, reason: "not_logged_in" as const });
}

function extractPersistedCartFromMeta(
  meta: Array<{ key?: string; value?: unknown }> | undefined
): { cart: CartItem[]; updated_at: string | null } {
  const cartRow = meta?.find((row) => row?.key === PERSISTED_CART_META_KEY);
  const updatedRow = meta?.find(
    (row) => row?.key === PERSISTED_CART_UPDATED_META_KEY
  );

  const rawCart = metaValueToString(cartRow?.value);
  if (!rawCart.trim()) {
    return { cart: [], updated_at: metaValueToString(updatedRow?.value) || null };
  }

  try {
    const parsed = JSON.parse(rawCart) as unknown;
    return {
      cart: parsePersistedCartPayload(parsed),
      updated_at: metaValueToString(updatedRow?.value) || null,
    };
  } catch {
    return { cart: [], updated_at: metaValueToString(updatedRow?.value) || null };
  }
}

export async function GET() {
  try {
    const auth = await getCartPersistAuth();
    if (!auth) return notLoggedIn();

    const customer = await fetchWooCustomer(auth.customerId);
    const { cart, updated_at } = extractPersistedCartFromMeta(
      customer.meta_data
    );

    return NextResponse.json({
      ok: true,
      cart,
      updated_at,
    });
  } catch (err) {
    console.error("[cart/persist] GET failed:", err);
    return NextResponse.json({
      ok: true,
      cart: [],
      updated_at: null,
    });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getCartPersistAuth();
    if (!auth) return notLoggedIn();

    const body = (await request.json()) as { cart?: unknown };
    if (!Array.isArray(body.cart)) {
      return NextResponse.json(
        { ok: false, error: "cart must be an array" },
        { status: 400 }
      );
    }

    if (body.cart.length > MAX_PERSISTED_CART_ITEMS) {
      return NextResponse.json(
        { ok: false, error: "cart exceeds maximum items" },
        { status: 400 }
      );
    }

    const cart = parsePersistedCartPayload(body.cart);
    const updatedAt = new Date().toISOString();
    const cartJson = serializePersistedCart(cart);

    const existing = await fetchWooCustomer(auth.customerId);
    const meta_data = mergeCartMeta(
      existing.meta_data,
      cartJson,
      updatedAt
    );

    await updateWooCustomerMeta(auth.customerId, meta_data);

    return NextResponse.json({ ok: true, updated_at: updatedAt });
  } catch (err) {
    console.error("[cart/persist] PUT failed:", err);
    const message =
      err instanceof Error ? err.message : "Cart could not be saved.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const auth = await getCartPersistAuth();
    if (!auth) return notLoggedIn();

    const existing = await fetchWooCustomer(auth.customerId);
    const meta_data = clearCartMeta(existing.meta_data);
    await updateWooCustomerMeta(auth.customerId, meta_data);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cart/persist] DELETE failed:", err);
    const message =
      err instanceof Error ? err.message : "Cart could not be cleared.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
