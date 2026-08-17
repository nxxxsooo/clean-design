import { createHmac, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createLocalServiceAuthenticator } from "../../src/services/local-service-auth.js";
import { createServiceLeaseRegistry } from "../../src/services/local-service-leases.js";

const secret = Buffer.alloc(32, 9);

function setup(clock?: () => number) {
  const leaseRegistry = createServiceLeaseRegistry(clock ? { clock } : undefined);
  const auth = createLocalServiceAuthenticator(
    clock ? { clock, leaseRegistry, secret } : { leaseRegistry, secret },
  );
  return { auth, leaseRegistry };
}

function clientProof(input: {
  challengeId: string;
  clientNonce: string;
  role: string;
  serverNonce: string;
}): string {
  return createHmac("sha256", secret)
    .update("clean-design/service/proof/v1")
    .update("\u0000")
    .update(input.challengeId)
    .update("\u0000")
    .update(input.clientNonce)
    .update("\u0000")
    .update(input.serverNonce)
    .update("\u0000")
    .update(input.role)
    .digest("base64url");
}

function acquireInput(challenge: { challengeId: string; serverNonce: string }, clientNonce: string) {
  return {
    challengeId: challenge.challengeId,
    clientNonce,
    proof: clientProof({
      challengeId: challenge.challengeId,
      clientNonce,
      role: "mcp",
      serverNonce: challenge.serverNonce,
    }),
    protocolVersion: 1 as const,
    role: "mcp" as const,
    serverNonce: challenge.serverNonce,
  };
}

describe("createLocalServiceAuthenticator", () => {
  it("accepts a correct proof and issues a lease with a session key", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });

    const acquired = auth.acquire(acquireInput(challenge, clientNonce));

    expect(acquired.lease.role).toBe("mcp");
    expect(acquired.lease.serverProof).toEqual(expect.any(String));
    expect(acquired.sessionKey).toHaveLength(32);
  });

  it("rejects an unsupported protocol version before doing any crypto work", () => {
    const { auth } = setup();
    expect(() =>
      auth.issueChallenge({
        clientNonce: randomBytes(32).toString("base64url"),
        protocolVersion: 2,
        role: "mcp",
      }),
    ).toThrow(/PROTOCOL_MISMATCH/);
  });

  it("rejects a forged proof", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });

    expect(() =>
      auth.acquire({
        ...acquireInput(challenge, clientNonce),
        proof: randomBytes(32).toString("base64url"),
      }),
    ).toThrow(/AUTH_FAILED/);
  });

  it("rejects a proof bound to a different role", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });

    expect(() =>
      auth.acquire({
        ...acquireInput(challenge, clientNonce),
        proof: clientProof({
          challengeId: challenge.challengeId,
          clientNonce,
          role: "desktop",
          serverNonce: challenge.serverNonce,
        }),
      }),
    ).toThrow(/AUTH_FAILED/);
  });

  it("rejects an altered server nonce", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });

    expect(() =>
      auth.acquire({
        ...acquireInput(challenge, clientNonce),
        serverNonce: randomBytes(32).toString("base64url"),
      }),
    ).toThrow(/AUTH_FAILED/);
  });

  it("consumes each challenge exactly once", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });
    const input = acquireInput(challenge, clientNonce);

    auth.acquire(input);
    expect(() => auth.acquire(input)).toThrow(/AUTH_FAILED/);
  });

  it("rejects an expired challenge", () => {
    let now = 1_000;
    const { auth } = setup(() => now);
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });

    now += 120_000;

    expect(() => auth.acquire(acquireInput(challenge, clientNonce))).toThrow(/AUTH_FAILED/);
  });

  it("verifies renew and release signatures bound to the lease session key", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });
    const acquired = auth.acquire(acquireInput(challenge, clientNonce));

    const nonce = randomBytes(16).toString("base64url");
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const signature = createHmac("sha256", acquired.sessionKey)
      .update("clean-design/service/renew/v1")
      .update("\u0000")
      .update(acquired.lease.leaseId)
      .update("\u0000")
      .update(nonce)
      .update("\u0000")
      .update(expiresAt)
      .digest("base64url");

    const lease = auth.verifyLeaseInput(
      { expiresAt, leaseId: acquired.lease.leaseId, nonce, signature },
      "renew",
    );
    expect(lease.role).toBe("mcp");

    // The same nonce must not be replayable.
    expect(() =>
      auth.verifyLeaseInput(
        { expiresAt, leaseId: acquired.lease.leaseId, nonce, signature },
        "renew",
      ),
    ).toThrow(/AUTH_FAILED/);
  });

  it("rejects a renew signature replayed as a release", () => {
    const { auth } = setup();
    const clientNonce = randomBytes(32).toString("base64url");
    const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: "mcp" });
    const acquired = auth.acquire(acquireInput(challenge, clientNonce));

    const nonce = randomBytes(16).toString("base64url");
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const renewSignature = createHmac("sha256", acquired.sessionKey)
      .update("clean-design/service/renew/v1")
      .update("\u0000")
      .update(acquired.lease.leaseId)
      .update("\u0000")
      .update(nonce)
      .update("\u0000")
      .update(expiresAt)
      .digest("base64url");

    expect(() =>
      auth.verifyLeaseInput(
        { expiresAt, leaseId: acquired.lease.leaseId, nonce, signature: renewSignature },
        "release",
      ),
    ).toThrow(/AUTH_FAILED/);
  });

  it("does not leak session keys for unknown leases", () => {
    const { auth } = setup();
    expect(auth.sessionKey("never-issued")).toBeNull();
  });
});
