import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const sourceEntry = join(testDir, "..", "src", "index.ts");
const tsxCli = require.resolve("tsx/cli");

describe("tools-pack mac lifecycle CLI", () => {
  it("exposes only the Apple Silicon macOS command surface", async () => {
    const { stdout } = await execFileAsync(process.execPath, [tsxCli, sourceEntry, "--help"], {
      maxBuffer: 1024 * 1024,
    });

    expect(stdout).toContain("mac <action>");
    expect(stdout).not.toContain("win <action>");
    expect(stdout).not.toContain("linux <action>");
  });

  it("accepts the documented namespace-scoped removal flags", async () => {
    const { stdout } = await execFileAsync(process.execPath, [tsxCli, sourceEntry, "mac", "--help"], {
      maxBuffer: 1024 * 1024,
    });

    expect(stdout).toContain("--remove-product-user-data");
    expect(stdout).toContain("--remove-data");
    expect(stdout).toContain("--remove-logs");
    expect(stdout).toContain("--remove-sidecars");
  });
});
