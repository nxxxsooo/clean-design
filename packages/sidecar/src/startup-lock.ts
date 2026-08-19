/**
 * @module startup-lock
 *
 * Single-winner startup lock. When several clients discover a stopped
 * service at the same moment, exactly one must spawn it; the rest wait and
 * attach. `open(path, "wx")` gives that guarantee atomically, without a
 * daemon, a port, or a race window between "check" and "create".
 *
 * Stale recovery is deliberately conservative. A lock is only removed when
 * its owner is provably gone *and* the lock is old enough, because stealing
 * a lock from a process that is still mid-spawn produces exactly the
 * duplicate-service outcome the lock exists to prevent.
 */

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Default age after which a dead owner's lock may be reclaimed. */
const DEFAULT_STALE_AFTER_MS = 60_000;

export type StartupLockHandle = {
  /** Remove the lock, but only while this handle still owns it. */
  release(): Promise<void>;
  token: string;
};

export type AcquireStartupLockOptions = {
  isOwnerAlive?: (pid: number) => boolean;
  staleAfterMs?: number;
};

type LockRecord = {
  createdAt: string;
  pid: number;
  token: string;
};

function defaultIsOwnerAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission and liveness check without
    // delivering anything to the target.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readLockRecord(path: string): Promise<LockRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<LockRecord>;
    if (typeof record.pid !== "number" || typeof record.createdAt !== "string") return null;
    return {
      createdAt: record.createdAt,
      pid: record.pid,
      token: typeof record.token === "string" ? record.token : "",
    };
  } catch {
    return null;
  }
}

/**
 * Acquire the startup lock at `path`.
 *
 * @throws When another live owner holds the lock, or when a dead owner's
 * lock is not yet old enough to reclaim.
 */
export async function acquireStartupLock(
  path: string,
  options: AcquireStartupLockOptions = {},
): Promise<StartupLockHandle> {
  const isOwnerAlive = options.isOwnerAlive ?? defaultIsOwnerAlive;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const token = randomUUID();

  await mkdir(dirname(path), { mode: 0o700, recursive: true });

  const write = async (): Promise<StartupLockHandle> => {
    const handle = await open(path, "wx", 0o600);
    try {
      const record: LockRecord = {
        createdAt: new Date().toISOString(),
        pid: process.pid,
        token,
      };
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    let released = false;
    return {
      token,
      async release() {
        if (released) return;
        released = true;
        // Re-read before removing: if a later owner reclaimed this lock,
        // deleting it would hand the service to a third caller.
        const current = await readLockRecord(path);
        if (current && current.token !== token) return;
        await rm(path, { force: true });
      },
    };
  };

  try {
    return await write();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  const existing = await readLockRecord(path);
  const ageMs = existing ? Date.now() - Date.parse(existing.createdAt) : Number.NaN;
  const reclaimable =
    existing !== null &&
    !isOwnerAlive(existing.pid) &&
    Number.isFinite(ageMs) &&
    ageMs >= staleAfterMs;

  if (!reclaimable) {
    throw new Error(`startup lock at ${path} is held by pid ${existing?.pid ?? "unknown"}`);
  }

  await rm(path, { force: true });
  return write();
}
