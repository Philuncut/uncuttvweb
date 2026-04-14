import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const GHOST_API_URL = process.env.GHOST_API_URL;
const GHOST_ADMIN_API_KEY = process.env.GHOST_ADMIN_API_KEY;

function createGhostToken(): string | null {
  if (!GHOST_ADMIN_API_KEY) return null;

  // Ghost Admin API key format: {id}:{secret} — but env may have extra "id:" prefix
  const parts = GHOST_ADMIN_API_KEY.split(":");
  // Take last two parts (handles both "id:secret" and "prefix:id:secret")
  const id = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  const secret = parts[parts.length - 1];
  if (!id || !secret) return null;

  console.log("[Newsletter] JWT — id:", id);
  console.log("[Newsletter] JWT — secret length:", secret.length);

  const iat = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { iat, exp: iat + 5 * 60, aud: "/admin/" },
    Buffer.from(secret, "hex"),
    {
      algorithm: "HS256",
      header: { alg: "HS256", kid: id, typ: "JWT" },
    }
  );

  console.log("[Newsletter] JWT token generated:", token.slice(0, 50) + "...");
  return token;
}

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email: string };

    console.log("[Newsletter] Subscribe request for:", email);
    console.log("[Newsletter] GHOST_API_URL:", GHOST_API_URL);
    console.log("[Newsletter] GHOST_ADMIN_API_KEY prefix:", GHOST_ADMIN_API_KEY?.slice(0, 10));

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }

    if (!GHOST_API_URL || !GHOST_ADMIN_API_KEY) {
      console.log("[Newsletter] Ghost not configured, skipping");
      return NextResponse.json({ success: true });
    }

    const token = createGhostToken();
    if (!token) {
      console.error("[Newsletter] Failed to create Ghost JWT token");
      return NextResponse.json({ success: true });
    }

    const url = `${GHOST_API_URL}/ghost/api/admin/members/`;
    const body = {
      members: [
        {
          email,
          subscribed: true,
          labels: [{ name: "shop-subscriber" }],
        },
      ],
    };

    console.log("[Newsletter] Request URL:", url);
    console.log("[Newsletter] Request body:", JSON.stringify(body, null, 2));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Ghost ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const resBody = await res.text();
    console.log("[Newsletter] Ghost response status:", res.status);
    console.log("[Newsletter] Ghost response body:", resBody.slice(0, 500));

    if (res.ok) {
      console.log("[Newsletter] Successfully subscribed:", email);
      return NextResponse.json({ success: true });
    }

    if (res.status === 409 || res.status === 422) {
      console.log("[Newsletter] Member already exists:", email);
      return NextResponse.json({ success: true });
    }

    console.error("[Newsletter] Ghost API error:", res.status);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Newsletter] Error:", error);
    return NextResponse.json(
      { error: "Anmeldung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
