import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";
import { pathExists, scrubMacExtendedAttributes } from "./fs.js";
import { sanitizeNamespace } from "./paths.js";
import type { MacPackResult, MacPaths } from "./types.js";

async function moveBuilderArtifact(options: {
  destinationPath: string;
  label: string;
  sourcePath: string;
}): Promise<string> {
  if (!(await pathExists(options.sourcePath))) {
    throw new Error(`no ${options.label} produced at ${options.sourcePath}`);
  }
  await mkdir(dirname(options.destinationPath), { recursive: true });
  await rm(options.destinationPath, { force: true, recursive: true });
  await rename(options.sourcePath, options.destinationPath);
  await scrubMacExtendedAttributes(options.destinationPath);
  return options.destinationPath;
}

export async function finalizeMacArtifacts(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<Pick<MacPackResult, "dmgPath" | "zipPath">> {
  const namespaceToken = sanitizeNamespace(config.namespace);
  let dmgPath: string | null = null;
  let zipPath: string | null = null;

  if (config.to === "dmg" || config.to === "all") {
    dmgPath = await moveBuilderArtifact({
      destinationPath: paths.dmgPath,
      label: "dmg artifact",
      sourcePath: join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.dmg`),
    });
  }

  if (config.to === "zip" || config.to === "all") {
    zipPath = await moveBuilderArtifact({
      destinationPath: paths.zipPath,
      label: "zip artifact",
      sourcePath: join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.zip`),
    });
  }

  return { dmgPath, zipPath };
}
