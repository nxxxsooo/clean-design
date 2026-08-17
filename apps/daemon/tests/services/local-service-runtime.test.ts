import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION } from "@open-design/sidecar-proto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearServiceRuntimeDescriptor,
  readServiceRuntimeDescriptor,
  readServiceSecret,
  resolveServiceRuntimePaths,
  writeServiceRuntimeDescriptor,
  writeServiceSecret,
} from "../../src/services/local-service-runtime.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "clean-design-service-runtime-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    dataRootFingerprint: "/base",
    executableFingerprint: "/bin/node",
    internalUrl: "http://127.0.0.1:1234/",
    namespace: "demo",
    pid: 4242,
    protocolVersion: CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION,
    serviceVersion: "0.15.1",
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("resolveServiceRuntimePaths", () => {
  it("places private state beside the namespace socket", () => {
    const paths = resolveServiceRuntimePaths("/tmp/clean-design/ipc/demo/daemon.sock");

    expect(paths.root).toBe("/tmp/clean-design/ipc/demo");
    expect(paths.secretPath).toBe("/tmp/clean-design/ipc/demo/mcp-secret");
    expect(paths.runtimeDescriptorPath).toBe("/tmp/clean-design/ipc/demo/service-runtime.json");
  });
});

describe("service secret", () => {
  it("writes an owner-only 32 byte secret", async () => {
    const secretPath = join(root, "mcp-secret");
    const written = await writeServiceSecret(secretPath);

    expect(written).toHaveLength(32);
    expect((await stat(secretPath)).mode & 0o777).toBe(0o600);
    expect((await readServiceSecret(secretPath))?.equals(written)).toBe(true);
  });

  it("issues a different secret on each service start", async () => {
    const secretPath = join(root, "mcp-secret");
    const first = await writeServiceSecret(secretPath);
    const second = await writeServiceSecret(secretPath);

    expect(first.equals(second)).toBe(false);
  });

  it("returns null when no secret exists", async () => {
    expect(await readServiceSecret(join(root, "absent"))).toBeNull();
  });

  it("refuses a world readable secret", async () => {
    const secretPath = join(root, "loose");
    await writeFile(secretPath, JSON.stringify({ secret: "AAAA" }), { mode: 0o644 });

    await expect(readServiceSecret(secretPath)).rejects.toThrow(/permissions/i);
  });
});

describe("service runtime descriptor", () => {
  it("round-trips a valid descriptor", async () => {
    const path = join(root, "service-runtime.json");
    const value = descriptor();
    await writeServiceRuntimeDescriptor(path, value as never);

    expect(await readServiceRuntimeDescriptor(path)).toEqual(value);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("refuses a descriptor from an incompatible protocol", async () => {
    const path = join(root, "service-runtime.json");
    await writeServiceRuntimeDescriptor(path, descriptor({ protocolVersion: 99 }) as never);

    await expect(readServiceRuntimeDescriptor(path)).rejects.toThrow(/protocol version/i);
  });

  it("refuses a descriptor missing required fields", async () => {
    const path = join(root, "service-runtime.json");
    await writeServiceRuntimeDescriptor(path, descriptor({ internalUrl: "" }) as never);

    await expect(readServiceRuntimeDescriptor(path)).rejects.toThrow(/internalUrl/);
  });

  it("stops advertising a stopped service", async () => {
    const path = join(root, "service-runtime.json");
    await writeServiceRuntimeDescriptor(path, descriptor() as never);
    await clearServiceRuntimeDescriptor(path);

    expect(await readServiceRuntimeDescriptor(path)).toBeNull();
  });
});
