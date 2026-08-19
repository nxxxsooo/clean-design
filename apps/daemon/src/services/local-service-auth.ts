/**
 * @module local-service-auth
 *
 * Challenge-response authentication for the shared local service.
 *
 * Possession of the owner-only `mcp-secret` file is the credential. A client
 * proves it without transmitting it: the daemon issues a random server
 * nonce, the client returns an HMAC over both nonces plus the challenge id
 * and the requested role, and the daemon recomputes and compares in
 * constant time.
 *
 * Every HMAC input is domain-separated by a version string so a value
 * produced for one purpose can never be replayed as another. Challenges and
 * lease nonces are single-use.
 */

import { createHmac, randomUUID, randomBytes, timingSafeEqual } from "node:crypto";

import {
  CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION,
  type AcquireServiceClientInput,
  type ServiceChallengeInput,
  type ServiceChallengeResult,
  type ServiceLease,
  type SignedServiceLeaseInput,
} from "@open-design/sidecar-proto";

import type { ServiceLeaseRecord, ServiceLeaseRegistry } from "./local-service-leases.js";

const PROOF_DOMAIN = "clean-design/service/proof/v1";
const SERVER_PROOF_DOMAIN = "clean-design/service/server-proof/v1";
const SESSION_DOMAIN = "clean-design/service/session/v1";
const RENEW_DOMAIN = "clean-design/service/renew/v1";
const RELEASE_DOMAIN = "clean-design/service/release/v1";

/** Challenges are short-lived; a handshake that stalls this long is retried. */
const CHALLENGE_TTL_MS = 30_000;
/** Bound the outstanding-challenge table so a spammer cannot grow it without limit. */
const MAX_OUTSTANDING_CHALLENGES = 64;
/** Signed lease requests must be recent; this tolerates modest clock drift. */
const LEASE_SIGNATURE_SKEW_MS = 30_000;

export class LocalServiceAuthError extends Error {
  readonly code: "AUTH_FAILED" | "PROTOCOL_MISMATCH";

  constructor(code: "AUTH_FAILED" | "PROTOCOL_MISMATCH", message: string) {
    super(`${code}: ${message}`);
    this.name = "LocalServiceAuthError";
    this.code = code;
  }
}

export interface LocalServiceAuthenticator {
  acquire(input: AcquireServiceClientInput): { lease: ServiceLease; sessionKey: Buffer };
  issueChallenge(input: ServiceChallengeInput): ServiceChallengeResult;
  sessionKey(leaseId: string): Buffer | null;
  verifyLeaseInput(input: SignedServiceLeaseInput, action: "renew" | "release"): ServiceLeaseRecord;
}

export type LocalServiceAuthenticatorOptions = {
  clock?: () => number;
  leaseRegistry: ServiceLeaseRegistry;
  secret: Buffer;
};

type OutstandingChallenge = {
  clientNonce: string;
  expiresAtMs: number;
  role: string;
  serverNonce: string;
};

function hmac(key: Buffer, domain: string, parts: readonly string[]): Buffer {
  const mac = createHmac("sha256", key).update(domain);
  for (const part of parts) {
    mac.update("\u0000").update(part);
  }
  return mac.digest();
}

