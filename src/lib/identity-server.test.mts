import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

/**
 * Der Zugriff auf den Identitätsdienst.
 *
 * Der Dienst ist hinter einem ersetzten fetch. Geprüft wird, was der Shop
 * aus jeder Antwort macht -- vor allem, dass ein Ausfall nie wie ein
 * falsches Passwort aussieht und dass auseinandergelaufene Passwörter als
 * eigener Fall herauskommen.
 */

process.env.IDENTITY_URL = "https://id.test";

const {
  clientIpFrom,
  identityChangePassword,
  identityFailureResponse,
  identityLogin,
} = await import("@/lib/identity-server");

type Aufruf = {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

let aufrufe: Aufruf[] = [];
let antwort: () => Response;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SITZUNG = {
  access_token: "sb-access",
  refresh_token: "sb-refresh",
  user: {
    id: "c0ffee00-0000-4000-8000-000000000000",
    email: "gast@example.com",
    display_name: "Gast Gastl",
    roles: ["customer"],
  },
};

beforeEach(() => {
  aufrufe = [];
  delete process.env.IDENTITY_CALLER_SECRET;
  antwort = () =>
    json(200, { ...SITZUNG, wordpress: { status: "ok", token: "jwt.abc" } });

  globalThis.fetch = ((eingabe: unknown, init: RequestInit = {}) => {
    aufrufe.push({
      url: String(eingabe),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: { ...(init.headers as Record<string, string>) },
    });
    return Promise.resolve(antwort());
  }) as unknown as typeof fetch;
});

/** Die Kopfzeilen der Anfrage des Endnutzers an den Shop. */
function anfrage(kopf: Record<string, string>): Headers {
  return new Headers(kopf);
}

describe("identityLogin", () => {
  it("fordert das WordPress-Token an und liefert es mit Adresse und Namen", async () => {
    const result = await identityLogin("gast@example.com", "pw");

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.wordpressToken, "jwt.abc");
    assert.equal(result.email, "gast@example.com");
    assert.equal(result.displayName, "Gast Gastl");

    assert.equal(aufrufe.length, 1);
    assert.equal(aufrufe[0].url, "https://id.test/auth/login");
    assert.deepEqual(aufrufe[0].body, {
      email: "gast@example.com",
      password: "pw",
      wordpressToken: true,
    });
  });

  it("ruft jwt-auth nie direkt", async () => {
    await identityLogin("gast@example.com", "pw");
    assert.equal(
      aufrufe.some((a) => a.url.includes("jwt-auth")),
      false
    );
  });

  it("meldet auseinandergelaufene Passwörter als eigenen Fall", async () => {
    // Supabase hat angenommen, WordPress nicht. Kein falsches Passwort,
    // sondern der Moment, in dem der Nutzer neu setzen muss.
    antwort = () => json(200, { ...SITZUNG, wordpress: { status: "rejected" } });

    const result = await identityLogin("gast@example.com", "pw");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "out-of-sync" });
  });

  it("wertet ein nicht erreichbares WordPress als Ausfall", async () => {
    antwort = () =>
      json(200, { ...SITZUNG, wordpress: { status: "unavailable" } });

    const result = await identityLogin("gast@example.com", "pw");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "unavailable" });
  });

  it("meldet 401 als abgelehnt", async () => {
    antwort = () => json(401, { message: "Mailadresse oder Passwort ist falsch." });

    const result = await identityLogin("gast@example.com", "falsch");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "rejected" });
  });

  it("meldet 403 als unbestätigte Adresse, nicht als Ausfall", async () => {
    antwort = () =>
      json(403, {
        message: "Bitte bestätige zuerst den Link in der Willkommensmail.",
        error: "Forbidden",
        statusCode: 403,
      });

    const result = await identityLogin("gast@example.com", "richtig");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "unconfirmed" });
  });

  it("meldet 429 als gebremst", async () => {
    antwort = () => json(429, { message: "Zu viele Versuche." });

    const result = await identityLogin("gast@example.com", "pw");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "rate-limited" });
  });

  it("meldet einen Netzfehler als Ausfall, nicht als Ablehnung", async () => {
    antwort = () => {
      throw new TypeError("fetch failed");
    };

    const result = await identityLogin("gast@example.com", "pw");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "unavailable" });
  });

  it("meldet 503 als Ausfall", async () => {
    antwort = () => json(503, { message: "Anmeldung derzeit nicht möglich." });

    const result = await identityLogin("gast@example.com", "pw");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "unavailable" });
  });

  it("fällt auf die eingegebene Adresse zurück, wenn der Dienst keine nennt", async () => {
    antwort = () =>
      json(200, {
        ...SITZUNG,
        user: { ...SITZUNG.user, email: null, display_name: null },
        wordpress: { status: "ok", token: "jwt.abc" },
      });

    const result = await identityLogin("Gast@Example.com", "pw");

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.email, "Gast@Example.com");
    assert.equal(result.displayName, "");
  });
});

