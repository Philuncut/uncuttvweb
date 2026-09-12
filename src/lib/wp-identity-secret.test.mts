import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import jwt from "jsonwebtoken";

/**
 * Dieselbe Prüfung, aber mit hinterlegtem Signaturschlüssel.
 *
 * Sobald WP_JWT_SECRET gesetzt ist, fliegt ein gefälschtes Token schon
 * hier raus, ohne dass WordPress überhaupt gefragt wird. Eigene Datei,
 * weil das Modul die Umgebung beim Laden liest.
 */

const SCHLUESSEL = "der-schluessel-aus-der-wp-config";

process.env.WOOCOMMERCE_URL = "https://wp.test";
process.env.WP_JWT_SECRET = SCHLUESSEL;

const { resolveIdentity, resetIdentityCache } = await import(
  "@/lib/wp-identity"
);

let aufrufe = 0;

const NUTZER = { id: 11, email: "anton@example.com", roles: ["customer"] };

function echtesToken(sekunden = 3600): string {
  return jwt.sign({ data: { user: { id: 11 } } }, SCHLUESSEL, {
    expiresIn: sekunden,
  });
}

beforeEach(() => {
  resetIdentityCache();
  aufrufe = 0;
  globalThis.fetch = (() => {
    aufrufe += 1;
    return Promise.resolve(
      new Response(JSON.stringify(NUTZER), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  }) as unknown as typeof fetch;
});

describe("Mit hinterlegtem Schlüssel", () => {
  it("geht ein echtes Token durch", async () => {
    const result = await resolveIdentity(echtesToken());

    assert.equal(result.status, "ok");
    assert.equal(aufrufe, 1);
  });

  it("fliegt ein fremd signiertes Token ohne Netzaufruf raus", async () => {
    const gefaelscht = jwt.sign(
      { data: { user: { id: 1 } } },
      "ein-anderer-schluessel",
      { expiresIn: 3600 }
    );

    const result = await resolveIdentity(gefaelscht);

    assert.equal(result.status, "invalid");
    // Genau der Gewinn des hinterlegten Schlüssels: WordPress wird dafür
    // gar nicht erst behelligt.
    assert.equal(aufrufe, 0);
  });

  it("fliegt ein abgelaufenes Token ohne Netzaufruf raus", async () => {
    const result = await resolveIdentity(echtesToken(-60));

    assert.equal(result.status, "invalid");
    assert.equal(aufrufe, 0);
  });

  it("hilft auch ein selbst gebasteltes Token ohne Signatur nicht", async () => {
    const kopf = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" })
    ).toString("base64url");
    const nutzlast = Buffer.from(
      JSON.stringify({ data: { user: { id: 1 } }, exp: 4102444800 })
    ).toString("base64url");

    const result = await resolveIdentity(`${kopf}.${nutzlast}.`);

    assert.equal(result.status, "invalid");
    assert.equal(aufrufe, 0);
  });
});
