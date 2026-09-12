import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectCandidates,
  denialForPortal,
  denialForSession,
  denialForWholesale,
  mayEnterHaendlerPortal,
  resolveSession,
  type VerifiedSession,
} from "@/lib/session-core";
import type { IdentityResult } from "@/lib/wp-identity";

/**
 * Die geschlossenen Lücken.
 *
 * Vorher entschied die Anwesenheit eines Cookies. Diese Tests halten fest,
 * dass jetzt allein das Token entscheidet und dass ein Nutzer nur zu seinen
 * eigenen Daten kommt.
 */

const ANTON: IdentityResult = {
  status: "ok",
  identity: { wpUserId: 11, email: "anton@example.com", roles: ["customer"] },
};

const BERTA: IdentityResult = {
  status: "ok",
  identity: { wpUserId: 22, email: "berta@example.com", roles: ["customer"] },
};

const HAENDLERIN: IdentityResult = {
  status: "ok",
  identity: {
    wpUserId: 33,
    email: "haendlerin@example.com",
    roles: ["wholesale"],
  },
};

/** Tut so, als kennte WordPress nur die hinterlegten Tokens. */
function auflöserFür(
  bekannt: Record<string, IdentityResult>
): (token: string) => Promise<IdentityResult> {
  return async (token) => bekannt[token] ?? { status: "invalid" };
}

describe("Gefälschte Cookies ohne gültiges Token", () => {
  it("führen zu einer Absage mit 401", async () => {
    const result = await resolveSession(
      collectCandidates("selbst-gesetzt", "auch-selbst-gesetzt"),
      auflöserFür({})
    );

    assert.equal(result.status, "invalid");

    const denial = denialForSession(result);
    assert.equal(denial?.status, 401);
    // Ein wertloses Token fliegt samt Cookies raus.
    assert.equal(denial?.clearCookies, true);
  });

  it("gelten auch dann nicht, wenn sie nach einem echten Nutzer aussehen", async () => {
    // Frueher genuegte woo_customer_id plus irgendein woo_token. Der Inhalt
    // der uebrigen Cookies spielt jetzt ueberhaupt keine Rolle mehr.
    const result = await resolveSession(
      collectCandidates(undefined, "token-von-nirgendwo"),
      auflöserFür({ "echtes-token": ANTON })
    );

    assert.equal(result.status, "invalid");
  });

  it("ohne jedes Token gilt der Aufrufer als anonym", async () => {
    const result = await resolveSession(
      collectCandidates(undefined, undefined),
      auflöserFür({})
    );

    assert.equal(result.status, "anonymous");

    const denial = denialForSession(result);
    assert.equal(denial?.status, 401);
    // Es gibt nichts aufzuräumen.
    assert.equal(denial?.clearCookies, false);
  });
});

describe("Ein Token gehört genau einem Nutzer", () => {
  it("liefert die Identität aus dem Token, nicht aus den Cookies", async () => {
    const result = await resolveSession(
      collectCandidates(undefined, "token-anton"),
      auflöserFür({ "token-anton": ANTON, "token-berta": BERTA })
    );

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    assert.equal(result.session.wpUserId, 11);
    assert.equal(result.session.customerId, 11);
    assert.equal(result.session.email, "anton@example.com");
  });

  it("gibt mit Antons Token niemals Bertas Nummer heraus", async () => {
    const antons = await resolveSession(
      collectCandidates(undefined, "token-anton"),
      auflöserFür({ "token-anton": ANTON, "token-berta": BERTA })
    );
    const bertas = await resolveSession(
      collectCandidates(undefined, "token-berta"),
      auflöserFür({ "token-anton": ANTON, "token-berta": BERTA })
    );

    assert.equal(antons.status, "ok");
    assert.equal(bertas.status, "ok");
    if (antons.status !== "ok" || bertas.status !== "ok") return;

    assert.notEqual(antons.session.customerId, bertas.session.customerId);
    assert.equal(antons.session.customerId, 11);
    assert.equal(bertas.session.customerId, 22);
  });
});

describe("Die Rolle stammt aus WordPress", () => {
  it("macht aus einem Kunden keinen Händler", async () => {
    const result = await resolveSession(
      collectCandidates("token-anton", undefined),
      auflöserFür({ "token-anton": ANTON })
    );

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    // Das Token kam über das Händler-Cookie. Frueher haette allein das
    // gereicht; jetzt zaehlt die Rolle, die WordPress nennt.
    assert.equal(result.session.source, "haendler");
    assert.equal(result.session.isWholesale, false);
    assert.equal(mayEnterHaendlerPortal(result.session), false);
    assert.equal(denialForPortal(result.session)?.status, 403);
    assert.equal(denialForWholesale(result.session)?.status, 403);
  });

  it("erkennt eine echte Händlerin", async () => {
    const result = await resolveSession(
      collectCandidates("token-haendlerin", undefined),
      auflöserFür({ "token-haendlerin": HAENDLERIN })
    );

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    assert.equal(result.session.isWholesale, true);
    assert.equal(denialForPortal(result.session), null);
    assert.equal(denialForWholesale(result.session), null);
  });

  it("lässt Administratoren ins Portal, ohne sie zu Händlern zu machen", () => {
    const admin: VerifiedSession = {
      wpUserId: 1,
      customerId: 1,
      email: "admin@example.com",
      roles: ["administrator"],
      isWholesale: false,
      source: "haendler",
      token: "token-admin",
    };

    assert.equal(denialForPortal(admin), null);
    // Sonst würden sie im B2C-Shop umgeleitet.
    assert.equal(denialForWholesale(admin)?.status, 403);
  });
});

describe("Ein Ausfall von WordPress", () => {
  it("meldet 503 und lässt die Cookies in Ruhe", async () => {
    const result = await resolveSession(
      collectCandidates(undefined, "token-anton"),
      async () => ({ status: "unavailable" })
    );

    assert.equal(result.status, "unavailable");

    const denial = denialForSession(result);
    assert.equal(denial?.status, 503);
    // Ein kurzer Ausfall darf niemanden dauerhaft abmelden.
    assert.equal(denial?.clearCookies, false);
  });
});

describe("Zwei Tokens in den Cookies", () => {
  it("nimmt das gültige, auch wenn das erste nichts taugt", async () => {
    const result = await resolveSession(
      collectCandidates("totes-token", "token-anton"),
      auflöserFür({ "token-anton": ANTON })
    );

    assert.equal(result.status, "ok");
  });

  it("prüft ein doppelt gesetztes Token nur einmal", async () => {
    let aufrufe = 0;
    await resolveSession(
      collectCandidates("dasselbe", "dasselbe"),
      async () => {
        aufrufe += 1;
        return { status: "invalid" };
      }
    );

    assert.equal(aufrufe, 1);
  });
});
