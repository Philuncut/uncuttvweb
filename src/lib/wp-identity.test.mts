import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import jwt from "jsonwebtoken";

/**
 * Die Token-Prüfung ohne hinterlegten Signaturschlüssel.
 *
 * So läuft der Dienst heute: WP_JWT_SECRET ist nicht gesetzt, über Gültig
 * oder Ungültig entscheidet WordPress. Abgelaufene Tokens fliegen trotzdem
 * ohne Netzaufruf raus, weil das Ablaufdatum auch ohne Schlüssel lesbar
 * ist.
 */

process.env.WOOCOMMERCE_URL = "https://wp.test";
delete process.env.WP_JWT_SECRET;

const { resolveIdentity, resetIdentityCache } = await import(
  "@/lib/wp-identity"
);

type Anfrage = { url: string; authorization: string | null };

let anfragen: Anfrage[] = [];
let antwort: () => Response;

function tokenMitAblauf(sekundenAbJetzt: number): string {
  return jwt.sign(
    { data: { user: { id: 11 } } },
    "irgendein-schluessel-den-wir-nicht-kennen",
    { expiresIn: sekundenAbJetzt }
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const NUTZER = {
  id: 11,
  email: "anton@example.com",
  roles: ["customer"],
};

beforeEach(() => {
  resetIdentityCache();
  anfragen = [];
  antwort = () => json(200, NUTZER);

  globalThis.fetch = ((eingabe: unknown, init: RequestInit = {}) => {
    const kopf = new Headers(init.headers ?? {});
    anfragen.push({
      url: String(eingabe),
      authorization: kopf.get("authorization"),
    });
    return Promise.resolve(antwort());
  }) as unknown as typeof fetch;
});

describe("Ein gültiges Token", () => {
  it("liefert Nummer, Mailadresse und Rollen aus WordPress", async () => {
    const result = await resolveIdentity(tokenMitAblauf(3600));

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    assert.equal(result.identity.wpUserId, 11);
    assert.equal(result.identity.email, "anton@example.com");
    assert.deepEqual(result.identity.roles, ["customer"]);
  });

  it("wird als Bearer geschickt, nicht als Cookie ausgewertet", async () => {
    const token = tokenMitAblauf(3600);
    await resolveIdentity(token);

    assert.equal(anfragen.length, 1);
    assert.match(anfragen[0].url, /\/wp-json\/wp\/v2\/users\/me/);
    assert.equal(anfragen[0].authorization, `Bearer ${token}`);
  });

  it("wird innerhalb der Pufferzeit nur einmal nachgefragt", async () => {
    const token = tokenMitAblauf(3600);
    await resolveIdentity(token);
    await resolveIdentity(token);
    await resolveIdentity(token);

    assert.equal(anfragen.length, 1);
  });
});

describe("Ein abgelaufenes Token", () => {
  it("gilt nicht mehr", async () => {
    const result = await resolveIdentity(tokenMitAblauf(-60));
    assert.equal(result.status, "invalid");
  });

  it("löst dafür nicht einmal einen Aufruf nach WordPress aus", async () => {
    await resolveIdentity(tokenMitAblauf(-60));
    assert.equal(anfragen.length, 0);
  });
});

describe("Ein gefälschtes Token", () => {
  it("gilt nicht, weil WordPress es ablehnt", async () => {
    antwort = () =>
      json(401, { code: "jwt_auth_invalid_token", message: "Invalid token" });

    const result = await resolveIdentity(tokenMitAblauf(3600));
    assert.equal(result.status, "invalid");
  });

  it("gilt auch dann nicht, wenn es gar kein JWT ist", async () => {
    antwort = () => json(403, { code: "jwt_auth_no_auth_header" });

    const result = await resolveIdentity("voelliger-unsinn");
    assert.equal(result.status, "invalid");
  });

  it("führt bei leerem Wert zu keiner Anfrage", async () => {
    const result = await resolveIdentity("   ");
    assert.equal(result.status, "invalid");
    assert.equal(anfragen.length, 0);
  });
});

describe("Wenn WordPress nicht antwortet", () => {
  it("wird keine Aussage getroffen", async () => {
    antwort = () => {
      throw new TypeError("fetch failed");
    };

    const result = await resolveIdentity(tokenMitAblauf(3600));
    assert.equal(result.status, "unavailable");
  });

  it("wird der Ausfall nicht gepuffert", async () => {
    antwort = () => {
      throw new TypeError("fetch failed");
    };
    const token = tokenMitAblauf(3600);
    await resolveIdentity(token);

    // Sonst bliebe nach dem Ende des Ausfalls eine Minute lang niemand
    // angemeldet.
    antwort = () => json(200, NUTZER);
    const result = await resolveIdentity(token);
    assert.equal(result.status, "ok");
  });

  it("gilt auch ein Serverfehler als Ausfall, nicht als Ablehnung", async () => {
    antwort = () => json(500, { message: "kaputt" });

    const result = await resolveIdentity(tokenMitAblauf(3600));
    assert.equal(result.status, "unavailable");
  });
});

describe("Eine unbrauchbare Antwort", () => {
  it("gilt nicht als Anmeldung", async () => {
    antwort = () => json(200, { roles: ["administrator"] });

    const result = await resolveIdentity(tokenMitAblauf(3600));
    assert.equal(result.status, "unavailable");
  });
});
