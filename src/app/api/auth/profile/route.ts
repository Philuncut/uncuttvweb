import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

type WooAddress = {
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  state?: string;
};

type WooCustomer = {
  first_name?: string;
  last_name?: string;
  email?: string;
  billing?: WooAddress;
  shipping?: WooAddress;
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

type ProfilePayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  billing: {
    company: string;
    vat: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    postcode: string;
    country: string;
    state: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    postcode: string;
    country: string;
    state: string;
  };
  shipping_same_as_billing: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildProfileFromCustomer(
  customer: WooCustomer,
  cookieName: string
): ProfilePayload {
  const billing = customer.billing ?? {};
  const shipping = customer.shipping ?? {};
  const vat =
    customer.meta_data?.find((meta) => meta?.key === "_billing_vat")?.value ?? "";

  const firstName = asString(customer.first_name) || cookieName;
  const lastName = asString(customer.last_name);
  const email = asString(customer.email);

  const billingProfile = {
    company: asString(billing.company),
    vat: asString(vat),
    phone: asString(billing.phone),
    address_1: asString(billing.address_1),
    address_2: asString(billing.address_2),
    city: asString(billing.city),
    postcode: asString(billing.postcode),
    country: asString(billing.country),
    state: asString(billing.state),
  };

  const shippingProfile = {
    first_name: asString(shipping.first_name),
    last_name: asString(shipping.last_name),
    company: asString(shipping.company),
    address_1: asString(shipping.address_1),
    address_2: asString(shipping.address_2),
    city: asString(shipping.city),
    postcode: asString(shipping.postcode),
    country: asString(shipping.country),
    state: asString(shipping.state),
  };

  const shippingIsEmpty = Object.values(shippingProfile).every((value) => !value);
  const shippingEqualsBilling =
    shippingProfile.first_name === firstName &&
    shippingProfile.last_name === lastName &&
    shippingProfile.company === billingProfile.company &&
    shippingProfile.address_1 === billingProfile.address_1 &&
    shippingProfile.address_2 === billingProfile.address_2 &&
    shippingProfile.city === billingProfile.city &&
    shippingProfile.postcode === billingProfile.postcode &&
    shippingProfile.country === billingProfile.country &&
    shippingProfile.state === billingProfile.state;

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone: billingProfile.phone,
    billing: billingProfile,
    shipping: shippingProfile,
    shipping_same_as_billing: shippingIsEmpty || shippingEqualsBilling,
  };
}

async function fetchWooCustomer(customerId: string): Promise<WooCustomer> {
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3/customers/${customerId}`, {
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Kunde konnte nicht geladen werden.");
  }

  return res.json();
}

function validateProfile(body: ProfilePayload, isHaendler: boolean): string | null {
  const requiredRoot = [body.first_name, body.last_name, body.email];
  if (requiredRoot.some((value) => !asString(value))) {
    return "Vorname, Nachname und E-Mail sind erforderlich.";
  }

  if (
    !asString(body.billing.address_1) ||
    !asString(body.billing.city) ||
    !asString(body.billing.postcode) ||
    !asString(body.billing.country) ||
    !asString(body.billing.phone)
  ) {
    return "Rechnungsadresse und Telefon sind unvollständig.";
  }

  if (!body.shipping_same_as_billing) {
    const shippingValues = [
      body.shipping.first_name,
      body.shipping.last_name,
      body.shipping.company,
      body.shipping.address_1,
      body.shipping.address_2,
      body.shipping.city,
      body.shipping.postcode,
      body.shipping.country,
      body.shipping.state,
    ];
    if (shippingValues.some((value) => !asString(value))) {
      return "Lieferadresse ist unvollständig.";
    }
  }

  const vat = asString(body.billing.vat);
  if (isHaendler && (!asString(body.billing.company) || !vat)) {
    return "Firmenname und UID-Nummer sind für Händler erforderlich.";
  }
  if (vat && !/^[A-Z]{2}[A-Z0-9]+$/.test(vat.toUpperCase())) {
    return "UID-Nummer ist ungültig.";
  }

  return null;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("woo_token")?.value;
    const customerId = cookieStore.get("woo_customer_id")?.value;
    const cookieName = asString(cookieStore.get("woo_customer_name")?.value);

    if (!token || !customerId) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const customer = await fetchWooCustomer(customerId);
    const profile = buildProfileFromCustomer(customer, cookieName);
    return NextResponse.json(profile);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Profil konnte nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("woo_token")?.value;
    const customerId = cookieStore.get("woo_customer_id")?.value;

    if (!token || !customerId) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const body = (await request.json()) as ProfilePayload;
    const role = asString(
      cookieStore.get("haendler_role")?.value ||
        cookieStore.get("woo_customer_role")?.value
    ).toLowerCase();
    const isHaendler =
      role === "wholesale" || role === "administrator" || role === "shop_manager";

    const validationError = validateProfile(body, isHaendler);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const billing = {
      first_name: asString(body.first_name),
      last_name: asString(body.last_name),
      company: asString(body.billing.company),
      phone: asString(body.billing.phone),
      address_1: asString(body.billing.address_1),
      address_2: asString(body.billing.address_2),
      city: asString(body.billing.city),
      postcode: asString(body.billing.postcode),
      country: asString(body.billing.country),
      state: asString(body.billing.state),
    };

    const shipping = body.shipping_same_as_billing
      ? {
          first_name: billing.first_name,
          last_name: billing.last_name,
          company: billing.company,
          address_1: billing.address_1,
          address_2: billing.address_2,
          city: billing.city,
          postcode: billing.postcode,
          country: billing.country,
          state: billing.state,
        }
      : {
          first_name: asString(body.shipping.first_name),
          last_name: asString(body.shipping.last_name),
          company: asString(body.shipping.company),
          address_1: asString(body.shipping.address_1),
          address_2: asString(body.shipping.address_2),
          city: asString(body.shipping.city),
          postcode: asString(body.shipping.postcode),
          country: asString(body.shipping.country),
          state: asString(body.shipping.state),
        };

    const updateRes = await fetch(
      `${WOO_URL}/wp-json/wc/v3/customers/${customerId}`,
      {
        method: "PUT",
        headers: {
          Authorization: AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: asString(body.first_name),
          last_name: asString(body.last_name),
          email: asString(body.email),
          billing,
          shipping,
          meta_data: [{ key: "_billing_vat", value: asString(body.billing.vat) }],
        }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      return NextResponse.json(
        { error: text || "Profil konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    const updatedCustomer = (await updateRes.json()) as WooCustomer;
    const profile = buildProfileFromCustomer(updatedCustomer, "");

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Profil konnte nicht gespeichert werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
