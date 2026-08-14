import { cac } from "cac";
import type { CAC } from "cac";

import { resolveToolPackConfig, type ToolPackCliOptions } from "./config.js";
import {
  cleanupPackedMacNamespace,
  installPackedMacDmg,
  inspectPackedMacApp,
  packMac,
  readPackedMacLogs,
  startPackedMacApp,
  stopPackedMacApp,
  uninstallPackedMacApp,
} from "./mac/index.js";
type CliOptions = ToolPackCliOptions;

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printLogs(result: { logs: Record<string, { lines: string[]; logPath: string }>; namespace: string }, options: CliOptions): void {
  if (options.json === true) {
    printJson(result);
    return;
  }

  for (const [app, entry] of Object.entries(result.logs)) {
    process.stdout.write(`[${app}] ${entry.logPath}\n`);
    process.stdout.write(entry.lines.length > 0 ? `${entry.lines.join("\n")}\n` : "(no log lines)\n");
  }
}

type CacCommand = ReturnType<CAC["command"]>;

function addSharedOptions(command: CacCommand) {
  return command
    .option("--cache-dir <path>", "advanced escape hatch for relocating tools-pack cache")
    .option("--dir <path>", "tools-pack output/runtime root directory")
    .option("--json", "print JSON")
    .option("--namespace <name>", "runtime namespace")
    .option("--expr <expression>", "desktop inspect eval expression")
    .option("--path <path>", "desktop inspect screenshot path");
}

const MAC_TO_HELP = "build target: all|app|dmg|zip (default: all)";

function addBuildOptions(command: CacCommand) {
  return command
    .option("--app-version <version>", "override the packaged app version")
    .option("--portable", "do not bake local tools-pack runtime roots into the packaged config")
    .option("--signed", "build a signed mac artifact")
    .option("--notarize", "notarize a signed mac artifact")
    .option("--to <target>", MAC_TO_HELP);
}

function addMacBuildOptions(command: CacCommand) {
  return addBuildOptions(command)
    .option("--mac-compression <mode>", "mac artifact compression: normal|maximum|store (default: normal)");
}

function addMacLifecycleOptions(command: CacCommand) {
  return command
    .option("--remove-data", "remove current-namespace packaged data during uninstall/cleanup")
    .option("--remove-logs", "remove current-namespace packaged logs during uninstall/cleanup")
    .option("--remove-product-user-data", "remove current-product Electron userData for this namespace during uninstall/cleanup")
    .option("--remove-sidecars", "remove current-namespace packaged sidecar runtime during uninstall/cleanup");
}

const cli = cac("tools-pack");

addMacLifecycleOptions(
  addMacBuildOptions(addSharedOptions(cli.command("mac <action>", "Mac packaging commands: build|install|start|stop|logs|uninstall|cleanup|inspect"))),
).action(
  async (action: string, options: CliOptions) => {
    const config = resolveToolPackConfig(options);
    switch (action) {
      case "build":
        printJson(await packMac(config));
        return;
      case "install":
        printJson(await installPackedMacDmg(config));
        return;
      case "start":
        printJson(await startPackedMacApp(config));
        return;
      case "stop":
        printJson(await stopPackedMacApp(config));
        return;
      case "logs":
        printLogs(await readPackedMacLogs(config), options);
        return;
      case "inspect":
        printJson(await inspectPackedMacApp(config, options));
        return;
      case "uninstall":
        printJson(await uninstallPackedMacApp(config));
        return;
      case "cleanup":
        printJson(await cleanupPackedMacNamespace(config));
        return;
      default:
        throw new Error(`unsupported mac action: ${action}`);
    }
  },
);

cli.help();
cli.parse();
