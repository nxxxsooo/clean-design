import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveToolPackConfig, WORKSPACE_ROOT } from "../src/config.js";

describe("resolveToolPackConfig mac build target", () => {
  it("accepts mac artifacts and rejects unsupported values", () => {
    expect(resolveToolPackConfig({ to: "zip" }).to).toBe("zip");
    expect(resolveToolPackConfig({ to: "all" }).to).toBe("all");
    expect(resolveToolPackConfig({ to: "dmg" }).to).toBe("dmg");
    expect(() => resolveToolPackConfig({ to: "nsis" })).toThrow(/unsupported mac --to target: nsis/);
  });
});

describe("resolveToolPackConfig cache root", () => {
  it("keeps the default cache outside custom tools-pack roots", () => {
    const config = resolveToolPackConfig({
      dir: "/tmp/clean-design-pack",
      namespace: "cache-root-test",
    });

    expect(config.roots.toolPackRoot).toBe(resolve("/tmp/clean-design-pack"));
    expect(config.roots.cacheRoot).toBe(resolve(join(WORKSPACE_ROOT, ".tmp", "tools-pack", "cache")));
  });

  it("uses an explicit cache-dir when supplied", () => {
    const config = resolveToolPackConfig({
      cacheDir: "/tmp/clean-design-pack-cache",
      dir: "/tmp/clean-design-pack",
      namespace: "cache-root-test",
    });

    expect(config.roots.toolPackRoot).toBe(resolve("/tmp/clean-design-pack"));
    expect(config.roots.cacheRoot).toBe(resolve("/tmp/clean-design-pack-cache"));
  });
});

describe("resolveToolPackConfig namespace defaults", () => {
  it("keeps ordinary local builds on the default namespace", () => {
    expect(resolveToolPackConfig().namespace).toBe("default");
    expect(resolveToolPackConfig({ appVersion: "0.8.0" }).namespace).toBe("default");
  });

  it("defaults prerelease builds to their mac release-channel namespace", () => {
    expect(resolveToolPackConfig({ appVersion: "0.8.0-beta.4" }).namespace).toBe("release-beta");
    expect(resolveToolPackConfig({ appVersion: "0.8.0-preview.4" }).namespace).toBe("release-preview");
    expect(resolveToolPackConfig({ appVersion: "0.8.0-prerelease.4" }).namespace).toBe("release-prerelease");
  });

  it("keeps an explicit namespace ahead of the prerelease channel default", () => {
    expect(resolveToolPackConfig({ appVersion: "0.8.0-beta.4", namespace: "custom-beta" }).namespace).toBe(
      "custom-beta",
    );
  });
});
