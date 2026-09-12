import { NextResponse } from "next/server";
import { clearSessionCookies, readSession } from "@/lib/auth-session";
import { isNewsletterSubscribedFromMeta } from "@/lib/newsletter-customer-meta";
import { fetchWooCustomer } from "@/lib/woo-customer-api";

export const dynamic = "force-dynamic";

export type AuthSessionPayload = {
  isLoggedIn: boolean;
  type: "haendler" | "customer" | null;
  name: string | null;
  dashboardHref: string | null;
  isWholesale: boolean;
  isNewsletterSubscribed: boolean;
};

const EMPTY: AuthSessionPayload = {
  isLoggedIn: false,
  type: null,
  name: null,
  dashboardHref: null,
  isWholesale: false,
  isNewsletterSubscribed: false,
};

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? email;
  return local.replace(/[._]+/g, " ").trim() || email;
}

/** Anzeigename und Newsletter-Status in einem Zug aus dem Kundensatz. */
async function loadCustomerBits(
  customerId: number
): Promise<{ name: string | null; isNewsletterSubscribed: boolean }> {
  try {
    const customer = await fetchWooCustomer(String(customerId));
    const first = (customer.first_name ?? "").trim();
    return {
      name: first || null,
      isNewsletterSubscribed: isNewsletterSubscribedFromMeta(
        customer.meta_data
      ),
    };
  } catch {
    return { name: null, isNewsletterSubscribed: false };
  }
}

export async function GET() {
  const result = await readSession();

  // Ein abgelaufenes oder gefälschtes Token räumt die Cookies weg. Sonst
  // hielte der Browser den Nutzer noch wochenlang für angemeldet, während
  // jede geschützte Anfrage mit 401 zurückkommt.
  if (result.status === "invalid") {
    await clearSessionCookies();
    return NextResponse.json(EMPTY satisfies AuthSessionPayload);
  }

  if (result.status !== "ok") {
    return NextResponse.json(EMPTY satisfies AuthSessionPayload);
  }

  const { session } = result;
  const bits = await loadCustomerBits(session.customerId);

  return NextResponse.json({
    isLoggedIn: true,
    type: session.source,
    name: bits.name ?? displayNameFromEmail(session.email),
    dashboardHref: "/konto",
    // Die Händlerkennzeichnung stammt aus den Rollen, die WordPress zu
    // diesem Token nennt, nicht mehr aus einem Rollen-Cookie.
    isWholesale: session.isWholesale,
    isNewsletterSubscribed: bits.isNewsletterSubscribed,
  } satisfies AuthSessionPayload);
}
