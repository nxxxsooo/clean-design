import { homedir } from "node:os";
import { join } from "node:path";

import { APP_KEYS } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";
import {
  MAC_PREBUNDLE_ENTRYPOINTS_DIR_NAME,
  MAC_PREBUNDLE_META_DIR_NAME,
  MAC_PREBUNDLED_APP_DIR_NAME,
  MAC_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH,
  MAC_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH,
  MAC_PREBUNDLED_PACKAGED_MAIN_RELATIVE_PATH,
  MAC_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH,
} from "../mac-prebundle.js";
import { resolveMacInstallIdentity } from "./identity.js";
import type { MacPaths } from "./types.js";

export function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function macAppExecutablePath(appPath: string, executableName = PRODUCT_NAME): string {
  return join(appPath, "Contents", "MacOS", executableName);
}

export function resolveMacAppOutputDirectoryName(): string {
  return "mac-arm64";
}

export function resolveMacPaths(config: ToolPackConfig): MacPaths {
  const namespaceRoot = config.roots.output.namespaceRoot;
  const appBuilderOutputRoot = config.roots.output.appBuilderRoot;
  const namespaceToken = sanitizeNamespace(config.namespace);
  const identity = resolveMacInstallIdentity(config);
  const appPath = join(
    appBuilderOutputRoot,
    resolveMacAppOutputDirectoryName(),
    identity.publicAppBundleName,
  );
  const installApplicationsRoot = join(namespaceRoot, "install", "Applications");
  const installedAppPath = join(installApplicationsRoot, identity.systemAppBundleName);

  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot,
    appPath,
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    assembledPrebundledRoot: join(namespaceRoot, "assembled", "app", MAC_PREBUNDLED_APP_DIR_NAME),
    daemonCliPrebundleEntrypointPath: join(namespaceRoot, MAC_PREBUNDLE_ENTRYPOINTS_DIR_NAME, "daemon-cli.js"),
    daemonCliPrebundlePath: join(namespaceRoot, "assembled", MAC_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH),
    daemonPrebundleMetaPath: join(namespaceRoot, MAC_PREBUNDLE_META_DIR_NAME, "daemon.meta.json"),
    daemonPrebundleRoot: join(namespaceRoot, "assembled", "app", MAC_PREBUNDLED_APP_DIR_NAME, "daemon"),
    daemonSidecarPrebundleEntrypointPath: join(namespaceRoot, MAC_PREBUNDLE_ENTRYPOINTS_DIR_NAME, "daemon-sidecar.js"),
    daemonSidecarPrebundlePath: join(namespaceRoot, "assembled", MAC_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH),
    dmgPath: join(namespaceRoot, "dmg", `${PRODUCT_NAME}-${namespaceToken}.dmg`),
    installApplicationsRoot,
    installedAppPath,
    mountPoint: join(namespaceRoot, "mount"),
    packagedMainPrebundleMetaPath: join(namespaceRoot, MAC_PREBUNDLE_META_DIR_NAME, "packaged-main.meta.json"),
    packagedMainPrebundlePath: join(namespaceRoot, "assembled", MAC_PREBUNDLED_PACKAGED_MAIN_RELATIVE_PATH),
    packagedConfigPath: join(namespaceRoot, "clean-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "clean-design"),
    systemApplicationsAppPath: join("/Applications", identity.systemAppBundleName),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userApplicationsAppPath: join(homedir(), "Applications", identity.systemAppBundleName),
    webStandaloneHookAuditPath: join(namespaceRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(namespaceRoot, "web-standalone-after-pack-config.json"),
    webSidecarPrebundleMetaPath: join(namespaceRoot, MAC_PREBUNDLE_META_DIR_NAME, "web-sidecar.meta.json"),
    webSidecarPrebundlePath: join(namespaceRoot, "assembled", MAC_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH),
    zipPath: join(namespaceRoot, "zip", `${PRODUCT_NAME}-${namespaceToken}.zip`),
  };
}

export function resolveMacProductUserDataRoot(config: ToolPackConfig): string {
  return join(homedir(), "Library", "Application Support", resolveMacInstallIdentity(config).productName);
}

export function resolveMacProductNamespaceRoot(config: ToolPackConfig): string {
  return join(resolveMacProductUserDataRoot(config), "namespaces", config.namespace);
}


export function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

export function desktopIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
}