describe("identityChangePassword", () => {
  it("schickt alle drei Werte und fordert ein frisches Token an", async () => {
    antwort = () =>
      json(200, { status: "changed", wordpress: { status: "ok", token: "jwt.neu" } });

    const result = await identityChangePassword(
      "gast@example.com",
      "altes-pw",
      "neues-langes-pw"
    );

    assert.deepEqual(result, { ok: true, wordpressToken: "jwt.neu" });
    assert.equal(aufrufe[0].url, "https://id.test/auth/change-password");
    assert.deepEqual(aufrufe[0].body, {
      email: "gast@example.com",
      currentPassword: "altes-pw",
      newPassword: "neues-langes-pw",
      wordpressToken: true,
    });
  });

  it("gilt auch ohne Token als gelungen", async () => {
    // Passwort gesetzt, nur WordPress antwortete gerade nicht. Das
    // bisherige Token gilt weiter.
    antwort = () =>
      json(200, { status: "changed", wordpress: { status: "unavailable" } });

    const result = await identityChangePassword("gast@example.com", "a", "b-lang-genug");

    assert.deepEqual(result, { ok: true, wordpressToken: null });
  });

  it("meldet ein falsches aktuelles Passwort als abgelehnt", async () => {
    antwort = () => json(401, { message: "Aktuelles Passwort ist falsch." });

    const result = await identityChangePassword("gast@example.com", "falsch", "neu-lang");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "rejected" });
  });

  it("reicht eine 400 des Dienstes mit Meldung durch", async () => {
    antwort = () => json(400, { message: "Das neue Passwort ist zu schwach." });

    const result = await identityChangePassword("gast@example.com", "a", "b");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, {
      kind: "invalid",
      message: "Das neue Passwort ist zu schwach.",
    });
  });

  it("meldet 503 als Ausfall", async () => {
    antwort = () => json(503, { message: "Es wurde nichts verändert." });

    const result = await identityChangePassword("gast@example.com", "a", "b-lang-genug");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.failure, { kind: "unavailable" });
  });
});

describe("identityFailureResponse", () => {
  it("gibt jedem Fall seinen eigenen Status", async () => {
    assert.equal(identityFailureResponse({ kind: "rejected" }).status, 401);
    assert.equal(identityFailureResponse({ kind: "out-of-sync" }).status, 409);
    assert.equal(identityFailureResponse({ kind: "rate-limited" }).status, 429);
    assert.equal(identityFailureResponse({ kind: "invalid" }).status, 400);
    assert.equal(identityFailureResponse({ kind: "unconfirmed" }).status, 403);
    assert.equal(identityFailureResponse({ kind: "unavailable" }).status, 503);
  });

  it("markiert den Abgleichfall maschinenlesbar", async () => {
    const body = (await identityFailureResponse({ kind: "out-of-sync" }).json()) as {
      code?: string;
    };
    assert.equal(body.code, "password_out_of_sync");
  });

  it("markiert die unbestätigte Adresse maschinenlesbar und nennt die Willkommensmail", async () => {
    const body = (await identityFailureResponse({ kind: "unconfirmed" }).json()) as {
      code?: string;
      error: string;
    };
    assert.equal(body.code, "email_unconfirmed");
    assert.match(body.error, /Willkommensmail/);
    // Weder wie ein falsches Passwort noch wie ein Ausfall.
    assert.equal(/passwort/i.test(body.error), false);
    assert.equal(/nicht möglich/i.test(body.error), false);
  });

  it("lässt einen Ausfall nicht wie ein falsches Passwort klingen", async () => {
    const body = (await identityFailureResponse({ kind: "unavailable" }).json()) as {
      error: string;
    };
    assert.equal(/passwort/i.test(body.error), false);
  });
});

