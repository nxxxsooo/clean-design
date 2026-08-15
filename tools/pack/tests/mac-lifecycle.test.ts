import { access, chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopStatusSnapshot } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "../src/config.js";
import { resolveMacInstallIdentity } from "../src/mac/identity.js";
import { resolveMacPaths } from "../src/mac/paths.js";

const requestJsonIpc = vi.fn(async (): Promise<DesktopStatusSnapshot> => ({ state: "running" }));
const resolveAppIpcPath = vi.fn(() => "/tmp/open-design/ipc/test/desktop.sock");
const createSidecarLaunchEnv = vi.fn(({ extraEnv }: { extraEnv: NodeJS.ProcessEnv }) => extraEnv);
const collectProcessTreePids = vi.fn(
  (_processes: unknown[], rootPids: Array<number | null>) =>
    rootPids.filter((pid): pid is number => typeof pid === "number"),
);
const listProcessSnapshots = vi.fn(async () => [] as Array<{ command: string; pid: number; ppid: number }>);
const matchesStampedProcess = vi.fn<typeof import("@open-design/platform").matchesStampedProcess>(() => false);
const stopProcesses = vi.fn(async (pids: number[]) => ({ remainingPids: [], stoppedPids: pids }));
const spawnLoggedProcess = vi.fn(async ({ env }: { env: NodeJS.ProcessEnv }) => {
  return Object.assign(new EventEmitter(), {
    env,
    pid: 1234,
    unref: vi.fn(),
  }) as unknown as ChildProcess & { env: NodeJS.ProcessEnv };
});

vi.mock("@open-design/sidecar", () => ({
  createSidecarLaunchEnv,
  requestJsonIpc,
  resolveAppIpcPath,
}));

vi.mock("@open-design/platform", () => ({
  collectProcessTreePids,
  createProcessStampArgs: vi.fn(() => []),
  isProcessAlive: vi.fn(() => true),
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail: vi.fn(async () => []),
  spawnLoggedProcess,
  stopProcesses,
}));

const {
  cleanupPackedMacNamespace,
  startPackedMacApp,
  stopPackedMacApp,
  uninstallPackedMacApp,
} = await import("../src/mac/lifecycle.js");

function makeConfig(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  return {
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "local-test",
    platform: "mac",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", "local-test", "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", "local-test"),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test"),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    to: "app",
    webOutputMode: "standalone",
    workspaceRoot: root,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  requestJsonIpc.mockResolvedValue({ state: "running" });
  listProcessSnapshots.mockResolvedValue([]);
  matchesStampedProcess.mockReturnValue(false);
  collectProcessTreePids.mockImplementation(
    (_processes: unknown[], rootPids: Array<number | null>) =>
      rootPids.filter((pid): pid is number => typeof pid === "number"),
  );
  stopProcesses.mockImplementation(async (pids: number[]) => ({ remainingPids: [], stoppedPids: pids }));
});

