import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const WOO_URL = process.env.WOOCOMMERCE_URL!;

interface Body {
  currentPassword: string;
  newPassword: string;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const customerEmail = cookieStore.get("woo_customer_email")?.value;

    if (!customerEmail) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } =
      (await request.json()) as Body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Alle Felder sind erforderlich." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Das neue Passwort muss mindestens 8 Zeichen lang sein." },
        { status: 400 }
      );
    }

    // Verify current password via WordPress Basic Auth
    const currentAuth =
      "Basic " +
      Buffer.from(`${customerEmail}:${currentPassword}`).toString("base64");

    const verifyRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: currentAuth },
    });

    if (!verifyRes.ok) {
      return NextResponse.json(
        { error: "Aktuelles Passwort ist falsch." },
        { status: 401 }
      );
    }

    // Update password via WordPress REST API using current credentials
    const updateRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
      method: "POST",
      headers: {
        Authorization: currentAuth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });

    if (!updateRes.ok) {
      const err = await updateRes.text();
      console.error("[ChangePassword] WordPress update failed:", err);
      return NextResponse.json(
        { error: "Passwort konnte nicht geändert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ChangePassword] Error:", error);
    const message =
      error instanceof Error ? error.message : "Fehler beim Ändern des Passworts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