describe("clientIpFrom", () => {
  it("nimmt x-real-ip, wie Vercel es setzt", () => {
    const ip = clientIpFrom(
      anfrage({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.9" })
    );
    assert.equal(ip, "203.0.113.5");
  });

  it("nimmt ersatzweise den ersten Eintrag von x-forwarded-for", () => {
    const ip = clientIpFrom(
      anfrage({ "x-forwarded-for": "198.51.100.9, 10.0.0.1, 10.0.0.2" })
    );
    assert.equal(ip, "198.51.100.9");
  });

  it("liefert null, wenn keine Adresse bestimmbar ist", () => {
    assert.equal(clientIpFrom(anfrage({})), null);
    assert.equal(clientIpFrom(anfrage({ "x-real-ip": "  " })), null);
    assert.equal(clientIpFrom(anfrage({ "x-forwarded-for": " , 10.0.0.1" })), null);
  });
});

describe("Weitergabe der Absenderadresse", () => {
  // Der Dienst zählt seine Grenze je Adresse. Ohne Weitergabe zählt er
  // gegen Vercel, also gegen alle Nutzer des Shops zusammen.

  it("weist sich aus und gibt die Adresse des Endnutzers mit", async () => {
    process.env.IDENTITY_CALLER_SECRET = "geheim";

    await identityLogin(
      "gast@example.com",
      "pw",
      anfrage({ "x-real-ip": "203.0.113.5" })
    );

    assert.equal(aufrufe[0].headers["X-UncutTV-Caller-Secret"], "geheim");
    assert.equal(aufrufe[0].headers["X-UncutTV-Client-IP"], "203.0.113.5");
  });

  it("auch beim Passwortwechsel", async () => {
    process.env.IDENTITY_CALLER_SECRET = "geheim";
    antwort = () =>
      json(200, { status: "changed", wordpress: { status: "ok", token: "jwt.neu" } });

    await identityChangePassword(
      "gast@example.com",
      "altes-pw",
      "neues-langes-pw",
      anfrage({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" })
    );

    assert.equal(aufrufe[0].headers["X-UncutTV-Caller-Secret"], "geheim");
    assert.equal(aufrufe[0].headers["X-UncutTV-Client-IP"], "198.51.100.9");
  });

  it("lässt den Adresskopf weg statt ihn leer zu setzen", async () => {
    process.env.IDENTITY_CALLER_SECRET = "geheim";

    await identityLogin("gast@example.com", "pw", anfrage({}));

    assert.equal(aufrufe[0].headers["X-UncutTV-Caller-Secret"], "geheim");
    assert.equal("X-UncutTV-Client-IP" in aufrufe[0].headers, false);
  });

  it("lässt den Adresskopf weg, wenn keine Anfragekopfzeilen übergeben wurden", async () => {
    process.env.IDENTITY_CALLER_SECRET = "geheim";

    await identityLogin("gast@example.com", "pw");

    assert.equal(aufrufe[0].headers["X-UncutTV-Caller-Secret"], "geheim");
    assert.equal("X-UncutTV-Client-IP" in aufrufe[0].headers, false);
  });

  it("schickt ohne Geheimnis keinen der beiden Köpfe, auch nicht die Adresse", async () => {
    // Der Dienst zählt dann wie bisher gegen die Adresse von Vercel. Eine
    // Adresse ohne Ausweis würde er ohnehin nicht annehmen.
    await identityLogin(
      "gast@example.com",
      "pw",
      anfrage({ "x-real-ip": "203.0.113.5" })
    );

    assert.equal("X-UncutTV-Caller-Secret" in aufrufe[0].headers, false);
    assert.equal("X-UncutTV-Client-IP" in aufrufe[0].headers, false);
  });

  it("wertet ein leeres Geheimnis wie ein fehlendes", async () => {
    process.env.IDENTITY_CALLER_SECRET = "   ";

    await identityLogin(
      "gast@example.com",
      "pw",
      anfrage({ "x-real-ip": "203.0.113.5" })
    );

    assert.equal("X-UncutTV-Caller-Secret" in aufrufe[0].headers, false);
    assert.equal("X-UncutTV-Client-IP" in aufrufe[0].headers, false);
  });

  it("lässt den Inhaltstyp unangetastet", async () => {
    process.env.IDENTITY_CALLER_SECRET = "geheim";

    await identityLogin("gast@example.com", "pw", anfrage({ "x-real-ip": "203.0.113.5" }));

    assert.equal(aufrufe[0].headers["Content-Type"], "application/json");
  });
});
