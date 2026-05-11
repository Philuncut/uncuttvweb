import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;

interface LoginBody {
  email: string;
  password: string;
}

const ALLOWED_ROLES = ["wholesale", "administrator", "shop_manager"];

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

    console.log("[Haendler Login] Attempting login for:", email);
    console.log("[Haendler Login] WOO_URL:", WOO_URL);

    // Step 1: Authenticate via JWT
    const jwtUrl = `${WOO_URL}/wp-json/jwt-auth/v1/token`;
    console.log("[Haendler Login] JWT URL:", jwtUrl);

    const jwtRes = await fetch(jwtUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });

    const jwtBody = await jwtRes.text();
    console.log("[Haendler Login] JWT status:", jwtRes.status);
    console.log("[Haendler Login] JWT response body:", jwtBody.slice(0, 500));

    if (!jwtRes.ok) {
      console.log("[Haendler Login] JWT auth FAILED. Status:", jwtRes.status, "Body:", jwtBody.slice(0, 300));
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    const jwtData = JSON.parse(jwtBody);
    const token = jwtData.token || "";
    const jwtEmail = jwtData.user_email || email;
    const jwtDisplayName = jwtData.user_display_name || "";

    console.log("[Haendler Login] JWT SUCCESS. Token prefix:", token.slice(0, 30));
    console.log("[Haendler Login] JWT email:", jwtEmail, "display:", jwtDisplayName);

    // Step 2: Get user roles via JWT token
    const meUrl = `${WOO_URL}/wp-json/wp/v2/users/me?context=edit`;
    console.log("[Haendler Login] Fetching:", meUrl);

    const meRes = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      const meErrBody = await meRes.text();
      console.log("[Haendler Login] /users/me FAILED. Status:", meRes.status, "Body:", meErrBody.slice(0, 300));
      return NextResponse.json(
        { error: "Benutzerdaten konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const meBody = await meRes.text();
    console.log("[Haendler Login] /users/me raw response:", meBody.slice(0, 500));

    const wpUser = JSON.parse(meBody);

    // WordPress may return roles in different fields depending on permissions
    const wpRoles: string[] = wpUser.roles || [];
    const wpCaps = wpUser.capabilities || {};
    const extraCaps = wpUser.extra_capabilities || {};

    console.log("[Haendler Login] User:", jwtEmail);
    console.log("[Haendler Login] roles field:", JSON.stringify(wpRoles));
    console.log("[Haendler Login] capabilities:", JSON.stringify(Object.keys(wpCaps)));
    console.log("[Haendler Login] extra_capabilities:", JSON.stringify(Object.keys(extraCaps)));

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

    console.log("[Haendler Login] Combined roles:", JSON.stringify(allRoles));
    console.log("[Haendler Login] Allowed roles:", JSON.stringify(ALLOWED_ROLES));

    // Step 3: Check for allowed roles (case-insensitive)
    const hasAllowedRole = allRoles.some((r) =>
      ALLOWED_ROLES.some((a) => a.toLowerCase() === r)
    );

    console.log("[Haendler Login] hasAllowedRole:", hasAllowedRole);

    if (!hasAllowedRole) {
      console.log("[Haendler Login] REJECTED — no allowed role found in:", JSON.stringify(allRoles));
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

    console.log("[Haendler Login] Session created for:", jwtEmail, "role:", matchedRole);

    const nameParts = jwtDisplayName.split(" ").filter(Boolean);
    return NextResponse.json({
      id: wpUser.id,
      email: jwtEmail,
      name: jwtDisplayName,
      firstName: haendlerDisplayName,
      lastName: nameParts.slice(1).join(" ") || "",
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
