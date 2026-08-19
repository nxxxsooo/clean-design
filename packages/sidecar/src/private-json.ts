/**
 * @module private-json
 *
 * Owner-only JSON state for the local service boundary. This is the strict
 * counterpart to `json-file`: that module is deliberately forgiving because
 * it carries discovery pointers, while this one carries authentication
 * material and runtime descriptors where a wrong answer is worse than no
 * answer. Reads fail loudly on loose permissions, symlinks, oversized
 * payloads, and malformed content instead of returning `null`.
 */

import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Refuse to buffer more than this before parsing unless told otherwise. */
const DEFAULT_MAX_BYTES = 64 * 1024;

export type ReadPrivateJsonOptions<T> = {
  maxBytes?: number;
  validate?: (value: unknown) => T;
};

/**
 * Atomically write `value` as owner-only JSON.
 *
 * The temporary file is created with `wx` and mode `0600` so the secret is
 * never briefly world-readable, and it is fsynced before the rename so a
 * crash cannot leave a torn descriptor behind.
 */
export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { mode: 0o700, recursive: true });

  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }

  // The rename preserves the temp file's mode, but an existing target may
  // have had a different one. Assert the final state explicitly.
  await chmod(path, 0o600);
}

/**
 * Read owner-only JSON.
 *
 * @returns The parsed value, or `null` when the file does not exist.
 * @throws When the path is not a regular file, is group/world accessible,
 * exceeds `maxBytes`, is not valid JSON, or fails the caller's validator.
 */
export async function readPrivateJson<T = unknown>(
  path: string,
  options: ReadPrivateJsonOptions<T> = {},
): Promise<T | null> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let stats;
  try {
    // `lstat`, not `stat`: a symlink here would let another user redirect
    // us to a file we should not read.
    stats = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  if (!stats.isFile()) {
    throw new Error(`private state at ${path} must be a regular file`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`private state at ${path} has group or world permissions`);
  }
  if (stats.size > maxBytes) {
    throw new Error(`private state at ${path} is too large (${stats.size} > ${maxBytes} bytes)`);
  }

  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return options.validate ? options.validate(parsed) : (parsed as T);
}
