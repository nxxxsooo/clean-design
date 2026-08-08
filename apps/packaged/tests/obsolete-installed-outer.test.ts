import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProcessSnapshot, StopProcessesResult } from "@open-design/platform";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createObsoleteInstalledOuterRetirement,
} from "../src/obsolete-installed-outer.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

type InspectInstalledOuterPath = (path: string) => Promise<{
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
} | null>;

function inspectedEntry(options: {
  directory?: boolean;
  symbolicLink?: boolean;
} = {}) {
  return {
    isDirectory: () => options.directory ?? false,
    isFile: () => !(options.directory ?? false),
    isSymbolicLink: () => options.symbolicLink ?? false,
  };
}

function macInspectMock(
  launchPath: string,
  executablePath: string,
  executableSymbolicLink = false,
): InspectInstalledOuterPath {
  return vi.fn(async (path) => {
    if (path === launchPath) return inspectedEntry({ directory: true });
    if (path === executablePath) return inspectedEntry({ symbolicLink: executableSymbolicLink });
    return null;
  });
}

async function createMacInstalledOuter(): Promise<{
  executablePath: string;
  inspectInstalledOuterPath?: InspectInstalledOuterPath;
  launchPath: string;
}> {
  if (process.platform === "win32") {
    const launchPath = "/Applications/Clean Design.app";
    const executablePath = `${launchPath}/Contents/MacOS/Clean Design`;
    return {
      executablePath,
      inspectInstalledOuterPath: macInspectMock(launchPath, executablePath),
      launchPath,
    };
  }
  const root = await mkdtemp(join(tmpdir(), "od-obsolete-outer-"));
  roots.push(root);
  const launchPath = join(root, "Clean Design.app");
  const executablePath = join(launchPath, "Contents", "MacOS", "Clean Design");
  await mkdir(join(launchPath, "Contents", "MacOS"), { recursive: true });
  await writeFile(executablePath, "legacy outer", "utf8");
  return { executablePath, launchPath };
}

function fileInspectMock(symbolicLink = false): InspectInstalledOuterPath {
  return vi.fn(async () => inspectedEntry({ symbolicLink }));
}

async function createWindowsInstalledOuter(
  executableName = "Clean Design.exe",
): Promise<{
  executablePath: string;
  inspectInstalledOuterPath?: InspectInstalledOuterPath;
  launchPath: string;
}> {
  if (process.platform !== "win32") {
    const executablePath = `C:\\Program Files\\Clean Design\\${executableName}`;
    return { executablePath, inspectInstalledOuterPath: fileInspectMock(), launchPath: executablePath };
  }
  const root = await mkdtemp(join(tmpdir(), "od-obsolete-outer-win-"));
  roots.push(root);
  const executablePath = join(root, executableName);
  await writeFile(executablePath, "legacy outer", "utf8");
  return { executablePath, launchPath: executablePath };
}

function snapshot(pid: number, ppid: number, command: string): ProcessSnapshot {
  return { command, pid, ppid };
}

function stopped(pids: number[]): StopProcessesResult {
  return {
    alreadyStopped: pids.length === 0,
    forcedPids: [],
    matchedPids: pids,
    remainingPids: [],
    stoppedPids: pids,
  };
}

function stopMock() {
  return vi.fn(async (pids: Array<number | null | undefined>) => stopped(
    pids.filter((pid): pid is number => pid != null),
  ));
}

