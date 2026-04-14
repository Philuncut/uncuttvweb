import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;
const WOO_KEY = process.env.WOOCOMMERCE_KEY!;
const WOO_SECRET = process.env.WOOCOMMERCE_SECRET!;
const AUTH_HEADER =
  "Basic " + Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");

export async function GET() {
  try {
    const cookieStore = await cookies();
    const customerId = cookieStore.get("woo_customer_id")?.value;
    const customerEmail = cookieStore.get("woo_customer_email")?.value;
    const customerRole = cookieStore.get("woo_customer_role")?.value;
    const token = cookieStore.get("woo_token")?.value;

    if (!customerId) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    // Try to fetch WooCommerce customer
    const cusRes = await fetch(
      `${WOO_URL}/wp-json/wc/v3/customers/${customerId}`,
      {
        headers: {
          Authorization: AUTH_HEADER,
          "Content-Type": "application/json",
        },
      }
    );

    if (cusRes.ok) {
      const customer = await cusRes.json();

      // Fetch recent orders
      const ordRes = await fetch(
        `${WOO_URL}/wp-json/wc/v3/orders?customer=${customerId}&per_page=20&orderby=date&order=desc`,
        {
          headers: {
            Authorization: AUTH_HEADER,
            "Content-Type": "application/json",
          },
        }
      );

      let orders: unknown[] = [];
      if (ordRes.ok) {
        orders = await ordRes.json();
      }

      return NextResponse.json({
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        role: customer.role || customerRole || "customer",
        billing: customer.billing,
        shipping: customer.shipping,
        meta_data: customer.meta_data || [],
        orders,
      });
    }

    // WooCommerce customer not found — likely an admin user
    // Use JWT token to fetch WordPress user data
    if (token) {
      const meRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (meRes.ok) {
        const wpUser = await meRes.json();

        // Fetch all orders (admins can see all, but filter by email)
        let orders: unknown[] = [];
        if (customerEmail) {
          const ordRes = await fetch(
            `${WOO_URL}/wp-json/wc/v3/orders?search=${encodeURIComponent(customerEmail)}&per_page=20&orderby=date&order=desc`,
            {
              headers: {
                Authorization: AUTH_HEADER,
                "Content-Type": "application/json",
              },
            }
          );
          if (ordRes.ok) {
            orders = await ordRes.json();
          }
        }

        const nameParts = (wpUser.name || "").split(" ");
        return NextResponse.json({
          id: wpUser.id,
          email: customerEmail || wpUser.slug + "@uncuttv.at",
          firstName: nameParts[0] || wpUser.slug || "",
          lastName: nameParts.slice(1).join(" ") || "",
          role: customerRole || "administrator",
          billing: {},
          shipping: {},
          orders,
        });
      }
    }

    // Fallback: return minimal data from cookies
    return NextResponse.json({
      id: parseInt(customerId),
      email: customerEmail || "",
      firstName: "",
      lastName: "",
      role: customerRole || "customer",
      billing: {},
      shipping: {},
      orders: [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fehler beim Laden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
