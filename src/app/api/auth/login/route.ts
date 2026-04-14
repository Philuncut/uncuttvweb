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

    // Step 1: Authenticate via WordPress REST API with Basic Auth
    const userAuth =
      "Basic " + Buffer.from(`${email}:${password}`).toString("base64");

    const wpRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: userAuth,
      },
    });

    console.log("[Login] WordPress auth status:", wpRes.status);

    if (!wpRes.ok) {
      console.log("[Login] Auth failed for:", email);
      return NextResponse.json(
        { error: "Ungültige E-Mail oder Passwort." },
        { status: 401 }
      );
    }

    const wpUser = await wpRes.json();
    const wpUserId = wpUser.id;
    const wpName = wpUser.name || "";
    const wpRoles: string[] = wpUser.roles || [];

    console.log("[Login] Auth succeeded. User ID:", wpUserId, "Name:", wpName, "Roles:", wpRoles);

    // Step 2: Try to find WooCommerce customer by email
    const cusRes = await fetch(
      `${WOO_URL}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}&role=all&per_page=100`,
      {
        headers: {
          Authorization: WOO_AUTH,
          "Content-Type": "application/json",
        },
      }
    );

    let customer = null;

    if (cusRes.ok) {
      const customers = await cusRes.json();
      if (Array.isArray(customers) && customers.length > 0) {
        customer =
          customers.find(
            (c: { email: string }) =>
              c.email.toLowerCase() === email.toLowerCase()
          ) || customers[0];
        console.log("[Login] Found WooCommerce customer:", customer.id, customer.email);
      }
    }

    // Step 3: Fallback search
    if (!customer) {
      const searchRes = await fetch(
        `${WOO_URL}/wp-json/wc/v3/customers?search=${encodeURIComponent(email)}&role=all&per_page=100`,
        {
          headers: {
            Authorization: WOO_AUTH,
            "Content-Type": "application/json",
          },
        }
      );

      if (searchRes.ok) {
        const searchCustomers = await searchRes.json();
        if (Array.isArray(searchCustomers)) {
          customer =
            searchCustomers.find(
              (c: { email: string }) =>
                c.email.toLowerCase() === email.toLowerCase()
            ) || null;
        }
      }
    }

    // Step 4: Build session
    const nameParts = wpName.split(" ");
    const sessionUser = {
      id: customer?.id || wpUserId,
      email: customer?.email || email,
      first_name: customer?.first_name || nameParts[0] || "",
      last_name:
        customer?.last_name || nameParts.slice(1).join(" ") || "",
      role: customer?.role || wpRoles[0] || "customer",
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