describe("createObsoleteInstalledOuterRetirement", () => {
  it("stops only the exact installed outer root and its descendants", async () => {
    const { executablePath, inspectInstalledOuterPath, launchPath } = await createMacInstalledOuter();
    const snapshots = [
      snapshot(101, 1, executablePath),
      snapshot(102, 101, `${launchPath}/Contents/Frameworks/Clean Design Helper.app/Contents/MacOS/Clean Design Helper`),
      snapshot(103, 102, "helper-child"),
      snapshot(104, 1, `${executablePath} Helper`),
      snapshot(105, 1, "/unrelated/Clean Design"),
      snapshot(900, 1, "/payload/Clean Design.app/Contents/MacOS/Clean Design"),
    ];
    const stopProcesses = stopMock();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Clean Design.app/Contents/MacOS/Clean Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger,
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Clean Design.app/Contents/MacOS/Clean Design",
      platform: "darwin",
    }, {
      inspectInstalledOuterPath,
      listProcessSnapshots: async () => snapshots,
      stopProcesses,
    });

    const result = await retire();

    expect(stopProcesses).toHaveBeenCalledExactlyOnceWith([103, 102, 101]);
    expect(result).toMatchObject({
      executablePath,
      rootPids: [101],
      status: "retired",
      treePids: [103, 102, 101],
    });
    expect(logger.info).toHaveBeenCalledWith(
      "retired obsolete installed outer",
      expect.objectContaining({ rootPids: [101], stoppedPids: [103, 102, 101] }),
    );
  });

  it("does nothing outside an exact payload desktop process", async () => {
    const { launchPath } = await createMacInstalledOuter();
    const listProcessSnapshots = vi.fn(async () => []);
    const stopProcesses = vi.fn(async () => stopped([]));
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/installed/Clean Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: false,
      payloadExecutablePath: null,
      platform: "darwin",
    }, { listProcessSnapshots, stopProcesses });

    await expect(retire()).resolves.toMatchObject({ reason: "not-payload-desktop", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("rejects a symlinked install executable before enumerating processes", async () => {
    let inspectInstalledOuterPath: InspectInstalledOuterPath | undefined;
    let launchPath: string;
    if (process.platform === "win32") {
      launchPath = "/Applications/Clean Design.app";
      const executablePath = `${launchPath}/Contents/MacOS/Clean Design`;
      inspectInstalledOuterPath = macInspectMock(launchPath, executablePath, true);
    } else {
      const root = await mkdtemp(join(tmpdir(), "od-obsolete-outer-symlink-"));
      roots.push(root);
      launchPath = join(root, "Clean Design.app");
      const executableDirectory = join(launchPath, "Contents", "MacOS");
      const target = join(root, "target");
      await mkdir(executableDirectory, { recursive: true });
      await writeFile(target, "not the installed executable", "utf8");
      await symlink(target, join(executableDirectory, "Clean Design"));
    }
    const listProcessSnapshots = vi.fn(async () => []);
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Clean Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Clean Design",
      platform: "darwin",
    }, {
      inspectInstalledOuterPath,
      listProcessSnapshots,
      stopProcesses: async (pids) => stopped(pids.filter((pid): pid is number => pid != null)),
    });

    await expect(retire()).resolves.toMatchObject({ reason: "invalid-install-anchor", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
  });

  it("refuses to stop an outer tree that contains the current payload", async () => {
    const { executablePath, inspectInstalledOuterPath, launchPath } = await createMacInstalledOuter();
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Clean Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Clean Design",
      platform: "darwin",
    }, {
      inspectInstalledOuterPath,
      listProcessSnapshots: async () => [
        snapshot(101, 1, executablePath),
        snapshot(800, 101, "handoff daemon"),
        snapshot(900, 800, "/payload/Clean Design"),
        snapshot(901, 900, "payload helper"),
      ],
      stopProcesses,
    });

    await expect(retire()).resolves.toMatchObject({
      reason: "unsafe-current-descendant",
      status: "skipped",
    });
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("coalesces concurrent retirement requests without suppressing later opens", async () => {
    const { executablePath, inspectInstalledOuterPath, launchPath } = await createMacInstalledOuter();
    let releaseEnumeration: (() => void) | undefined;
    const listProcessSnapshots = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseEnumeration = resolve;
      });
      return [snapshot(101, 1, executablePath)];
    });
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "/payload/Clean Design",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "/payload/Clean Design",
      platform: "darwin",
    }, { inspectInstalledOuterPath, listProcessSnapshots, stopProcesses });

    const first = retire();
    const concurrent = retire();
    await vi.waitFor(() => expect(releaseEnumeration).toBeTypeOf("function"));
    releaseEnumeration?.();
    await Promise.all([first, concurrent]);
    expect(listProcessSnapshots).toHaveBeenCalledTimes(1);

    const later = retire();
    await vi.waitFor(() => expect(listProcessSnapshots).toHaveBeenCalledTimes(2));
    releaseEnumeration?.();
    await later;
  });
});

