import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPrivateJson, writePrivateJson } from "../src/private-json.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "clean-design-private-json-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("writePrivateJson", () => {
  it("writes owner-only files", async () => {
    const target = join(root, "nested", "secret.json");
    await writePrivateJson(target, { token: "value" });

    expect((await stat(target)).mode & 0o777).toBe(0o600);
    expect(await readPrivateJson(target)).toEqual({ token: "value" });
  });

  it("leaves no temporary file behind", async () => {
    const target = join(root, "secret.json");
    await writePrivateJson(target, { a: 1 });
    await writePrivateJson(target, { a: 2 });

    expect(await readdir(root)).toEqual(["secret.json"]);
    expect(await readPrivateJson(target)).toEqual({ a: 2 });
  });
});

describe("readPrivateJson", () => {
  it("returns null when the file is absent", async () => {
    expect(await readPrivateJson(join(root, "missing.json"))).toBeNull();
  });

  it("refuses group or world readable secrets", async () => {
    const target = join(root, "loose.json");
    await writeFile(target, JSON.stringify({ token: "value" }), "utf8");
    await chmod(target, 0o644);

    await expect(readPrivateJson(target)).rejects.toThrow(/permissions/i);
  });

  it("refuses a symlink even when the target is owner-only", async () => {
    const real = join(root, "real.json");
    const link = join(root, "link.json");
    await writePrivateJson(real, { token: "value" });
    await symlink(real, link);

    await expect(readPrivateJson(link)).rejects.toThrow(/regular file/i);
  });

  it("refuses a directory", async () => {
    const target = join(root, "dir.json");
    await mkdir(target);

    await expect(readPrivateJson(target)).rejects.toThrow(/regular file/i);
  });

  it("caps the number of bytes it will parse", async () => {
    const target = join(root, "big.json");
    await writeFile(target, JSON.stringify({ blob: "x".repeat(5000) }), { mode: 0o600 });

    await expect(readPrivateJson(target, { maxBytes: 1024 })).rejects.toThrow(/too large/i);
  });

  it("applies a caller supplied validator", async () => {
    const target = join(root, "typed.json");
    await writePrivateJson(target, { pid: "not-a-number" });

    await expect(
      readPrivateJson(target, {
        validate: (value) => {
          const pid = (value as { pid?: unknown }).pid;
          if (typeof pid !== "number") throw new Error("pid must be a number");
          return { pid };
        },
      }),
    ).rejects.toThrow(/pid must be a number/);
  });

  it("rejects malformed JSON rather than returning null", async () => {
    const target = join(root, "broken.json");
    await writeFile(target, "{not json", { mode: 0o600 });

    await expect(readPrivateJson(target)).rejects.toThrow();
  });
});
