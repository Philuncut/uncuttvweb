import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;

interface LoginBody {
  email: string;
  password: string;
}

const ALLOWED_ROLES = ["wholesale", "administrator", "shop_manager"];

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

    // Step 1: Authenticate via JWT
    const jwtRes = await fetch(`${WOO_URL}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });

    console.log("[Haendler Login] JWT status:", jwtRes.status);

    if (!jwtRes.ok) {
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    const jwtData = await jwtRes.json();
    const token = jwtData.token || "";
    const jwtEmail = jwtData.user_email || email;
    const jwtDisplayName = jwtData.user_display_name || "";

    // Step 2: Get user roles via JWT token
    const meRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
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

    cookieStore.set("haendler_token", token, opts);
    cookieStore.set("haendler_id", String(wpUser.id), opts);
    cookieStore.set("haendler_email", jwtEmail, opts);
    cookieStore.set("haendler_role", matchedRole, opts);

    console.log("[Haendler Login] Session created for:", jwtEmail, "role:", matchedRole);

    return NextResponse.json({
      id: wpUser.id,
      email: jwtEmail,
      name: jwtDisplayName,
      firstName: jwtDisplayName.split(" ")[0] || "",
      lastName: jwtDisplayName.split(" ").slice(1).join(" ") || "",
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
