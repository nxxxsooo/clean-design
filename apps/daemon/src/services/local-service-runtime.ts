/**
 * @module local-service-runtime
 *
 * Owner-only on-disk state for the shared local service boundary.
 *
 * Two files live beside the namespace socket:
 *
 * - `mcp-secret` holds the 32-byte shared secret a client must possess to
 *   authenticate. It is created once per service start.
 * - `service-runtime.json` describes the running service so a client can
 *   decide whether to attach or refuse before opening a socket.
 *
 * Both are mode `0600`. Neither is ever logged.
 */

import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readPrivateJson, writePrivateJson } from "@open-design/sidecar";
import {
  CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION,
  type ServiceRuntimeDescriptor,
} from "@open-design/sidecar-proto";

export const SERVICE_SECRET_FILE = "mcp-secret";
export const SERVICE_RUNTIME_FILE = "service-runtime.json";

export type ServiceRuntimePaths = {
  root: string;
  runtimeDescriptorPath: string;
  secretPath: string;
};

/** Namespace runtime files live next to the daemon socket. */
export function resolveServiceRuntimePaths(ipcPath: string): ServiceRuntimePaths {
  const root = dirname(ipcPath);
  return {
    root,
    runtimeDescriptorPath: join(root, SERVICE_RUNTIME_FILE),
    secretPath: join(root, SERVICE_SECRET_FILE),
  };
}

type StoredSecret = { secret: string };

/**
 * Create and persist a fresh service secret.
 *
 * A new secret per service start means leases from a previous daemon
 * instance cannot authenticate against this one.
 */
export async function writeServiceSecret(secretPath: string): Promise<Buffer> {
  const secret = randomBytes(32);
  await writePrivateJson(secretPath, { secret: secret.toString("base64") } satisfies StoredSecret);
  return secret;
}

/** Read the service secret, refusing loose permissions or a malformed value. */
export async function readServiceSecret(secretPath: string): Promise<Buffer | null> {
  const stored = await readPrivateJson<StoredSecret>(secretPath, {
    validate: (value) => {
      const secret = (value as { secret?: unknown }).secret;
      if (typeof secret !== "string" || secret.length === 0) {
        throw new Error("service secret file is malformed");
      }
      return { secret };
    },
  });
  if (!stored) return null;

  const secret = Buffer.from(stored.secret, "base64");
  if (secret.length !== 32) throw new Error("service secret must be 32 bytes");
  return secret;
}

export async function writeServiceRuntimeDescriptor(
  runtimeDescriptorPath: string,
  descriptor: ServiceRuntimeDescriptor,
): Promise<void> {
  await writePrivateJson(runtimeDescriptorPath, descriptor);
}

/**
 * Read the runtime descriptor.
 *
 * @returns The descriptor, or `null` when absent or incompatible. A
 * descriptor from a different protocol version is treated as absent so a
 * mismatched client refuses to attach instead of speaking the wrong dialect.
 */
export async function readServiceRuntimeDescriptor(
  runtimeDescriptorPath: string,
): Promise<ServiceRuntimeDescriptor | null> {
  return readPrivateJson<ServiceRuntimeDescriptor>(runtimeDescriptorPath, {
    validate: (value) => {
      const record = value as Partial<ServiceRuntimeDescriptor>;
      if (record.protocolVersion !== CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION) {
        throw new Error("service runtime descriptor has an incompatible protocol version");
      }
      for (const key of ["internalUrl", "namespace", "serviceVersion", "startedAt"] as const) {
        if (typeof record[key] !== "string" || record[key]?.length === 0) {
          throw new Error(`service runtime descriptor is missing ${key}`);
        }
      }
      if (typeof record.pid !== "number") {
        throw new Error("service runtime descriptor is missing pid");
      }
      return record as ServiceRuntimeDescriptor;
    },
  });
}

/** Remove the runtime descriptor so a stopped service is not advertised. */
export async function clearServiceRuntimeDescriptor(runtimeDescriptorPath: string): Promise<void> {
  await rm(runtimeDescriptorPath, { force: true });
}