describe("Windows obsolete installed outer retirement", () => {
  it("stops the revalidated exact installed outer root and its current descendants", async () => {
    const { executablePath, inspectInstalledOuterPath, launchPath } = await createWindowsInstalledOuter();
    const firstSnapshots = [
      snapshot(201, 1, `"${executablePath.toUpperCase()}"`),
      snapshot(202, 201, "Clean Design.exe --type=gpu-process"),
      snapshot(203, 202, "Clean Design.exe --type=utility"),
      snapshot(204, 1, `"${executablePath}" cleandesign://project/123`),
      snapshot(205, 1, `${executablePath}.old`),
      snapshot(900, 1, "C:\\payload\\Clean Design.exe"),
    ];
    const secondSnapshots = [
      snapshot(201, 1, `"${executablePath}"`),
      snapshot(202, 201, "Clean Design.exe --type=gpu-process"),
      snapshot(206, 202, "Clean Design.exe --type=renderer"),
      snapshot(204, 1, `"${executablePath}" cleandesign://project/123`),
      snapshot(205, 1, `${executablePath}.old`),
      snapshot(900, 1, "C:\\payload\\Clean Design.exe"),
    ];
    const listProcessSnapshots = vi.fn()
      .mockResolvedValueOnce(firstSnapshots)
      .mockResolvedValueOnce(secondSnapshots);
    const stopProcesses = stopMock();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "C:\\PAYLOAD\\CLEAN DESIGN.EXE",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger,
      payloadDesktopProcess: true,
      payloadExecutablePath: "c:\\payload\\Clean Design.exe",
      platform: "win32",
    }, { inspectInstalledOuterPath, listProcessSnapshots, stopProcesses });

    const result = await retire();

    expect(listProcessSnapshots).toHaveBeenCalledTimes(2);
    expect(stopProcesses).toHaveBeenCalledExactlyOnceWith([206, 202, 201]);
    expect(result).toMatchObject({
      executablePath,
      rootPids: [201],
      status: "retired",
      treePids: [206, 202, 201],
    });
  });

  it("skips a reused root pid when the second snapshot no longer matches the executable", async () => {
    const { executablePath, inspectInstalledOuterPath, launchPath } = await createWindowsInstalledOuter();
    const listProcessSnapshots = vi.fn()
      .mockResolvedValueOnce([
        snapshot(201, 1, `"${executablePath}"`),
        snapshot(202, 201, "Clean Design.exe --type=gpu-process"),
      ])
      .mockResolvedValueOnce([
        snapshot(201, 1, "C:\\Windows\\System32\\notepad.exe"),
        snapshot(202, 201, "Clean Design.exe --type=gpu-process"),
      ]);
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "C:\\payload\\Clean Design.exe",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "C:\\payload\\Clean Design.exe",
      platform: "win32",
    }, { inspectInstalledOuterPath, listProcessSnapshots, stopProcesses });

    await expect(retire()).resolves.toMatchObject({ reason: "no-match", status: "skipped" });
    expect(listProcessSnapshots).toHaveBeenCalledTimes(2);
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("rejects installed executables whose basename does not match the payload", async () => {
    const { inspectInstalledOuterPath, launchPath } = await createWindowsInstalledOuter("Not Clean Design.exe");
    const listProcessSnapshots = vi.fn(async () => []);
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "C:\\payload\\Clean Design.exe",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "C:\\payload\\Clean Design.exe",
      platform: "win32",
    }, { inspectInstalledOuterPath, listProcessSnapshots, stopProcesses });

    await expect(retire()).resolves.toMatchObject({ reason: "invalid-install-anchor", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("refuses a revalidated outer tree that contains the current payload", async () => {
    const { executablePath, inspectInstalledOuterPath, launchPath } = await createWindowsInstalledOuter();
    const snapshots = [
      snapshot(201, 1, `"${executablePath}"`),
      snapshot(800, 201, "handoff daemon"),
      snapshot(900, 800, "C:\\payload\\Clean Design.exe"),
    ];
    const listProcessSnapshots = vi.fn(async () => snapshots);
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "C:\\payload\\Clean Design.exe",
      currentPid: 900,
      installedLaunchPath: launchPath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "C:\\payload\\Clean Design.exe",
      platform: "win32",
    }, { inspectInstalledOuterPath, listProcessSnapshots, stopProcesses });

    await expect(retire()).resolves.toMatchObject({
      reason: "unsafe-current-descendant",
      status: "skipped",
    });
    expect(listProcessSnapshots).toHaveBeenCalledTimes(2);
    expect(stopProcesses).not.toHaveBeenCalled();
  });

  it("rejects a symlinked Windows executable before enumerating processes", async () => {
    const executablePath = "C:\\Program Files\\Clean Design\\Clean Design.exe";
    const listProcessSnapshots = vi.fn(async () => []);
    const stopProcesses = stopMock();
    const retire = createObsoleteInstalledOuterRetirement({
      currentExecutablePath: "C:\\payload\\Clean Design.exe",
      currentPid: 900,
      installedLaunchPath: executablePath,
      logger: { info: vi.fn(), warn: vi.fn() },
      payloadDesktopProcess: true,
      payloadExecutablePath: "C:\\payload\\Clean Design.exe",
      platform: "win32",
    }, {
      inspectInstalledOuterPath: fileInspectMock(true),
      listProcessSnapshots,
      stopProcesses,
    });

    await expect(retire()).resolves.toMatchObject({ reason: "invalid-install-anchor", status: "skipped" });
    expect(listProcessSnapshots).not.toHaveBeenCalled();
    expect(stopProcesses).not.toHaveBeenCalled();
  });
});
