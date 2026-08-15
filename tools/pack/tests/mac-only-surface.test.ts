import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const toolsPackRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const unsupportedPaths = [
  "resources/linux",
  "resources/win",
  "src/linux.ts",
  "src/win-prebundle.ts",
  "src/win",
  "src/launcher-layout.ts",
  "src/launcher-runtime-snapshot.ts",
  "src/mac/payload.ts",
] as const;

describe("tools-pack mac-only surface", () => {
  it.each(unsupportedPaths)("does not ship %s", async (relativePath) => {
    await expect(access(join(toolsPackRoot, relativePath))).rejects.toThrow();
  });

  it("does not depend directly on removed launcher or Windows tooling", async () => {
    const packageJson = JSON.parse(await readFile(join(toolsPackRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("@open-design/launcher-proto");
    expect(packageJson.dependencies).toHaveProperty("@open-design/release");
    expect(packageJson.dependencies).not.toHaveProperty("resedit");
  });

  it("does not include removed launcher or updater packages in the mac build graph", async () => {
    const files = [
      "src/mac/constants.ts",
      "src/mac-prebundle.ts",
      "src/mac/workspace.ts",
      "src/workspace-build.ts",
    ] as const;

    for (const relativePath of files) {
      const source = await readFile(join(toolsPackRoot, relativePath), "utf8");
      expect(source).not.toContain("@open-design/launcher-proto");
      expect(source).not.toContain("packages/launcher-proto");
      expect(source).not.toContain("@open-design/download");
      expect(source).not.toContain("packages/download");
    }
  });

  it("uses Clean Design wording in the retained notarization hook", async () => {
    const source = await readFile(join(toolsPackRoot, "resources/mac/notarize.cjs"), "utf8");

    expect(source).not.toContain("open-design-notarize");
    expect(source).toContain("clean-design-notarize");
  });
});
