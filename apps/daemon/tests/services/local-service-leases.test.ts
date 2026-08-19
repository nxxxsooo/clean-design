import { CLEAN_DESIGN_SERVICE_LIMITS } from "@open-design/sidecar-proto";
import { describe, expect, it } from "vitest";

import { createServiceLeaseRegistry } from "../../src/services/local-service-leases.js";

const sessionKey = () => Buffer.alloc(32, 7);

describe("createServiceLeaseRegistry", () => {
  it("issues leases up to the fixed client capacity", () => {
    const registry = createServiceLeaseRegistry();
    for (let index = 0; index < CLEAN_DESIGN_SERVICE_LIMITS.clientCapacity; index += 1) {
      registry.acquire({ role: "mcp", sessionKey: sessionKey() });
    }

    expect(registry.status().activeClients).toBe(CLEAN_DESIGN_SERVICE_LIMITS.clientCapacity);
    expect(() => registry.acquire({ role: "mcp", sessionKey: sessionKey() })).toThrow(
      /SERVICE_CAPACITY/,
    );
  });

  it("renews a live lease and extends its expiry", () => {
    let now = 1_000;
    const registry = createServiceLeaseRegistry({ clock: () => now });
    const lease = registry.acquire({ role: "mcp", sessionKey: sessionKey() });

    now += 10_000;
    const renewed = registry.renew(lease.leaseId);

    expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.parse(lease.expiresAt));
    expect(renewed.role).toBe("mcp");
  });

  it("frees capacity on release", () => {
    const registry = createServiceLeaseRegistry();
    const lease = registry.acquire({ role: "desktop", sessionKey: sessionKey() });

    registry.release(lease.leaseId);

    expect(registry.status().activeClients).toBe(0);
    expect(registry.sessionKey(lease.leaseId)).toBeNull();
  });

  it("reclaims expired leases so a crashed client cannot hold capacity", () => {
    let now = 1_000;
    const registry = createServiceLeaseRegistry({ clock: () => now });
    registry.acquire({ role: "mcp", sessionKey: sessionKey() });

    now += CLEAN_DESIGN_SERVICE_LIMITS.leaseTtlMs + 1;
    expect(registry.reclaimExpired()).toBe(1);
    expect(registry.status().activeClients).toBe(0);
  });

  it("refuses to renew an expired or unknown lease", () => {
    let now = 1_000;
    const registry = createServiceLeaseRegistry({ clock: () => now });
    const lease = registry.acquire({ role: "mcp", sessionKey: sessionKey() });

    now += CLEAN_DESIGN_SERVICE_LIMITS.leaseTtlMs + 1;

    expect(() => registry.renew(lease.leaseId)).toThrow(/LEASE_NOT_FOUND/);
    expect(() => registry.renew("never-issued")).toThrow(/LEASE_NOT_FOUND/);
  });

  it("is idle eligible only with no leases and no active work", () => {
    const registry = createServiceLeaseRegistry();
    expect(registry.isIdleEligible()).toBe(true);

    const lease = registry.acquire({ role: "mcp", sessionKey: sessionKey() });
    expect(registry.isIdleEligible()).toBe(false);

    registry.release(lease.leaseId);
    expect(registry.isIdleEligible()).toBe(true);

    expect(registry.isIdleEligible({ activeOperations: 1 })).toBe(false);
  });

  it("keeps session keys per lease and never shares them", () => {
    const registry = createServiceLeaseRegistry();
    const first = registry.acquire({ role: "mcp", sessionKey: Buffer.alloc(32, 1) });
    const second = registry.acquire({ role: "mcp", sessionKey: Buffer.alloc(32, 2) });

    expect(registry.sessionKey(first.leaseId)?.equals(Buffer.alloc(32, 1))).toBe(true);
    expect(registry.sessionKey(second.leaseId)?.equals(Buffer.alloc(32, 2))).toBe(true);
  });

  it("reports the role that was fixed at acquire time", () => {
    const registry = createServiceLeaseRegistry();
    const lease = registry.acquire({ role: "desktop", sessionKey: sessionKey() });

    expect(registry.find(lease.leaseId)?.role).toBe("desktop");
  });
});