describe("startPackedMacApp", () => {
  it("accepts a clean bootstrap exit when the delegated desktop becomes healthy", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Clean Design");
      const delegatedPid = 5678;

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      requestJsonIpc.mockResolvedValue({ pid: delegatedPid, state: "running" });
      spawnLoggedProcess.mockImplementationOnce(async ({ env }: { env: NodeJS.ProcessEnv }) => {
        const child = Object.assign(new EventEmitter(), {
          env,
          pid: 1234,
          unref: vi.fn(),
        }) as unknown as ChildProcess & { env: NodeJS.ProcessEnv };
        setTimeout(() => child.emit("exit", 0, null), 10);
        return child;
      });

      const result = await startPackedMacApp(config);

      expect(result.pid).toBe(delegatedPid);
      expect(result.status).toEqual({ pid: delegatedPid, state: "running" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a non-zero bootstrap exit before desktop handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Clean Design");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 1\n", "utf8");
      await chmod(executablePath, 0o755);
      spawnLoggedProcess.mockImplementationOnce(async ({ env }: { env: NodeJS.ProcessEnv }) => {
        const child = Object.assign(new EventEmitter(), {
          env,
          pid: 1234,
          unref: vi.fn(),
        }) as unknown as ChildProcess & { env: NodeJS.ProcessEnv };
        setTimeout(() => child.emit("exit", 1, null), 10);
        return child;
      });

      await expect(startPackedMacApp(config)).rejects.toThrow("process exited early code=1 signal=null");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("writes a launch override when the bundled config is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Clean Design");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);

      const result = await startPackedMacApp(config);
      const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "clean-design-config.json");
      const launchEnv = spawnLoggedProcess.mock.calls[0]?.[0]?.env as NodeJS.ProcessEnv | undefined;

      expect(result.source).toBe("installed");
      expect(result.status?.state).toBe("running");
      expect(launchEnv?.OD_PACKAGED_CONFIG_PATH).toBe(launchConfigPath);
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain(
        `"namespaceBaseRoot": ${JSON.stringify(config.roots.runtime.namespaceBaseRoot)}`,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("passes a launch override config path for portable mac starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Clean Design");
      const bundledConfigPath = join(paths.installedAppPath, "Contents", "Resources", "clean-design-config.json");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await mkdir(join(paths.installedAppPath, "Contents", "Resources"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      await writeFile(
        bundledConfigPath,
        `${JSON.stringify({
          appVersion: "1.2.3",
          daemonCliEntryRelative: "open-design/bin/od",
          namespace: config.namespace,
          nodeCommandRelative: "open-design/bin/node",
        }, null, 2)}\n`,
        "utf8",
      );

      const result = await startPackedMacApp(config);
      const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "clean-design-config.json");
      const launchEnv = spawnLoggedProcess.mock.calls[0]?.[0]?.env as NodeJS.ProcessEnv | undefined;

      expect(result.source).toBe("installed");
      expect(result.status?.state).toBe("running");
      expect(launchEnv?.OD_PACKAGED_CONFIG_PATH).toBe(launchConfigPath);
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain(
        `"namespaceBaseRoot": ${JSON.stringify(config.roots.runtime.namespaceBaseRoot)}`,
      );
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain('"appVersion": "1.2.3"');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("uses the preview executable name for preview release namespaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root, { namespace: "release-preview" });
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Clean Design Preview");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);

      const result = await startPackedMacApp(config);

      expect(result.source).toBe("installed");
      expect(result.executablePath).toBe(executablePath);
      expect(result.status?.state).toBe("running");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("stopPackedMacApp", () => {
  it("waits for a packaged desktop to exit after graceful shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    const config = makeConfig(root);
    const packagedDesktop = { command: "packaged-desktop", pid: 4242, ppid: 1 };

    try {
      requestJsonIpc.mockResolvedValue({ state: "running" });
      listProcessSnapshots
        .mockResolvedValueOnce([packagedDesktop])
        .mockResolvedValueOnce([packagedDesktop])
        .mockResolvedValueOnce([]);
      matchesStampedProcess.mockImplementation((processInfo, criteria) => {
        const sidecarCriteria = criteria as { namespace?: string; source?: string };
        return (
          processInfo.command === packagedDesktop.command &&
          sidecarCriteria.namespace === config.namespace &&
          sidecarCriteria.source === "packaged"
        );
      });

      await expect(stopPackedMacApp(config)).resolves.toMatchObject({
        gracefulRequested: true,
        namespace: config.namespace,
        remainingPids: [],
        status: "stopped",
        stoppedPids: [packagedDesktop.pid],
      });
      expect(listProcessSnapshots).toHaveBeenCalledTimes(3);
      expect(matchesStampedProcess).toHaveBeenCalledWith(
        packagedDesktop,
        expect.objectContaining({ namespace: config.namespace, source: "packaged" }),
        expect.anything(),
      );
      expect(stopProcesses).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("macOS uninstall cleanup boundaries", () => {
  it("removes only requested current-product namespace state during uninstall", async () => {
    const root = await mkdtemp(join(tmpdir(), "clean-design-tools-pack-mac-uninstall-"));
    const previousHome = process.env.HOME;
    process.env.HOME = join(root, "home");

    try {
      const config = makeConfig(root, {
        removeData: true,
        removeLogs: true,
        removeProductUserData: true,
        removeSidecars: true,
      });
      const paths = resolveMacPaths(config);
      const identity = resolveMacInstallIdentity(config);
      const productNamespaceRoot = join(
        process.env.HOME,
        "Library",
        "Application Support",
        identity.productName,
        "namespaces",
        config.namespace,
      );
      const siblingNamespaceRoot = join(
        process.env.HOME,
        "Library",
        "Application Support",
        identity.productName,
        "namespaces",
        "sibling",
      );
      const retiredProductRoot = join(
        process.env.HOME,
        "Library",
        "Application Support",
        "Clean Design",
      );

      for (const scope of ["data", "logs", "runtime", "user-data", "cache"]) {
        await mkdir(join(productNamespaceRoot, scope), { recursive: true });
        await writeFile(join(productNamespaceRoot, scope, "marker"), scope, "utf8");
        await mkdir(join(config.roots.runtime.namespaceRoot, scope), { recursive: true });
        await writeFile(join(config.roots.runtime.namespaceRoot, scope, "marker"), scope, "utf8");
      }
      await mkdir(siblingNamespaceRoot, { recursive: true });
      await writeFile(join(siblingNamespaceRoot, "keep"), "sibling", "utf8");
      await mkdir(retiredProductRoot, { recursive: true });
      await writeFile(join(retiredProductRoot, "keep"), "retired", "utf8");
      await mkdir(paths.installedAppPath, { recursive: true });

      const result = await uninstallPackedMacApp(config);

      expect(result.removed).toBe(true);
      expect(result.removalPlan).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: join(productNamespaceRoot, "data"), scope: "data", willRemove: true }),
        expect.objectContaining({ path: join(productNamespaceRoot, "logs"), scope: "logs", willRemove: true }),
        expect.objectContaining({ path: join(productNamespaceRoot, "runtime"), scope: "sidecars", willRemove: true }),
        expect.objectContaining({ path: join(productNamespaceRoot, "user-data"), scope: "product-user-data", willRemove: true }),
      ]));
      for (const scope of ["data", "logs", "runtime", "user-data"]) {
        await expect(access(join(productNamespaceRoot, scope))).rejects.toMatchObject({ code: "ENOENT" });
        await expect(access(join(config.roots.runtime.namespaceRoot, scope))).rejects.toMatchObject({ code: "ENOENT" });
      }
      await expect(readFile(join(productNamespaceRoot, "cache", "marker"), "utf8")).resolves.toBe("cache");
      await expect(readFile(join(config.roots.runtime.namespaceRoot, "cache", "marker"), "utf8")).resolves.toBe("cache");
      await expect(readFile(join(siblingNamespaceRoot, "keep"), "utf8")).resolves.toBe("sibling");
      await expect(readFile(join(retiredProductRoot, "keep"), "utf8")).resolves.toBe("retired");
    } finally {
      if (previousHome == null) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await rm(root, { force: true, recursive: true });
    }
  });

  it("applies portable state flags during cleanup without deleting adjacent namespace data", async () => {
    const root = await mkdtemp(join(tmpdir(), "clean-design-tools-pack-mac-cleanup-"));
    const previousHome = process.env.HOME;
    process.env.HOME = join(root, "home");

    try {
      const config = makeConfig(root, {
        namespace: "release-beta",
        removeData: true,
        removeLogs: false,
        removeProductUserData: true,
        removeSidecars: false,
      });
      const identity = resolveMacInstallIdentity(config);
      const productNamespaceRoot = join(
        process.env.HOME,
        "Library",
        "Application Support",
        identity.productName,
        "namespaces",
        config.namespace,
      );
      const siblingNamespaceRoot = join(
        process.env.HOME,
        "Library",
        "Application Support",
        identity.productName,
        "namespaces",
        "release-preview",
      );

      for (const scope of ["data", "logs", "runtime", "user-data", "cache"]) {
        await mkdir(join(productNamespaceRoot, scope), { recursive: true });
        await writeFile(join(productNamespaceRoot, scope, "marker"), scope, "utf8");
      }
      await mkdir(siblingNamespaceRoot, { recursive: true });
      await writeFile(join(siblingNamespaceRoot, "keep"), "sibling", "utf8");

      const result = await cleanupPackedMacNamespace(config);

      expect(result.removalPlan).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: join(productNamespaceRoot, "data"), scope: "data", willRemove: true }),
        expect.objectContaining({ path: join(productNamespaceRoot, "logs"), scope: "logs", willRemove: false }),
        expect.objectContaining({ path: join(productNamespaceRoot, "runtime"), scope: "sidecars", willRemove: false }),
        expect.objectContaining({ path: join(productNamespaceRoot, "user-data"), scope: "product-user-data", willRemove: true }),
      ]));
      await expect(access(join(productNamespaceRoot, "data"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(join(productNamespaceRoot, "user-data"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(join(productNamespaceRoot, "logs", "marker"), "utf8")).resolves.toBe("logs");
      await expect(readFile(join(productNamespaceRoot, "runtime", "marker"), "utf8")).resolves.toBe("runtime");
      await expect(readFile(join(productNamespaceRoot, "cache", "marker"), "utf8")).resolves.toBe("cache");
      await expect(readFile(join(siblingNamespaceRoot, "keep"), "utf8")).resolves.toBe("sibling");
    } finally {
      if (previousHome == null) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await rm(root, { force: true, recursive: true });
    }
  });
});
