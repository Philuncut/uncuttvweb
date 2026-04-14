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
    console.log("[Login] JWT response body:", jwtBody.slice(0, 500));

    if (!jwtRes.ok) {
      let jwtError = "";
      try {
        const jwtData = JSON.parse(jwtBody);
        jwtError = jwtData.code || jwtData.message || "";
      } catch {
        jwtError = jwtBody;
      }
      console.log("[Login] JWT auth failed:", jwtError);

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
    console.log("[Login] JWT auth succeeded for:", jwtEmail, "display:", jwtDisplayName);

    // Step 2: Try to find WooCommerce customer with role=all
    const searchUrl = `${WOO_URL}/wp-json/wc/v3/customers?email=${encodeURIComponent(jwtEmail)}&role=all&per_page=100`;
    console.log("[Login] Searching WooCommerce customers (role=all):", searchUrl);

    const cusRes = await fetch(searchUrl, {
      headers: {
        Authorization: AUTH_HEADER,
        "Content-Type": "application/json",
      },
    });

    const cusBody = await cusRes.text();
    console.log("[Login] WooCommerce customer search status:", cusRes.status);
    console.log("[Login] WooCommerce customer search body:", cusBody.slice(0, 300));

    let customer = null;

    if (cusRes.ok) {
      const customers = JSON.parse(cusBody);
      if (Array.isArray(customers) && customers.length > 0) {
        customer = customers.find(
          (c: { email: string }) =>
            c.email.toLowerCase() === jwtEmail.toLowerCase()
        ) || customers[0];
        console.log("[Login] Found WooCommerce customer:", customer.id, customer.email, "role:", customer.role);
      }
    }

    // Step 3: Also try search param as fallback
    if (!customer) {
      console.log("[Login] No customer found with email+role=all, trying search...");

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
            console.log("[Login] Found customer via search:", customer.id, customer.email);
          }
        }
      }
    }

    // Step 4: If customer found in WooCommerce, use that data
    if (customer) {
      return setAuthCookiesAndRespond(
        {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name || jwtDisplayName.split(" ")[0] || "",
          last_name: customer.last_name || jwtDisplayName.split(" ").slice(1).join(" ") || "",
          role: customer.role || "customer",
        },
        token
      );
    }

    // Step 5: No WooCommerce customer — this is likely an admin/editor/etc.
    // Use JWT data directly to create a session
    console.log("[Login] No WooCommerce customer found. Using JWT user data (likely admin).");

    // Get WordPress user ID from JWT token
    let wpUserId = jwtData.data?.id || 0;
    if (!wpUserId && token) {
      // Fetch user profile with the JWT token to get the ID
      try {
        const meRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          wpUserId = meData.id;
          console.log("[Login] Got WP user ID from /users/me:", wpUserId);
        }
      } catch {
        console.log("[Login] Failed to fetch /users/me");
      }
    }

    const nameParts = jwtDisplayName.split(" ");
    return setAuthCookiesAndRespond(
      {
        id: wpUserId || 0,
        email: jwtEmail,
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        role: "administrator",
      },
      token
    );
  } catch (error) {
    console.error("[Login] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function setAuthCookiesAndRespond(
  user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  },
  token: string
) {
  const cookieStore = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  } as const;

  cookieStore.set("woo_customer_id", String(user.id), opts);
  cookieStore.set("woo_customer_email", user.email, opts);
  cookieStore.set("woo_customer_role", user.role, opts);
  if (token) {
    cookieStore.set("woo_token", token, opts);
  }

  console.log("[Login] Session created for:", user.email, "role:", user.role, "id:", user.id);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
  });
}
