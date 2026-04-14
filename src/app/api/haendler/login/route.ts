import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

interface LoginBody {
  email: string;
  password: string;
}

interface JwtResponse {
  token?: string;
  user_email?: string;
  user_display_name?: string;
  user_nicename?: string;
  code?: string;
  message?: string;
  data?: { id?: number };
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

    // ── Step 1: Authenticate via JWT (identical to customer login) ──
    const jwtRes = await fetch(`${WOO_URL}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });

    const jwtBody = await jwtRes.text();
    console.log("[Haendler Login] JWT response status:", jwtRes.status);
    console.log("[Haendler Login] JWT response body:", jwtBody.slice(0, 500));

    if (!jwtRes.ok) {
      let jwtError = "";
      try {
        const jwtData = JSON.parse(jwtBody);
        jwtError = jwtData.code || jwtData.message || "";
      } catch {
        jwtError = jwtBody;
      }
      console.log("[Haendler Login] JWT auth failed:", jwtError);

      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    // JWT succeeded — user is authenticated
    const jwtData: JwtResponse = JSON.parse(jwtBody);
    const token = jwtData.token || "";
    const jwtEmail = jwtData.user_email || email;
    const jwtDisplayName = jwtData.user_display_name || "";
    console.log("[Haendler Login] JWT auth succeeded for:", jwtEmail, "display:", jwtDisplayName);

    // ── Step 2: Try to find WooCommerce customer with role=all ──
    const searchUrl = `${WOO_URL}/wp-json/wc/v3/customers?email=${encodeURIComponent(jwtEmail)}&role=all&per_page=100`;
    console.log("[Haendler Login] Searching WooCommerce customers (role=all):", searchUrl);

    const cusRes = await fetch(searchUrl, {
      headers: {
        Authorization: AUTH_HEADER,
        "Content-Type": "application/json",
      },
    });

    const cusBody = await cusRes.text();
    console.log("[Haendler Login] WooCommerce customer search status:", cusRes.status);
    console.log("[Haendler Login] WooCommerce customer search body:", cusBody.slice(0, 300));

    let customer = null;

    if (cusRes.ok) {
      const customers = JSON.parse(cusBody);
      if (Array.isArray(customers) && customers.length > 0) {
        customer = customers.find(
          (c: { email: string }) =>
            c.email.toLowerCase() === jwtEmail.toLowerCase()
        ) || customers[0];
        console.log("[Haendler Login] Found WooCommerce customer:", customer.id, customer.email, "role:", customer.role);
      }
    }

    // Step 3: Also try search param as fallback
    if (!customer) {
      console.log("[Haendler Login] No customer found with email+role=all, trying search...");

      const searchRes = await fetch(
        `${WOO_URL}/wp-json/wc/v3/customers?search=${encodeURIComponent(jwtEmail)}&role=all&per_page=100`,
        {
          headers: {
            Authorization: AUTH_HEADER,
            "Content-Type": "application/json",
          },
        }
      );

      if (searchRes.ok) {
        const searchCustomers = await searchRes.json();
        if (Array.isArray(searchCustomers)) {
          customer = searchCustomers.find(
            (c: { email: string }) =>
              c.email.toLowerCase() === jwtEmail.toLowerCase()
          ) || null;
          if (customer) {
            console.log("[Haendler Login] Found customer via search:", customer.id, customer.email);
          }
        }
      }
    }

    // ── Step 4: Determine user role ──
    let userRole = customer?.role || "";
    let wpUserId = customer?.id || jwtData.data?.id || 0;

    // If we have a customer, check its WooCommerce role
    // But WooCommerce role field may not match WordPress role
    // So also check via /users/me for the actual WordPress role
    let wpRoles: string[] = [];
    if (token) {
      try {
        const meRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meBody = await meRes.text();
        console.log("[Haendler Login] /users/me status:", meRes.status);
        console.log("[Haendler Login] /users/me body:", meBody.slice(0, 500));

        if (meRes.ok) {
          const wpUser = JSON.parse(meBody);
          wpRoles = wpUser.roles || [];
          wpUserId = wpUser.id || wpUserId;
          console.log("[Haendler Login] WordPress roles:", JSON.stringify(wpRoles));
        }
      } catch (e) {
        console.log("[Haendler Login] /users/me fetch failed:", e);
      }
    }

    // Combine WooCommerce role + WordPress roles for checking
    const allRoles = [...wpRoles];
    if (userRole && !allRoles.includes(userRole)) {
      allRoles.push(userRole);
    }

    console.log("[Haendler Login] All roles:", JSON.stringify(allRoles));
    console.log("[Haendler Login] Allowed roles:", JSON.stringify(ALLOWED_ROLES));

    const hasAllowedRole = allRoles.some((r) => ALLOWED_ROLES.includes(r));
    console.log("[Haendler Login] Role check result:", hasAllowedRole);

    if (!hasAllowedRole) {
      return NextResponse.json(
        {
          error:
            "Dein Konto wurde noch nicht freigeschaltet. Bitte warte auf die Bestätigung.",
        },
        { status: 403 }
      );
    }

    // ── Step 5: Set cookies ──
    const matchedRole = allRoles.find((r) => ALLOWED_ROLES.includes(r)) || "wholesale";
    const nameParts = jwtDisplayName.split(" ");

    const cookieStore = await cookies();
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    } as const;

    cookieStore.set("haendler_token", token, opts);
    cookieStore.set("haendler_id", String(wpUserId), opts);
    cookieStore.set("haendler_email", jwtEmail, opts);
    cookieStore.set("haendler_role", matchedRole, opts);

    console.log("[Haendler Login] Session created for:", jwtEmail, "role:", matchedRole, "id:", wpUserId);

    return NextResponse.json({
      id: wpUserId,
      email: jwtEmail,
      name: jwtDisplayName,
      firstName: nameParts[0] || "",
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
