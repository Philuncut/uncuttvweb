import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const WOO_AUTH =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

interface LoginBody {
  email: string;
  password: string;
}

function resolveSessionRole(wpRoles: string[], fallbackRole?: string): string {
  const normalized = wpRoles.map((role) => String(role).toLowerCase());
  if (normalized.includes("wholesale")) return "wholesale";
  if (normalized.includes("administrator")) return "administrator";
  if (normalized.includes("shop_manager")) return "shop_manager";
  if (fallbackRole) return fallbackRole;
  return "customer";
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

    console.log("[Login] Attempting login for:", email);

    // Step 1: Authenticate via JWT
    const jwtRes = await fetch(`${WOO_URL}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });

    const jwtBody = await jwtRes.text();
    console.log("[Login] JWT response status:", jwtRes.status);

    if (!jwtRes.ok) {
      console.log("[Login] JWT auth failed:", jwtBody.slice(0, 300));
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    const jwtData = JSON.parse(jwtBody);
    const token = jwtData.token || "";
    const jwtEmail = jwtData.user_email || email;
    const jwtDisplayName = jwtData.user_display_name || "";

    console.log("[Login] JWT auth succeeded for:", jwtEmail);

    // Step 2: Get user details via JWT token
    let wpUserId = 0;
    let wpRoles: string[] = [];

    if (token) {
      const meRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me?context=edit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const wpUser = await meRes.json();
        wpUserId = wpUser.id;
        wpRoles = wpUser.roles || [];
        console.log("[Login] WP user ID:", wpUserId, "roles:", wpRoles);
      }
    }

    // Step 3: Try to find WooCommerce customer
    let customer = null;

    const cusRes = await fetch(
      `${WOO_URL}/wp-json/wc/v3/customers?email=${encodeURIComponent(jwtEmail)}&role=all&per_page=100`,
      { headers: { Authorization: WOO_AUTH, "Content-Type": "application/json" } }
    );

    if (cusRes.ok) {
      const customers = await cusRes.json();
      if (Array.isArray(customers) && customers.length > 0) {
        customer =
          customers.find(
            (c: { email: string }) => c.email.toLowerCase() === jwtEmail.toLowerCase()
          ) || customers[0];
      }
    }

    // Fallback search
    if (!customer) {
      const searchRes = await fetch(
        `${WOO_URL}/wp-json/wc/v3/customers?search=${encodeURIComponent(jwtEmail)}&role=all&per_page=100`,
        { headers: { Authorization: WOO_AUTH, "Content-Type": "application/json" } }
      );
      if (searchRes.ok) {
        const searchCustomers = await searchRes.json();
        if (Array.isArray(searchCustomers)) {
          customer =
            searchCustomers.find(
              (c: { email: string }) => c.email.toLowerCase() === jwtEmail.toLowerCase()
            ) || null;
        }
      }
    }

    // Step 4: Build session
    const nameParts = jwtDisplayName.split(" ");
    const sessionUser = {
      id: customer?.id || wpUserId,
      email: customer?.email || jwtEmail,
      first_name: customer?.first_name || nameParts[0] || "",
      last_name: customer?.last_name || nameParts.slice(1).join(" ") || "",
      role: resolveSessionRole(wpRoles, customer?.role),
    };

    const cookieStore = await cookies();
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    } as const;

    cookieStore.set("woo_customer_id", String(sessionUser.id), opts);
    cookieStore.set("woo_customer_email", sessionUser.email, opts);
    cookieStore.set("woo_customer_role", sessionUser.role, opts);
    cookieStore.set("woo_token", token, opts);

    // Non-httpOnly cookie for client-side display (name only, no sensitive data)
    cookieStore.set("woo_customer_name", sessionUser.first_name, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    console.log("[Login] Session created for:", sessionUser.email, "role:", sessionUser.role);

    return NextResponse.json({
      id: sessionUser.id,
      email: sessionUser.email,
      firstName: sessionUser.first_name,
      lastName: sessionUser.last_name,
      role: sessionUser.role,
    });
  } catch (error) {
    console.error("[Login] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
