import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveMacInstallIdentity } from "../src/mac/identity.js";
import { resolveMacPaths } from "../src/mac/paths.js";

function makeConfig(root: string, namespace: string): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform: "mac",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", namespace),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dmg",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

describe("resolveMacInstallIdentity", () => {
  it("keeps stable builds on the canonical mac identity", () => {
    expect(resolveMacInstallIdentity(makeConfig("/work", "release-stable"))).toMatchObject({
      appId: "fun.mjshao.clean-design",
      installerTitle: "Clean Design",
      productName: "Clean Design",
      publicAppBundleName: "Clean Design.app",
      systemAppBundleName: "Clean Design.app",
    });
  });

  it("uses first-class beta app identity for beta release namespaces", () => {
    const config = makeConfig("/work", "release-beta");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "fun.mjshao.clean-design.beta",
      executableName: "Clean Design Beta",
      installerTitle: "Clean Design Beta",
      productName: "Clean Design Beta",
      publicAppBundleName: "Clean Design Beta.app",
      systemAppBundleName: "Clean Design Beta.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/Clean Design Beta\.app$/);
  });

  it("uses first-class preview app identity for preview release namespaces", () => {
    const config = makeConfig("/work", "release-preview");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "fun.mjshao.clean-design.preview",
      executableName: "Clean Design Preview",
      installerTitle: "Clean Design Preview",
      productName: "Clean Design Preview",
      publicAppBundleName: "Clean Design Preview.app",
      systemAppBundleName: "Clean Design Preview.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/Clean Design Preview\.app$/);
  });

  it("uses first-class prerelease app identity for prerelease release versions and namespaces", () => {
    const prereleaseVersionConfig = {
      ...makeConfig("/work", "release-stable"),
      appVersion: "0.8.0-prerelease.2",
    };
    const prereleaseNamespaceConfig = makeConfig("/work", "release-prerelease");

    expect(resolveMacInstallIdentity(prereleaseVersionConfig)).toEqual({
      appId: "fun.mjshao.clean-design.prerelease",
      executableName: "Clean Design Prerelease",
      installerTitle: "Clean Design Prerelease",
      productName: "Clean Design Prerelease",
      publicAppBundleName: "Clean Design Prerelease.app",
      systemAppBundleName: "Clean Design Prerelease.app",
    });
    expect(resolveMacPaths(prereleaseVersionConfig).appPath).toMatch(/Clean Design Prerelease\.app$/);
    expect(resolveMacInstallIdentity(prereleaseNamespaceConfig)).toMatchObject({
      productName: "Clean Design Prerelease",
      publicAppBundleName: "Clean Design Prerelease.app",
    });
  });
});
