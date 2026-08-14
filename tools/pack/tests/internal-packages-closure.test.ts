import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INTERNAL_PACKAGES as MAC_INTERNAL_PACKAGES } from "../src/mac/constants.js";
import { shouldInstallInternalPackageForMacPrebundle } from "../src/mac-prebundle.js";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

type PackageEntry = { readonly directory: string; readonly name: string };

function runtimeWorkspaceDeps(directory: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(workspaceRoot, directory, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  return Object.keys(manifest.dependencies ?? {}).filter((dep) => dep.startsWith("@open-design/"));
}

// The mac pack lane assembles its packaged app by `pnpm pack`-ing a subset of
// INTERNAL_PACKAGES into tarballs, wiring them as `file:` dependencies, and
// running an npm/pnpm install in the isolated app directory. `pnpm pack`
// rewrites every `workspace:*` ref to a concrete version, so the install
// resolves each tarball's runtime `@open-design/*` dependencies. Any such
// dependency that is NOT also installed as a local tarball is fetched from the
// public npm registry and 404s — these packages are workspace-only and never
// published.
//
// The invariant: the set a lane actually installs must be closed under its
// runtime `@open-design/*` dependencies.
//
// Standalone desktop/web/packaged/daemon entry points are prebundled with
// esbuild and excluded from the tarball install. The remaining tarball set must
// stay closed under runtime workspace dependencies.

describe("pack lane INTERNAL_PACKAGES dependency closure", () => {
  it("mac: every installed package's runtime @open-design deps are installed", () => {
    const installed = MAC_INTERNAL_PACKAGES.filter((pkg) =>
      shouldInstallInternalPackageForMacPrebundle({ packageName: pkg.name, webOutputMode: "standalone" })
    );
    const installedNames = new Set<string>(installed.map((pkg) => pkg.name));
    const missing: { dependency: string; dependent: string }[] = [];

    for (const pkg of installed) {
      for (const dependency of runtimeWorkspaceDeps(pkg.directory)) {
        if (!installedNames.has(dependency)) {
          missing.push({ dependency, dependent: pkg.name });
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
