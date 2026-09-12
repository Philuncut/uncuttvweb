import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { wooFetch } from "@/lib/woocommerce";

const WOO_URL = process.env.WOOCOMMERCE_URL!;

interface LoginBody {
  email: string;
  password: string;
}

const ALLOWED_ROLES = ["wholesale", "administrator", "shop_manager"];

interface WooCustomer {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

/** Gleiche Strategie wie `/api/auth/login`: `?email=…&role=all`, sonst `?search=…`. */
async function findWooCustomerByEmail(
  email: string
): Promise<WooCustomer | null> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return null;
  try {
    const byEmail = await wooFetch<WooCustomer[]>(
      "/customers",
      { email: normalized, role: "all", per_page: "100" },
      { cache: "no-store" }
    );
    if (Array.isArray(byEmail) && byEmail.length > 0) {
      const c =
        byEmail.find((x) => x.email?.toLowerCase() === normalized) ||
        byEmail[0];
      if (c?.id) return c;
    }
    const bySearch = await wooFetch<WooCustomer[]>(
      "/customers",
      { search: normalized, role: "all", per_page: "100" },
      { cache: "no-store" }
    );
    if (Array.isArray(bySearch) && bySearch.length > 0) {
      const c = bySearch.find(
        (x) => x.email?.toLowerCase() === normalized
      );
      return c?.id ? c : null;
    }
  } catch {
    // Woo nicht erreichbar oder kein Treffer — ohne Kunden-Cookies fortfahren
  }
  return null;
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? email;
  return local.replace(/[._]+/g, " ").trim() || email;
}

function pickFirstNonEmpty(
  ...vals: (string | undefined | null)[]
): string | null {
  for (const v of vals) {
    const t = String(v ?? "").trim();
    if (t) return t;
  }
  return null;
}

function metaFirstName(meta: unknown): string | null {
  if (meta == null || typeof meta !== "object") return null;
  if (Array.isArray(meta)) {
    const entry = meta.find(
      (m: { key?: string; value?: unknown }) => m?.key === "first_name"
    );
    const v = entry?.value;
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
  }
  const v = (meta as Record<string, unknown>).first_name;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** WP `/wp/v2/users/me?context=edit` — first_name, meta.first_name, name, sonst E-Mail-Prefix. */
function resolveHaendlerDisplayName(
  wpUser: {
    first_name?: string;
    name?: string;
    meta?: unknown;
  },
  email: string
): string {
  return (
    pickFirstNonEmpty(wpUser.first_name) ??
    metaFirstName(wpUser.meta) ??
    pickFirstNonEmpty(wpUser.name) ??
    displayNameFromEmail(email)
  );
}

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as LoginBody;

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-Mail und Passwort sind erforderlich." },
        { status: 400 }
      );
    }

    // Step 1: Authenticate via JWT
    const jwtUrl = `${WOO_URL}/wp-json/jwt-auth/v1/token`;

    const jwtRes = await fetch(jwtUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });

    const jwtBody = await jwtRes.text();

    if (!jwtRes.ok) {
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    const jwtData = JSON.parse(jwtBody);
    const token = jwtData.token || "";
    const jwtEmail = jwtData.user_email || email;
    const jwtDisplayName = jwtData.user_display_name || "";

    // Step 2: Get user roles via JWT token
    const meUrl = `${WOO_URL}/wp-json/wp/v2/users/me?context=edit`;

    const meRes = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      const meErrBody = await meRes.text();
      return NextResponse.json(
        { error: "Benutzerdaten konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const meBody = await meRes.text();

    const wpUser = JSON.parse(meBody);

    // WordPress may return roles in different fields depending on permissions
    const wpRoles: string[] = wpUser.roles || [];
    const wpCaps = wpUser.capabilities || {};
    const extraCaps = wpUser.extra_capabilities || {};

    // Build comprehensive role list from all sources
    const allRoles = [
      ...wpRoles.map((r) => r.toLowerCase()),
      ...Object.keys(extraCaps).map((r) => r.toLowerCase()),
    ];

    // Also check capabilities for admin indicators
    if (wpCaps.manage_options || wpCaps.manage_woocommerce) {
      allRoles.push("administrator");
    }
    if (wpCaps.manage_woocommerce) {
      allRoles.push("shop_manager");
    }

    // Step 3: Check for allowed roles (case-insensitive)
    const hasAllowedRole = allRoles.some((r) =>
      ALLOWED_ROLES.some((a) => a.toLowerCase() === r)
    );

    if (!hasAllowedRole) {
      return NextResponse.json(
        {
          error:
            "Dein Konto wurde noch nicht freigeschaltet. Bitte warte auf die Bestätigung.",
        },
        { status: 403 }
      );
    }

    // Step 4: Set cookies
    const matchedRole =
      allRoles.find((r) => ALLOWED_ROLES.some((a) => a.toLowerCase() === r)) ||
      "wholesale";

    const cookieStore = await cookies();
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    } as const;

    const haendlerDisplayName = resolveHaendlerDisplayName(wpUser, jwtEmail);

    cookieStore.set("haendler_token", token, opts);
    cookieStore.set("haendler_id", String(wpUser.id), opts);
    cookieStore.set("haendler_email", jwtEmail, opts);
    cookieStore.set("haendler_role", matchedRole, opts);
    cookieStore.set("haendler_name", haendlerDisplayName, opts);

    const jwtNameParts = jwtDisplayName.split(/\s+/).filter(Boolean);
    const customer = await findWooCustomerByEmail(jwtEmail);
    if (customer?.id) {
      const sessionFirst =
        (customer.first_name && customer.first_name.trim()) ||
        jwtNameParts[0] ||
        haendlerDisplayName;

      cookieStore.set("woo_customer_id", String(customer.id), opts);
      cookieStore.set("woo_customer_email", customer.email || jwtEmail, opts);
      cookieStore.set(
        "woo_customer_role",
        customer.role || "customer",
        opts
      );
      cookieStore.set("woo_token", token, opts);
      cookieStore.set("woo_customer_name", sessionFirst, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return NextResponse.json({
      id: wpUser.id,
      email: jwtEmail,
      name: jwtDisplayName,
      firstName: haendlerDisplayName,
      lastName: jwtNameParts.slice(1).join(" ") || "",
      company: jwtDisplayName,
      role: matchedRole,
    });
  } catch (error) {
    console.error("[Haendler Login] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
