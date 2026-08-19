/**
 * @module local-service-leases
 *
 * In-memory registry of live clients on the shared local service boundary.
 *
 * A lease is the unit of "someone still needs this daemon". The visible
 * desktop holds one, each plugin bridge holds one, and the daemon only
 * becomes idle-eligible when the last lease is gone. Leases expire on their
 * own so a client that crashes without releasing cannot pin the service
 * open or consume capacity forever.
 *
 * Session keys live here and are never persisted to disk.
 */

import { randomUUID } from "node:crypto";

import {
  CLEAN_DESIGN_SERVICE_LIMITS,
  type ServiceClientRole,
  type ServiceStatusSnapshot,
} from "@open-design/sidecar-proto";

export type ServiceLeaseRecord = {
  expiresAt: string;
  leaseId: string;
  role: ServiceClientRole;
};

export type ServiceLeaseRegistryOptions = {
  clock?: () => number;
};

export type AcquireLeaseInput = {
  role: ServiceClientRole;
  sessionKey: Buffer;
};

export type IdleEligibilityInput = {
  activeOperations?: number;
  activeRenders?: number;
};

export interface ServiceLeaseRegistry {
  acquire(input: AcquireLeaseInput): ServiceLeaseRecord;
  find(leaseId: string): ServiceLeaseRecord | null;
  isIdleEligible(input?: IdleEligibilityInput): boolean;
  reclaimExpired(): number;
  release(leaseId: string): void;
  renew(leaseId: string): ServiceLeaseRecord;
  sessionKey(leaseId: string): Buffer | null;
  status(): Pick<ServiceStatusSnapshot, "activeClients">;
}

type InternalLease = ServiceLeaseRecord & {
  expiresAtMs: number;
  sessionKey: Buffer;
};

export class ServiceLeaseError extends Error {
  readonly code: "SERVICE_CAPACITY" | "LEASE_NOT_FOUND";

  constructor(code: "SERVICE_CAPACITY" | "LEASE_NOT_FOUND", message: string) {
    super(`${code}: ${message}`);
    this.name = "ServiceLeaseError";
    this.code = code;
  }
}

export function createServiceLeaseRegistry(
  options: ServiceLeaseRegistryOptions = {},
): ServiceLeaseRegistry {
  const clock = options.clock ?? Date.now;
  const leases = new Map<string, InternalLease>();

  function dropExpired(): number {
    const now = clock();
    let removed = 0;
    for (const [leaseId, lease] of leases) {
      if (lease.expiresAtMs <= now) {
        leases.delete(leaseId);
        removed += 1;
      }
    }
    return removed;
  }

  function toRecord(lease: InternalLease): ServiceLeaseRecord {
    return { expiresAt: lease.expiresAt, leaseId: lease.leaseId, role: lease.role };
  }

  function liveLease(leaseId: string): InternalLease {
    dropExpired();
    const lease = leases.get(leaseId);
    if (!lease) {
      throw new ServiceLeaseError("LEASE_NOT_FOUND", `no live lease for ${leaseId}`);
    }
    return lease;
  }

  return {
    acquire(input) {
      // Reclaim first so a burst of crashed clients does not permanently
      // occupy the capacity budget.
      dropExpired();
      if (leases.size >= CLEAN_DESIGN_SERVICE_LIMITS.clientCapacity) {
        throw new ServiceLeaseError(
          "SERVICE_CAPACITY",
          `service is at its ${CLEAN_DESIGN_SERVICE_LIMITS.clientCapacity} client limit`,
        );
      }

      const expiresAtMs = clock() + CLEAN_DESIGN_SERVICE_LIMITS.leaseTtlMs;
      const lease: InternalLease = {
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
        leaseId: randomUUID(),
        role: input.role,
        sessionKey: input.sessionKey,
      };
      leases.set(lease.leaseId, lease);
      return toRecord(lease);
    },

    find(leaseId) {
      dropExpired();
      const lease = leases.get(leaseId);
      return lease ? toRecord(lease) : null;
    },

    isIdleEligible(input = {}) {
      dropExpired();
      return (
        leases.size === 0 && (input.activeOperations ?? 0) === 0 && (input.activeRenders ?? 0) === 0
      );
    },

    reclaimExpired: dropExpired,

    release(leaseId) {
      leases.delete(leaseId);
    },

    renew(leaseId) {
      const lease = liveLease(leaseId);
      lease.expiresAtMs = clock() + CLEAN_DESIGN_SERVICE_LIMITS.leaseTtlMs;
      lease.expiresAt = new Date(lease.expiresAtMs).toISOString();
      return toRecord(lease);
    },

    sessionKey(leaseId) {
      dropExpired();
      return leases.get(leaseId)?.sessionKey ?? null;
    },

    status() {
      dropExpired();
      return { activeClients: leases.size };
    },
  };
}
