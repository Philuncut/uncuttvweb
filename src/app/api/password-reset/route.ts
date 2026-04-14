import { NextResponse } from "next/server";

const WOO_URL = process.env.WOOCOMMERCE_URL!;

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }

    await fetch(`${WOO_URL}/wp-login.php?action=lostpassword`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        user_login: email,
        redirect_to: "",
        "wp-submit": "Neues Passwort",
      }).toString(),
    });

    // Always return success — don't reveal whether account exists
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PasswordReset] Error:", error);
    return NextResponse.json({ success: true });
  }
}
