import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runNpmInstall } from "../src/mac/commands.js";

const originalPath = process.env.PATH;
const originalCapturePath = process.env.CLEAN_DESIGN_NPM_ENV_CAPTURE;
const originalUserConfig = process.env.NPM_CONFIG_USERCONFIG;
const originalAllowScripts = process.env.npm_config_allow_scripts;

afterEach(() => {
  restoreEnv("PATH", originalPath);
  restoreEnv("CLEAN_DESIGN_NPM_ENV_CAPTURE", originalCapturePath);
  restoreEnv("NPM_CONFIG_USERCONFIG", originalUserConfig);
  restoreEnv("npm_config_allow_scripts", originalAllowScripts);
});

describe("runNpmInstall", () => {
  it("isolates the packaged dependency install from user npm configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "clean-design-tools-pack-npm-env-"));
    try {
      const binDir = join(root, "bin");
      const appRoot = join(root, "app");
      const capturePath = join(root, "npm-env.json");
      const fakeNpmPath = join(binDir, "npm");
      await mkdir(binDir, { recursive: true });
      await mkdir(appRoot, { recursive: true });
      await writeFile(
        fakeNpmPath,
        [
          "#!/usr/bin/env node",
          "const { writeFileSync } = require('node:fs');",
          "writeFileSync(process.env.CLEAN_DESIGN_NPM_ENV_CAPTURE, JSON.stringify({",
          "  allowScripts: process.env.npm_config_allow_scripts ?? null,",
          "  userConfig: process.env.NPM_CONFIG_USERCONFIG ?? null,",
          "}));",
        ].join("\n"),
        "utf8",
      );
      await chmod(fakeNpmPath, 0o755);

      process.env.PATH = `${binDir}${delimiter}${originalPath ?? ""}`;
      process.env.CLEAN_DESIGN_NPM_ENV_CAPTURE = capturePath;
      process.env.NPM_CONFIG_USERCONFIG = join(root, "user.npmrc");
      process.env.npm_config_allow_scripts = "@example/inherited-script-policy";

      await runNpmInstall(appRoot);

      await expect(readFile(capturePath, "utf8")).resolves.toBe(
        JSON.stringify({ allowScripts: null, userConfig: "/dev/null" }),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
