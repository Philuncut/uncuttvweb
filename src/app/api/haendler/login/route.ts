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

    // Step 1: Authenticate via WordPress REST API with Basic Auth
    const userAuth =
      "Basic " + Buffer.from(`${email}:${password}`).toString("base64");

    const wpRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: userAuth },
    });

    console.log("[Haendler Login] WordPress auth status:", wpRes.status);

    if (!wpRes.ok) {
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    const wpUser = await wpRes.json();
    const wpUserId = wpUser.id;
    const wpName = wpUser.name || "";
    const wpRoles: string[] = wpUser.roles || [];

    console.log("[Haendler Login] User:", email, "Roles:", wpRoles);

    // Step 2: Check for allowed roles
    const hasAllowedRole = wpRoles.some((r) => ALLOWED_ROLES.includes(r));

    if (!hasAllowedRole) {
      return NextResponse.json(
        {
          error:
            "Dein Konto wurde noch nicht freigeschaltet. Bitte warte auf die Bestätigung.",
        },
        { status: 403 }
      );
    }

    // Step 3: Set cookies
    const matchedRole =
      wpRoles.find((r) => ALLOWED_ROLES.includes(r)) || "wholesale";

    const cookieStore = await cookies();
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    } as const;

    cookieStore.set("haendler_token", userAuth, opts);
    cookieStore.set("haendler_id", String(wpUserId), opts);
    cookieStore.set("haendler_email", email, opts);
    cookieStore.set("haendler_role", matchedRole, opts);

    console.log("[Haendler Login] Session created for:", email, "role:", matchedRole);

    return NextResponse.json({
      id: wpUserId,
      email,
      name: wpName,
      firstName: wpName.split(" ")[0] || "",
      lastName: wpName.split(" ").slice(1).join(" ") || "",
      company: wpName,
      role: matchedRole,
    });
  } catch (error) {
    console.error("[Haendler Login] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
