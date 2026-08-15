import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCT_NAME } from "../src/mac/constants.js";
import { macAppExecutablePath, resolveMacAppOutputDirectoryName, sanitizeNamespace } from "../src/mac/paths.js";

describe("sanitizeNamespace", () => {
  it("keeps alphanumerics, dots, hyphens, and underscores", () => {
    expect(sanitizeNamespace("Open-Design.beta_1")).toBe("Open-Design.beta_1");
  });

  it("replaces forbidden chars with hyphens and collapses runs", () => {
    expect(sanitizeNamespace("a/b c")).toBe("a-b-c");
    expect(sanitizeNamespace("a   //  b")).toBe("a-b");
    expect(sanitizeNamespace("中文/ns")).toBe("-ns");
  });
});

describe("macAppExecutablePath", () => {
  it("joins the Contents/MacOS executable path under the bundle", () => {
    const appPath = "/tmp/out/mac/Clean Design.app";
    expect(macAppExecutablePath(appPath)).toBe(join(appPath, "Contents", "MacOS", PRODUCT_NAME));
  });

  it("honors a custom executable name", () => {
    const appPath = "/tmp/out/mac/Clean Design.app";
    expect(macAppExecutablePath(appPath, "open-design-beta")).toBe(
      join(appPath, "Contents", "MacOS", "open-design-beta"),
    );
  });
});

describe("resolveMacAppOutputDirectoryName", () => {
  it("always targets the Apple Silicon builder directory", () => {
    expect(resolveMacAppOutputDirectoryName()).toBe("mac-arm64");
  });
});