/** Constant-time compare that also tolerates length mismatch without throwing. */
function safeEquals(expected: Buffer, candidate: string): boolean {
  let provided: Buffer;
  try {
    provided = Buffer.from(candidate, "base64url");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

export function createLocalServiceAuthenticator(
  options: LocalServiceAuthenticatorOptions,
): LocalServiceAuthenticator {
  const clock = options.clock ?? Date.now;
  const { leaseRegistry, secret } = options;
  const challenges = new Map<string, OutstandingChallenge>();
  const usedLeaseNonces = new Map<string, number>();

  function dropExpiredChallenges(): void {
    const now = clock();
    for (const [id, challenge] of challenges) {
      if (challenge.expiresAtMs <= now) challenges.delete(id);
    }
    for (const [nonce, expiresAtMs] of usedLeaseNonces) {
      if (expiresAtMs <= now) usedLeaseNonces.delete(nonce);
    }
  }

  return {
    issueChallenge(input) {
      if (input.protocolVersion !== CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION) {
        throw new LocalServiceAuthError(
          "PROTOCOL_MISMATCH",
          `client speaks protocol ${input.protocolVersion}`,
        );
      }

      dropExpiredChallenges();
      if (challenges.size >= MAX_OUTSTANDING_CHALLENGES) {
        throw new LocalServiceAuthError("AUTH_FAILED", "too many outstanding challenges");
      }

      const challengeId = randomUUID();
      const serverNonce = randomBytes(32).toString("base64url");
      const expiresAtMs = clock() + CHALLENGE_TTL_MS;
      challenges.set(challengeId, {
        clientNonce: input.clientNonce,
        expiresAtMs,
        role: input.role,
        serverNonce,
      });

      return {
        challengeId,
        expiresAt: new Date(expiresAtMs).toISOString(),
        serverNonce,
      };
    },

    acquire(input) {
      if (input.protocolVersion !== CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION) {
        throw new LocalServiceAuthError(
          "PROTOCOL_MISMATCH",
          `client speaks protocol ${input.protocolVersion}`,
        );
      }

      dropExpiredChallenges();
      const challenge = challenges.get(input.challengeId);
      // Consume before verifying so a failed attempt cannot be retried
      // against the same server nonce.
      challenges.delete(input.challengeId);

      if (!challenge) {
        throw new LocalServiceAuthError("AUTH_FAILED", "unknown or expired challenge");
      }
      if (
        challenge.clientNonce !== input.clientNonce ||
        challenge.serverNonce !== input.serverNonce ||
        challenge.role !== input.role
      ) {
        throw new LocalServiceAuthError("AUTH_FAILED", "challenge binding mismatch");
      }

      const expected = hmac(secret, PROOF_DOMAIN, [
        input.challengeId,
        input.clientNonce,
        input.serverNonce,
        input.role,
      ]);
      if (!safeEquals(expected, input.proof)) {
        throw new LocalServiceAuthError("AUTH_FAILED", "invalid client proof");
      }

      const sessionKey = hmac(secret, SESSION_DOMAIN, [
        input.challengeId,
        input.clientNonce,
        input.serverNonce,
        input.role,
      ]);
      const record = leaseRegistry.acquire({ role: input.role, sessionKey });

      // The server proof lets the client confirm it is talking to a daemon
      // that also holds the secret, not an impostor socket.
      const serverProof = hmac(secret, SERVER_PROOF_DOMAIN, [
        record.leaseId,
        input.clientNonce,
        input.serverNonce,
      ]).toString("base64url");

      return {
        lease: {
          expiresAt: record.expiresAt,
          leaseId: record.leaseId,
          role: record.role,
          serverProof,
        },
        sessionKey,
      };
    },

    sessionKey(leaseId) {
      return leaseRegistry.sessionKey(leaseId);
    },

    verifyLeaseInput(input, action) {
      dropExpiredChallenges();

      const sessionKey = leaseRegistry.sessionKey(input.leaseId);
      if (!sessionKey) {
        throw new LocalServiceAuthError("AUTH_FAILED", "unknown lease");
      }

      const expiresAtMs = Date.parse(input.expiresAt);
      const now = clock();
      if (!Number.isFinite(expiresAtMs) || Math.abs(expiresAtMs - now) > LEASE_SIGNATURE_SKEW_MS * 2) {
        throw new LocalServiceAuthError("AUTH_FAILED", "lease request expiry is out of range");
      }

      const replayKey = `${input.leaseId}:${input.nonce}`;
      if (usedLeaseNonces.has(replayKey)) {
        throw new LocalServiceAuthError("AUTH_FAILED", "lease nonce was already used");
      }

      const domain = action === "renew" ? RENEW_DOMAIN : RELEASE_DOMAIN;
      const expected = hmac(sessionKey, domain, [input.leaseId, input.nonce, input.expiresAt]);
      if (!safeEquals(expected, input.signature)) {
        throw new LocalServiceAuthError("AUTH_FAILED", `invalid ${action} signature`);
      }

      usedLeaseNonces.set(replayKey, now + LEASE_SIGNATURE_SKEW_MS * 2);

      return action === "renew"
        ? leaseRegistry.renew(input.leaseId)
        : (() => {
            const record = leaseRegistry.find(input.leaseId);
            if (!record) throw new LocalServiceAuthError("AUTH_FAILED", "unknown lease");
            leaseRegistry.release(input.leaseId);
            return record;
          })();
    },
  };
}
