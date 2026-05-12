import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { stripe } from "@/lib/stripe";

interface CartMeta {
  id: number;
  name: string;
  qty: number;
  price: string;
}

interface CustomerInfo {
  email: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  country: string;
}

type OrderMetaEntry = { key: string; value: unknown };

interface SyncBody {
  sessionId?: string;
  paymentIntentId?: string;
  customer?: CustomerInfo;
  items?: CartMeta[];
  /** Optional checkout extras — company / VAT take precedence over profile when non-empty */
  billing?: Record<string, string>;
  meta_data?: OrderMetaEntry[];
  /** Versand — Checkout / Store API / Wholesale-Pauschale */
  checkoutShipping?: {
    rate: number;
    label: string;
    method_id: string;
    rate_id?: string;
    instance_id?: number;
  };
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value).trim();
  return String(value).trim();
}

type WooCustomer = {
  billing?: { company?: string; [key: string]: unknown };
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

function billingVatFromCustomerMeta(customer: WooCustomer): string {
  const entry = customer.meta_data?.find(
    (m) => m?.key === "_billing_vat" || m?.key === "billing_vat"
  );
  return asString(entry?.value);
}

function vatFromOrderMeta(meta: OrderMetaEntry[] | undefined): string {
  const entry = meta?.find(
    (m) => m.key === "_billing_vat" || m.key === "billing_vat"
  );
  return asString(entry?.value);
}

/**
 * Keeps non-VAT meta entries, then sets `_billing_vat` and
 * `_eu_vat_guard_order_vat_number` (VAT Guard plugin) from frontend meta if
 * non-empty, else from Woo customer profile.
 */
function mergeOrderMetaData(
  existing: OrderMetaEntry[] | undefined,
  vatFromFrontend: string,
  vatFromProfile: string
): OrderMetaEntry[] | undefined {
  const base = [...(existing ?? [])].filter(
    (m) =>
      m.key !== "_billing_vat" &&
      m.key !== "billing_vat" &&
      m.key !== "_eu_vat_guard_order_vat_number"
  );
  const vat = asString(vatFromFrontend) || asString(vatFromProfile);
  if (!vat) {
    return base.length > 0 ? base : undefined;
  }
  base.push({ key: "_billing_vat", value: vat });
  base.push({ key: "_eu_vat_guard_order_vat_number", value: vat });
  return base;
}

function resolveLoggedInCustomerId(cookieStore: Awaited<
  ReturnType<typeof cookies>
>): string | undefined {
  const wooId = cookieStore.get("woo_customer_id")?.value?.trim();
  if (wooId) return wooId;
  const haendlerToken = cookieStore.get("haendler_token")?.value;
  const haendlerId = cookieStore.get("haendler_id")?.value?.trim();
  if (haendlerToken && haendlerId) return haendlerId;
  return undefined;
}

async function fetchWooCustomer(
  customerId: string,
  wooUrl: string,
  authHeader: string
): Promise<WooCustomer | null> {
  try {
    const res = await fetch(
      `${wooUrl}/wp-json/wc/v3/customers/${encodeURIComponent(customerId)}`,
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as WooCustomer;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncBody;

    let cartItems: CartMeta[] = [];
    let billing: Record<string, string> = {};
    let shipping: Record<string, string> = {};
    let transactionId = "";

    if (body.sessionId) {
      // Stripe Checkout Session flow
      const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
        expand: ["customer_details", "line_items"],
      });

      if (session.payment_status !== "paid") {
        return NextResponse.json(
          { error: "Zahlung nicht abgeschlossen." },
          { status: 400 }
        );
      }

      cartItems = JSON.parse(session.metadata?.cart_items || "[]");
      transactionId = session.payment_intent as string;

      const customer = session.customer_details;
      const ship = (session as unknown as Record<string, unknown>).shipping_details as {
        name?: string;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          postal_code?: string;
          country?: string;
        };
      } | undefined;

      billing = {
        first_name: customer?.name?.split(" ")[0] || "",
        last_name: customer?.name?.split(" ").slice(1).join(" ") || "",
        email: customer?.email || "",
        phone: customer?.phone || "",
        address_1: customer?.address?.line1 || "",
        address_2: customer?.address?.line2 || "",
        city: customer?.address?.city || "",
        postcode: customer?.address?.postal_code || "",
        country: customer?.address?.country || "",
      };

      shipping = {
        first_name: ship?.name?.split(" ")[0] || billing.first_name,
        last_name: ship?.name?.split(" ").slice(1).join(" ") || billing.last_name,
        address_1: ship?.address?.line1 || billing.address_1,
        address_2: ship?.address?.line2 || billing.address_2,
        city: ship?.address?.city || billing.city,
        postcode: ship?.address?.postal_code || billing.postcode,
        country: ship?.address?.country || billing.country,
      };
    } else if (body.paymentIntentId && body.customer && body.items) {
      // Direct PaymentIntent flow
      cartItems = body.items;
      transactionId = body.paymentIntentId;

      const c = body.customer;
      billing = {
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        address_1: c.street,
        city: c.city,
        postcode: c.zip,
        country: c.country,
      };
      shipping = { ...billing };
    } else {
      return NextResponse.json(
        { error: "Fehlende Daten." },
        { status: 400 }
      );
    }

    if (cartItems.length === 0) {
      return NextResponse.json(
        { error: "Keine Artikel gefunden." },
        { status: 400 }
      );
    }

    if (body.billing && typeof body.billing === "object") {
      for (const [key, val] of Object.entries(body.billing)) {
        if (typeof val === "string" && val.trim()) {
          billing[key] = val;
        }
      }
    }

    const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
    const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
    const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;
    const AUTH_HEADER =
      "Basic " +
      Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString("base64");

    const cookieStore = await cookies();
    const customerIdStr = resolveLoggedInCustomerId(cookieStore);

    let profileCompany = "";
    let profileVat = "";
    if (customerIdStr) {
      const wcCustomer = await fetchWooCustomer(
        customerIdStr,
        WOOCOMMERCE_URL,
        AUTH_HEADER
      );
      if (wcCustomer) {
        profileCompany = asString(wcCustomer.billing?.company);
        profileVat = billingVatFromCustomerMeta(wcCustomer);
      }
    }

    const companyFromFrontend = asString(body.billing?.company);
    const companyMerged =
      companyFromFrontend || profileCompany || asString(billing.company);
    if (companyMerged) {
      billing.company = companyMerged;
    }

    const vatFromFrontendMeta = vatFromOrderMeta(body.meta_data);

    const orderData: Record<string, unknown> = {
      status: "processing",
      payment_method: "stripe",
      payment_method_title: "Stripe",
      set_paid: true,
      /** Line totals from checkout are gross (incl. VAT); avoids WC recomputing subtotal from catalog. */
      prices_include_tax: true,
      billing,
      shipping,
      line_items: cartItems.map((item) => {
        const lineTotal = (parseFloat(item.price) * item.qty).toFixed(2);
        return {
          product_id: Number(item.id),
          quantity: item.qty,
          subtotal: lineTotal,
          total: lineTotal,
        };
      }),
      transaction_id: transactionId,
    };

    const mergedMeta = mergeOrderMetaData(
      body.meta_data,
      vatFromFrontendMeta,
      profileVat
    );
    if (mergedMeta && mergedMeta.length > 0) {
      orderData.meta_data = mergedMeta;
    }

    const parsedId = customerIdStr ? parseInt(customerIdStr, 10) : NaN;
    if (customerIdStr && Number.isFinite(parsedId) && parsedId > 0) {
      orderData.customer_id = parsedId;
    }

    if (
      body.checkoutShipping &&
      typeof body.checkoutShipping.rate === "number" &&
      !Number.isNaN(body.checkoutShipping.rate)
    ) {
      const s = body.checkoutShipping;
      if (!(s.method_id === "none" && s.rate === 0)) {
        orderData.shipping_lines = [
          {
            method_id: s.method_id || "flat_rate",
            method_title: s.label || "Versand",
            total: Math.max(0, s.rate).toFixed(2),
          },
        ];
      }
    }

    const res = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`, {
      method: "POST",
      headers: {
        Authorization: AUTH_HEADER,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WooCommerce order creation failed: ${errText}`);
    }

    const order = await res.json();

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.number,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
