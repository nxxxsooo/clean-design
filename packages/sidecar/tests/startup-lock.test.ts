import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireStartupLock } from "../src/startup-lock.js";

let root = "";
const alive = () => true;
const dead = () => false;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "clean-design-startup-lock-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("acquireStartupLock", () => {
  it("admits exactly one winner among concurrent callers", async () => {
    const lockPath = join(root, "start.lock");
    const results = await Promise.allSettled(
      Array.from({ length: 32 }, () => acquireStartupLock(lockPath, { isOwnerAlive: alive })),
    );

    const winners = results.filter((result) => result.status === "fulfilled");
    expect(winners).toHaveLength(1);
  });

  it("writes an owner-only lock recording the holder", async () => {
    const lockPath = join(root, "start.lock");
    const handle = await acquireStartupLock(lockPath, { isOwnerAlive: alive });

    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(lockPath, "utf8")).pid).toBe(process.pid);

    await handle.release();
  });

  it("refuses while a live owner holds the lock", async () => {
    const lockPath = join(root, "start.lock");
    const handle = await acquireStartupLock(lockPath, { isOwnerAlive: alive });

    await expect(acquireStartupLock(lockPath, { isOwnerAlive: alive })).rejects.toThrow(/held/i);

    await handle.release();
  });

  it("recovers a stale lock only when the owner is dead and old enough", async () => {
    const lockPath = join(root, "start.lock");
    const stale = { createdAt: new Date(Date.now() - 60_000).toISOString(), pid: 999_999 };
    await writeFile(lockPath, JSON.stringify(stale), { mode: 0o600 });

    // A dead owner whose lock is still fresh must not be stolen: the real
    // owner may be mid-spawn and about to become visible.
    await expect(
      acquireStartupLock(lockPath, { isOwnerAlive: dead, staleAfterMs: 300_000 }),
    ).rejects.toThrow(/held/i);

    const handle = await acquireStartupLock(lockPath, {
      isOwnerAlive: dead,
      staleAfterMs: 1_000,
    });
    expect(JSON.parse(await readFile(lockPath, "utf8")).pid).toBe(process.pid);

    await handle.release();
  });

  it("does not steal a stale-looking lock from a live owner", async () => {
    const lockPath = join(root, "start.lock");
    const old = { createdAt: new Date(Date.now() - 600_000).toISOString(), pid: 999_999 };
    await writeFile(lockPath, JSON.stringify(old), { mode: 0o600 });

    await expect(
      acquireStartupLock(lockPath, { isOwnerAlive: alive, staleAfterMs: 1_000 }),
    ).rejects.toThrow(/held/i);
  });

  it("releases idempotently and only removes its own token", async () => {
    const lockPath = join(root, "start.lock");
    const handle = await acquireStartupLock(lockPath, { isOwnerAlive: alive });

    await handle.release();
    await handle.release();

    const next = await acquireStartupLock(lockPath, { isOwnerAlive: alive });
    const token = JSON.parse(await readFile(lockPath, "utf8")).token;

    // The first handle must not delete a lock a later owner now holds.
    await handle.release();
    expect(JSON.parse(await readFile(lockPath, "utf8")).token).toBe(token);

    await next.release();
  });
});
