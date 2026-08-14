#!/usr/bin/env node
// @ts-nocheck
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { runDaemonCliStartup, startDaemonRuntime } from './daemon-startup.js';
import { runArtifactsCli } from './artifacts-cli.js';
import { runProjectHandoff } from './handoff-cli.js';
import { runDesignToolCli } from './tools-design-cli.js';
import { runDesignSystemsToolCli } from './tools-design-systems-cli.js';
import { DESIGN_SYSTEMS_USAGE, isDesignSystemsHelpArg } from './cli-help/index.js';
import { BRAND_USAGE, isBrandHelpArg } from './cli-help/index.js';
import { parseDesignSystemRenameArgs } from './design-systems/rename-args.js';
import { runLiveArtifactsToolCli } from './tools-live-artifacts-cli.js';
import { splitResearchSubcommand } from './research/cli-args.js';
import { resolveDaemonUrl } from './daemon-url.js';
import { requestJsonIpc } from '@open-design/sidecar';
import { SIDECAR_ENV, SIDECAR_MESSAGES } from '@open-design/sidecar-proto';
import { EXPORT_FORMATS, EXPORT_IMAGE_FORMATS } from '@open-design/contracts';
import { buildExportCliRequestBody, buildExportCliResultEnvelope, resolveExportCliDeckMode } from './export-cli-request.js';
import { exportRoutePath } from './export-cli-routing.js';

const argv = process.argv.slice(2);

const RESUME_CONTINUE_PROMPT =
  'The previous turn was interrupted by a transient failure. ' +
  'If your last response was cut off, continue it from where you left off ' +
  'and keep any work already completed; otherwise complete the original ' +
  'request. Inspect the current project files as needed before making ' +
  'further changes.';

// ---- Subcommand router ----------------------------------------------------
//
// `od` is two CLIs glued together:
//   - default mode: starts the daemon + opens the web UI.
//   - `od media …`: a thin client that POSTs to the running daemon. This
//     is what the code agent invokes from inside a chat to actually
//     produce image / video / audio bytes (the unifying contract).
//
// We dispatch on the first positional argument so flags like --port keep
// working unchanged. Subcommand routing is keyword-based; flags are
// parsed inside each handler.

// Flags accepted by `od media generate`. Whitelisted so a hallucinated
// `--length 5` from the LLM fails fast instead of silently no-op'ing
// while we route a bogus body to the daemon.
//
// Hoisted to the top of the module *before* the subcommand dispatch
// below: top-level `await SUBCOMMAND_MAP[first](rest)` runs runMedia
// synchronously during module evaluation, and runMedia references these
// `const` Sets — leaving them at the bottom of the file would hit the
// TDZ ("Cannot access 'MEDIA_GENERATE_STRING_FLAGS' before
// initialization") and crash every `od media …` invocation.
const MEDIA_GENERATE_STRING_FLAGS = new Set([
  'project',
  'surface',
  'model',
  'prompt',
  'prompt-file',
  'output',
  'aspect',
  'length',
  'duration',
  'prompt-influence',
  'voice',
  'audio-kind',
  'composition-dir',
  'image',
  'daemon-url',
  'language',
]);
const MEDIA_GENERATE_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  'loop',
]);

const RESEARCH_SEARCH_STRING_FLAGS = new Set([
  'query',
  'max-sources',
  'daemon-url',
]);
const RESEARCH_SEARCH_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
]);

const PLUGIN_STRING_FLAGS = new Set([
  'daemon-url',
  'source',
  'inputs',
  'project',
  'conversation',
  'message',
  'agent',
  'model',
  'snapshot-id',
  'capabilities',
  'grant-caps',
  'before',
  'trust',
  'tag',
  'policy',
  'version',
  'reason',
  'catalog',
  'host',
  'name',
]);
const PLUGIN_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  'json',
  'revoke',
  'follow',
  'strict',
]);

const UI_STRING_FLAGS = new Set([
  'daemon-url',
  'run',
  'project',
  'value',
  'value-json',
  'plugin',
  'snapshot-id',
  'persist',
  'kind',
]);
const UI_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  'json',
  'skip',
  // Plan §6 Phase 2A.5 — `od ui show --schema` returns just the
  // surface's JSON Schema (or `null` when the surface declares
  // none). Lets a code agent inspect the contract before piping a
  // value back through `od ui respond --value-json`.
  'schema',
]);

// Hoist flag set bindings consumed by handlers reachable through
// the top-of-file dispatcher. The dispatch block runs synchronously
// during module load; any const declared further down the file is
// still in TDZ when the handler executes, so `od status` /
// `od atoms list` / etc. would crash with `Cannot access X before
// initialization`.
const DAEMON_STRING_FLAGS = new Set([
  'daemon-url', 'port', 'host',
]);
const DAEMON_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json', 'headless', 'serve-web', 'no-open',
]);
const LIBRARY_STRING_FLAGS = new Set(['daemon-url', 'query', 'tag']);
const LIBRARY_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
// `od library …` (OD Library asset registry). Hoisted so the dispatcher can
// parse flags without hitting a temporal-dead-zone on these sets.
const LIBRARY_ASSET_STRING_FLAGS = new Set([
  'daemon-url', 'kind', 'tag', 'source', 'date', 'query', 'project', 'label', 'out', 'dir',
]);
const LIBRARY_ASSET_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
const DIAGNOSTICS_STRING_FLAGS = new Set(['daemon-url', 'output']);
const DIAGNOSTICS_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
const CONFIG_STRING_FLAGS = new Set(['daemon-url', 'value', 'value-json']);
const CONFIG_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
const MESSAGE_CENTER_STRING_FLAGS = new Set([
  'daemon-url',
  'locale',
  'filter',
  'limit',
  'cursor',
]);
const MESSAGE_CENTER_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
const PROJECT_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'skill', 'design-system', 'plugin', 'metadata-json',
  'pending-prompt', 'project', 'conversation', 'message', 'prompt',
  'prompt-file', 'path', 'dir', 'as',
  'agent', 'model', 'snapshot-id', 'inputs', 'grant-caps', 'editor',
  'title', 'label', 'against', 'seed-from', 'fork-after', 'mode',
  'source',
]);
const PROJECT_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'follow']);
// `od templates …` mirrors NewProjectPanel / ExamplesTab. Same surface,
// same /api/templates store. The CLI form is the embeddability contract:
// external agents (hermes-agent, openclaw, ...) can snapshot, list, or
// remove user-saved project templates without going through the web UI.
const TEMPLATES_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'description',
]);
const TEMPLATES_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
const MEMORY_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'description', 'type', 'body', 'body-file',
  // `od memory profile set` reads structured fields verbatim and/or a prose
  // body; `--field "Label=Value"` is repeatable (scanned manually below since
  // parseFlags collapses duplicate keys). `--prompt-file <path|->` mirrors the
  // long-prose embeddability contract used by `od brand`.
  'field', 'prompt-file', 'assertion', 'check', 'rationale',
  // `od memory rule suggest` distils annotations into rule proposals: a single
  // `--note` plus optional target context, or a `--prompt-file` carrying a JSON
  // array of annotations / newline-separated notes.
  'note', 'target', 'file', 'current-text',
  // `od memory config` toggles accept true|false values (string, not boolean)
  // so an agent can set OR clear a hook in one shape: `--profile false`.
  'enabled', 'profile', 'rewrite', 'verify', 'extraction',
]);
const MEMORY_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json',
]);
// Defined near the top because `runFigma` is reachable through the
// top-of-file SUBCOMMAND_MAP dispatch during module evaluation; a `const`
// further down would still be in TDZ when the handler reads it.
const FIGMA_STRING_FLAGS = new Set([
  'daemon-url', 'project', 'file', 'figma-url', 'notes', 'prompt', 'prompt-file',
]);
const FIGMA_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json', 'build',
]);
// `od brand …` mirrors the Brands library + New Brand modal. Same surface,
// same /api/brands store. The CLI form is the embeddability contract: an
// external agent (hermes-agent, openclaw, scripted job) can extract, list,
// inspect, and remove brands headlessly without rendering the web UI.
// Hoisted next to the other dispatch-touched flag sets because runBrand is
// reachable through the top-of-file SUBCOMMAND_MAP dispatch, which runs during
// module evaluation — a const declared further down would still be in TDZ.
const BRAND_STRING_FLAGS = new Set([
  'daemon-url', 'prompt-file', 'project', 'locale',
  'html-file', 'css-file', 'base-url',
]);
const BRAND_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json',
]);
const RECOVERABLE_EXIT_CODES = {
  'daemon-not-running':       64,
  'plugin-not-found':         65,
  'snapshot-not-found':       65,
  'capabilities-required':    66,
  'missing-input':            67,
  'project-not-found':        68,
  'run-not-found':            69,
  'provider-not-configured':  70,
  'plugin-requires-daemon':   71,
  'snapshot-stale':           72,
  'genui-surface-awaiting':   73,
  'desktop-auth-pending':     74,
  'desktop-import-token-rejected': 75,
};
const PLUGIN_LIST_FILTER_FLAGS = new Set([
  ...PLUGIN_STRING_FLAGS,
  'task-kind', 'mode', 'tag', 'trust',
]);
const PLUGIN_LIST_BOOLEAN_FLAGS = new Set([
  ...PLUGIN_BOOLEAN_FLAGS,
  'bundled', 'no-bundled',
]);

const SUBCOMMAND_MAP = {
  artifacts: runArtifacts,
  media: runMedia,
  research: runResearch,
  brand: runBrand,
  brands: runBrand,
  project: runProject,
  memory: runMemory,
  run: runRun,
  files: runFiles,
  templates: runTemplates,
  conversation: runConversation,
  chat: runChat,
  daemon: runDaemon,
  atoms: runAtoms,
  skills: runSkills,
  'design-systems': runDesignSystems,
  craft: runCraft,
  diagnostics: runDiagnostics,
  export: runExport,
  status: runStatus,
  version: runVersion,
  doctor: runDoctor,
  config: runConfig,
  library: runLibrary,
  figma: runFigma,
};

const EXPORT_STRING_FLAGS = new Set([
  'daemon-url', 'project', 'format', 'out', 'output', 'image-format', 'title', 'file',
]);
const EXPORT_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'deck', 'page', 'no-deck']);
// EXPORT_FORMATS / EXPORT_IMAGE_FORMATS are the shared contract DTO (single
// source of truth for the web/daemon/CLI export surface), imported above.

function printExportHelp() {
  console.log(`Usage:
  od export <file> --project <id> --format <fmt> [options]

Programmatic export of an HTML/deck artifact to PDF, image, or PPTX. Runs
entirely from the rendered design (no model/agent calls). Rasterization uses
the desktop runtime's bundled Chromium, so a desktop/packaged runtime must be
reachable; otherwise the command reports that the renderer is unavailable.

Formats:  ${EXPORT_FORMATS.join(', ')}

Options:
  --project <id>           Project id (required)
  --format <fmt>           One of: ${EXPORT_FORMATS.join(' | ')} (required)
  --out <path>             Write the file here (defaults to the suggested name)
  --image-format <fmt>     png | jpeg (for --format image)
  --deck                   Treat the artifact as a multi-slide deck
  --page, --no-deck        Treat the artifact as a normal scrollable page
  --title <title>          Title used for metadata / default filename
  --json                   Print a machine-readable result envelope
  --daemon-url <url>       Override daemon URL

Examples:
  od export index.html --project p1 --format pdf --out page.pdf
  od export slide.html --project p1 --format image --image-format png --out slide.png
  od export deck.html --project p1 --format pptx --out deck.pptx`);
}

async function runExport(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printExportHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  let flags;
  try {
    flags = parseFlags(args, { string: EXPORT_STRING_FLAGS, boolean: EXPORT_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const pos = positionalArgs(args, EXPORT_STRING_FLAGS);
  const file = flags.file || pos[0];
  const projectId = flags.project || process.env.OD_PROJECT_ID;
  const format = flags.format;
  if (!file || !projectId || !format) {
    printExportHelp();
    process.exit(2);
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    console.error(`invalid --format: ${format} (expected ${EXPORT_FORMATS.join(' | ')})`);
    process.exit(2);
  }
  if (flags['image-format'] && !(EXPORT_IMAGE_FORMATS as readonly string[]).includes(flags['image-format'])) {
    console.error(`invalid --image-format: ${flags['image-format']} (expected ${EXPORT_IMAGE_FORMATS.join(' | ')})`);
    process.exit(2);
  }
  if (flags['image-format'] && format !== 'image') {
    console.error('--image-format is only valid with --format image');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  // All three formats rasterize through the desktop screenshot renderer so the
  // CLI matches the UI exactly. In particular `pdf` uses `/export/pdf-image`
  // (one raster page per deck slide / per viewport for a page) — NOT the generic
  // `/export` vector `printToPDF` path, which drops CJK glyphs in the packaged
  // runtime and is the bug this feature exists to avoid.
  const exportPath = exportRoutePath(format);
  let deckMode;
  try {
    deckMode = resolveExportCliDeckMode({
      format,
      deck: flags.deck === true,
      page: flags.page === true,
      noDeck: flags['no-deck'] === true,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
  const requestBody = buildExportCliRequestBody({
    fileName: file,
    format,
    deck: deckMode,
    ...(format === 'image' && flags['image-format'] ? { imageFormat: flags['image-format'] } : {}),
    ...(flags.title ? { title: flags.title } : {}),
  });
  let resp;
  try {
    resp = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/${exportPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const buffer = Buffer.from(await resp.arrayBuffer());
  let out = flags.out || flags.output;
  if (!out) {
    const cd = resp.headers.get('content-disposition') || '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plain = /filename="([^"]+)"/i.exec(cd);
    if (star && star[1]) {
      try { out = decodeURIComponent(star[1]); } catch { out = plain && plain[1] ? plain[1] : null; }
    } else if (plain && plain[1]) {
      out = plain[1];
    }
    if (!out) {
      const ext = format === 'image'
        ? (flags['image-format'] === 'jpeg' ? 'jpg' : 'png')
        : format === 'pptx' ? 'pptx' : 'pdf';
      out = `artifact.${ext}`;
    }
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(out, buffer);
  if (flags.json) {
    return process.stdout.write(
      JSON.stringify(buildExportCliResultEnvelope({ path: out, bytes: buffer.length, format }), null, 2) + '\n',
    );
  }
  console.log(`wrote ${out} (${buffer.length} bytes)`);
}

const first = argv.find((a) => !a.startsWith('-'));
if (first && SUBCOMMAND_MAP[first]) {
  const idx = argv.indexOf(first);
  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 1)];
  await SUBCOMMAND_MAP[first](rest);
  process.exit(0);
}

if (argv[0] === 'tools' && argv[1] === 'live-artifacts') {
  runLiveArtifactsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else if (argv[0] === 'tools' && argv[1] === 'design') {
  const localCommand = argv[2];
  if (localCommand !== 'github-design-context'
      && localCommand !== 'local-design-context'
      && localCommand !== 'design-system-package-audit') {
    process.stderr.write(`${JSON.stringify({ ok: false, error: { message: 'Unsupported design tool command.' } })}\n`);
    process.exitCode = 64;
  } else runDesignToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else if (argv[0] === 'tools' && argv[1] === 'directions') {
  // Agent-facing pull layer for the direction library: the slim prompt
  // carries only an id+label index and the agent fetches the chosen
  // direction's full spec (palette, font stacks, posture) here.
  runDirectionsToolCli(argv.slice(2));
} else if (argv[0] === 'tools' && argv[1] === 'design-systems') {
  runDesignSystemsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else {
  await runDaemonCliStartup(argv, { printHelp: printRootHelp });
}

async function runDirectionsToolCli(args) {
  const { DESIGN_DIRECTIONS, formatDirectionSpecText } = await import(
    './prompts/directions.js'
  );
  const wantJson = args.includes('--json');
  // Agents call this command straight from the prompt contract, so malformed
  // invocations must fail fast instead of falling through to the full list
  // or swallowing the next flag as the value.
  const readFlagValue = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    if (idx === -1) return null;
    if (args.indexOf(flag, idx + 1) !== -1) {
      console.error(`duplicate ${flag} flag`);
      process.exit(1);
    }
    const value = args[idx + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`missing value for ${flag}`);
      process.exit(1);
    }
    return value;
  };
  const idValue = readFlagValue('--id');
  const labelValue = readFlagValue('--label');
  if (idValue !== null && labelValue !== null) {
    console.error('pass either --id or --label, not both');
    process.exit(1);
  }
  const needle = idValue ?? labelValue;
  if (needle) {
    if (wantJson) {
      const match = DESIGN_DIRECTIONS.find(
        (d) =>
          d.id.toLowerCase() === String(needle).trim().toLowerCase() ||
          d.label.toLowerCase() === String(needle).trim().toLowerCase(),
      );
      if (!match) {
        console.error(`unknown direction: ${needle}`);
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(match) + '\n');
      return;
    }
    const spec = formatDirectionSpecText(String(needle));
    if (!spec) {
      console.error(
        `unknown direction: ${needle}\nRun \`od tools directions\` to list ids.`,
      );
      process.exit(1);
    }
    process.stdout.write(spec + '\n');
    return;
  }
  if (wantJson) {
    process.stdout.write(
      JSON.stringify(DESIGN_DIRECTIONS.map(({ id, label }) => ({ id, label }))) + '\n',
    );
    return;
  }
  for (const d of DESIGN_DIRECTIONS) {
    console.log(`${d.id}\t${d.label}`);
  }
}

function printRootHelp() {
  console.log(`Usage:
  od [--port <n>] [--host <addr>] [--no-open]
      Start the local daemon and open the web UI.

  od tools live-artifacts <create|list|update|refresh> [options]
      Manage live artifacts through daemon wrapper commands.

  od tools directions [--id <id> | --label <label>] [--json]
      List the built-in design directions, or print one direction's full
      palette / font stacks / posture spec for binding into :root.

  od artifacts create --name <path> --input <file> [--project <id-or-name>]
      Create a normal project artifact through the local daemon.

  od tools design <github-design-context|local-design-context|design-system-package-audit> [options]
      Inspect a user-selected local source or audit a local design-system package.

  od tools design-systems read --path <manifest-declared-path>
      Read active design-system pull-layer files through daemon wrapper commands.

  od research search --query <text> [--max-sources 5] [--daemon-url <url>]
      Run agent-callable Tavily research through the local daemon.

  od memory tree <list|view|edit|move> [args]
      Inspect and edit the memory tree that is injected into agent prompts.

  od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<t>"] [--json]
      Create a Side Chat: a new conversation that inherits another
      conversation's context by copying its messages (--seed-from), optionally
      stopping at one message (--fork-after). Mirrors the web chat fork action.

  od diagnostics export [<path>] [--json]
      Bundle daemon/web/desktop logs, machine info, and recent crash reports
      into a zip for support tickets. Same output as Settings → About →
      Export diagnostics.

  od export <file> --project <id> --format <pdf|image|pptx> [--out <path>]
      Programmatically export an HTML/deck artifact to PDF, image, or PPTX
      (no model/agent calls). Mirrors the web Download menu; rasterization uses
      the desktop runtime's bundled Chromium.

  "$OD_NODE_BIN" "$OD_BIN" tools ...
      Recommended agent-runtime form; avoids relying on user PATH for od or node.

  od media generate --surface <image|video|audio> --model <id> [opts]
      Generate a media artifact and write it into the active project.
      Designed to be invoked by a code agent - picks up OD_DAEMON_URL
      and OD_PROJECT_ID from the env that the daemon injected on spawn.

Options:
  --port <n>       Port to listen on (default: 7456, env: OD_PORT).
  --host <addr>    Interface address to bind to (default: 127.0.0.1, env: OD_BIND_HOST).
                   Set to a specific IP (e.g. a Tailscale address) to restrict access
                   to that interface only.
  --no-open        Do not open the browser after start.

What the daemon does:
  * scans PATH for supported code-agent CLIs (claude, codex, opencode, pi, antigravity)
  * serves the chat UI at http://<host>:<port>
  * proxies messages (text + images) to the selected agent via child-process spawn
  * exposes /api/projects/:id/media/generate — the unified image/video/audio
     dispatcher that the agent calls via \`od media generate\`.`);
}

// ---------------------------------------------------------------------------
// Subcommand: od research …
// ---------------------------------------------------------------------------

async function runResearch(args) {
  const { sub, subArgs } = splitResearchSubcommand(args);
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printResearchHelp();
    process.exit(sub === 'help' || args.includes('--help') || args.includes('-h') ? 0 : 2);
  }
  if (sub !== 'search') {
    console.error(`unknown subcommand: od research ${sub}`);
    printResearchHelp();
    process.exit(2);
  }
  return runResearchSearch(subArgs);
}

async function runResearchSearch(rawArgs) {
  let flags;
  try {
    flags = parseFlags(rawArgs, {
      string: RESEARCH_SEARCH_STRING_FLAGS,
      boolean: RESEARCH_SEARCH_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printResearchHelp();
    process.exit(2);
  }
  const query = typeof flags.query === 'string' ? flags.query.trim() : '';
  if (!query) {
    console.error('--query required');
    process.exit(2);
  }
  const daemonUrl = await cliDaemonUrl(flags);
  const maxSources =
    flags['max-sources'] == null ? undefined : Number(flags['max-sources']);
  const url = `${daemonUrl.replace(/\/$/, '')}/api/research/search`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        ...(Number.isFinite(maxSources) ? { maxSources } : {}),
      }),
    });
  } catch (err) {
    surfaceFetchError(err, daemonUrl);
    process.exit(3);
  }
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`daemon ${resp.status}: ${text}`);
    process.exit(4);
  }
  process.stdout.write(`${await resp.text()}\n`);
}

async function runArtifacts(args) {
  const { exitCode } = await runArtifactsCli(args);
  process.exit(exitCode);
}

function printResearchHelp() {
  console.log(`Usage:
  od research search --query <text> [--max-sources 5] [--daemon-url <url>]

Runs Tavily-backed shallow research through the local Clean Design daemon.
Output is JSON only on stdout:
  { "query": "...", "summary": "...", "sources": [...], "provider": "tavily", "depth": "shallow", "fetchedAt": 0 }

Flags:
  --query        Required search query.
  --max-sources  Optional source cap. Defaults to 5, clamped to Tavily's max.
  --daemon-url   Local daemon URL. Defaults to OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456.`);
}

// ---------------------------------------------------------------------------
// Subcommand: od media …
// ---------------------------------------------------------------------------

async function runMedia(args) {
  const sub = args.find((a) => !a.startsWith('-')) || '';
  if (sub === 'help' || sub === '-h' || sub === '--help' || sub === '') {
    printMediaHelp();
    return;
  }
  if (sub !== 'generate' && sub !== 'wait') {
    console.error(`unknown subcommand: od media ${sub}`);
    printMediaHelp();
    process.exit(1);
  }

  const idx = args.indexOf(sub);
  const subArgs = [...args.slice(0, idx), ...args.slice(idx + 1)];
  if (sub === 'wait') return runMediaWait(subArgs);
  return runMediaGenerate(subArgs);
}

async function runMediaGenerate(rawArgs) {
  let flags;
  try {
    flags = parseFlags(rawArgs, {
      string: MEDIA_GENERATE_STRING_FLAGS,
      boolean: MEDIA_GENERATE_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printMediaHelp();
    process.exit(2);
  }

  const daemonUrl = await cliDaemonUrl(flags);
  const projectId = flags.project || process.env.OD_PROJECT_ID;
  const token = process.env.OD_TOOL_TOKEN;
  if (!projectId && !token) {
    console.error(
      'project id required. Pass --project <id> or set OD_PROJECT_ID. The daemon injects this when it spawns the code agent.',
    );
    process.exit(2);
  }

  const surface = flags.surface;
  if (!surface || !['image', 'video', 'audio'].includes(surface)) {
    console.error('--surface must be one of: image | video | audio');
    process.exit(2);
  }
  if (!flags.model) {
    console.error('--model required (see http://<daemon>/api/media/models)');
    process.exit(2);
  }

  // Long-form media prompts (detailed image/video descriptions, program-
  // generated prompts) arrive via --prompt-file <path|-> (stdin) per the CLI
  // contract; readPromptFromFlags prefers an inline --prompt and otherwise reads
  // the file/stdin, matching od run / od brand.
  const prompt = await readPromptFromFlags(flags);

  const body = {
    surface,
    model: flags.model,
    prompt,
    output: flags.output,
    aspect: flags.aspect,
    voice: flags.voice,
    audioKind: flags['audio-kind'],
    compositionDir: flags['composition-dir'],
    image: flags.image,
    language: flags.language,
  };
  if (flags.length != null) body.length = Number(flags.length);
  if (flags.duration != null) body.duration = Number(flags.duration);
  if (flags['prompt-influence'] != null) body.promptInfluence = Number(flags['prompt-influence']);
  if (flags.loop === true) body.loop = true;

  const url = token
    ? `${daemonUrl.replace(/\/$/, '')}/api/tools/media/generate`
    : `${daemonUrl.replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/media/generate`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, daemonUrl);
    process.exit(3);
  }
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`daemon ${resp.status}: ${text}`);
    process.exit(4);
  }
  const accepted = await resp.json();
  const { taskId } = accepted;
  if (!taskId) {
    console.error('daemon did not return a taskId');
    process.exit(4);
  }
  console.error(`task ${taskId} queued (${accepted.status || 'queued'})`);
  await pollUntilDoneOrBudget(daemonUrl, taskId, 0, {
    stillRunningExitCode: 0,
  });
}

async function runMediaWait(rawArgs) {
  const taskId = rawArgs.find((a) => a && !a.startsWith('--'));
  if (!taskId) {
    console.error('usage: od media wait <taskId> [--since <n>] [--daemon-url <url>]');
    process.exit(2);
  }
  const flagsOnly = rawArgs.filter((a) => a !== taskId);
  let flags;
  try {
    flags = parseFlags(flagsOnly, {
      string: new Set(['since', 'daemon-url']),
      boolean: new Set(['help', 'h']),
    });
  } catch (err) {
    console.error(err.message);
    printMediaHelp();
    process.exit(2);
  }
  const daemonUrl = await cliDaemonUrl(flags);
  const since = Number.isFinite(Number(flags.since))
    ? Number(flags.since)
    : 0;
  await pollUntilDoneOrBudget(daemonUrl, taskId, since, { totalBudgetMs: 120_000 });
}

async function pollUntilDoneOrBudget(daemonUrl, taskId, sinceStart, options = {}) {
  const totalBudgetMs = typeof options.totalBudgetMs === 'number' ? options.totalBudgetMs : 25_000;
  const perCallTimeoutMs = 4_000;
  const stillRunningExitCode =
    typeof options.stillRunningExitCode === 'number'
      ? options.stillRunningExitCode
      : 2;
  const startedAt = Date.now();
  const url = `${daemonUrl.replace(/\/$/, '')}/api/media/tasks/${encodeURIComponent(taskId)}/wait`;

  let since = Number.isFinite(sinceStart) ? sinceStart : 0;
  let lastSnapshot = null;

  while (Date.now() - startedAt < totalBudgetMs) {
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    const callTimeout = Math.max(500, Math.min(perCallTimeoutMs, remaining));
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, timeoutMs: callTimeout }),
      });
    } catch (err) {
      surfaceFetchError(err, daemonUrl);
      process.exit(3);
    }
    if (resp.status === 404) {
      console.error(`task ${taskId} not found (expired or never queued)`);
      process.exit(4);
    }
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`daemon ${resp.status}: ${text}`);
      process.exit(4);
    }
    let snap;
    try {
      snap = await resp.json();
    } catch {
      console.error('daemon returned non-JSON for /wait');
      process.exit(4);
    }
    lastSnapshot = snap;
    if (Array.isArray(snap.progress)) {
      for (const line of snap.progress) {
        process.stderr.write(line + '\n');
        process.stdout.write(`# ${line}\n`);
      }
    }
    if (typeof snap.nextSince === 'number') since = snap.nextSince;

    if (snap.status === 'done') {
      const file = snap.file || {};
      const warnings = Array.isArray(file.warnings) ? file.warnings : [];
      for (const w of warnings) {
        if (typeof w === 'string' && w) console.error(`WARN: ${w}`);
      }
      if (file.providerError) {
        const provider = file.providerId || 'provider';
        console.error(
          `WARN: ${provider} call failed — wrote stub fallback (${file.size} bytes) to ${file.name}`,
        );
        console.error(`WARN: reason: ${file.providerError}`);
        console.error(
          'WARN: surface this verbatim to the user. Do NOT claim the stub is the final result.',
        );
      }
      process.stdout.write(JSON.stringify({ file }) + '\n');
      process.exit(file.providerError ? 5 : 0);
    }
    if (snap.status === 'failed') {
      const msg = snap.error?.message || 'task failed';
      console.error(`task failed: ${msg}`);
      process.stdout.write(
        JSON.stringify({ taskId, status: 'failed', error: snap.error || {} }) + '\n',
      );
      process.exit(snap.error?.status || 5);
    }
    if (snap.status === 'interrupted') {
      const msg = snap.error?.message || 'task interrupted';
      console.error(`task interrupted: ${msg}`);
      process.stdout.write(
        JSON.stringify({ taskId, status: 'interrupted', error: snap.error || {} }) + '\n',
      );
      process.exit(snap.error?.status || 5);
    }
  }

  const handoff = {
    taskId,
    status: lastSnapshot?.status || 'running',
    nextSince: since,
    elapsed: Math.round((Date.now() - startedAt) / 1000),
  };
  process.stdout.write(JSON.stringify(handoff) + '\n');
  const stillRunningHint =
    stillRunningExitCode === 0
      ? 'This is a successful queued/running handoff, not a failure.'
      : `exit code ${stillRunningExitCode} = still running.`;
  process.stderr.write(
    `task ${taskId} still running after ${handoff.elapsed}s. ` +
      `Run \`"$OD_NODE_BIN" "$OD_BIN" media wait ${taskId} --since ${since}\` to continue in an agent runtime ` +
      `(${stillRunningHint}).\n`,
  );
  process.exit(stillRunningExitCode);
}

function surfaceFetchError(err, daemonUrl) {
  const cause = err && typeof err === 'object' ? err.cause : null;
  const code =
    cause && typeof cause === 'object' && typeof cause.code === 'string'
      ? cause.code
      : null;
  const causeMsg =
    cause && typeof cause === 'object' && typeof cause.message === 'string'
      ? cause.message
      : '';
  let detail = err && err.message ? err.message : String(err);
  if (code) detail = `${code}${causeMsg ? ` — ${causeMsg}` : ''}`;
  else if (causeMsg) detail = causeMsg;
  console.error(`failed to reach daemon at ${daemonUrl}: ${detail}`);
  if (code === 'EPERM' || code === 'ENETUNREACH') {
    console.error(
      'hint: outbound connect was denied by a sandbox. If you launched ' +
        'this command from a code agent, check the agent\'s sandbox / ' +
        'network policy. The Clean Design daemon itself is unaffected - it can be ' +
        'reached from a regular shell.',
    );
  }
}

function parseFlags(argv, opts = {}) {
  const stringFlags = opts.string instanceof Set ? opts.string : new Set();
  const booleanFlags = opts.boolean instanceof Set ? opts.boolean : new Set();
  const knownFlags = new Set([...stringFlags, ...booleanFlags]);
  // Positionals collected silently; callers that take `<id>` style
  // positional args (e.g. `od plugin info <id>`) re-scan `argv`
  // themselves to pick them up. Strict positional rejection here
  // would break those commands, so we only enforce strict-flag
  // semantics for things that *are* prefixed with `--`.
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) {
      // Positional — let the caller decide what to do with it.
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (knownFlags.size > 0 && !knownFlags.has(key)) {
      throw new Error(
        `unknown flag: --${key}. Run with --help for the list of accepted flags.`,
      );
    }
    if (eq >= 0) {
      out[key] = a.slice(eq + 1);
      continue;
    }
    if (booleanFlags.has(key)) {
      out[key] = true;
      continue;
    }
    if (stringFlags.has(key)) {
      const next = argv[i + 1];
      if (next == null) {
        throw new Error(`flag --${key} requires a value`);
      }
      out[key] = next;
      i++;
      continue;
    }
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function readPromptFromFlags(flags) {
  if (typeof flags.prompt === 'string' && flags.prompt.length > 0) {
    return flags.prompt;
  }
  if (typeof flags['prompt-file'] === 'string' && flags['prompt-file'].length > 0) {
    const promptPath = flags['prompt-file'];
    if (promptPath === '-') {
      return await new Promise((resolve, reject) => {
        let buffer = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { buffer += chunk; });
        process.stdin.on('end', () => resolve(buffer));
        process.stdin.on('error', reject);
      });
    }
    const { readFile } = await import('node:fs/promises');
    return await readFile(promptPath, 'utf8');
  }
  return null;
}

function positionalArgs(argv, stringFlags = new Set()) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (!a.startsWith('--')) {
      out.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (eq < 0 && stringFlags.has(key)) i++;
  }
  return out;
}

async function cliDaemonUrl(flags) {
  return resolveDaemonUrl({ flagUrl: flags?.['daemon-url'] });
}

async function cliDaemonBaseUrl(flags) {
  return (await cliDaemonUrl(flags)).replace(/\/$/, '');
}

function printMediaHelp() {
  console.log(`Usage: od media generate --surface <image|video|audio> --model <id> [opts]
       "$OD_NODE_BIN" "$OD_BIN" media generate --surface <image|video|audio> --model <id> [opts]

Required:
  --surface  image | video | audio
  --model    Model id from /api/media/models (e.g. gpt-image-2, seedance-2, suno-v5).
  --project  Project id. Auto-resolved from OD_PROJECT_ID when invoked by the daemon.

Common options:
  --prompt "<text>"         Generation prompt. ElevenLabs SFX prompts must stay under 450 characters.
  --prompt-file <path|->     Read the prompt from a file, or - for stdin (for long-form prompts).
  --output <filename>       File to write under the project. Auto-named if omitted.
  --aspect 1:1|16:9|9:16|4:3|3:4
  --length <seconds>        Video length.
  --duration <seconds>      Audio duration.
  --prompt-influence <0-1>  ElevenLabs SFX prompt adherence. Higher values follow the prompt more closely.
  --loop                    ElevenLabs SFX only: request a seamless loop.
  --voice <voice-id>        Speech / TTS voice.
  --language <lang>         Language boost for TTS (e.g. Chinese,Yue for Cantonese).
  --audio-kind music|speech|sfx
  --composition-dir <path>  hyperframes-html only — project-relative path
                            to the dir containing hyperframes.json /
                            meta.json / index.html. The daemon runs
                            \`npx hyperframes render\` against it.
  --image <path>            Project-relative path to a reference image
                            (image-to-video for Seedance i2v models, or
                            future image-edit endpoints). Daemon reads
                            the file from the project, base64-encodes
                            it, and forwards it to the upstream API.
  --daemon-url <url>

Output: a single line of JSON: {"file": { name, size, kind, mime, ... }}
  Slow models return {"taskId": "...", "nextSince": n} with exit 0 instead —
  a successful queued handoff, not a failure. Poll with \`media wait\`:
  exit 0 = done ({"file": ...} on stdout), exit 2 = still running (re-run
  the wait command stderr prints, carrying forward nextSince), 5 = failed.

Worked generate→wait loop (POSIX bash — do NOT translate to PowerShell;
parse JSON with python3, not jq):

  out=\$("\$OD_NODE_BIN" "\$OD_BIN" media generate --project "\$OD_PROJECT_ID" \\
    --surface image --model flux-pro-ultra --prompt "..." --aspect 16:9)
  last=\$(printf '%s\\n' "\$out" | tail -1)
  task_id=\$(printf '%s\\n' "\$last" | python3 -c "import sys,json; print(json.load(sys.stdin).get('taskId',''))" 2>/dev/null)
  since=\$(printf '%s\\n' "\$last" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nextSince',0))" 2>/dev/null)
  while [ -n "\$task_id" ]; do
    out=\$("\$OD_NODE_BIN" "\$OD_BIN" media wait "\$task_id" --since "\${since:-0}")
    ec=\$?
    last=\$(printf '%s\\n' "\$out" | tail -1)
    since=\$(printf '%s\\n' "\$last" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nextSince',0))" 2>/dev/null)
    if [ "\$ec" -eq 0 ]; then task_id=""; elif [ "\$ec" -ne 2 ]; then echo "\$out" >&2; exit "\$ec"; fi
  done
  printf '%s\\n' "\$last"

Skills should call this and then reference the returned filename in their
artifact / message body. The daemon writes the bytes into the project's
files folder so the FileViewer can preview them immediately.`);
}

// ---------------------------------------------------------------------------
// Subcommand: od plugin …
// ---------------------------------------------------------------------------

// Plan §3.B1 / spec §12.4: CLI structured error helper. Maps a daemon
// HTTP error envelope (or a synthetic local error) to a stable exit
// code + a JSON envelope on stderr. Code agents read these to decide
// whether the failure is recoverable (re-grant capabilities, prompt
// the user, retry with --grant-caps, etc.).
function exitWithStructuredError({ code, message, data }) {
  const exit = RECOVERABLE_EXIT_CODES[code] ?? 1;
  const envelope = { error: { code, message, data: data ?? {} } };
  process.stderr.write(JSON.stringify(envelope) + '\n');
  process.exit(exit);
}

// Map a daemon HTTP response into the exit-code envelope. Returns the
// parsed body (so the caller can keep going if it doesn't want to exit).
//
// Daemon error envelopes come in two shapes in practice:
//   { error: { code, message, ... } }  — newer routes using sendApiError
//   { error: '<message>' }             — older flat-string routes
//                                         (e.g. POST /api/templates at
//                                         routes/project/index.ts)
// Normalize so a flat-string body still surfaces its message to the
// structured envelope instead of collapsing to `HTTP <status>: `, which
// would drop the only diagnostic the daemon actually returned to a
// headless caller.
async function structuredHttpFailure(resp, fallbackCode = 'daemon-not-running') {
  let raw = '';
  let parsed;
  try {
    raw = await resp.text();
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const errorObj =
    typeof parsed?.error === 'string'
      ? { message: parsed.error }
      : parsed?.error;
  const errCode = normalizeRecoverableErrorCode(errorObj?.code, errorObj?.message);
  if (errCode) {
    exitWithStructuredError({
      code:    errCode,
      message: errorObj?.message ?? `HTTP ${resp.status}`,
      data:    structuredErrorData(errorObj),
    });
  }
  exitWithStructuredError({
    code:    fallbackCode,
    message: errorObj?.message ?? `HTTP ${resp.status}${raw ? `: ${raw}` : ''}`,
    data:    structuredErrorData(errorObj),
  });
}

function normalizeRecoverableErrorCode(code, message) {
  if (code === 'DESKTOP_AUTH_PENDING') return 'desktop-auth-pending';
  if (code === 'FORBIDDEN' && /desktop import token rejected/i.test(String(message ?? ''))) {
    return 'desktop-import-token-rejected';
  }
  return code;
}

function structuredErrorData(error) {
  if (!error || typeof error !== 'object') return undefined;
  const data = {};
  if ('data' in error && error.data !== undefined) Object.assign(data, error.data);
  if ('details' in error && error.details !== undefined) data.details = error.details;
  if (typeof error.retryable === 'boolean') data.retryable = error.retryable;
  return Object.keys(data).length > 0 ? data : undefined;
}

async function runPlugin(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printPluginHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':      return runPluginList(rest);
    case 'search':    return runPluginSearch(rest);
    case 'sources':   return runPluginSources(rest);
    case 'info':      return runPluginInfo(rest);
    case 'manifest':  return runPluginManifest(rest);
    case 'apply':     return runPluginApply(rest);
    case 'duplicate': return runPluginDuplicate(rest);
    case 'canon':     return runPluginCanon(rest);
    case 'diff':      return runPluginDiff(rest);
    case 'replay':    return runPluginReplay(rest);
    case 'snapshots': return runPluginSnapshots(rest);
    case 'simulate':  return runPluginSimulate(rest);
    case 'verify':    return runPluginVerify(rest);
    case 'run':       return runPluginRun(rest);
    case 'scaffold': return runPluginScaffold(rest);
    case 'validate': return runPluginValidate(rest);
    case 'pack':     return runPluginPack(rest);
    default:
      console.error(`unknown subcommand: od plugin ${sub}`);
      printPluginHelp();
      process.exit(2);
  }
}

// Phase 4 / spec §14.1 — `od plugin scaffold` interactive starter.
//
// Side-effect: writes a SKILL.md + open-design.json starter under
// `<targetDir>/<id>/`. Default targetDir is process.cwd() so a code
// agent can drop the scaffold into the current repo root.
async function runPluginScaffold(rest) {
  const flags = parseFlags(rest, {
    string: new Set([
      'id', 'title', 'description', 'task-kind', 'mode', 'scenario', 'out',
    ]),
    boolean: new Set(['help', 'h', 'json', 'with-claude-plugin']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin scaffold --id <id> [--title "<title>"] [--description "<text>"]
                     [--task-kind new-generation|code-migration|figma-migration|tune-collab]
                     [--mode <mode>] [--scenario <scenario>]
                     [--out <dir>] [--with-claude-plugin]

Writes <out|cwd>/<id>/{SKILL.md,open-design.json,README.md}.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const id = typeof flags.id === 'string' && flags.id.length > 0
    ? flags.id
    : rest.find((a) => !a.startsWith('-'));
  if (!id) {
    console.error('Usage: od plugin scaffold --id <id>');
    process.exit(2);
  }
  const targetDir = typeof flags.out === 'string' && flags.out.length > 0
    ? flags.out
    : process.cwd();
  const { scaffoldPlugin, ScaffoldError } = await import('./plugins/scaffold.js');
  try {
    const input = {
      targetDir,
      id,
      ...(flags.title       ? { title: flags.title }             : {}),
      ...(flags.description ? { description: flags.description } : {}),
      ...(flags['task-kind']
        ? { taskKind: flags['task-kind'] }
        : {}),
      ...(flags.mode        ? { mode: flags.mode }               : {}),
      ...(flags.scenario    ? { scenario: flags.scenario }       : {}),
      withClaudePlugin: Boolean(flags['with-claude-plugin']),
    };
    const result = await scaffoldPlugin(input);
    if (flags.json) return process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    console.log(`[scaffold] ${result.folder}`);
    for (const file of result.files) console.log(`  ${file}`);
    console.log(`\nNext: od plugin validate ${result.folder}`);
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`[scaffold] ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
}

// Phase 4 / spec §11.5 / plan §3.W1 — `od plugin validate <folder>`.
//
// Pre-install lint pass against an author's working dir. Optionally
// fetches the daemon's registry view so skill / DS / atom refs in
// the manifest can be checked too; falls back to an empty registry
// when --no-daemon is set or the daemon is unreachable.
async function runPluginValidate(rest) {
  const flags = parseFlags(rest, {
    string:  new Set(['daemon-url']),
    boolean: new Set(['help', 'h', 'json', 'no-daemon']),
  });
  if (flags.help || flags.h || rest.length === 0 || rest[0]?.startsWith('-')) {
    console.log(`Usage:
  od plugin validate <folder> [--json] [--no-daemon] [--daemon-url <url>]

Runs the plugin doctor against an unfinished plugin folder before
install. Validates manifest shape, atom ids, until expressions, and
context refs against the live daemon registry (skip with --no-daemon).

Exit codes:
  0  doctor.ok = true
  4  doctor.ok = false (errors present)
  2  CLI usage error / folder unreadable`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const folder = rest[0];

  // Try to load the daemon's registry view; the validator works
  // offline too — emits warnings instead of errors for refs we
  // can't resolve.
  let registry;
  if (!flags['no-daemon']) {
    const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
    try {
      const [skillsResp, dsResp, atomsResp] = await Promise.all([
        fetch(`${base}/api/skills`).catch(() => null),
        fetch(`${base}/api/design-systems`).catch(() => null),
        fetch(`${base}/api/atoms`).catch(() => null),
      ]);
      const skills = (skillsResp?.ok ? (await skillsResp.json())?.skills : []) ?? [];
      const designSystems = (dsResp?.ok ? (await dsResp.json())?.designSystems : []) ?? [];
      const atoms = (atomsResp?.ok ? (await atomsResp.json())?.atoms : []) ?? [];
      registry = {
        skills:        skills.map((s) => ({ id: s.id, title: s.name ?? s.title, description: s.description })),
        designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
        craft:         [],
        atoms:         atoms.map((a) => ({ id: a.id, label: a.label })),
      };
    } catch {
      registry = undefined;
    }
  }

  let result;
  try {
    const { validatePluginFolder, flattenValidationDiagnostics } = await import('./plugins/validate.js');
    result = await validatePluginFolder({ folder, ...(registry ? { registry } : {}) });
    if (flags.json) {
      const flat = flattenValidationDiagnostics(result);
      process.stdout.write(JSON.stringify({
        ok:      result.ok,
        folder:  result.folder,
        ...(result.doctor ? { freshDigest: result.doctor.freshDigest, pluginId: result.doctor.pluginId } : {}),
        diagnostics: flat,
      }, null, 2) + '\n');
    } else {
      console.log(`[validate] folder: ${result.folder}`);
      if (result.doctor) {
        console.log(`[validate] pluginId: ${result.doctor.pluginId}`);
        console.log(`[validate] freshDigest: ${result.doctor.freshDigest.slice(0, 12)}\u2026`);
      }
      const diagnostics = (await import('./plugins/validate.js')).flattenValidationDiagnostics(result);
      const errors = diagnostics.filter((d) => d.severity === 'error');
      const warnings = diagnostics.filter((d) => d.severity === 'warning');
      const infos = diagnostics.filter((d) => d.severity === 'info');
      for (const d of errors)   console.error(`  [error]   ${d.code}: ${d.message}`);
      for (const d of warnings) console.warn (`  [warning] ${d.code}: ${d.message}`);
      for (const d of infos)    console.log  (`  [info]    ${d.code}: ${d.message}`);
      if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
        console.log('[validate] no issues');
      }
      console.log(`[validate] ok=${result.ok}`);
    }
  } catch (err) {
    console.error(`[validate] failed: ${err?.message ?? err}`);
    process.exit(2);
  }
  process.exit(result.ok ? 0 : 4);
}

// Phase 4 / spec §14 / plan §3.X1 — `od plugin pack <folder>`.
//
// Produces a gzip-compressed tar archive ready to install via the
// installer's HTTPS-tarball path. The output path is folder-base +
// version when the manifest exposes a version, otherwise folder-base.
async function runPluginPack(rest) {
  const flags = parseFlags(rest, {
    string:  new Set(['out']),
    boolean: new Set(['help', 'h', 'json']),
  });
  if (flags.help || flags.h || rest.length === 0 || rest[0]?.startsWith('-')) {
    console.log(`Usage:
  od plugin pack <folder> [--out <path>] [--json]

Builds a gzip-compressed tar archive of <folder> at --out (default
'<folder>/../<basename>-<manifest.version>.tgz'). The archive is the
portable distribution shape for a plugin folder.

Skipped when packing:
  node_modules / .git / .next / dist / build / out / coverage /
  .turbo / .cache / .pnpm-store / .parcel-cache / .svelte-kit /
  .nuxt / .astro / .vercel / .vscode / .DS_Store / Thumbs.db
  (matches the installer's tarball-extract skiplist).
Symlinks are rejected at pack time (consistent with extract-time
rejection at install).

Exit codes:
  0  archive written
  2  CLI usage error
  4  pack-time error (missing open-design.json, invalid JSON, etc)`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const folder = rest[0];
  try {
    const { packPlugin, PackPluginError } = await import('./plugins/pack.js');
    let result;
    try {
      result = await packPlugin({
        folder,
        ...(typeof flags.out === 'string' ? { out: flags.out } : {}),
      });
    } catch (err) {
      if (err instanceof PackPluginError) {
        if (flags.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: err.message }, null, 2) + '\n');
        } else {
          console.error(`[pack] ${err.message}`);
        }
        process.exit(4);
      }
      throw err;
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({
        ok:            true,
        outPath:       result.outPath,
        bytes:         result.bytes,
        fileCount:     result.files.length,
        pluginId:      result.pluginId,
        pluginVersion: result.pluginVersion,
      }, null, 2) + '\n');
    } else {
      const idStr = result.pluginVersion
        ? `${result.pluginId ?? 'plugin'}@${result.pluginVersion}`
        : result.pluginId ?? 'plugin';
      console.log(`[pack] packed ${idStr}`);
      console.log(`[pack] out:    ${result.outPath}`);
      console.log(`[pack] files:  ${result.files.length}`);
      console.log(`[pack] bytes:  ${result.bytes}`);
      console.log(`\nNext: share ${result.outPath} with the target runtime.`);
    }
  } catch (err) {
    console.error(`[pack] failed: ${err?.message ?? err}`);
    process.exit(2);
  }
}

async function runPluginSnapshots(args) {
  const sub = args[0];
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od plugin snapshots list  [--project <id>]               List applied plugin snapshots.
  od plugin snapshots show  <snapshotId> [--json]          Print one snapshot's full contents.
  od plugin snapshots diff  <id-a> <id-b> [--json]         Compare two snapshots field-by-field.
  od plugin snapshots prune [--before <unix-ms>]           Delete expired (or older-than-cutoff) snapshots.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const flags = parseFlags(args.slice(1), { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  if (sub === 'show') {
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    const id = positional[0];
    if (!id) {
      console.error('Usage: od plugin snapshots show <snapshotId>');
      process.exit(2);
    }
    const url = `${base}/api/applied-plugins/${encodeURIComponent(id)}`;
    const resp = await fetch(url);
    if (resp.status === 404) {
      console.error(`snapshot ${id} not found`);
      process.exit(72);
    }
    if (!resp.ok) {
      console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (sub === 'diff') {
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    if (positional.length < 2) {
      console.error('Usage: od plugin snapshots diff <id-a> <id-b>');
      process.exit(2);
    }
    const [idA, idB] = positional;
    const [respA, respB] = await Promise.all([
      fetch(`${base}/api/applied-plugins/${encodeURIComponent(idA)}`),
      fetch(`${base}/api/applied-plugins/${encodeURIComponent(idB)}`),
    ]);
    if (respA.status === 404) { console.error(`snapshot ${idA} not found`); process.exit(72); }
    if (respB.status === 404) { console.error(`snapshot ${idB} not found`); process.exit(72); }
    if (!respA.ok || !respB.ok) {
      console.error(`fetch failed: ${respA.status} / ${respB.status}`);
      process.exit(1);
    }
    const a = await respA.json();
    const b = await respB.json();
    const { diffSnapshots } = await import('./plugins/snapshot-diff.js');
    const report = diffSnapshots({ a, b });
    if (flags.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    const digestNote = report.digestEqual
      ? '\u2713 manifestSourceDigest equal (e2e-2 invariant holds)'
      : '\u2717 manifestSourceDigest DIFFERS (replay would diverge)';
    console.log(`[snapshots diff] ${idA} \u2194 ${idB}`);
    console.log(`  ${digestNote}`);
    console.log(`  ${report.added} added, ${report.removed} removed, ${report.changed} changed`);
    if (report.entries.length === 0) {
      console.log('  (no field-level differences)');
      return;
    }
    for (const e of report.entries) {
      const tag = e.kind === 'added' ? '+' : e.kind === 'removed' ? '-' : '~';
      if (e.summary) {
        console.log(`  ${tag} ${e.field}  (${e.summary})`);
      } else if (e.kind === 'changed') {
        console.log(`  ${tag} ${e.field}: ${e.before ?? ''} \u2192 ${e.after ?? ''}`);
      } else if (e.kind === 'added') {
        console.log(`  ${tag} ${e.field}: ${e.after ?? ''}`);
      } else {
        console.log(`  ${tag} ${e.field}: ${e.before ?? ''}`);
      }
    }
    return;
  }
  if (sub === 'list') {
    const url = flags.project
      ? `${base}/api/projects/${encodeURIComponent(flags.project)}/applied-plugins`
      : `${base}/api/applied-plugins`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (sub === 'prune') {
    const url = `${base}/api/applied-plugins/prune`;
    const before = flags.before ? Number(flags.before) : undefined;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(before ? { before } : {}),
    });
    if (!resp.ok) {
      console.error(`POST ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    console.log(`[snapshots] pruned ${data.removed ?? 0} snapshot(s)`);
    return;
  }
  console.error(`unknown subcommand: od plugin snapshots ${sub}`);
  process.exit(2);
}

// Plan §3.B3: `od plugin run <id>` shorthand. Today this is a thin
// wrapper around `od plugin apply` + `POST /api/runs` so a code agent
// can drive the apply→start→follow loop without two hops.
async function runPluginRun(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags.conversation
    && a !== flags.message
    && a !== flags.agent
    && a !== flags.model
    && a !== flags['snapshot-id']
    && a !== flags.capabilities
    && a !== flags['grant-caps']);
  if (!id) {
    console.error('Usage: od plugin run <id> --project <projectId> [--inputs <json>] [--agent <id>] [--message "<text>"] [--grant-caps a,b] [--follow]');
    process.exit(2);
  }
  if (!flags.project) {
    console.error('--project <projectId> is required (Phase 1.5 will add the auto-create wrapper)');
    process.exit(2);
  }
  const inputs = flags.inputs ? safeParseJson(flags.inputs) ?? {} : {};
  const grantCaps = typeof flags['grant-caps'] === 'string' && flags['grant-caps'].length > 0
    ? flags['grant-caps'].split(',').map((c) => c.trim()).filter(Boolean)
    : [];
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  // 1. Apply (returns ApplyResult + manifestSourceDigest).
  const applyResp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputs, grantCaps, projectId: flags.project }),
  });
  const applyData = await applyResp.json().catch(() => ({}));
  if (!applyResp.ok) {
    console.error(`apply failed: ${applyResp.status} ${JSON.stringify(applyData)}`);
    process.exit(applyResp.status === 422 ? 67 : 1);
  }
  // 2. Start the run with pluginId so the daemon resolver pins the
  //    snapshot to the run object.
  const runResp = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId:        flags.project,
      pluginId:         id,
      pluginInputs:     inputs,
      grantCaps,
      ...(flags.conversation ? { conversationId: flags.conversation } : {}),
      ...(flags.message ? { message: flags.message } : {}),
      ...(flags.agent ? { agentId: flags.agent } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags['snapshot-id'] ? { appliedPluginSnapshotId: flags['snapshot-id'] } : {}),
    }),
  });
  const runData = await runResp.json().catch(() => ({}));
  if (!runResp.ok) {
    if (runResp.status === 409 && runData?.error?.code === 'capabilities-required') {
      const missing = (runData.error.data?.missing ?? []).join(',');
      console.error(`[run] capabilities required: ${missing}`);
      console.error(`[run] retry with --grant-caps ${missing}`);
      process.exit(66);
    }
    console.error(`run failed: ${runResp.status} ${JSON.stringify(runData)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ apply: applyData, run: runData }, null, 2) + '\n');
    if (flags.follow) await streamRunEvents(base, runData.runId);
    return;
  }
  console.log(`[run] started run ${runData.runId} (snapshot ${runData.appliedPluginSnapshotId ?? applyData?.appliedPlugin?.snapshotId ?? 'n/a'})`);
  if (flags.follow) {
    await streamRunEvents(base, runData.runId);
  }
}

async function pluginDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

// Plan §3.Y1 — filter knobs on `od plugin list` (and feeds
// `od plugin search` below). Recognising these as string flags
// keeps the parseFlags() argv consumer happy.
async function runPluginList(rest) {
  const flags = parseFlags(rest, {
    string:  PLUGIN_LIST_FILTER_FLAGS,
    boolean: PLUGIN_LIST_BOOLEAN_FLAGS,
  });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od plugin list [--task-kind <kind>] [--mode <mode>] [--tag <tag>] \\
                 [--trust <tier>] [--bundled | --no-bundled] [--json]

Lists installed plugins. Filters AND together: --task-kind=code-migration
+ --tag=phase-7 returns only code-migration plugins tagged 'phase-7'.

  --task-kind   Match od.taskKind (new-generation / figma-migration /
                code-migration / tune-collab).
  --mode        Match od.mode.
  --tag         Match an entry in tags[].
  --trust       Match trust tier (trusted / restricted / bundled).
  --bundled     Restrict to bundled plugins (sourceKind='bundled' OR
                trust='bundled').
  --no-bundled  Exclude bundled plugins.`);
    process.exit(0);
  }
  const data = await fetchPluginList(flags);
  const filtered = await applyPluginFilters(data?.plugins ?? [], flags);
  emitPluginList({ entries: filtered, json: !!flags.json, emptyMessage: 'No plugins matched the filter.' });
}

// Plan §3.Y1 — `od plugin search <query>`.
async function runPluginSearch(rest) {
  const flags = parseFlags(rest, {
    string:  PLUGIN_LIST_FILTER_FLAGS,
    boolean: PLUGIN_LIST_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const query = positional[0];
  if (flags.help || flags.h || !query) {
    console.log(`Usage:
  od plugin search <query> [--task-kind <kind>] [--mode <mode>] \\
                           [--tag <tag>] [--trust <tier>] \\
                           [--bundled | --no-bundled] [--json]

Free-text search across installed plugins. Matches case-insensitively
on id / title / description / tags. Combines with the same filter
flags as 'od plugin list'.`);
    process.exit(query ? 0 : 2);
  }
  const data = await fetchPluginList(flags);
  const filtered = await applyPluginFilters(data?.plugins ?? [], flags, query);
  emitPluginList({
    entries: filtered,
    json:    !!flags.json,
    emptyMessage: `No installed plugins matched "${query}".`,
    showRank: true,
  });
}

function formatCounts(counts) {
  if (!counts || typeof counts !== 'object') return '(none)';
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '(none)';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

function formatTimestamp(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '(none)';
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}

async function fetchPluginList(flags) {
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET /api/plugins failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  return data;
}

async function applyPluginFilters(plugins, flags, query) {
  if (!Array.isArray(plugins) || plugins.length === 0) return [];
  const { searchInstalledPlugins } = await import('./plugins/search.js');
  const trustFlag = typeof flags.trust === 'string' ? flags.trust : undefined;
  const taskKind  = typeof flags['task-kind'] === 'string' ? flags['task-kind'] : undefined;
  const mode      = typeof flags.mode === 'string' ? flags.mode : undefined;
  const tag       = typeof flags.tag === 'string'  ? flags.tag  : undefined;
  let bundled;
  if (flags.bundled === true)         bundled = true;
  if (flags['no-bundled'] === true)   bundled = false;
  const result = searchInstalledPlugins({
    plugins,
    ...(typeof query === 'string' && query.trim() ? { query } : {}),
    ...(taskKind ? { taskKind } : {}),
    ...(mode     ? { mode } : {}),
    ...(tag      ? { tag } : {}),
    ...(trustFlag === 'trusted' || trustFlag === 'restricted' || trustFlag === 'bundled' ? { trust: trustFlag } : {}),
    ...(typeof bundled === 'boolean' ? { bundled } : {}),
  });
  return result.entries;
}

function emitPluginList({ entries, json, emptyMessage, showRank }) {
  if (json) {
    process.stdout.write(JSON.stringify({
      total: entries.length,
      plugins: entries.map((e) => ({
        ...e.plugin,
        ...(showRank ? { matched: e.matched, rank: e.rank } : {}),
      })),
    }, null, 2) + '\n');
    return;
  }
  if (entries.length === 0) {
    console.log(emptyMessage ?? 'No plugins matched.');
    return;
  }
  for (const entry of entries) {
    const p = entry.plugin;
    const tail = showRank && entry.matched.length > 0
      ? `  matched=[${entry.matched.join(',')}]`
      : '';
    console.log(`${p.id}@${p.version}  trust=${p.trust}  source=${p.sourceKind}  title="${p.title}"${tail}`);
  }
}

async function runPluginInfo(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('--')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.version);
  if (!id) {
    console.error('Usage: od plugin info <id> [--json]');
    process.exit(2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const url = `${base}/api/plugins/${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function runPluginManifest(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('--') && a !== flags['daemon-url'] && a !== flags.source);
  if (!id) {
    console.error('Usage: od plugin manifest <id>');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (resp.status === 404) {
    console.error(`plugin ${id} not found`);
    process.exit(65);
  }
  if (!resp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (!data?.manifest) {
    console.error(`plugin ${id} has no recorded manifest (registry row is incomplete)`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(data.manifest, null, 2) + '\n');
}

// Plan §3.MM2 — `od plugin sources`. Lists every distinct install
// source string + count of plugins installed from it, ordered by
// count descending then source ascending. Useful for ops audits
// ('which github repos do my plugins come from') + for plugin
// authors comparing their fork to its upstream installs.
async function runPluginSources(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET /api/plugins failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
  const buckets = new Map();
  for (const p of plugins) {
    const key = `${p.sourceKind ?? 'unknown'}\t${p.source ?? '(none)'}`;
    const entry = buckets.get(key) ?? { sourceKind: p.sourceKind ?? 'unknown', source: p.source ?? '(none)', count: 0, plugins: [] };
    entry.count += 1;
    entry.plugins.push({ id: p.id, version: p.version });
    buckets.set(key, entry);
  }
  const rows = [...buckets.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.sourceKind !== b.sourceKind) return a.sourceKind.localeCompare(b.sourceKind);
    return a.source.localeCompare(b.source);
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify({ total: plugins.length, sources: rows }, null, 2) + '\n');
    return;
  }
  if (rows.length === 0) {
    console.log('No plugins installed.');
    return;
  }
  console.log(`# Plugin install sources (total: ${plugins.length})`);
  for (const row of rows) {
    console.log(`  ${row.sourceKind.padEnd(11)}  ${String(row.count).padStart(3)}  ${row.source}`);
    for (const plug of row.plugins) {
      console.log(`               \u2514\u2500 ${plug.id}@${plug.version}`);
    }
  }
}

async function runPluginVerify(rest) {
  const flags = parseFlags(rest, {
    string:  new Set([...PLUGIN_STRING_FLAGS, 'config']),
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const id = positional[0];
  if (flags.help || flags.h || !id) {
    console.log(`Usage:
  od plugin verify <pluginId> [--config <path>] [--json]

CI meta-command. Reads an optional config from
'<plugin-folder>/.od-verify.json' (or --config <path>) and runs:

  doctor    — manifest + atom + ref lint
  simulate  — convergence dry-run for every until expression,
              with per-stage signals from config.simulate.signals
  canon     — byte-equality check against
              config.canon.fixturePath using the snapshot at
              config.canon.snapshotId

Sample .od-verify.json:

  {
    "enabled": ["doctor", "simulate"],
    "simulate": {
      "signals": { "critique.score": 5, "build.passing": true },
      "iterationCap": 5
    },
    "canon": {
      "snapshotId": "snap-abc",
      "fixturePath": "tests/expected-block.md"
    }
  }

Exit codes:
  0  every enabled check passed
  4  one or more enabled checks failed
  2  CLI usage error / plugin not found / config malformed`);
    process.exit(id ? 0 : 2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');

  // 1. Resolve the plugin record (fsPath + manifest).
  const pluginResp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}`);
  if (pluginResp.status === 404) {
    console.error(`plugin ${id} not found`);
    process.exit(65);
  }
  if (!pluginResp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${pluginResp.status} ${await pluginResp.text()}`);
    process.exit(1);
  }
  const plugin = await pluginResp.json();

  // 2. Load .od-verify.json from --config or <fsPath>/.od-verify.json.
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const configPath = typeof flags.config === 'string'
    ? path.resolve(flags.config)
    : (typeof plugin?.fsPath === 'string' ? path.join(plugin.fsPath, '.od-verify.json') : null);
  let config = { enabled: ['doctor', 'simulate', 'canon'] };
  if (configPath) {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(raw);
    } catch (err) {
      const e = err;
      if (e?.code !== 'ENOENT') {
        console.error(`[verify] cannot read config ${configPath}: ${e?.message ?? e}`);
        process.exit(2);
      }
      // ENOENT → run with defaults. canon will skip cleanly because no
      // config.canon entry was supplied.
    }
  }

  // 3. doctor (when enabled)
  const enabledSet = new Set((config.enabled ?? ['doctor', 'simulate', 'canon']).filter((c) =>
    c === 'doctor' || c === 'simulate' || c === 'canon'));
  let doctorReport = null;
  if (enabledSet.has('doctor')) {
    const doctorResp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}/doctor`);
    if (doctorResp.ok) {
      doctorReport = await doctorResp.json();
    }
  }

  // 4. simulate (when enabled)
  let simulateReport = null;
  if (enabledSet.has('simulate')) {
    const pipeline = plugin?.manifest?.od?.pipeline;
    if (pipeline && Array.isArray(pipeline.stages) && pipeline.stages.length > 0) {
      const { simulatePipeline } = await import('./plugins/simulate.js');
      simulateReport = simulatePipeline({
        pipeline,
        signals: config.simulate?.signals ?? {},
        ...(typeof config.simulate?.iterationCap === 'number' && config.simulate.iterationCap > 0
          ? { iterationCap: config.simulate.iterationCap }
          : {}),
      });
    }
  }

  // 5. canon (when enabled + fixture supplied)
  let canonActual = null;
  let canonExpected = null;
  if (enabledSet.has('canon') && config.canon?.snapshotId && config.canon?.fixturePath) {
    const fixturePath = path.resolve(
      typeof flags.config === 'string'
        ? path.dirname(path.resolve(flags.config))
        : (typeof plugin?.fsPath === 'string' ? plugin.fsPath : process.cwd()),
      config.canon.fixturePath,
    );
    try {
      canonExpected = await fs.readFile(fixturePath, 'utf8');
    } catch {
      canonExpected = null;
    }
    if (canonExpected !== null) {
      const canonResp = await fetch(
        `${base}/api/applied-plugins/${encodeURIComponent(config.canon.snapshotId)}/canon`,
        { headers: { accept: 'text/plain' } },
      );
      if (canonResp.ok) {
        canonActual = await canonResp.text();
      }
    }
  }

  // 6. Aggregate.
  const { verifyPlugin } = await import('./plugins/verify.js');
  const report = verifyPlugin({
    config: {
      enabled: [...enabledSet],
      ...(config.strict   === true     ? { strict:   true }      : {}),
      ...(config.simulate              ? { simulate: config.simulate } : {}),
      ...(config.canon                 ? { canon:    config.canon    } : {}),
    },
    ...(doctorReport   ? { doctor:        doctorReport } : {}),
    ...(simulateReport ? { simulate:      simulateReport } : {}),
    ...(canonActual    ? { canon:         canonActual } : {}),
    ...(canonExpected  ? { canonExpected: canonExpected } : {}),
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify({ pluginId: id, ...report }, null, 2) + '\n');
  } else {
    console.log(`[verify] plugin ${id} \u2014 ${report.passed ? 'PASSED' : 'FAILED'}`);
    for (const o of report.outcomes) {
      const tag = o.status === 'passed' ? '\u2713'
                : o.status === 'failed' ? '\u2717'
                : o.status === 'skipped' ? '-'
                : '!';
      console.log(`  ${tag} ${o.summary}`);
    }
  }
  process.exit(report.passed ? 0 : 4);
}

// Plan §3.EE1 — `od plugin simulate <pluginId> [-s key=value ...]`.
//
// Walks the plugin's pipeline against caller-supplied signals and
// reports per-stage convergence (iterations + outcome). No LLM is
// invoked — this is a pure devloop dry-run for testing 'until'
// expressions.
//
// Signals are supplied via repeatable -s key=value flags. The
// closed UntilSignals vocabulary applies (critique.score /
// iterations / user.confirmed / preview.ok / build.passing /
// tests.passing); unknown keys surface as warnings.
async function runPluginSimulate(rest) {
  const flags = parseFlags(rest, {
    string:  new Set([...PLUGIN_STRING_FLAGS, 's', 'cap']),
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const id = positional[0];
  if (flags.help || flags.h || !id) {
    console.log(`Usage:
  od plugin simulate <pluginId> [-s key=value ...] [--cap <n>] [--json]

Walks the plugin's pipeline against caller-supplied signals and
reports per-stage convergence. No LLM is invoked.

Examples:
  # critique-theater stage that exits when score >= 4
  od plugin simulate my-plugin -s critique.score=5

  # build-test devloop where both signals must hold
  od plugin simulate code-migration \\
      -s build.passing=true -s tests.passing=true

  # raise the per-stage iteration cap (default 10)
  od plugin simulate my-plugin -s critique.score=2 --cap 20

Closed signal vocabulary:
  critique.score (number)
  iterations     (number)
  user.confirmed (boolean)
  preview.ok     (boolean)
  build.passing  (boolean)
  tests.passing  (boolean)`);
    process.exit(id ? 0 : 2);
  }
  // Collect every -s value (parseFlags returns the last only).
  const sValues = [];
  for (let i = 0; i < rest.length; i++) {
    if ((rest[i] === '-s' || rest[i] === '--signal') && typeof rest[i + 1] === 'string') {
      sValues.push(rest[i + 1]);
    }
  }
  // Fetch the plugin from the daemon so we get the resolved
  // manifest (including pipeline).
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}`);
  if (resp.status === 404) {
    console.error(`plugin ${id} not found`);
    process.exit(65);
  }
  if (!resp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const plugin = await resp.json();
  const pipeline = plugin?.manifest?.od?.pipeline;
  if (!pipeline || !Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ outcome: 'no-pipeline', stages: [] }, null, 2) + '\n');
    } else {
      console.log(`[simulate] plugin ${id} has no od.pipeline (or it is empty); nothing to walk.`);
    }
    return;
  }
  const { simulatePipeline, parseSignalKv } = await import('./plugins/simulate.js');
  const parsedSignals = parseSignalKv(sValues);
  for (const w of parsedSignals.warnings) console.warn(`[simulate] warn: ${w}`);
  const cap = typeof flags.cap === 'string' ? Number(flags.cap) : undefined;
  const result = simulatePipeline({
    pipeline,
    signals: parsedSignals.signals,
    ...(Number.isFinite(cap) && cap > 0 ? { iterationCap: cap } : {}),
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  console.log(`[simulate] plugin ${id} \u2014 outcome: ${result.outcome}, totalIterations: ${result.totalIterations}`);
  for (const stage of result.stages) {
    const tag = stage.outcome === 'converged' ? '\u2713'
              : stage.outcome === 'cap'         ? '\u2717'
              : stage.outcome === 'unparsable'  ? '!'
              :                                   '\u2014';
    const reason = stage.reason ? `  (${stage.reason})` : '';
    const matched = stage.matched && stage.matched.length > 0
      ? `  matched=[${stage.matched.map((c) => `${c.signal}${c.op}${c.value}`).join(' && ')}]`
      : '';
    console.log(`  ${tag} ${stage.stageId}: ${stage.outcome} (${stage.iterations} iter)${reason}${matched}`);
  }
  // Exit non-zero on cap-hit / unparsable so CI can wire this
  // into a pipeline check easily.
  if (result.outcome === 'cap-hit' || result.outcome === 'unparsable') process.exit(4);
}

// Plan §3.CC1 / §3.DD2 — `od plugin canon <snapshotId>`. Prints the
// canonical `## Active plugin` block a snapshot will splice into
// the system prompt. Useful for understanding what the agent
// reads + locking byte-equality regression tests against the
// daemon's renderPluginBlock() output.
//
// --check <file> mode: compares the canon output against an
// on-disk fixture (typically committed under tests/fixtures/) and
// exits 4 on byte-mismatch. Lets a plugin author lock byte-
// equality without writing a new test harness.
async function runPluginCanon(rest) {
  const flags = parseFlags(rest, {
    string:  new Set([...PLUGIN_STRING_FLAGS, 'check']),
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const id = positional[0];
  if (flags.help || flags.h || !id) {
    console.log(`Usage:
  od plugin canon <snapshotId> [--json]
  od plugin canon <snapshotId> --check <expected-file>

Prints the canonical '## Active plugin' / '## Plugin inputs' /
'## Plugin atoms' block this snapshot would splice into the
system prompt. Default output is plain text; --json wraps the
block in { snapshotId, pluginId, block }.

--check <file> compares the canon output to the file's bytes and
exits 4 on mismatch. Useful for committing renderPluginBlock()
fixtures into a plugin's own tests/.`);
    process.exit(id ? 0 : 2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const url = `${base}/api/applied-plugins/${encodeURIComponent(id)}/canon`;
  const checkPath = typeof flags.check === 'string' ? flags.check : null;
  // --check always wants the raw text output; force text/plain.
  const wantsText = !flags.json || checkPath !== null;
  const headers = { accept: wantsText ? 'text/plain' : 'application/json' };
  const resp = await fetch(url, { headers });
  if (resp.status === 404) {
    console.error(`snapshot ${id} not found`);
    process.exit(72);
  }
  if (!resp.ok) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  if (checkPath) {
    const fs = await import('node:fs/promises');
    let expected;
    try {
      expected = await fs.readFile(checkPath, 'utf8');
    } catch (err) {
      console.error(`[canon --check] cannot read ${checkPath}: ${err?.message ?? err}`);
      process.exit(2);
    }
    const actual = await resp.text();
    if (actual === expected) {
      console.log(`[canon] \u2713 byte-equal to ${checkPath}`);
      return;
    }
    // Surface a small unified-diff preview so the author sees what
    // drifted. Full diff is left to the user's preferred tool.
    console.error(`[canon --check] \u2717 mismatch with ${checkPath}`);
    console.error(`  expected length: ${expected.length} bytes`);
    console.error(`  actual length:   ${actual.length} bytes`);
    const expectedLines = expected.split('\n');
    const actualLines   = actual.split('\n');
    const limit = Math.min(Math.max(expectedLines.length, actualLines.length), 40);
    for (let i = 0; i < limit; i++) {
      if (expectedLines[i] !== actualLines[i]) {
        console.error(`  line ${i + 1}:`);
        if (expectedLines[i] !== undefined) console.error(`    - ${expectedLines[i]}`);
        if (actualLines[i]   !== undefined) console.error(`    + ${actualLines[i]}`);
      }
    }
    process.exit(4);
  }
  if (flags.json) {
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const body = await resp.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

// Plan §3.AA1 — `od plugin diff <a> <b>`. Compares two installed
// plugins (by id) and prints a structured report. Useful for
// debugging replay invariance + reviewing version bumps.
async function runPluginDiff(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-'));
  if (flags.help || flags.h || positional.length < 2) {
    console.log(`Usage:
  od plugin diff <id-a> <id-b> [--json]

Compares two installed plugins (or two installs of the same id at
different versions) and prints every changed field. Output groups
into 'added' / 'removed' / 'changed' with one line per field.`);
    process.exit(positional.length < 2 ? 2 : 0);
  }
  const [idA, idB] = positional;
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const [respA, respB] = await Promise.all([
    fetch(`${base}/api/plugins/${encodeURIComponent(idA)}`),
    fetch(`${base}/api/plugins/${encodeURIComponent(idB)}`),
  ]);
  if (!respA.ok) {
    console.error(`GET /api/plugins/${idA} failed: ${respA.status}`);
    process.exit(1);
  }
  if (!respB.ok) {
    console.error(`GET /api/plugins/${idB} failed: ${respB.status}`);
    process.exit(1);
  }
  const a = await respA.json();
  const b = await respB.json();
  const { diffPlugins } = await import('./plugins/diff.js');
  const report = diffPlugins({ a, b });
  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  if (report.entries.length === 0) {
    console.log(`[diff] ${idA} and ${idB} are equivalent on every recorded field.`);
    return;
  }
  console.log(`[diff] ${idA} \u2194 ${idB} — ${report.added} added, ${report.removed} removed, ${report.changed} changed`);
  for (const e of report.entries) {
    const tag = e.kind === 'added'   ? '+'
              : e.kind === 'removed' ? '-'
              : '~';
    if (e.summary) {
      console.log(`  ${tag} ${e.field}  (${e.summary})`);
    } else if (e.kind === 'changed') {
      console.log(`  ${tag} ${e.field}: ${e.before ?? ''} \u2192 ${e.after ?? ''}`);
    } else if (e.kind === 'added') {
      console.log(`  ${tag} ${e.field}: ${e.after ?? ''}`);
    } else {
      console.log(`  ${tag} ${e.field}: ${e.before ?? ''}`);
    }
  }
}

async function runPluginApply(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags['grant-caps']);
  if (!id) {
    console.error('Usage: od plugin apply <id> [--inputs <json>] [--input k=v ...] [--project <id>] [--grant-caps a,b]');
    process.exit(2);
  }
  // Plan §3.B2: support both --inputs <json> and repeated --input k=v
  // forms so a code agent can build the inputs map without a JSON
  // shell-escape dance.
  let inputs = {};
  if (typeof flags.inputs === 'string' && flags.inputs.trim().length > 0) {
    try { inputs = JSON.parse(flags.inputs); } catch (err) {
      console.error(`--inputs must be valid JSON: ${err.message}`);
      process.exit(2);
    }
  }
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--input' && typeof rest[i + 1] === 'string') {
      const kv = rest[i + 1];
      const eq = kv.indexOf('=');
      if (eq > 0) {
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        inputs[k] = coerceCliValue(v);
      }
      i += 1;
    }
  }
  const grantCaps = typeof flags['grant-caps'] === 'string' && flags['grant-caps'].length > 0
    ? flags['grant-caps'].split(',').map((c) => c.trim()).filter(Boolean)
    : [];
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/apply`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputs, projectId: flags.project, grantCaps }),
    });
  } catch (err) {
    return exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${await pluginDaemonUrl(flags)}: ${err?.message ?? err}`,
    });
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 422 && Array.isArray(data?.fields)) {
      return exitWithStructuredError({
        code: 'missing-input',
        message: `Plugin "${id}" is missing required inputs: ${data.fields.join(', ')}`,
        data: { pluginId: id, missing: data.fields },
      });
    }
    return structuredHttpFailure(resp);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const snap = data?.appliedPlugin;
  if (snap) {
    console.log(`[apply] ${snap.pluginId}@${snap.pluginVersion} digest=${snap.manifestSourceDigest.slice(0, 12)}…`);
    console.log(`[apply] context: ${(data.contextItems ?? []).map((c) => `${c.kind}:${c.id ?? c.name ?? c.path}`).join(', ')}`);
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      for (const w of data.warnings) console.log(`[apply] warn: ${w}`);
    }
  } else {
    console.log(JSON.stringify(data));
  }
}

async function runPluginDuplicate(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.name);
  if (!id) {
    console.error('Usage: od plugin duplicate <id> [--name "<project name>"] [--json]');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/duplicate-project`;
  const body = typeof flags.name === 'string' && flags.name.trim().length > 0
    ? { name: flags.name.trim() }
    : {};
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${await pluginDaemonUrl(flags)}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json().catch(() => ({}));
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[duplicate] created project ${data.projectId} from ${data.sourcePluginId} -> ${data.relPath}`);
  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    for (const warning of data.warnings) console.log(`[duplicate] warn: ${warning}`);
  }
}

function coerceCliValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// `od plugin replay <runId> --snapshot-id <id>` — re-emit the immutable
// snapshot the original run was launched against, so the caller (or
// another agent) can re-apply the same plugin against fresh state. Phase
// 2A keeps replay headless: the CLI prints the snapshot + rerun bundle;
// the agent restarts the run via `od plugin apply` followed by a normal
// `od run start`. Future Phase 2C `od plugin run` will collapse this
// into a one-shot wrapper.
async function runPluginReplay(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const runId = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags['snapshot-id']
    && a !== flags.capabilities);
  if (!runId) {
    console.error('Usage: od plugin replay <runId> --snapshot-id <id>');
    process.exit(2);
  }
  const snapshotId = flags['snapshot-id'];
  if (!snapshotId) {
    console.error('--snapshot-id is required (runs are in-memory in Phase 2A; pass the snapshot id returned by od plugin apply)');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/replay`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST /api/runs/${runId}/replay failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[replay] ${data.rerun?.pluginId}@${data.rerun?.pluginVersion} digest=${(data.rerun?.manifestSourceDigest ?? '').slice(0, 12)}…`);
  console.log(`[replay] inputs: ${JSON.stringify(data.rerun?.inputs ?? {})}`);
  console.log('[replay] re-apply via: od plugin apply ' + data.rerun?.pluginId + ' --inputs ' + JSON.stringify(JSON.stringify(data.rerun?.inputs ?? {})));
}

async function runUi(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printUiHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':    return runUiList(rest);
    case 'show':    return runUiShow(rest);
    case 'respond': return runUiRespond(rest);
    case 'revoke':  return runUiRevoke(rest);
    case 'prefill': return runUiPrefill(rest);
    default:
      console.error(`unknown subcommand: od ui ${sub}`);
      printUiHelp();
      process.exit(2);
  }
}

async function uiDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

async function runUiList(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const base = (await uiDaemonUrl(flags)).replace(/\/$/, '');
  let url;
  if (flags.run) url = `${base}/api/runs/${encodeURIComponent(flags.run)}/genui`;
  else if (flags.project) url = `${base}/api/projects/${encodeURIComponent(flags.project)}/genui`;
  else {
    console.error('Usage: od ui list --run <runId> | --project <projectId>');
    process.exit(2);
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const surfaces = Array.isArray(data?.surfaces) ? data.surfaces : [];
  if (surfaces.length === 0) {
    console.log('No GenUI surfaces.');
    return;
  }
  for (const s of surfaces) {
    console.log(`${s.surfaceId}  kind=${s.kind}  persist=${s.persist}  status=${s.status}  rowId=${s.id}`);
  }
}

async function runUiShow(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const runId = flags.run ?? positional[0];
  const surfaceId = flags['snapshot-id'] ? null : positional[flags.run ? 0 : 1];
  if (!runId || !surfaceId) {
    console.error('Usage: od ui show --run <runId> <surfaceId>');
    process.exit(2);
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/genui/${encodeURIComponent(surfaceId)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  // Plan §6 Phase 2A.5 — `--schema` prints the spec's JSON Schema
  // only (null if the surface declares none). Designed to feed
  // `od ui respond --value-json "$(...)"` in headless / agent flows.
  if (flags.schema) {
    const schema = data?.spec?.schema ?? null;
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function runUiRespond(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const runId = flags.run ?? positional[0];
  const surfaceId = positional[flags.run ? 0 : 1];
  if (!runId || !surfaceId) {
    console.error('Usage: od ui respond --run <runId> <surfaceId> [--value <text> | --value-json <json> | --skip]');
    process.exit(2);
  }
  let value = null;
  if (flags.skip) {
    // Skip translates to a null answer; daemon resolves the surface in
    // `resolved` state with `respondedBy: 'auto'`. Phase 2A keeps the
    // semantics simple; spec §10.3.4 onTimeout='skip' lands in Phase 4.
    value = null;
  } else if (typeof flags['value-json'] === 'string') {
    try { value = JSON.parse(flags['value-json']); } catch (err) {
      console.error(`--value-json must be valid JSON: ${err.message}`);
      process.exit(2);
    }
  } else if (typeof flags.value === 'string') {
    value = flags.value;
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/genui/${encodeURIComponent(surfaceId)}/respond`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value, respondedBy: 'user' }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`[ui] ${surfaceId} resolved (rowId=${data?.surface?.id})`);
  }
}

async function runUiRevoke(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const projectId = flags.project ?? positional[0];
  const surfaceId = positional[flags.project ? 0 : 1];
  if (!projectId || !surfaceId) {
    console.error('Usage: od ui revoke --project <projectId> <surfaceId>');
    process.exit(2);
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/genui/${encodeURIComponent(surfaceId)}/revoke`;
  const resp = await fetch(url, { method: 'POST' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`[ui] revoked ${data.invalidated} row(s)`);
  }
}

async function runUiPrefill(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const projectId = flags.project ?? positional[0];
  const surfaceId = positional[flags.project ? 0 : 1];
  const snapshotId = flags['snapshot-id'];
  if (!projectId || !surfaceId || !snapshotId) {
    console.error('Usage: od ui prefill --project <projectId> --snapshot-id <id> <surfaceId> [--value <text> | --value-json <json>] [--persist run|conversation|project] [--kind form|choice|confirmation|oauth-prompt]');
    process.exit(2);
  }
  let value = null;
  if (typeof flags['value-json'] === 'string') {
    try { value = JSON.parse(flags['value-json']); } catch (err) {
      console.error(`--value-json must be valid JSON: ${err.message}`);
      process.exit(2);
    }
  } else if (typeof flags.value === 'string') {
    value = flags.value;
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/genui/prefill`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      snapshotId,
      surfaceId,
      kind:    flags.kind ?? 'confirmation',
      persist: flags.persist ?? 'project',
      value,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`[ui] prefilled ${surfaceId} (rowId=${data?.surface?.id})`);
  }
}

function printUiHelp() {
  console.log(`Usage:
  od ui list  --run <runId>                          List GenUI surfaces for a run.
  od ui list  --project <projectId>                  List GenUI surfaces for a project.
  od ui show  --run <runId> <surfaceId> [--schema]   Read a single surface (kind / schema / value). --schema prints just the JSON Schema.
  od ui respond --run <runId> <surfaceId> [--value <txt> | --value-json <json> | --skip]
                                                     Answer a pending surface from any process.
  od ui revoke --project <projectId> <surfaceId>     Invalidate a project-tier cached answer.
  od ui prefill --project <projectId> --snapshot-id <id> <surfaceId>
                [--value <text> | --value-json <json>] [--persist run|conversation|project]
                                                     Pre-answer a surface so the run never broadcasts it.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base (default OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456).
  --json               Emit raw JSON (suitable for scripts) instead of human-readable output.`);
}

function printPluginHelp() {
  console.log(`Usage:
  od plugin list [--task-kind <kind>]     List installed plugins (filterable).
  od plugin search <query> [--tag <t>]    Search installed plugins by id/title/desc/tag.
  od plugin info <id>                     Print a plugin's manifest + trust state as JSON.
  od plugin manifest <id>                 Print only the parsed manifest JSON (no wrapper).
  od plugin sources                       List distinct install sources + counts.
  od plugin apply <id> [--inputs <json>]  Compute an ApplyResult (preview) for a plugin.
  od plugin duplicate <id> [--name <n>]   Copy a plugin HTML example into a new project
                                          without starting an agent run.
  od plugin canon <snapshotId>            Print the canonical system-prompt block for a snapshot.
                                          (--check <file> for byte-equality fixtures.)
  od plugin simulate <pluginId> [-s k=v]  Walk the plugin's pipeline against caller-supplied
                                          signals; report stage convergence + iterations
                                          (no LLM in the loop).
  od plugin verify <pluginId>             CI meta-command: doctor + simulate + canon --check
                                          driven by an .od-verify.json config in the plugin folder.
  od plugin diff <a> <b> [--json]         Compare two installed plugins by id.
  od plugin replay <runId> --snapshot-id <id>
                                          Re-emit the immutable snapshot a run launched against.
  od plugin validate <folder> [--json]    Lint a plugin folder before installing
                                          (manifest parse + atom + ref checks).
  od plugin pack <folder> [--out <path>]  Build a .tgz archive of a plugin
                                          folder for distribution.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base (default OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456).
  --json               Emit raw JSON (suitable for scripts) instead of human-readable output.

Clean Design works with the plugins already present in the local runtime.
Installing, upgrading, publishing, and registry commands are not available.`);
}

// ---------------------------------------------------------------------------
// Subcommand: od project / od run / od files / od conversation
//
// Plan §6 Phase 1 follow-up + Phase 2C: thin CLI wrappers over the
// existing daemon HTTP endpoints (POST /api/projects, POST /api/runs,
// GET /api/projects/:id/files, …). The §12.5 walkthrough relies on
// these so a code agent can drive Clean Design end-to-end without
// hitting `/api/*` directly. Spec §11.7 invariant: every UI feature is
// reachable via the CLI; we wrap rather than duplicate.
// ---------------------------------------------------------------------------

async function projectDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

function printFigmaUsage() {
  console.log(`Usage:
  od figma import --project <id> --file <path.fig> [--notes "<text>"]
                  [--build] [--prompt "<text>" | --prompt-file <path|->] [--json]
  od figma import --project <id> --figma-url <url> [--notes "<text>"] [--json]

Imports a Figma design into a project. A .fig file is decoded fully offline
(no Figma account); a Figma URL runs through the od-figma-migration scenario
(OAuth). Either way it stages a figma/ snapshot the agent reshapes into a
webpage.

Flags:
  --project <id>       Target project id (required).
  --file <path.fig>    Local .fig to decode offline.
  --figma-url <url>    Figma file URL (https://figma.com/(file|design)/<key>).
  --notes "<text>"     Design brief folded into the reshape prompt.
  --build              After import, start a run that builds the webpage.
  --prompt / --prompt-file   Override the build prompt (file or - for stdin).
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
}

async function runFigma(args) {
  const sub = args.find((a) => !a.startsWith('-'));
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printFigmaUsage();
    process.exit(sub ? 0 : 2);
  }
  if (sub !== 'import') {
    console.error(`unknown subcommand: od figma ${sub}`);
    printFigmaUsage();
    process.exit(2);
  }
  const idx = args.indexOf(sub);
  const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
  const flags = parseFlags(rest, { string: FIGMA_STRING_FLAGS, boolean: FIGMA_BOOLEAN_FLAGS });
  const base = (await cliDaemonUrl(flags)).replace(/\/$/, '');

  if (!flags.project) {
    console.error('--project <id> is required');
    process.exit(2);
  }
  const file = flags.file;
  const figmaUrl = flags['figma-url'];
  if (!file && !figmaUrl) {
    console.error('one of --file <path.fig> or --figma-url <url> is required');
    process.exit(2);
  }

  // Figma URL → the existing migration scenario (OAuth lives in the run
  // pipeline). Start it through the same /api/runs path `od run start` uses.
  if (figmaUrl && !file) {
    const runBody = {
      projectId: flags.project,
      pluginId: 'od-figma-migration',
      pluginInputs: { figmaUrl, ...(flags.notes ? { notes: flags.notes } : {}) },
    };
    const runResp = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(runBody),
    });
    const runData = await runResp.json().catch(() => ({}));
    if (!runResp.ok) {
      console.error(`POST /api/runs failed: ${runResp.status} ${JSON.stringify(runData)}`);
      process.exit(1);
    }
    if (flags.json) return process.stdout.write(JSON.stringify(runData, null, 2) + '\n');
    console.log(`[figma] migration run started ${runData.runId}`);
    return;
  }

  // Offline .fig path → multipart upload to the import endpoint.
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
  const form = new FormData();
  form.append('file', new Blob([bytes]), basename(file));
  if (flags.notes) form.append('notes', String(flags.notes));
  const resp = await fetch(`${base}/api/projects/${encodeURIComponent(flags.project)}/figma/import`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();

  if (flags.json && !flags.build) {
    return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
  const inv = data.inventory ?? {};
  if (!flags.json) {
    console.log(`[figma] imported "${data.label}" → ${data.snapshotDir}/`);
    console.log(`  ${inv.decoded ? 'decoded' : 'assets-only'}: ${inv.nodeCount} nodes, ${inv.pageCount} pages, ${inv.frameCount} frames, ${inv.componentCount} components`);
    console.log(`  ${(inv.colors ?? []).length} colors, ${(inv.fonts ?? []).length} fonts, ${inv.assetCount} assets${inv.hasThumbnail ? ', + preview' : ''}`);
    for (const w of inv.warnings ?? []) console.log(`  ! ${w}`);
  }

  if (flags.build) {
    const override = await readPromptFromFlags(flags);
    const message = override || data.suggestedPrompt;
    const runResp = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: flags.project, message }),
    });
    const runData = await runResp.json().catch(() => ({}));
    if (!runResp.ok) {
      console.error(`build run failed: ${runResp.status} ${JSON.stringify(runData)}`);
      process.exit(1);
    }
    if (flags.json) return process.stdout.write(JSON.stringify({ ...data, build: runData }, null, 2) + '\n');
    console.log(`[figma] build run started ${runData.runId}`);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: od brand …
//
// Headless surface for the Brands library. This is the dual-track contract:
// every capability the Brands UI exposes (extract from a URL, list, inspect,
// delete) is reachable here so an external agent (hermes-agent, openclaw,
// scripted job) can drive the brand lifecycle without rendering a page.
// Storage is /api/brands on the local daemon; a "brand" registers a `user:<id>`
// design system under the hood, so applying a brand reuses the existing
// design-system apply flow — there is no separate brandId apply path.
// ---------------------------------------------------------------------------

// Derive a short domain for list output from a brand's source URL.
function brandDomainForCli(sourceUrl) {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) return '-';
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`);
    return u.hostname.replace(/^www\./, '') || '-';
  } catch {
    return sourceUrl;
  }
}

function formatBrandRow(summary) {
  const meta = summary?.meta ?? {};
  const name = summary?.brand?.name || meta.id || '-';
  return [
    meta.id ?? '-',
    name,
    brandDomainForCli(meta.sourceUrl),
    meta.status ?? '-',
  ].join('\t');
}

async function runBrand(args) {
  if (args.length === 0 || isBrandHelpArg(args[0])
      || args.includes('--help') || args.includes('-h')) {
    console.log(BRAND_USAGE);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':     return runBrandList(rest);
    case 'create':   return runBrandCreate(rest);
    case 'extract':  return runBrandCreate(rest);
    case 'continue': return runBrandContinue(rest);
    case 'preview':  return runBrandPreview(rest);
    case 'finalize': return runBrandFinalize(rest);
    case 'extract-from-html': return runBrandExtractFromHtml(rest);
    case 'get':      return runBrandGet(rest);
    case 'show':     return runBrandGet(rest);
    case 'delete':   return runBrandDelete(rest);
    case 'remove':   return runBrandDelete(rest);
    default:
      console.error(`unknown subcommand: od brand ${sub}`);
      console.log(BRAND_USAGE);
      process.exit(2);
  }
}

async function runBrandList(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const brands = Array.isArray(data?.brands) ? data.brands : [];
  if (brands.length === 0) {
    console.log('No brands yet. Extract one with: od brand create <url>');
    return;
  }
  console.log('# id\tname\tdomain\tstatus');
  for (const summary of brands) console.log(formatBrandRow(summary));
}

async function runBrandCreate(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const positional = positionalArgs(rest, BRAND_STRING_FLAGS);
  // The URL may arrive as a positional, or — for parity with other long-input
  // subcommands — via --prompt-file <path|-> (a file or stdin). The positional
  // wins when both are present.
  let url = positional[0];
  if (!url) {
    const fromFile = await readPromptFromFlags(flags);
    if (typeof fromFile === 'string') url = fromFile.trim();
  }
  if (!url) {
    console.error('Usage: od brand create <url> [--json]\n' +
      '       od brand create --prompt-file <path|-> [--json]');
    process.exit(2);
  }

  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        url,
        ...(typeof flags.locale === 'string' && flags.locale.trim()
          ? { locale: flags.locale.trim() }
          : {}),
      }),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) {
    return structuredHttpFailure(resp);
  }

  // Extraction is agent-driven: this kickoff reserves the brand + a backing
  // project with the target site open in a browser tab and a seeded prompt.
  // The agent then runs the chain (measure → synthesize → `od brand finalize`).
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  process.stderr.write(
    '[brand] extraction project created — open it to run the agent, ' +
    `then it self-finalizes with: od brand finalize ${data?.id ?? ''}\n`,
  );
  // Clean stdout result: "<id>\t<projectId>" so jq / cut / xargs can chain.
  console.log(`${data?.id ?? ''}\t${data?.projectId ?? ''}`);
}

async function runBrandFinalize(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand finalize <id> [--project <projectId>] [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const body = {};
  if (typeof flags.project === 'string' && flags.project.trim()) body.projectId = flags.project.trim();
  if (typeof flags.locale === 'string' && flags.locale.trim()) body.locale = flags.locale.trim();
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/finalize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  const name = data?.brand?.name ?? data?.id ?? id;
  console.log(`${data?.id ?? id}\t${name}`);
  if (data?.designSystemId) process.stderr.write(`[brand] registered design system ${data.designSystemId}\n`);
}

async function runBrandContinue(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand continue <id> [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/continue-extraction`, {
      method: 'POST',
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  console.log([
    data?.id ?? id,
    data?.status ?? '-',
    data?.projectId ?? '',
    data?.conversationId ?? '',
  ].join('\t'));
}

// Read a flag value as file content (or stdin when the value is "-"). Returns
// null when the flag is unset. Mirrors readPromptFromFlags' file/stdin handling
// but for an arbitrary flag name (--html-file / --css-file).
async function readFileFlagOrStdin(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value === '-') {
    return await new Promise((resolve, reject) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }
  const { readFile } = await import('node:fs/promises');
  return await readFile(value, 'utf8');
}

// od brand extract-from-html <id> --html-file <path|-> [--css-file <path>]
//   [--base-url <url>] [--json]
// Re-runs extraction against pre-captured rendered HTML (e.g. a page an external
// agent already loaded past an anti-bot wall), mirroring the UI's browser-assist
// confirm path so the capability is reachable from the CLI too.
async function runBrandExtractFromHtml(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand extract-from-html <id> --html-file <path|-> '
      + '[--css-file <path>] [--base-url <url>] [--json]');
    process.exit(2);
  }
  let html;
  try {
    html = await readFileFlagOrStdin(flags['html-file']);
  } catch (err) {
    console.error(`could not read --html-file: ${err.message}`);
    process.exit(2);
  }
  if (!html || !html.trim()) {
    console.error('--html-file <path|-> is required (the rendered page HTML)');
    process.exit(2);
  }
  let css = '';
  if (typeof flags['css-file'] === 'string' && flags['css-file'].length > 0) {
    try {
      css = (await readFileFlagOrStdin(flags['css-file'])) ?? '';
    } catch (err) {
      console.error(`could not read --css-file: ${err.message}`);
      process.exit(2);
    }
  }
  const body = { html };
  if (css.trim()) body.css = css;
  if (typeof flags['base-url'] === 'string' && flags['base-url'].trim()) {
    body.baseUrl = flags['base-url'].trim();
  }

  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/extract-from-html`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  const name = data?.brand?.name ?? data?.id ?? id;
  console.log(`${data?.id ?? id}\t${name}`);
  if (data?.designSystemId) {
    process.stderr.write(`[brand] registered design system ${data.designSystemId}\n`);
  }
}

async function runBrandPreview(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand preview <id> [--project <projectId>] [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const body = {};
  if (typeof flags.project === 'string' && flags.project.trim()) body.projectId = flags.project.trim();
  if (typeof flags.locale === 'string' && flags.locale.trim()) body.locale = flags.locale.trim();
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  // Clean stdout result: "<id>\t<file>" so the agent can confirm the path.
  console.log(`${data?.id ?? id}\t${data?.file ?? 'brand.html'}`);
}

async function runBrandGet(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand get <id> [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const meta = data?.meta ?? {};
  const brand = data?.brand ?? null;
  console.log(`id\t${meta.id ?? id}`);
  console.log(`name\t${brand?.name ?? '-'}`);
  console.log(`domain\t${brandDomainForCli(meta.sourceUrl)}`);
  console.log(`status\t${meta.status ?? '-'}`);
  if (meta.designSystemId) console.log(`designSystem\t${meta.designSystemId}`);
  if (meta.projectId) console.log(`project\t${meta.projectId}`);
  if (Array.isArray(meta.systemFiles) && meta.systemFiles.length > 0) {
    console.log(`files\t${meta.systemFiles.join(' ')}`);
  }
  if (brand?.tagline) console.log(`tagline\t${brand.tagline}`);
  if (Array.isArray(brand?.colors) && brand.colors.length > 0) {
    console.log(`colors\t${brand.colors.map((c) => c.hex).join(' ')}`);
  }
  if (meta.error) console.log(`error\t${meta.error}`);
}

async function runBrandDelete(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand delete <id> [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json().catch(() => ({ ok: true }));
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[brand] deleted ${id}`);
}

function normalizeChatSessionModeFlag(value) {
  if (value == null) return undefined;
  const mode = String(value).trim().toLowerCase();
  if (mode === 'design' || mode === 'chat' || mode === 'plan') return mode;
  console.error('--mode must be one of: design, chat, plan');
  process.exit(2);
}

function safeReadJsonFile(p) {
  try {
    if (p === '-') return JSON.parse(readFileSync(0, 'utf8'));
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function collectCliPositionals(argv, stringFlags = new Set()) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--') {
      out.push(...argv.slice(i + 1));
      break;
    }
    if (typeof value === 'string' && value.startsWith('--')) {
      const eq = value.indexOf('=');
      const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
      if (eq < 0 && stringFlags.has(key)) i++;
      continue;
    }
    out.push(value);
  }
  return out;
}

async function resolveFolderPathForCli(rawPath) {
  const path = await import('node:path');
  const os = await import('node:os');
  const raw = typeof rawPath === 'string' && rawPath.trim().length > 0
    ? rawPath.trim()
    : (process.env.INIT_CWD || process.cwd());
  const expanded = raw === '~'
    ? os.homedir()
    : raw.startsWith(`~${path.sep}`)
      ? path.join(os.homedir(), raw.slice(2))
      : raw;
  return path.resolve(expanded);
}

async function basenameForCli(folderPath) {
  const path = await import('node:path');
  return path.basename(folderPath) || 'Imported project';
}

async function readRunMessageFromFlags(flags, fallback = null) {
  if (typeof flags.message === 'string' && flags.message.length > 0) {
    return flags.message;
  }
  const prompt = await readPromptFromFlags(flags);
  if (typeof prompt === 'string' && prompt.length > 0) return prompt;
  return fallback;
}

async function postJsonToDaemon(base, route, body, headers = {}) {
  let resp;
  try {
    resp = await fetch(`${base}${route}`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body:    JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errCode = data?.error?.code;
    if (errCode && errCode in RECOVERABLE_EXIT_CODES) {
      return exitWithStructuredError({
        code:    errCode,
        message: data.error.message ?? `HTTP ${resp.status}`,
        data:    data.error.data,
      });
    }
    console.error(`POST ${route} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  return data;
}

async function postImportFolderToDaemon(base, body, baseDir) {
  const headers = {};
  const importToken = await mintCliImportToken(baseDir);
  if (importToken != null) {
    headers['x-od-desktop-import-token'] = importToken;
  }
  return postJsonToDaemon(base, '/api/import/folder', body, headers);
}

async function runProject(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od project create [--name "<title>"] [--skill <id>] [--design-system <id>]
                    [--plugin <id>] [--inputs <json>] [--metadata-json <path|->]
                    [--mode design|chat|plan]
  od project create-design-system <id> [--name "<title>"]
                    [--prompt "<text>" | --prompt-file <path|->] [--json]
                    Duplicate a project as a design-system workspace and seed
                    the design-system generation prompt.
  od project duplicate <id> [--name "<title>"] [--json]
                    Duplicate a project and copy its Design Files.
  od project import <baseDir> [--name "<title>"]
  od project import-folder <path> [--name "<title>"] [--skill <id>]
                    [--design-system <id>] [--json]
  od project list                         List projects.
  od project info <id>                    Print one project.
  od project delete <id>                  Delete a project.
  od project editors                      List locally-installed editors that
                                          can open a project (hand-off targets).
  od project open-in <id> --editor <slug> Open the project's working directory
                                          in the chosen editor (cursor, zed,
                                          vscode, finder, terminal, …).
  od project handoff <id> --conversation <id> --api-key <key> --model <model>
                    [--base-url <url>] [--max-tokens <n>]
                    Synthesize a resume-conversation handoff prompt.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  // Handoff owns its own flag parsing, daemon-URL resolution, and
  // structured fail() output. Dispatch it before the generic project
  // parser below so a malformed `od project handoff` invocation
  // (`--unknown`, `--max-tokens` with no value) hits handoff-cli's
  // machine-readable fail() path instead of throwing out of parseFlags.
  if (sub === 'handoff') {
    const { exitCode } = await runProjectHandoff(rest);
    if (exitCode !== 0) process.exit(exitCode);
    return;
  }
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}/api/projects`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const projects = data?.projects ?? [];
      if (projects.length === 0) {
        console.log('No projects. Create one with `od project create --name "..."`.');
        return;
      }
      for (const p of projects) console.log(`${p.id}\t${p.name}\t${p.skillId ?? '-'}`);
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od project info <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    case 'create': {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      const name = typeof flags.name === 'string' && flags.name.length > 0
        ? flags.name
        : 'Untitled project';
      const body = {
        id,
        name,
        skillId:        flags.skill ?? null,
        designSystemId: flags['design-system'] ?? null,
      };
      const conversationMode = normalizeChatSessionModeFlag(flags.mode);
      if (conversationMode) body.conversationMode = conversationMode;
      if (flags['pending-prompt']) body.pendingPrompt = flags['pending-prompt'];
      if (flags['metadata-json']) {
        const mj = safeReadJsonFile(flags['metadata-json']);
        if (mj && typeof mj === 'object') body.metadata = mj;
      }
      if (flags.plugin) body.pluginId = flags.plugin;
      if (flags.inputs) {
        try { body.pluginInputs = JSON.parse(flags.inputs); } catch (err) {
          console.error(`--inputs must be valid JSON: ${err.message}`);
          process.exit(2);
        }
      }
      if (flags['grant-caps']) {
        body.grantCaps = String(flags['grant-caps']).split(',').map((c) => c.trim()).filter(Boolean);
      }
      const resp = await fetch(`${base}/api/projects`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409 && data?.error?.code === 'capabilities-required') {
          return exitWithStructuredError({
            code:    'capabilities-required',
            message: data.error.message,
            data:    data.error.data,
          });
        }
        console.error(`POST /api/projects failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] created ${data.project?.id ?? id} (conversation ${data.conversationId})`);
      return;
    }
    case 'create-design-system': {
      const sourceProjectId = positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!sourceProjectId) {
        console.error('Usage: od project create-design-system <id> [--name "<title>"] [--prompt-file <path|->] [--json]');
        process.exit(2);
      }
      const prompt = await readPromptFromFlags(flags);
      const body = {};
      if (typeof flags.name === 'string' && flags.name.length > 0) body.name = flags.name;
      if (typeof prompt === 'string' && prompt.trim().length > 0) body.pendingPrompt = prompt;
      const data = await postJsonToDaemon(
        base,
        `/api/projects/${encodeURIComponent(sourceProjectId)}/design-system-copy`,
        body,
      );
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(
        `[project] created design system project ${data.project?.id ?? '-'} from ${sourceProjectId} `
        + `(design system ${data.designSystemId ?? '-'}, conversation ${data.conversationId ?? '-'})`,
      );
      return;
    }
    case 'duplicate': {
      const sourceProjectId = positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!sourceProjectId) {
        console.error('Usage: od project duplicate <id> [--name "<title>"] [--json]');
        process.exit(2);
      }
      const body = {};
      if (typeof flags.name === 'string' && flags.name.length > 0) body.name = flags.name;
      const data = await postJsonToDaemon(
        base,
        `/api/projects/${encodeURIComponent(sourceProjectId)}/duplicate`,
        body,
      );
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(
        `[project] duplicated ${sourceProjectId} as ${data.project?.id ?? '-'} `
        + `(conversation ${data.conversationId ?? '-'})`,
      );
      return;
    }
    case 'import': {
      const [baseDir] = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const importBaseDir = typeof baseDir === 'string' ? baseDir.trim() : '';
      if (!importBaseDir) {
        console.error('Usage: od project import <baseDir> [--name "<title>"]');
        process.exit(2);
      }
      const body = { baseDir: importBaseDir };
      if (typeof flags.name === 'string' && flags.name.length > 0) body.name = flags.name;
      if (typeof flags.skill === 'string' && flags.skill.length > 0) body.skillId = flags.skill;
      if (typeof flags['design-system'] === 'string' && flags['design-system'].length > 0) {
        body.designSystemId = flags['design-system'];
      }
      const headers = { 'content-type': 'application/json' };
      const importToken = await mintCliImportToken(importBaseDir);
      if (importToken != null) {
        headers['x-od-desktop-import-token'] = importToken;
      }
      const resp = await fetch(`${base}/api/import/folder`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] imported ${data.project?.id ?? '-'} (conversation ${data.conversationId ?? '-'})`);
      return;
    }
    case 'import-folder': {
      const parts = collectCliPositionals(rest, PROJECT_STRING_FLAGS);
      const folderArg = flags.path ?? flags.dir ?? parts[0];
      if (!folderArg) {
        console.error('Usage: od project import-folder <path> [--skill <id>] [--design-system <id>]');
        process.exit(2);
      }
      const folderPath = await resolveFolderPathForCli(folderArg);
      const body = {
        baseDir:        folderPath,
        name:           typeof flags.name === 'string' && flags.name.length > 0
          ? flags.name
          : await basenameForCli(folderPath),
        skillId:        flags.skill ?? null,
        designSystemId: flags['design-system'] ?? null,
      };
      const data = await postImportFolderToDaemon(base, body, folderPath);
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] imported ${data.project?.id ?? '-'} from ${folderPath} (conversation ${data.conversationId ?? '-'})`);
      return;
    }
    case 'delete': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od project delete <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      console.log(`[project] deleted ${id}`);
      return;
    }
    case 'editors': {
      const resp = await fetch(`${base}/api/editors`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const editors = data?.editors ?? [];
      for (const ed of editors) {
        const status = ed.available ? 'available' : 'missing';
        console.log(`${ed.id}\t${ed.label}\t${status}`);
      }
      return;
    }
    case 'open-in': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od project open-in <id> --editor <slug>');
        process.exit(2);
      }
      const editor = typeof flags.editor === 'string' ? flags.editor : '';
      if (!editor) {
        console.error('--editor <slug> is required. Run `od project editors` to list options.');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/open-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editorId: editor }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (flags.json) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
        else console.error(`POST /api/projects/${id}/open-in failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] opened ${id} in ${editor} (${data.path ?? ''})`);
      return;
    }
    default:
      console.error(`unknown subcommand: od project ${sub}`);
      process.exit(2);
  }
}

async function runRun(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od run start --project <projectId> [--conversation <id>] [--message "<text>"]
               [--plugin <id>] [--inputs <json>] [--grant-caps a,b]
               [--agent claude|codex|opencode] [--model <id>] [--follow] [--json]
  od run redesign [--path <folder>] [--message "<text>" | --prompt-file <path|->]
               [--agent claude] [--model <id>] [--follow] [--json]
  od run watch  <runId>                     ND-JSON event stream on stdout.
  od run cancel <runId>                     Request cancellation.
  od run continue <runId> [--follow]        Continue a resumable failed run.
  od run list   [--project <id>]            List recent runs.
  od run info   <runId>                     One run's status.
  od run result-package <runId> [--json]    Inspect run outputs and workspace
                                            provenance without applying them.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const url = flags.project
        ? `${base}/api/runs?projectId=${encodeURIComponent(flags.project)}`
        : `${base}/api/runs`;
      const resp = await fetch(url);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const runs = data?.runs ?? [];
      for (const r of runs) {
        console.log(`${r.id}\t${r.status}\tproject=${r.projectId ?? '-'}\tplugin=${r.pluginId ?? '-'}`);
      }
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run info <runId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp, 'run-not-found');
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    case 'result-package': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run result-package <runId> [--json]');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}/result-package`);
      if (!resp.ok) return structuredHttpFailure(resp, 'run-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const run = data?.run ?? {};
      const workspace = data?.workspace ?? {};
      const storage = workspace.storage ?? {};
      const provenance = workspace.provenance ?? null;
      console.log(`run\t${run.id ?? id}\t${run.status ?? '-'}`);
      console.log(`workspace\t${storage.kind ?? '-'}\t${storage.baseDir ?? '-'}`);
      console.log(`provenance\t${provenance?.kind ?? '-'}\twriteback=${provenance?.writeback ?? '-'}`);
      console.log(`project\t${data?.project?.id ?? '-'}\tfiles=${data?.project?.fileCount ?? 0}`);
      const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : [];
      for (const artifact of artifacts) {
        console.log(`artifact\t${artifact.file ?? '-'}\t${artifact.kind ?? '-'}\t${artifact.title ?? '-'}`);
      }
      return;
    }
    case 'cancel': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run cancel <runId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      if (!resp.ok) return structuredHttpFailure(resp, 'run-not-found');
      console.log(`[run] cancelled ${id}`);
      return;
    }
    case 'continue': {
      const id = positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!id) {
        console.error('Usage: od run continue <runId> [--message "<text>"] [--follow] [--json]');
        process.exit(2);
      }
      const statusResp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}`);
      if (!statusResp.ok) return structuredHttpFailure(statusResp, 'run-not-found');
      const status = await statusResp.json();
      if (status?.resumable !== true) {
        const payload = {
          error: {
            code: 'run-not-resumable',
            message: `Run ${id} does not have a safe recoverable native session.`,
          },
        };
        if (flags.json) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
        else console.error(payload.error.message);
        process.exit(1);
      }
      if (!status.projectId || !status.conversationId) {
        const payload = {
          error: {
            code: 'run-missing-context',
            message: `Run ${id} is missing project or conversation context.`,
          },
        };
        if (flags.json) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
        else console.error(payload.error.message);
        process.exit(1);
      }
      const message = await readRunMessageFromFlags(flags, RESUME_CONTINUE_PROMPT);
      const body = {
        projectId: status.projectId,
        conversationId: status.conversationId,
        message,
        ...(status.agentId ? { agentId: status.agentId } : {}),
      };
      const data = await postJsonToDaemon(base, '/api/runs', body);
      if (flags.json && !flags.follow) {
        return process.stdout.write(JSON.stringify({
          ...data,
          continuedFromRunId: id,
        }, null, 2) + '\n');
      }
      console.log(`[run] continued ${id} as ${data.runId}`);
      if (flags.follow) await streamRunEvents(base, data.runId);
      return;
    }
    case 'watch': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run watch <runId>');
        process.exit(2);
      }
      await streamRunEvents(base, id);
      return;
    }
    case 'redesign': {
      const parts = collectCliPositionals(rest, PROJECT_STRING_FLAGS);
      const promptFromArgs = parts.join(' ').trim();
      const defaultMessage =
        'Use the redesign-existing-projects skill. Audit the current UI first, then redesign it to premium quality without breaking functionality. Preserve the existing product structure, routes, and behavior.';
      const message = await readRunMessageFromFlags(
        flags,
        promptFromArgs || defaultMessage,
      );
      const skillId = flags.skill ?? 'redesign-existing-projects';
      const designSystemId = flags['design-system'] ?? 'default';
      let projectId = flags.project;
      let conversationId = flags.conversation;
      let imported = null;

      if (!projectId) {
        const folderPath = await resolveFolderPathForCli(flags.path ?? flags.dir);
        imported = await postImportFolderToDaemon(base, {
          baseDir:        folderPath,
          name:           typeof flags.name === 'string' && flags.name.length > 0
            ? flags.name
            : await basenameForCli(folderPath),
          skillId,
          designSystemId,
        }, folderPath);
        projectId = imported.project?.id;
        conversationId = conversationId ?? imported.conversationId;
        if (!projectId) {
          console.error('POST /api/import/folder did not return project.id');
          process.exit(1);
        }
        if (!flags.json || flags.follow) {
          console.log(`[project] imported ${projectId} from ${folderPath} (conversation ${conversationId ?? '-'})`);
        }
      }

      const body = {
        projectId,
        ...(conversationId ? { conversationId } : {}),
        ...(message ? { message } : {}),
        skillId,
        designSystemId,
        ...(flags.agent ? { agentId: flags.agent } : {}),
        ...(flags.model ? { model: flags.model } : {}),
      };
      const data = await postJsonToDaemon(base, '/api/runs', body);
      if (flags.json && !flags.follow) {
        return process.stdout.write(JSON.stringify({
          ...data,
          project: imported?.project ?? null,
          conversationId: conversationId ?? null,
        }, null, 2) + '\n');
      }
      console.log(`[run] started ${data.runId}`);
      if (flags.follow) await streamRunEvents(base, data.runId);
      return;
    }
    case 'start': {
      if (!flags.project) {
        console.error('--project <projectId> is required');
        process.exit(2);
      }
      const body = { projectId: flags.project };
      if (flags.conversation) body.conversationId = flags.conversation;
      const message = await readRunMessageFromFlags(flags);
      if (message) body.message = message;
      if (flags.plugin) body.pluginId = flags.plugin;
      if (flags.skill) body.skillId = flags.skill;
      if (flags['design-system']) body.designSystemId = flags['design-system'];
      if (flags.agent) body.agentId = flags.agent;
      if (flags.model) body.model = flags.model;
      if (flags.inputs) {
        try { body.pluginInputs = JSON.parse(flags.inputs); } catch (err) {
          console.error(`--inputs must be valid JSON: ${err.message}`);
          process.exit(2);
        }
      }
      if (flags['grant-caps']) {
        body.grantCaps = String(flags['grant-caps']).split(',').map((c) => c.trim()).filter(Boolean);
      }
      if (flags['snapshot-id']) body.appliedPluginSnapshotId = flags['snapshot-id'];
      const resp = await fetch(`${base}/api/runs`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409 && data?.error?.code === 'capabilities-required') {
          return exitWithStructuredError({
            code:    'capabilities-required',
            message: data.error.message,
            data:    data.error.data,
          });
        }
        if (resp.status === 422 && data?.error?.code === 'missing-input') {
          return exitWithStructuredError({
            code:    'missing-input',
            message: data.error.message,
            data:    data.error.data,
          });
        }
        console.error(`POST /api/runs failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json && !flags.follow) {
        return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      }
      console.log(`[run] started ${data.runId}`);
      if (flags.follow) await streamRunEvents(base, data.runId);
      return;
    }
    default:
      console.error(`unknown subcommand: od run ${sub}`);
      process.exit(2);
  }
}

// Stream the SSE events at /api/runs/:id/events as ND-JSON on stdout.
// Each line is one event: { event, data } so a code agent can parse it
// without needing an SSE library.
async function streamRunEvents(base, runId) {
  const resp = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/events`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!resp.ok || !resp.body) {
    console.error(`run watch failed: ${resp.status}`);
    process.exit(1);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine  = lines.find((l) => l.startsWith('data: '));
      const event = eventLine ? eventLine.slice('event: '.length) : 'message';
      const dataRaw = dataLine ? dataLine.slice('data: '.length) : '';
      let parsed;
      try { parsed = JSON.parse(dataRaw); } catch { parsed = dataRaw; }
      process.stdout.write(JSON.stringify({ event, data: parsed }) + '\n');
      if (event === 'end') {
        return;
      }
    }
  }
}

// `od shell --project <id>` opens an interactive PTY rooted at the project's
// working directory and attaches to it. This is the CLI parity for the web
// Terminal tab — both surfaces drive `/api/projects/:id/terminals`. Output
// streams down over SSE; local keystrokes are POSTed back up to /stdin. When
// stdin is a TTY we flip it into raw mode so the remote shell sees per-key
// bytes (ctrl-c, arrows, tab) instead of line-buffered input.
async function runShell(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od shell --project <projectId> [--shell <path>] [--json]
                                  Open an interactive shell in the project's
                                  working directory and attach to it.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Print the created terminal session as JSON and exit
                       (does not attach).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const flags = parseFlags(args, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  if (!flags.project) {
    console.error('--project <projectId> is required');
    process.exit(2);
  }
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  const body = {};
  if (flags.shell) body.shell = flags.shell;
  if (process.stdout.columns) body.cols = process.stdout.columns;
  if (process.stdout.rows) body.rows = process.stdout.rows;
  const createResp = await fetch(
    `${base}/api/projects/${encodeURIComponent(flags.project)}/terminals`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!createResp.ok) return structuredHttpFailure(createResp, 'project-not-found');
  const created = await createResp.json();
  if (flags.json) {
    return process.stdout.write(JSON.stringify(created, null, 2) + '\n');
  }
  const terminalId = created?.terminal?.id;
  if (!terminalId) {
    console.error('terminal create returned no id');
    process.exit(1);
  }
  await attachTerminal(base, flags.project, terminalId);
}

// Bridge a local TTY to a remote PTY session: SSE `data` events → stdout,
// local stdin bytes → POST /stdin, terminal resize → POST /resize. Resolves
// when the remote shell emits its `exit` event.
async function attachTerminal(base, projectId, terminalId) {
  const termPath = `${base}/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}`;
  const isRawTty = Boolean(process.stdin.isTTY && process.stdin.setRawMode);
  if (isRawTty) process.stdin.setRawMode(true);
  process.stdin.resume();

  const onInput = (chunk) => {
    fetch(`${termPath}/stdin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: chunk.toString('utf8') }),
    }).catch(() => {});
  };
  process.stdin.on('data', onInput);

  const onResize = () => {
    fetch(`${termPath}/resize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cols: process.stdout.columns, rows: process.stdout.rows }),
    }).catch(() => {});
  };
  process.stdout.on('resize', onResize);

  const restore = () => {
    process.stdin.off('data', onInput);
    process.stdout.off('resize', onResize);
    if (isRawTty) {
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
    }
    process.stdin.pause();
  };

  try {
    const resp = await fetch(`${termPath}/stream`, { headers: { accept: 'text/event-stream' } });
    if (!resp.ok || !resp.body) {
      console.error(`shell attach failed: ${resp.status}`);
      process.exit(1);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const lines = block.split('\n');
        const eventLine = lines.find((l) => l.startsWith('event: '));
        const dataLine = lines.find((l) => l.startsWith('data: '));
        const event = eventLine ? eventLine.slice('event: '.length) : 'message';
        const dataRaw = dataLine ? dataLine.slice('data: '.length) : '';
        let parsed;
        try { parsed = JSON.parse(dataRaw); } catch { parsed = dataRaw; }
        if (event === 'data' && parsed && typeof parsed.data === 'string') {
          process.stdout.write(parsed.data);
        } else if (event === 'exit') {
          restore();
          process.exit(typeof parsed?.code === 'number' ? parsed.code : 0);
        }
      }
    }
  } finally {
    restore();
  }
}

function parseProjectFileVersionSourceFlag(raw) {
  if (raw == null) return null;
  if (raw === 'ai' || raw === 'manual' || raw === 'restore') return raw;
  console.error(`Invalid --source "${String(raw)}". Expected one of: ai, manual, restore.`);
  process.exit(2);
}

async function runFiles(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od files list   <projectId>                  List files in a project.
  od files read   <projectId> <relpath>        Stream file bytes to stdout.
  od files write  <projectId> <relpath> [< stdin]
                                               Write content from stdin.
  od files upload <projectId> <localpath> [--as <relpath>]
                                               Upload a local file.
  od files delete <projectId> <name>           Delete a project file.
  od files diff   <projectId> <relpathA> [<relpathB> | --against -]
                                               Print a unified diff.
  od files versions <projectId> <relpath>      List saved HTML versions.
  od files version-read <projectId> <relpath> <versionId>
                                               Stream one saved HTML version.
  od files version-create <projectId> <relpath>
                                               Save the current HTML as a version.
  od files version-restore <projectId> <relpath> <versionId>
                                               Restore a saved HTML as a new current version.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --prompt-file <path|->  Read a version prompt from file/stdin where supported.
  --source <ai|manual|restore>
                       Version provenance where supported.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od files list <projectId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files`);
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const files = Array.isArray(data?.files) ? data.files : [];
      for (const f of files) console.log(`${f.size}\t${f.name ?? f.path}`);
      return;
    }
    case 'read': {
      const positional = rest.filter((a) => !a.startsWith('-'));
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files read <projectId> <relpath>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files/${rel.split('/').map(encodeURIComponent).join('/')}`);
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const buf = Buffer.from(await resp.arrayBuffer());
      process.stdout.write(buf);
      return;
    }
    case 'upload': {
      const positional = rest.filter((a) => !a.startsWith('-')
        && a !== flags.as);
      const [id, localPath] = positional;
      if (!id || !localPath) {
        console.error('Usage: od files upload <projectId> <localpath> [--as <relpath>]');
        process.exit(2);
      }
      const buf = readFileSync(localPath);
      const desiredName = typeof flags.as === 'string' && flags.as.length > 0
        ? flags.as
        : basename(localPath);
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          name: desiredName,
          content: buf.toString('base64'),
          encoding: 'base64',
        }),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      if (data?.versionWarning?.message) console.error(`[files] warning: ${data.versionWarning.message}`);
      console.log(`[files] uploaded ${data?.file?.name ?? desiredName}`);
      return;
    }
    case 'write': {
      const positional = rest.filter((a) => !a.startsWith('-'));
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files write <projectId> <relpath> [< stdin]');
        process.exit(2);
      }
      // Read stdin synchronously into a buffer.
      let chunks = [];
      try {
        const stdin = readFileSync(0);
        chunks = [stdin];
      } catch (err) {
        console.error(`stdin read failed: ${err.message ?? err}`);
        process.exit(1);
      }
      const body = Buffer.concat(chunks);
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          name: rel,
          content: body.toString('utf8'),
          encoding: 'utf8',
        }),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      if (data?.versionWarning?.message) console.error(`[files] warning: ${data.versionWarning.message}`);
      console.log(`[files] wrote ${data?.file?.name ?? rel}`);
      return;
    }
    case 'delete': {
      const positional = rest.filter((a) => !a.startsWith('-'));
      const [id, name] = positional;
      if (!id || !name) {
        console.error('Usage: od files delete <projectId> <name>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!resp.ok) return structuredHttpFailure(resp);
      console.log(`[files] deleted ${name}`);
      return;
    }
    case 'diff': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, relA, relB] = positional;
      const against = typeof flags.against === 'string' ? flags.against : null;
      if (!id || !relA || (!relB && !against) || (relB && against)) {
        console.error('Usage: od files diff <projectId> <relpathA> [<relpathB> | --against -]');
        process.exit(2);
      }
      const left = await fetchProjectFileText(base, id, relA);
      const rightLabel = against ?? relB;
      const right = against === '-'
        ? await readStdinUtf8()
        : await fetchProjectFileText(base, id, rightLabel);
      const diff = createUnifiedDiff(`a/${relA}`, `b/${rightLabel}`, left, right);
      if (flags.json) return process.stdout.write(JSON.stringify({ diff }, null, 2) + '\n');
      process.stdout.write(diff);
      return;
    }
    case 'versions': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files versions <projectId> <relpath>');
        process.exit(2);
      }
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions`,
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      for (const version of versions) {
        const marker = version.current ? '*' : ' ';
        const prompt = typeof version.prompt === 'string' && version.prompt.trim()
          ? version.prompt.trim().replace(/\s+/g, ' ').slice(0, 96)
          : '-';
        const createdAt = Number.isFinite(Number(version.createdAt))
          ? new Date(Number(version.createdAt)).toISOString()
          : '-';
        console.log(`${marker}\tv${version.version ?? '-'}\t${version.source ?? '-'}\t${createdAt}\t${version.id ?? '-'}\t${prompt}`);
      }
      return;
    }
    case 'version-read': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel, versionId] = positional;
      if (!id || !rel || !versionId) {
        console.error('Usage: od files version-read <projectId> <relpath> <versionId>');
        process.exit(2);
      }
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions/${encodeURIComponent(versionId)}`,
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      process.stdout.write(String(data?.content ?? ''));
      return;
    }
    case 'version-create': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files version-create <projectId> <relpath> [--prompt <text> | --prompt-file <path|->] [--label <text>] [--source <ai|manual|restore>]');
        process.exit(2);
      }
      const source = parseProjectFileVersionSourceFlag(flags.source);
      const prompt = await readPromptFromFlags(flags);
      const body = {};
      if (prompt !== null) body.prompt = prompt;
      if (typeof flags.label === 'string' && flags.label.length > 0) body.label = flags.label;
      if (source) body.source = source;
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[files] saved ${rel} as version ${data?.version?.version ?? data?.version?.id ?? '-'}`);
      return;
    }
    case 'version-restore': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel, versionId] = positional;
      if (!id || !rel || !versionId) {
        console.error('Usage: od files version-restore <projectId> <relpath> <versionId> [--prompt <text> | --prompt-file <path|->]');
        process.exit(2);
      }
      const prompt = await readPromptFromFlags(flags);
      const body = {};
      if (prompt !== null) body.prompt = prompt;
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions/${encodeURIComponent(versionId)}/restore`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      if (data?.versionWarning?.message) console.error(`[files] warning: ${data.versionWarning.message}`);
      console.log(`[files] restored ${rel} as version ${data?.version?.version ?? data?.version?.id ?? '-'}`);
      return;
    }
    default:
      console.error(`unknown subcommand: od files ${sub}`);
      process.exit(2);
  }
}

function encodeProjectRelpath(rel) {
  return String(rel).split('/').map(encodeURIComponent).join('/');
}

async function fetchProjectFileText(base, id, rel) {
  const resp = await fetch(
    `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}`,
  );
  if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf.toString('utf8');
}

async function readStdinUtf8() {
  const fs = await import('node:fs');
  return fs.readFileSync(0, 'utf8');
}

async function mintCliImportToken(baseDir) {
  const socketPath = process.env[SIDECAR_ENV.IPC_PATH];
  if (typeof socketPath !== 'string' || socketPath.length === 0) return null;
  let result;
  try {
    result = await requestJsonIpc(
      socketPath,
      { type: SIDECAR_MESSAGES.MINT_IMPORT_TOKEN, input: { baseDir } },
      { timeoutMs: 800 },
    );
  } catch {
    return null;
  }
  if (result?.ok === true && typeof result.token === 'string' && result.token.length > 0) {
    return result.token;
  }
  if (result?.ok === false && result.code === 'DESKTOP_AUTH_PENDING') {
    exitWithStructuredError({
      code: 'desktop-auth-pending',
      message: result.message ?? 'desktop auth required but secret not yet registered',
      data: { retryable: result.retryable === true },
    });
  }
  return null;
}

function createUnifiedDiff(leftLabel, rightLabel, leftText, rightText) {
  if (leftText === rightText) return '';
  const leftLines = splitDiffLines(leftText);
  const rightLines = splitDiffLines(rightText);
  let prefix = 0;
  while (
    prefix < leftLines.length
    && prefix < rightLines.length
    && leftLines[prefix] === rightLines[prefix]
  ) {
    prefix++;
  }
  let leftEnd = leftLines.length;
  let rightEnd = rightLines.length;
  while (
    leftEnd > prefix
    && rightEnd > prefix
    && leftLines[leftEnd - 1] === rightLines[rightEnd - 1]
  ) {
    leftEnd--;
    rightEnd--;
  }
  const oldMid = leftLines.slice(prefix, leftEnd);
  const newMid = rightLines.slice(prefix, rightEnd);
  const body = diffLineBody(oldMid, newMid);
  if (body.length === 0) {
    body.push(...oldMid.map((line) => diffLine('-', line)), ...newMid.map((line) => diffLine('+', line)));
  }
  const oldStart = oldMid.length === 0 ? prefix : prefix + 1;
  const newStart = newMid.length === 0 ? prefix : prefix + 1;
  return [
    `--- ${leftLabel}`,
    `+++ ${rightLabel}`,
    `@@ -${formatDiffRange(oldStart, oldMid.length)} +${formatDiffRange(newStart, newMid.length)} @@`,
    ...body,
  ].join('\n') + '\n';
}

function splitDiffLines(text) {
  const value = String(text);
  if (value.length === 0) return [];
  return value.match(/.*?(?:\r\n|\n|\r|$)/gs).filter((line) => line.length > 0);
}

function formatDiffRange(start, length) {
  return length === 1 ? String(start) : `${start},${length}`;
}

function diffLineBody(oldLines, newLines) {
  if (oldLines.length === 0) return newLines.map((line) => diffLine('+', line));
  if (newLines.length === 0) return oldLines.map((line) => diffLine('-', line));
  if (oldLines.length * newLines.length > 1_000_000) {
    return [...oldLines.map((line) => diffLine('-', line)), ...newLines.map((line) => diffLine('+', line))];
  }
  const width = newLines.length + 1;
  const lcs = Array.from(
    { length: oldLines.length + 1 },
    () => new Uint32Array(width),
  );
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      out.push(diffLine(' ', oldLines[i]));
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(diffLine('-', oldLines[i]));
      i++;
    } else {
      out.push(diffLine('+', newLines[j]));
      j++;
    }
  }
  while (i < oldLines.length) out.push(diffLine('-', oldLines[i++]));
  while (j < newLines.length) out.push(diffLine('+', newLines[j++]));
  return out;
}

function diffLine(prefix, line) {
  const value = String(line);
  if (value.endsWith('\r\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\r')) return `${prefix}${renderDiffLineContent(value)}`;
  return `${prefix}${renderDiffLineContent(value)}\n\\ No newline at end of file`;
}

function renderDiffLineContent(value) {
  return String(value).replace(/\r/g, '\\r');
}

// `od templates …` is the headless face of NewProjectPanel /
// ExamplesTab — same /api/templates store, same DTO shapes. External
// agents (hermes-agent, openclaw, custom bots) use these to snapshot a
// project as a reusable starting point, list everything the user has
// saved, or drop one that is no longer needed. The web UI and the CLI
// share the daemon HTTP layer so neither can drift out of step.
async function runTemplates(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od templates list                                  List user-saved templates.
  od templates save  <projectId> --name <name>      Snapshot a project's current
                                                    files as a new template.
                     [--description <text>]
  od templates delete <id>                          Delete a saved template by id.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  let flags;
  try {
    flags = parseFlags(rest, { string: TEMPLATES_STRING_FLAGS, boolean: TEMPLATES_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = (await cliDaemonBaseUrl(flags));
  // Extract positional arguments while stepping past `--flag value`
  // pairs for any string-valued template flag. Without this the id has
  // to be the very first token after the sub-verb, so a headless caller
  // that prefixes shared options (`od templates save --daemon-url ...
  // proj-1 --name Cards`) would hit the missing-id usage path before
  // ever reaching the daemon. Mirrors the `positionalArgs` helper in
  // the other command parsers.
  const positionalArgs = (values) => {
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!value) continue;
      if (value.startsWith('--')) {
        const eq = value.indexOf('=');
        const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
        if (eq < 0 && TEMPLATES_STRING_FLAGS.has(key)) i++;
        continue;
      }
      if (value.startsWith('-')) continue;
      out.push(value);
    }
    return out;
  };
  switch (sub) {
    case 'list': {
      // Wrap every fetch in try/catch so the user sees a clean
      // "failed to reach daemon at <url>: <code>" error from
      // surfaceFetchError when the daemon isn't running. Without
      // this Node throws a raw `TypeError: fetch failed`, which
      // matches the pattern the rest of the CLI uses
      // (the project verbs and runResearch).
      let resp;
      try {
        resp = await fetch(`${base}/api/templates`);
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const templates = Array.isArray(data?.templates) ? data.templates : [];
      if (templates.length === 0) {
        console.log('No templates. Save one with `od templates save <projectId> --name "..."`.');
        return;
      }
      for (const t of templates) console.log(`${t.id}\t${t.name}`);
      return;
    }
    case 'save': {
      // Pull <projectId> from anywhere among the positional args
      // (`positionalArgs` already skipped past `--flag value` pairs)
      // so callers can put shared options before or after the id.
      const projectId = positionalArgs(rest)[0] ?? '';
      if (!projectId) {
        console.error('Usage: od templates save <projectId> --name <name> [--description <text>]');
        process.exit(2);
      }
      const name = typeof flags.name === 'string' ? flags.name.trim() : '';
      if (!name) {
        console.error('--name required');
        process.exit(2);
      }
      const body = { name, sourceProjectId: projectId };
      if (typeof flags.description === 'string' && flags.description.length > 0) {
        body.description = flags.description;
      }
      let resp;
      try {
        resp = await fetch(`${base}/api/templates`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      // Templates POST returns 404 when sourceProjectId is unknown,
      // and 400 for body validation failures (missing name, too-long
      // fields). Both are reachable user errors with the daemon
      // already running, so default-classifying them as
      // `daemon-not-running` would send agents down the wrong recovery
      // branch. Map 404 → project-not-found and 400 → missing-input,
      // keep the default for 5xx so genuine daemon trouble still
      // surfaces as `daemon-not-running`.
      if (!resp.ok) {
        if (resp.status === 404) return structuredHttpFailure(resp, 'project-not-found');
        if (resp.status === 400) return structuredHttpFailure(resp, 'missing-input');
        return structuredHttpFailure(resp);
      }
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const id = data?.template?.id ?? '';
      const savedName = data?.template?.name ?? name;
      console.log(`[templates] saved ${savedName}${id ? ` (${id})` : ''}`);
      return;
    }
    case 'delete': {
      const id = positionalArgs(rest)[0] ?? '';
      if (!id) {
        console.error('Usage: od templates delete <id>');
        process.exit(2);
      }
      let resp;
      try {
        resp = await fetch(`${base}/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      // The daemon route `DELETE /api/templates/:id` is intentionally
      // idempotent (returns `{ ok: true }` for unknown ids), so this
      // CLI verb mirrors that contract instead of inventing a
      // template-not-found exit code the production route never emits.
      // Any unexpected non-2xx still falls through to the generic
      // structured-failure envelope.
      if (!resp.ok) return structuredHttpFailure(resp);
      if (flags.json) {
        const data = await resp.json().catch(() => ({ ok: true }));
        return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      }
      console.log(`[templates] deleted ${id}`);
      return;
    }
    default:
      console.error(`unknown subcommand: od templates ${sub}`);
      process.exit(2);
  }
}

async function runConversation(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od conversation new  <projectId> [--title "<title>"] [--seed-from <cid>] [--fork-after <mid>] [--mode design|chat|plan]
                                           Create a conversation in a project.
                                           --seed-from copies another
                                           conversation's messages in (Side Chat).
                                           --fork-after stops the copy at one
                                           source message.
  od conversation list <projectId>           List conversations in a project.
  od conversation info <conversationId>      Print one conversation.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'new': {
      const [id] = positionalArgs(rest, PROJECT_STRING_FLAGS);
      if (!id) {
        console.error('Usage: od conversation new <projectId> [--title "<title>"] [--seed-from <cid>] [--fork-after <mid>]');
        process.exit(2);
      }
      const body = {};
      if (typeof flags.title === 'string') body.title = flags.title;
      const sessionMode = normalizeChatSessionModeFlag(flags.mode);
      if (sessionMode) body.sessionMode = sessionMode;
      if (typeof flags['seed-from'] === 'string' && flags['seed-from']) {
        body.seedFromConversationId = flags['seed-from'];
      }
      if (typeof flags['fork-after'] === 'string' && flags['fork-after']) {
        if (!body.seedFromConversationId) {
          console.error('--fork-after requires --seed-from');
          process.exit(2);
        }
        body.forkAfterMessageId = flags['fork-after'];
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/conversations`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const conv = data.conversation;
      console.log(`[conversation] created ${conv?.id ?? '-'} (mode ${conv?.sessionMode ?? sessionMode ?? 'design'})`);
      return;
    }
    case 'list': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od conversation list <projectId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/conversations`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od conversation info <conversationId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/conversations/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    default:
      console.error(`unknown subcommand: od conversation ${sub}`);
      process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: od chat  (Side Chat — context-seeded conversations)
//
// `od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<t>"] [--json]`
//   Creates a new conversation that inherits another conversation's context
//   by copying its messages, optionally truncating at one source message.
//   Mirrors the web chat fork action and POSTs to the same
//   /api/projects/:id/conversations endpoint the UI uses. This is the CLI half
//   of the dual-track surface for context-seeded conversations.
// ---------------------------------------------------------------------------

async function runChat(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<title>"] [--mode design|chat|plan] [--json]
                                           Create a Side Chat — a new conversation
                                           that copies in another conversation's
                                           context (--seed-from). Use
                                           --fork-after to stop at one source
                                           message.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'new': {
      // Accept --project for parity with the rest of the project-scoped CLI,
      // or a bare positional id for convenience.
      const id = typeof flags.project === 'string' && flags.project
        ? flags.project
        : positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!id) {
        console.error('Usage: od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<title>"]');
        process.exit(2);
      }
      const body = {};
      if (typeof flags.title === 'string') body.title = flags.title;
      const sessionMode = normalizeChatSessionModeFlag(flags.mode);
      if (sessionMode) body.sessionMode = sessionMode;
      if (typeof flags['seed-from'] === 'string' && flags['seed-from']) {
        body.seedFromConversationId = flags['seed-from'];
      }
      if (typeof flags['fork-after'] === 'string' && flags['fork-after']) {
        if (!body.seedFromConversationId) {
          console.error('--fork-after requires --seed-from');
          process.exit(2);
        }
        body.forkAfterMessageId = flags['fork-after'];
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/conversations`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const conv = data.conversation;
      const seeded = body.seedFromConversationId
        ? ` (seeded from ${body.seedFromConversationId})`
        : '';
      const forked = body.forkAfterMessageId
        ? ` through ${body.forkAfterMessageId}`
        : '';
      console.log(`[chat] created ${conv?.id ?? '-'}${conv?.title ? ` "${conv.title}"` : ''}${seeded}${forked} (mode ${conv?.sessionMode ?? sessionMode ?? 'design'})`);
      return;
    }
    default:
      console.error(`unknown subcommand: od chat ${sub}`);
      process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: od daemon  (Phase 1.5 lifecycle, plan §6 / §3.F2)
//
// `od daemon start [--headless] [--serve-web] [--port <n>] [--host <addr>]`
//   - --headless: implies --no-open, never tries to launch a browser.
//                 The default `od` (no subcommand) keeps its
//                 desktop-friendly behaviour for back-compat.
//   - --serve-web: same as --headless but allows the Next.js bundle to
//                  serve over the existing port. v1 doesn't bundle a
//                  separate web port; the flag is reserved so downstream
//                  packaged callers can branch on it.
//
// `od daemon status [--json] [--daemon-url <url>]` calls /api/daemon/status.
// `od daemon stop   [--daemon-url <url>]`         calls POST /api/daemon/shutdown.
// ---------------------------------------------------------------------------

async function runDaemon(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od daemon start [--headless] [--serve-web] [--port <n>] [--host <addr>] [--no-open]
                                          Start the daemon (Phase 1.5 headless mode).
  od daemon status [--json] [--daemon-url <url>]
                                          Print the daemon's runtime snapshot.
  od daemon stop   [--daemon-url <url>]   Send a graceful shutdown signal.
  od daemon db     status                 Print SQLite path + size + table row counts.
  od daemon db     verify [--quick]       Run integrity_check + foreign_key_check.
  od daemon db     vacuum                 Run SQLite VACUUM to reclaim space after deletes.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --headless           No browser auto-open; aliased --no-open.
  --serve-web          Serve the web UI over the existing port (no electron).
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: DAEMON_STRING_FLAGS, boolean: DAEMON_BOOLEAN_FLAGS });
  switch (sub) {
    case 'start':   return runDaemonStart(flags);
    case 'status':  return runDaemonStatus(flags);
    case 'stop':    return runDaemonStop(flags);
    case 'db':      return runDaemonDb(rest, flags);
    default:
      console.error(`unknown subcommand: od daemon ${sub}`);
      process.exit(2);
  }
}

// Plan §3.GG1 — `od daemon db status`. Prints a SQLite inventory
// (file path, size on disk, schema version, per-table row counts).
async function runDaemonDb(rest, flags) {
  const sub = rest[0];
  if (!sub || sub === 'help' || rest.includes('--help') || rest.includes('-h')) {
    console.log(`Usage:
  od daemon db status [--json] [--daemon-url <url>]
  od daemon db verify [--quick] [--json] [--daemon-url <url>]
  od daemon db vacuum [--json] [--daemon-url <url>]

status:
  Prints a structured inventory of the daemon's SQLite backend:
    - file path (under .od/ by default; OD_DATA_DIR overrides)
    - size on disk (primary + WAL + SHM)
    - schema version (user_version PRAGMA)
    - per-table row counts (system tables excluded)

verify:
  Runs SQLite PRAGMA integrity_check (or quick_check with --quick)
  + foreign_key_check, returns a structured issues[] report.
  Exit 0 when ok=true, 4 when any issue is found.

vacuum:
  Runs SQLite VACUUM to reclaim space after large delete batches
  (snapshot prune, plugin uninstall, etc.). Reports before/after
  sizes + elapsed ms.`);
    process.exit(sub ? 0 : 2);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  if (sub === 'vacuum') {
    const resp = await fetch(`${base}/api/daemon/db/vacuum`, { method: 'POST' });
    if (!resp.ok) {
      console.error(`POST /api/daemon/db/vacuum failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    console.log(`[db vacuum] reclaimed ${formatBytes(data.reclaimedBytes ?? 0)} (`
      + `${formatBytes(data.beforeBytes ?? 0)} \u2192 ${formatBytes(data.afterBytes ?? 0)}, `
      + `${data.elapsedMs ?? 0}ms)`);
    return;
  }
  if (sub === 'verify') {
    const verifyFlags = parseFlags(rest.slice(1), {
      string:  new Set(['daemon-url']),
      boolean: new Set(['help', 'h', 'json', 'quick']),
    });
    const url = `${base}/api/daemon/db/verify${verifyFlags.quick ? '?quick=1' : ''}`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      console.error(`POST ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
      const issueCount = Array.isArray(data.issues) ? data.issues.length : 0;
      console.log(`[db verify] mode=${data.mode}  ok=${data.ok}  issues=${issueCount}  ${data.elapsedMs ?? 0}ms`);
      if (issueCount > 0) {
        for (const issue of data.issues) {
          console.error(`  [${issue.kind}] ${issue.message}`);
        }
      }
    }
    process.exit(data.ok ? 0 : 4);
  }
  if (sub !== 'status') {
    console.error(`unknown subcommand: od daemon db ${sub}`);
    process.exit(2);
  }
  const resp = await fetch(`${base}/api/daemon/db`);
  if (!resp.ok) {
    console.error(`GET /api/daemon/db failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`# Daemon DB`);
  console.log(`  kind:           ${data.kind ?? 'unknown'}`);
  console.log(`  location:       ${data.location ?? '?'}`);
  console.log(`  size on disk:   ${formatBytes(data.sizeBytes ?? 0)}`);
  console.log(`  schema version: ${data.schemaVersion ?? '(none)'}`);
  console.log(`  tables:`);
  const tables = Array.isArray(data.tables) ? data.tables : [];
  if (tables.length === 0) {
    console.log('    (none)');
  } else {
    const longest = Math.max(...tables.map((t) => t.name.length));
    for (const t of tables) {
      console.log(`    ${t.name.padEnd(longest)}  ${t.rowCount}`);
    }
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

async function runDaemonStart(flags) {
  const port = Number(flags.port ?? process.env.OD_PORT ?? 7456);
  const host = String(flags.host ?? process.env.OD_BIND_HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const headless = Boolean(flags.headless || flags['no-open'] || flags['serve-web']);
  const runtime = await startDaemonRuntime({
    host,
    logListening: false,
    openBrowser: !headless,
    port,
  });
  console.log(`[od] listening on ${runtime.url} (${headless ? 'headless' : 'desktop'})`);

  await new Promise((resolve) => {
    let shuttingDown = false;
    const stop = () => {
      if (shuttingDown) process.exit(0);
      shuttingDown = true;
      void runtime.stop().finally(() => {
        cleanup();
        resolve();
      });
    };
    const cleanup = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

async function runDaemonStatus(flags) {
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/daemon/status`);
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  console.log(`[daemon] ${data.bindHost}:${data.port} v${data.version} pid=${data.pid} plugins=${data.installedPlugins}`);
}

async function runDaemonStop(flags) {
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/daemon/shutdown`, { method: 'POST' });
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  console.log(`[daemon] shutdown scheduled`);
}

// ---------------------------------------------------------------------------
// Subcommand: od atoms / od skills / od design-systems / od craft / od status
//
// Plan §3.H2 / §3.H3 / spec §12.2 — design-library + status introspection
// CLI parity. Every UI feature reachable via /api/* gets a CLI mirror
// (the §11.7 "headless = canonical" invariant).
// ---------------------------------------------------------------------------

async function libraryDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

async function runAtoms(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od atoms list             List first-party atoms (implemented + planned).
  od atoms show <id>        Print one atom's metadata.
  od atoms info <id>        Print metadata + the bundled SKILL.md body.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: LIBRARY_STRING_FLAGS, boolean: LIBRARY_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}/api/atoms`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const atoms = data?.atoms ?? [];
      for (const a of atoms) {
        console.log(`${a.id}\t${a.status}\t[${(a.taskKinds ?? []).join(', ')}]\t${a.label}`);
      }
      return;
    }
    case 'show': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od atoms show <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/atoms`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      const atom = (data?.atoms ?? []).find((a) => a.id === id);
      if (!atom) {
        console.error(`atom ${id} not found`);
        process.exit(65);
      }
      process.stdout.write(JSON.stringify(atom, null, 2) + '\n');
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od atoms info <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/atoms/${encodeURIComponent(id)}`);
      if (resp.status === 404) {
        console.error(`atom ${id} not found`);
        process.exit(65);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const atom = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(atom, null, 2) + '\n');
      console.log(`# ${atom.label} (${atom.id})`);
      console.log(`status:    ${atom.status}`);
      console.log(`taskKinds: ${(atom.taskKinds ?? []).join(', ')}`);
      console.log(`summary:   ${atom.description}`);
      if (typeof atom.skillBody === 'string' && atom.skillBody.length > 0) {
        console.log('');
        console.log('--- SKILL.md ---');
        console.log(atom.skillBody.trimEnd());
      } else {
        console.log('');
        console.log('(no bundled SKILL.md body found for this atom)');
      }
      return;
    }
    default:
      console.error(`unknown subcommand: od atoms ${sub}`);
      process.exit(2);
  }
}

function printLibraryHelp() {
  console.log(`Usage: od library <command> [options]

Commands:
  list                      List library assets. Filters: --kind --tag --source --date
  get <id>                  Print one asset (JSON).
  rm <id>                   Delete an asset.
  search <query>            Keyword search across captions / tags / titles.
  import <file|url>...      Import one or more local files / remote URLs into the library.
                            Restricted to design formats (images, fonts, text, HTML, JSON);
                            audio, video, and other binaries are rejected.
  apply <id>                Copy an asset into a project's design files. Requires --project.
  edit-as-page <id>         Turn a captured html asset into a new editable OD project (prints projectId).
  figma <id>                Export an html asset's OD Figma capture IR (clipper-captured pages).
  sync                      Pull design systems + agent-generated project artifacts into the Library.
  pair                      Mint a browser-extension pairing code.

Options:
  --json                    Machine-readable output.
  --daemon-url <url>        Override daemon URL (default: auto-discover).
  --kind <image|design-system|video|...>
                            Filter/declare asset kind.
  --tag <tag>               Filter by / attach a tag.
  --source <kind>           Filter by source (clipper|manual-upload|agent-task|design-system|generated).
  --date <YYYY-MM-DD>       Filter by archive date.
  --project <id>            Target project for apply.
  --dir <subdir>            Subdirectory inside the project for apply (default: library).
  --out <file>              Write the figma export to a file (default: stdout).`);
}

async function runLibrary(args) {
  const sub = args.find((a) => !a.startsWith('-')) || '';
  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    printLibraryHelp();
    process.exit(sub ? 0 : 2);
  }
  const idx = args.indexOf(sub);
  const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
  let flags;
  try {
    flags = parseFlags(rest, {
      string: LIBRARY_ASSET_STRING_FLAGS,
      boolean: LIBRARY_ASSET_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const pos = positionalArgs(rest, LIBRARY_ASSET_STRING_FLAGS);
  const writeJson = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');

  try {
    switch (sub) {
      case 'list':
      case 'search': {
        const params = new URLSearchParams();
        const query = sub === 'search' ? flags.query || pos[0] : flags.query;
        if (query) params.set('q', query);
        if (flags.kind) params.set('kind', flags.kind);
        if (flags.tag) params.set('tag', flags.tag);
        if (flags.source) params.set('source', flags.source);
        if (flags.date) params.set('date', flags.date);
        if (flags.project) params.set('projectId', flags.project);
        const qs = params.toString();
        const resp = await fetch(`${base}/api/library/assets${qs ? `?${qs}` : ''}`);
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        for (const asset of data.assets ?? []) {
          const dims = asset.width && asset.height ? `${asset.width}x${asset.height}` : '';
          const label = asset.sourceTitle || asset.sourceUrl || asset.caption || '';
          console.log(`${asset.id}\t${asset.kind}\t${dims}\t${label}`);
        }
        return;
      }
      case 'get': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library get <id>');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}`);
        if (!resp.ok) return structuredHttpFailure(resp);
        return writeJson(await resp.json());
      }
      case 'rm': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library rm <id>');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        if (flags.json) return writeJson(await resp.json());
        console.log(`deleted ${id}`);
        return;
      }
      case 'import': {
        const sources = pos;
        if (!sources.length) {
          console.error('Usage: od library import <file|url> [<file|url> ...]');
          process.exit(2);
        }
        const { readFile } = await import('node:fs/promises');
        const nodePath = await import('node:path');
        const results = [];
        let failed = false;
        for (const src of sources) {
          const body = {};
          try {
            if (/^https?:\/\//i.test(src)) {
              body.url = src;
              body.sourceUrl = src;
            } else {
              const bytes = await readFile(src);
              // Empty mediatype → daemon sniffs the bytes for the real mime.
              body.dataUrl = `data:;base64,${bytes.toString('base64')}`;
              body.filename = nodePath.basename(src);
            }
          } catch (err) {
            failed = true;
            results.push({ source: src, ok: false, error: err?.message ?? String(err) });
            if (!flags.json) console.error(`${src}\terror\t${err?.message ?? err}`);
            continue;
          }
          if (flags.kind) body.kind = flags.kind;
          if (flags.tag) body.tags = [flags.tag];
          const resp = await fetch(`${base}/api/library/ingest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            failed = true;
            // The daemon rejects unsupported formats (415) and oversized files
            // (413); surface the reason per source instead of aborting the run.
            const detail = await resp.json().catch(() => null);
            const message = detail?.error?.message ?? `HTTP ${resp.status}`;
            results.push({ source: src, ok: false, status: resp.status, error: message });
            if (!flags.json) console.error(`${src}\trejected\t${message}`);
            continue;
          }
          const data = await resp.json();
          results.push({ source: src, ok: true, ...data });
          if (!flags.json) {
            console.log(`${data.asset.id}\t${data.deduped ? 'deduped' : 'imported'}\t${data.asset.kind}`);
          }
        }
        if (flags.json) writeJson(sources.length === 1 ? results[0] : results);
        if (failed) process.exit(1);
        return;
      }
      case 'apply': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library apply <id> --project <projectId> [--dir <subdir>]');
          process.exit(2);
        }
        if (!flags.project) {
          console.error('Usage: od library apply <id> --project <projectId> [--dir <subdir>]');
          process.exit(2);
        }
        const body = { projectId: flags.project };
        if (flags.dir) body.dir = flags.dir;
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}/apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`applied ${id} → ${data.relPath}`);
        return;
      }
      case 'edit-as-page': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library edit-as-page <id>');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}/edit-as-page`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`created project ${data.projectId} → ${data.relPath}`);
        return;
      }
      case 'figma': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library figma <id> [--out <file>]');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}/figma`);
        if (!resp.ok) return structuredHttpFailure(resp);
        const ir = await resp.text();
        if (flags.out) {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(flags.out, ir, 'utf8');
          if (flags.json) return writeJson({ ok: true, id, out: flags.out, bytes: Buffer.byteLength(ir) });
          console.log(`wrote ${flags.out}`);
          return;
        }
        process.stdout.write(ir.endsWith('\n') ? ir : ir + '\n');
        return;
      }
      case 'sync': {
        const resp = await fetch(`${base}/api/library/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(
          `Synced ${data.total} new (${data.designSystems} design systems, ${data.projectAssets} project assets; ${data.deduped} already indexed).`,
        );
        return;
      }
      case 'pair': {
        const resp = await fetch(`${base}/api/library/pair`, { method: 'POST' });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`Pairing code: ${data.code}`);
        console.log('Enter this code in the OD Clipper extension popup within 5 minutes.');
        return;
      }
      default:
        console.error(`unknown subcommand: od library ${sub}`);
        printLibraryHelp();
        process.exit(2);
    }
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
}

async function runLibraryList(name, args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od ${name} list           List ${name}.
  od ${name} show <id>      Print one entry.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: LIBRARY_STRING_FLAGS, boolean: LIBRARY_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const apiPath = name === 'design-systems' ? '/api/design-systems' : `/api/${name}`;
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}${apiPath}`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const rows = data?.[name === 'design-systems' ? 'designSystems' : name] ?? [];
      for (const row of rows) {
        const label = row.title ?? row.name ?? row.id ?? row.label;
        console.log(`${row.id}\t${label}`);
      }
      return;
    }
    case 'show': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error(`Usage: od ${name} show <id>`);
        process.exit(2);
      }
      const resp = await fetch(`${base}${apiPath}/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    default:
      console.error(`unknown subcommand: od ${name} ${sub}`);
      process.exit(2);
  }
}

async function runSkills(args)        { return runLibraryList('skills', args); }
async function runCraft(args)         { return runLibraryList('craft', args); }

async function runDesignSystems(args) {
  if (args[0] === 'rename') return runDesignSystemRename(args.slice(1));
  if (args[0] === 'download') return runDesignSystemDownload(args.slice(1));
  if (args[0] === 'import-local') return runDesignSystemImportLocal(args.slice(1));
  if (args[0] === 'import-github') return runDesignSystemImportGithub(args.slice(1));
  if (args[0] === 'import-shadcn') return runDesignSystemImportShadcn(args.slice(1));
  if (args[0] === 'rebuild-token-contract') return runDesignSystemTokenContractRebuild(args.slice(1));
  if (!args[0] || isDesignSystemsHelpArg(args[0])) {
    console.log(DESIGN_SYSTEMS_USAGE);
    process.exit(isDesignSystemsHelpArg(args[0]) ? 0 : 2);
  }
  return runLibraryList('design-systems', args);
}

// od design-systems download <id> [--out <path>] [--json] [--daemon-url <url>]
//
// Streams GET /api/design-systems/:id/archive — the same self-contained brand
// .zip (every system file plus a generated SKILLS.md usage guide) the web
// "Download brand" button produces — and writes it to disk. Only user design
// systems are downloadable; presets return 404.
async function runDesignSystemDownload(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems download <id> [--out <path>] [--json] [--daemon-url <url>]

Downloads an editable design system as a shareable .zip (all files plus a
generated SKILLS.md usage guide).

  <id>                   Design system id (e.g. user:my-brand).
  --out <path>           Write the .zip here (defaults to the brand's name).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'out']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const id = positionalArgs(args, stringFlags)[0];
  if (!id) {
    console.error('Usage: od design-systems download <id> [--out <path>]');
    process.exit(2);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  let resp;
  try {
    resp = await fetch(`${base}/api/design-systems/${encodeURIComponent(id)}/archive`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`downloadable design system not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const buffer = Buffer.from(await resp.arrayBuffer());
  let out = typeof flags.out === 'string' ? flags.out : null;
  if (!out) {
    const cd = resp.headers.get('content-disposition') || '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plain = /filename="([^"]+)"/i.exec(cd);
    if (star && star[1]) {
      try { out = decodeURIComponent(star[1]); } catch { out = plain && plain[1] ? plain[1] : null; }
    } else if (plain && plain[1]) {
      out = plain[1];
    }
    if (!out) out = 'design-system.zip';
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(out, buffer);
  if (flags.json) {
    return process.stdout.write(
      JSON.stringify({ ok: true, id, out, bytes: buffer.length }, null, 2) + '\n',
    );
  }
  console.log(`Downloaded ${id} -> ${out} (${buffer.length} bytes)`);
}

// od design-systems import-local <path> [--name <name>]
//   [--import-mode <mode>] [--craft <slug,slug>] [--json] [--daemon-url <url>]
//
// Imports a local app/design-system project through the same daemon endpoint as
// the Settings UI. The CLI resolves relative paths before sending the request
// because the daemon intentionally accepts only absolute host paths.
async function runDesignSystemImportLocal(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems import-local <path> [--name <name>] [--import-mode <mode>] [--craft <slugs>] [--json] [--daemon-url <url>]
  od design-systems import-local --path <path> [--name <name>] [--json]

Imports a local project directory as an editable Open Design design system.

  <path>                 Local project directory to scan.
  --path <path>          Path alternative for scripts that prefer named flags.
  --name <name>          Display name override for the imported system.
  --import-mode <mode>   normalized | hybrid | verbatim (default hybrid).
  --craft <slugs>        Comma-separated craft sections to apply (e.g. color,type).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'path', 'name', 'import-mode', 'craft']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const localPath = typeof flags.path === 'string' ? flags.path : positionalArgs(args, stringFlags)[0];
  if (!localPath) {
    console.error('Usage: od design-systems import-local <path>');
    process.exit(2);
  }
  const pathModule = await import('node:path');
  const body = designSystemImportRequestBody(flags, {
    baseDir: pathModule.resolve(localPath),
  });
  return postDesignSystemImport(flags, '/api/design-systems/import/local', body);
}

// od design-systems import-github <url> [--branch <branch>] [--name <name>]
//   [--import-mode <mode>] [--craft <slug,slug>] [--json] [--daemon-url <url>]
async function runDesignSystemImportGithub(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems import-github <url> [--branch <branch>] [--name <name>] [--import-mode <mode>] [--craft <slugs>] [--json] [--daemon-url <url>]
  od design-systems import-github --url <url> [--branch <branch>] [--json]

Imports a public GitHub repository as an editable Open Design design system.

  <url>                  Repository root URL, e.g. https://github.com/acme/design-kit.
  --url <url>            URL alternative for scripts that prefer named flags.
  --branch <branch>      Branch, tag, or ref to clone.
  --name <name>          Display name override for the imported system.
  --import-mode <mode>   normalized | hybrid | verbatim (default hybrid).
  --craft <slugs>        Comma-separated craft sections to apply (e.g. color,type).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'url', 'branch', 'name', 'import-mode', 'craft']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const url = typeof flags.url === 'string' ? flags.url : positionalArgs(args, stringFlags)[0];
  if (!url) {
    console.error('Usage: od design-systems import-github <url>');
    process.exit(2);
  }
  const body = designSystemImportRequestBody(flags, {
    url,
    ...(typeof flags.branch === 'string' ? { branch: flags.branch } : {}),
  });
  return postDesignSystemImport(flags, '/api/design-systems/import/github', body);
}

function designSystemImportRequestBody(flags, baseBody) {
  const craftApplies =
    typeof flags.craft === 'string'
      ? flags.craft.split(',').map((slug) => slug.trim().toLowerCase()).filter(Boolean)
      : undefined;
  return {
    ...baseBody,
    ...(typeof flags.name === 'string' ? { name: flags.name } : {}),
    ...(typeof flags['import-mode'] === 'string' ? { importMode: flags['import-mode'] } : {}),
    ...(craftApplies && craftApplies.length > 0 ? { craftApplies } : {}),
  };
}

async function postDesignSystemImport(flags, endpoint, body) {
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const imported = data.designSystem ?? data;
  console.log(`Imported ${imported.id ?? '(unknown id)'}${imported.title ? ` -> ${imported.title}` : ''}`);
  if (data.tokenContractRebuild?.job) {
    console.log(`Token contract rebuild queued: ${data.tokenContractRebuild.job.id}`);
  } else if (data.tokenContractRebuild?.decision?.reason) {
    console.log(`Token contract rebuild: ${data.tokenContractRebuild.decision.reason}`);
  }
}

// od design-systems rebuild-token-contract <id> [--force] [--json]
//
// Starts the same review-gated token contract rebuild job exposed in the web
// design-system detail view. Without --force the daemon only queues a job when
// source/token-contract.report.json recommends it.
async function runDesignSystemTokenContractRebuild(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems rebuild-token-contract <id> [--force] [--json] [--daemon-url <url>]

Starts a review-gated TOKEN_SCHEMA token contract rebuild for an editable imported design system.

  <id>       Editable design-system id, e.g. user:acme-product.
  --force    Queue the review even when the quality report is already usable.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const flags = parseFlags(args, {
    string: LIBRARY_STRING_FLAGS,
    boolean: new Set([...LIBRARY_BOOLEAN_FLAGS, 'force']),
  });
  const id = positionalArgs(args, LIBRARY_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od design-systems rebuild-token-contract <id>');
    process.exit(2);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/design-systems/${encodeURIComponent(id)}/token-contract/rebuild-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: flags.force === true }),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  if (data.job) {
    console.log(`Token contract rebuild queued for ${id}: ${data.job.id}`);
    return;
  }
  const decision = data.decision;
  console.log(`Token contract rebuild not queued for ${id}: ${decision?.reason ?? 'no rebuild needed'}`);
}

// od design-systems import-shadcn <reference> [--name <name>]
//   [--import-mode <mode>] [--craft <slug,slug>] [--json] [--daemon-url <url>]
//
// Imports a shadcn registry item as an editable user design system via
// POST /api/design-systems/import/shadcn — the CLI mirror of the Settings →
// Design systems "shadcn" import source. <reference> is the shadcn CLI
// shorthand "<owner>/<repo>/<item>" (e.g. shadcn/ui/theme-zinc) or a direct
// https URL to a registry-item JSON document.
async function runDesignSystemImportShadcn(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems import-shadcn <reference> [--name <name>] [--import-mode <mode>] [--craft <slugs>] [--json] [--daemon-url <url>]

Imports a shadcn registry item as an Open Design design system.

  <reference>            "<owner>/<repo>/<item>" (e.g. shadcn/ui/theme-zinc)
                         or an https URL to a registry-item JSON document.
  --name <name>          Display name override for the imported system.
  --import-mode <mode>   normalized | hybrid | verbatim (default hybrid).
  --craft <slugs>        Comma-separated craft sections to apply (e.g. color,type).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'name', 'import-mode', 'craft']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const reference = positionalArgs(args, stringFlags)[0];
  if (!reference) {
    console.error('Usage: od design-systems import-shadcn <reference>');
    process.exit(2);
  }
  const body = designSystemImportRequestBody(flags, { reference });
  return postDesignSystemImport(flags, '/api/design-systems/import/shadcn', body);
}

// od design-systems rename <id> --title <new-title> [--json]
// Renames an editable (user-created) design system via PATCH
// /api/design-systems/:id. Built-in systems are read-only and the daemon
// returns 404, surfaced here as a structured failure. Arg parsing lives in
// rename-args.ts so it can be unit-tested.
async function runDesignSystemRename(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems rename <id> --title <new-title> [--json] [--daemon-url <url>]
  od design-systems rename <id> "<new title>" [--json]

Renames an editable (user-created) design system. Built-in systems are read-only.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const parsed = parseDesignSystemRenameArgs(args);
  if (!parsed) {
    console.error('Usage: od design-systems rename <id> --title <new-title>');
    process.exit(2);
  }
  const flags = parseFlags(args, {
    string: new Set([...LIBRARY_STRING_FLAGS, 'title']),
    boolean: LIBRARY_BOOLEAN_FLAGS,
  });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/design-systems/${encodeURIComponent(parsed.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: parsed.title }),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const renamed = data.designSystem ?? data;
  console.log(`Renamed ${parsed.id} -> ${renamed.title ?? parsed.title}`);
}

async function runStatus(args) {
  // Alias of `od daemon status`.
  return runDaemon(['status', ...args]);
}

// ---------------------------------------------------------------------------
// Subcommand: od diagnostics export <path> [--json]
//
// CLI surface for the Settings → About “Export diagnostics” feature. The
// daemon already exposes the bundle behind a local-loopback HTTP endpoint;
// this command is a thin shell over that endpoint so headless callers (CI,
// `od doctor` follow-ups, shell scripts) can collect a support bundle
// without driving the web UI.
// ---------------------------------------------------------------------------

async function runDiagnostics(args) {
  const sub = args[0];
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od diagnostics export [<path>] [--output <path>] [--json] [--daemon-url <url>]

Bundles daemon/web/desktop logs, machine info, and recent crash reports
into a zip. The bundle is the same one Settings → About → Export
diagnostics produces.

  <path>                 Where to write the zip. Defaults to
                         ./open-design-diagnostics-<timestamp>.zip in the
                         current working directory. Alias: --output <path>.
  --json                 Print {path, sizeBytes} on stdout instead of a
                         human-readable summary. The file is still written
                         to <path>.
  --daemon-url <url>     Override the daemon HTTP base URL.`);
    process.exit(0);
  }
  if (sub !== 'export') {
    console.error(`unknown subcommand: od diagnostics ${sub}`);
    process.exit(2);
  }

  const flags = parseFlags(args.slice(1), {
    string: DIAGNOSTICS_STRING_FLAGS,
    boolean: DIAGNOSTICS_BOOLEAN_FLAGS,
  });
  const positional = args.slice(1).filter((a) => !a.startsWith('-'));
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');

  const { DIAGNOSTICS_EXPORT_PATH, DIAGNOSTICS_FILENAME_PREFIX, diagnosticsFileName } =
    await import('@open-design/diagnostics');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const explicitOutput = typeof flags.output === 'string' && flags.output.length > 0
    ? flags.output
    : positional[0];
  const targetPath = path.resolve(explicitOutput ?? diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX));

  let resp;
  try {
    resp = await fetch(`${base}${DIAGNOSTICS_EXPORT_PATH}`);
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);

  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buf);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ path: targetPath, sizeBytes: buf.length }) + '\n');
    return;
  }
  console.log(`Wrote diagnostics bundle to ${targetPath} (${buf.length} bytes).`);
}

async function runVersion(args) {
  const flags = parseFlags(args, { string: LIBRARY_STRING_FLAGS, boolean: LIBRARY_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  let resp;
  try {
    resp = await fetch(`${base}/api/version`);
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const version = typeof data?.version === 'string'
    ? data.version
    : (data?.version?.version ?? JSON.stringify(data));
  console.log(version);
}

// ---------------------------------------------------------------------------
// Subcommand: od doctor / od config (Phase 4 CLI parity tail).
//
// Plan §3.I2 / spec §12.2.
//
// `od doctor` — repo-wide diagnostics. Hits /api/daemon/status, lists
// installed plugins + runs the per-plugin doctor, lists skills /
// design-systems / craft / atoms. Exits non-zero when any plugin
// doctor returns ok=false. Useful in CI: a failed exit causes the
// pipeline to surface plugin-system regressions.
//
// `od config get/set/list/unset` — wraps GET/PUT /api/app-config so a
// code agent can flip provider keys / orbit settings / pet config
// without leaving the terminal. JSON values pass through unchanged;
// scalar strings/numbers/booleans are coerced.
// ---------------------------------------------------------------------------

async function runDoctor(args) {
  const flags = parseFlags(args, { string: CONFIG_STRING_FLAGS, boolean: CONFIG_BOOLEAN_FLAGS });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od doctor [--json]   Print a daemon + plugin + design-library health summary.

Exit code is non-zero when any installed plugin's doctor returns ok=false
or the daemon cannot be reached.`);
    process.exit(0);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const report = {
    daemon:        null,
    plugins:       [],
    skills:        [],
    designSystems: [],
    atoms:         [],
    issues:        [],
  };

  // Daemon status
  try {
    const resp = await fetch(`${base}/api/daemon/status`);
    if (!resp.ok) {
      report.issues.push({ severity: 'error', code: 'daemon-status', message: `HTTP ${resp.status}` });
    } else {
      report.daemon = await resp.json();
    }
  } catch (err) {
    report.issues.push({ severity: 'error', code: 'daemon-not-running', message: String(err?.message ?? err) });
    if (flags.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      console.error('[doctor] daemon unreachable:', String(err?.message ?? err));
    }
    process.exit(64);
  }

  // Library inventory
  try {
    const [skillsResp, dsResp, atomsResp] = await Promise.all([
      fetch(`${base}/api/skills`),
      fetch(`${base}/api/design-systems`),
      fetch(`${base}/api/atoms`),
    ]);
    if (skillsResp.ok) {
      const data = await skillsResp.json();
      report.skills = data?.skills ?? [];
    }
    if (dsResp.ok) {
      const data = await dsResp.json();
      report.designSystems = data?.designSystems ?? [];
    }
    if (atomsResp.ok) {
      const data = await atomsResp.json();
      report.atoms = data?.atoms ?? [];
    }
  } catch (err) {
    report.issues.push({ severity: 'warn', code: 'library-list-failed', message: String(err?.message ?? err) });
  }

  // Plugin doctor — runs the daemon's per-plugin check on every install.
  try {
    const listResp = await fetch(`${base}/api/plugins`);
    if (listResp.ok) {
      const list = await listResp.json();
      const plugins = list?.plugins ?? [];
      for (const p of plugins) {
        try {
          const doctorResp = await fetch(`${base}/api/plugins/${encodeURIComponent(p.id)}/doctor`, { method: 'POST' });
          const data = await doctorResp.json().catch(() => ({}));
          report.plugins.push({ id: p.id, version: p.version, ok: !!data?.ok, issues: data?.issues ?? [] });
          if (!data?.ok) {
            report.issues.push({
              severity: 'error',
              code:     'plugin-doctor-failed',
              message:  `${p.id}@${p.version}: ${(data?.issues ?? []).map((i) => i.code).join(', ')}`,
            });
          }
        } catch (err) {
          report.issues.push({
            severity: 'warn',
            code:     'plugin-doctor-error',
            message:  `${p.id}: ${err?.message ?? err}`,
          });
        }
      }
    }
  } catch (err) {
    report.issues.push({ severity: 'warn', code: 'plugin-list-failed', message: String(err?.message ?? err) });
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(`[doctor] daemon ${report.daemon?.bindHost ?? '?'}:${report.daemon?.port ?? '?'} pid=${report.daemon?.pid ?? '?'}`);
    console.log(`[doctor] plugins: ${report.plugins.length} (skills ${report.skills.length}, design-systems ${report.designSystems.length}, atoms ${report.atoms.length})`);
    if (report.issues.length === 0) {
      console.log('[doctor] no issues');
    } else {
      for (const i of report.issues) {
        console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
      }
    }
  }
  const hasError = report.issues.some((i) => i.severity === 'error');
  process.exit(hasError ? 1 : 0);
}

async function runConfig(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od config list                      Print the full app config as JSON.
  od config get <key>                 Print one top-level key.
  od config set <key> <value>         Set a top-level key (string / number / boolean).
  od config set <key> --value-json '<json>'
                                       Set a key to a JSON value.
  od config unset <key>               Remove a top-level key.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: CONFIG_STRING_FLAGS, boolean: CONFIG_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');

  const fetchConfig = async () => {
    const resp = await fetch(`${base}/api/app-config`);
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    return data?.config ?? {};
  };
  const writeConfig = async (next) => {
    const resp = await fetch(`${base}/api/app-config`, {
      method:  'PUT',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(next),
    });
    if (!resp.ok) return structuredHttpFailure(resp);
    return (await resp.json())?.config ?? next;
  };

  switch (sub) {
    case 'list': {
      const cfg = await fetchConfig();
      process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
      return;
    }
    case 'get': {
      const key = rest.find((a) => !a.startsWith('-'));
      if (!key) {
        console.error('Usage: od config get <key>');
        process.exit(2);
      }
      const cfg = await fetchConfig();
      const value = cfg?.[key];
      if (flags.json) {
        process.stdout.write(JSON.stringify(value ?? null, null, 2) + '\n');
      } else {
        console.log(value === undefined ? '' : (typeof value === 'string' ? value : JSON.stringify(value, null, 2)));
      }
      return;
    }
    case 'set': {
      const positional = rest.filter((a) => !a.startsWith('-')
        && a !== flags.value
        && a !== flags['value-json']);
      const [key, scalarValue] = positional;
      if (!key) {
        console.error('Usage: od config set <key> <value> | od config set <key> --value-json <json>');
        process.exit(2);
      }
      let parsed;
      if (typeof flags['value-json'] === 'string') {
        try { parsed = JSON.parse(flags['value-json']); } catch (err) {
          console.error(`--value-json must be valid JSON: ${err.message}`);
          process.exit(2);
        }
      } else if (typeof flags.value === 'string') {
        parsed = coerceCliValue(flags.value);
      } else if (scalarValue !== undefined) {
        parsed = coerceCliValue(scalarValue);
      } else {
        console.error('Provide a value (positional, --value, or --value-json).');
        process.exit(2);
      }
      const cfg = await fetchConfig();
      const next = { ...cfg, [key]: parsed };
      const written = await writeConfig(next);
      if (flags.json) {
        process.stdout.write(JSON.stringify(written, null, 2) + '\n');
      } else {
        console.log(`[config] set ${key}`);
      }
      return;
    }
    case 'unset': {
      const key = rest.find((a) => !a.startsWith('-'));
      if (!key) {
        console.error('Usage: od config unset <key>');
        process.exit(2);
      }
      const cfg = await fetchConfig();
      const next = { ...cfg };
      delete next[key];
      const written = await writeConfig(next);
      if (flags.json) {
        process.stdout.write(JSON.stringify(written, null, 2) + '\n');
      } else {
        console.log(`[config] unset ${key}`);
      }
      return;
    }
    default:
      console.error(`unknown subcommand: od config ${sub}`);
      process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: od memory …
//
// Headless surface for the same editable markdown memory tree shown in
// Settings. Agents can inspect what will be injected into future prompts,
// edit a node, or move a node between memory buckets without scraping the UI.
// ---------------------------------------------------------------------------

function printMemoryHelp() {
  console.log(`Usage:
  od memory tree list [--json]
      List derived memory-tree folders and entry nodes.

  od memory tree view <id> [--json]
      Print one folder node or entry body.

  od memory tree edit <id> [--name <title>] [--description <text>]
                       [--type user|feedback|project|reference]
                       [--body <markdown> | --body-file <path|->] [--json]
      Patch an editable entry node. Folder nodes are derived from entry types.

  od memory tree move <id> --type user|feedback|project|reference [--json]
      Move an entry node to a different memory bucket while preserving its id.

  od memory profile show [--json]
      Print the singleton structured user profile (the PRE-loop reads this to
      expand a short query into a brief), or "no profile yet" when unset.

  od memory profile set [--field "Label=Value" ...] [--prompt-file <path|->]
                        [--description <text>] [--json]
      Upsert the user_profile entry. --field merges by label into the existing
      profile body; --prompt-file (path or - for stdin) replaces the body
      verbatim. Combine both: --prompt-file seeds the body, --field overrides.

  od memory rule list [--json]
      List verified rule memories (name + description). The POST loop enforces
      these as scorecard rubric items.

  od memory rule add --name <name> --assertion <text> --check <text>
                     [--description <text>] [--rationale <text>]
                     [--prompt-file <path|->] [--json]
      Add a rule. The body is "Assertion: …\nCheck: …" (plus an optional
      Rationale line), or the verbatim --prompt-file content when supplied.

  od memory rule suggest --note <text> [--target <label>] [--file <path>]
                         [--current-text <text>] [--json]
  od memory rule suggest --prompt-file <path|-> [--json]
      Distil annotations into candidate rule proposals (display-only). Pass one
      annotation via --note, or a JSON array of annotations / one note per line
      via --prompt-file. Keep one with: od memory rule add.

  od memory verify [list] [--json]
      List recent POST self-verify enforcement outcomes (pass/fail/missing) the
      daemon recorded for artifact turns with active rules.
  od memory verify clear [--json]
      Drop the in-memory verification history.

  od memory config [--enabled true|false] [--extraction true|false]
                   [--profile true|false] [--rewrite true|false]
                   [--verify true|false] [--json]
      With no toggle flags, print every memory switch. With flags, PATCH the
      config and print the result. --profile/--rewrite/--verify map to the
      profile/rewrite/verify hooks; --extraction maps to chatExtractionEnabled.

Common options:
  --daemon-url <url>   Clean Design daemon HTTP base.`);
}

function memoryPositionals(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!value) continue;
    if (value.startsWith('--')) {
      const eq = value.indexOf('=');
      const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
      if (eq < 0 && MEMORY_STRING_FLAGS.has(key)) i++;
      continue;
    }
    out.push(value);
  }
  return out;
}

async function readMemoryBodyFromFlags(flags) {
  if (typeof flags.body === 'string') return flags.body;
  if (typeof flags['body-file'] !== 'string') return undefined;
  const path = flags['body-file'];
  if (path === '-') {
    let body = '';
    for await (const chunk of process.stdin) body += chunk;
    return body;
  }
  const { readFile } = await import('node:fs/promises');
  return await readFile(path, 'utf8');
}

function formatMemoryTreeRow(node) {
  return [
    node.id,
    node.parentId ?? '-',
    node.path,
    node.kind,
    node.type ?? '-',
    node.scope,
    node.name,
  ].join('\t');
}

function printMemoryEntry(entry) {
  console.log(`# ${entry.name}`);
  console.log(`id: ${entry.id}`);
  console.log(`type: ${entry.type}`);
  console.log(`description: ${entry.description || '-'}`);
  console.log('');
  process.stdout.write(`${entry.body ?? ''}\n`);
}

async function fetchMemoryTree(base) {
  let resp;
  try {
    resp = await fetch(`${base}/api/memory/tree`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  return await resp.json();
}

async function patchMemoryTreeNode(base, id, body) {
  let resp;
  try {
    resp = await fetch(`${base}/api/memory/tree/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  return await resp.json();
}

// GET /api/memory/:id, returning the MemoryEntry or null on a 404. Used by the
// profile/rule subcommands so they can read-before-write (merge) without
// crashing when the entry doesn't exist yet.
async function fetchMemoryEntry(base, id) {
  let resp;
  try {
    resp = await fetch(`${base}/api/memory/${encodeURIComponent(id)}`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  return data.entry ?? data;
}

// Read the verbatim prose body for `od memory profile set` / `rule add`.
// Accepts `--prompt-file <path>` or `--prompt-file -` (stdin). Returns
// undefined when neither is supplied so the caller can fall back to flags.
async function readMemoryPromptFile(flags) {
  if (typeof flags['prompt-file'] !== 'string' || flags['prompt-file'].length === 0) {
    return undefined;
  }
  const path = flags['prompt-file'];
  if (path === '-') {
    return await new Promise((resolve, reject) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }
  const { readFile } = await import('node:fs/promises');
  return await readFile(path, 'utf8');
}

// Collect repeated `--field "Label=Value"` flags from the raw argv slice.
// parseFlags collapses duplicate keys, so we scan manually like `--input`
// in `od plugin apply`. Returns an ordered list of {label, value} pairs.
function collectMemoryFieldFlags(rest) {
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '--field') continue;
    const raw = rest[i + 1];
    if (typeof raw !== 'string') continue;
    i += 1;
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const label = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (label) out.push({ label, value });
  }
  return out;
}

// The profile body is the canonical flat "- Label: value" markdown list shared
// by the web Profile panel and the daemon onboarding-capture path
// (apps/daemon/src/memory.ts). We parse it back into label→value so `--field`
// upserts can merge by label rather than blindly appending, then re-render in
// the same plain shape so a CLI-written profile round-trips through the UI.
// A legacy "- **Label:** value" line is tolerated on read. Lines that don't
// match (free prose, blank lines, headings) are preserved verbatim ahead of
// the list.
function parseProfileBody(body) {
  const labels = [];
  const byLabel = new Map();
  const preamble = [];
  for (const line of (body ?? '').split('\n')) {
    const match = /^\s*-\s+(.+?):\s*(.*)$/.exec(line);
    if (match) {
      const label = match[1].replace(/\*\*/g, '').trim();
      const value = match[2].replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim();
      if (!byLabel.has(label)) labels.push(label);
      byLabel.set(label, value);
    } else if (line.trim().length > 0) {
      preamble.push(line);
    }
  }
  return { labels, byLabel, preamble };
}

function renderProfileBody(parsed) {
  const lines = [];
  if (parsed.preamble.length > 0) {
    lines.push(...parsed.preamble, '');
  }
  for (const label of parsed.labels) {
    lines.push(`- ${label}: ${parsed.byLabel.get(label) ?? ''}`);
  }
  return lines.join('\n');
}

function printMemoryProfile(entry) {
  if (!entry) {
    console.log('no profile yet');
    return;
  }
  printMemoryEntry(entry);
}

// `od memory config` reads every switch off GET /api/memory (the master
// `enabled`, the extraction hook `chatExtractionEnabled`, and the three new
// loop hooks). The new flags may be absent from older daemons / before the
// route patch lands, so we coalesce missing booleans to a printable dash.
function formatMemoryConfigSwitch(value) {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return '-';
}

async function runMemory(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printMemoryHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const topic = args[0];
  if (
    topic !== 'tree'
    && topic !== 'profile'
    && topic !== 'rule'
    && topic !== 'config'
    && topic !== 'verify'
  ) {
    console.error(`unknown subcommand: od memory ${topic}`);
    printMemoryHelp();
    process.exit(2);
  }
  // `od memory config` takes no inner action verb; the others are
  // `<topic> <action>` and re-scan positionals below for the verb.
  const rest = args.slice(1);
  let flags;
  try {
    flags = parseFlags(rest, {
      string: MEMORY_STRING_FLAGS,
      boolean: MEMORY_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const writeJson = (data) =>
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');

  if (topic === 'profile') {
    return runMemoryProfile(base, rest, flags, writeJson);
  }
  if (topic === 'rule') {
    return runMemoryRule(base, rest, flags, writeJson);
  }
  if (topic === 'verify') {
    return runMemoryVerify(base, rest, flags, writeJson);
  }
  if (topic === 'config') {
    return runMemoryConfig(base, rest, flags, writeJson);
  }

  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'list';

  if (action === 'list') {
    const data = await fetchMemoryTree(base);
    if (flags.json) return writeJson(data);
    const tree = data.tree ?? [];
    if (tree.length === 0) {
      console.log('No memory tree nodes.');
      return;
    }
    console.log('# id\tparent\tpath\tkind\ttype\tscope\tname');
    for (const node of tree) console.log(formatMemoryTreeRow(node));
    return;
  }

  if (action === 'view') {
    const id = parts[1];
    if (!id) {
      console.error('Usage: od memory tree view <id>');
      process.exit(2);
    }
    const treeData = await fetchMemoryTree(base);
    const node = (treeData.tree ?? []).find((item) => item.id === id);
    if (!node) {
      console.error(`memory tree node not found: ${id}`);
      process.exit(4);
    }
    if (node.kind === 'folder') {
      if (flags.json) return writeJson({ node });
      console.log(`${node.path}\t${node.name}\t${node.childrenCount ?? 0} children`);
      return;
    }
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/${encodeURIComponent(id)}`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    printMemoryEntry(data.entry ?? data);
    return;
  }

  if (action === 'edit') {
    const id = parts[1];
    if (!id) {
      console.error('Usage: od memory tree edit <id> [--name ...] [--description ...] [--type ...] [--body ...|--body-file ...]');
      process.exit(2);
    }
    const body = {};
    if (typeof flags.name === 'string') body.name = flags.name;
    if (typeof flags.description === 'string') body.description = flags.description;
    if (typeof flags.type === 'string') body.type = flags.type;
    const nextBody = await readMemoryBodyFromFlags(flags);
    if (typeof nextBody === 'string') body.body = nextBody;
    if (Object.keys(body).length === 0) {
      console.error('nothing to edit; pass --name, --description, --type, --body, or --body-file');
      process.exit(2);
    }
    const data = await patchMemoryTreeNode(base, id, body);
    if (flags.json) return writeJson(data);
    console.log(`[memory] updated ${data.entry?.id ?? id}`);
    return;
  }

  if (action === 'move') {
    const id = parts[1];
    const type = flags.type ?? parts[2];
    if (!id || !type) {
      console.error('Usage: od memory tree move <id> --type user|feedback|project|reference');
      process.exit(2);
    }
    const data = await patchMemoryTreeNode(base, id, { type });
    if (flags.json) return writeJson(data);
    console.log(`[memory] moved ${data.entry?.id ?? id} to ${data.entry?.type ?? type}`);
    return;
  }

  console.error(`unknown subcommand: od memory tree ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// `od memory profile <show|set>` — the singleton structured user profile the
// PRE loop (intent gateway) reads to expand a short query into a full brief.
// Same store as every other memory entry; the well-known id is `user_profile`.
async function runMemoryProfile(base, rest, flags, writeJson) {
  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'show';
  const PROFILE_ID = 'user_profile';

  if (action === 'show') {
    const entry = await fetchMemoryEntry(base, PROFILE_ID);
    if (flags.json) return writeJson(entry ?? null);
    printMemoryProfile(entry);
    return;
  }

  if (action === 'set') {
    const fields = collectMemoryFieldFlags(rest);
    const promptBody = await readMemoryPromptFile(flags);
    if (fields.length === 0 && typeof promptBody !== 'string') {
      console.error('Usage: od memory profile set [--field "Label=Value" ...] [--prompt-file <path|->] [--description <text>]');
      process.exit(2);
    }
    const existing = await fetchMemoryEntry(base, PROFILE_ID);
    // --prompt-file replaces the body verbatim; otherwise we merge --field
    // pairs by label into the existing profile body.
    const parsed = typeof promptBody === 'string'
      ? parseProfileBody(promptBody)
      : parseProfileBody(existing?.body ?? '');
    for (const { label, value } of fields) {
      if (!parsed.byLabel.has(label)) parsed.labels.push(label);
      parsed.byLabel.set(label, value);
    }
    const nextBody = renderProfileBody(parsed);
    const payload = {
      type: 'profile',
      name: existing?.name || 'Work profile',
      description: typeof flags.description === 'string'
        ? flags.description
        : (existing?.description ?? 'How I work — read by the intent gateway.'),
      body: nextBody,
    };
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/${encodeURIComponent(PROFILE_ID)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data.entry ?? data);
    console.log(`[memory] saved profile ${data.entry?.id ?? PROFILE_ID}`);
    printMemoryProfile(data.entry ?? data);
    return;
  }

  console.error(`unknown subcommand: od memory profile ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// `od memory rule <list|add>` — verified rules (assertion + check) the POST
// self-verify loop enforces as scorecard rubric items.
async function runMemoryRule(base, rest, flags, writeJson) {
  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'list';

  if (action === 'list') {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    const rules = (data.entries ?? []).filter((e) => e.type === 'rule');
    if (flags.json) return writeJson({ rules });
    if (rules.length === 0) {
      console.log('No rule memories.');
      return;
    }
    for (const rule of rules) {
      console.log(`${rule.id}\t${rule.name}\t${rule.description || '-'}`);
    }
    return;
  }

  if (action === 'add') {
    const name = flags.name;
    if (typeof name !== 'string' || name.length === 0) {
      console.error('Usage: od memory rule add --name <name> --assertion <text> --check <text> [--description <text>] [--rationale <text>] [--prompt-file <path|->]');
      process.exit(2);
    }
    // --prompt-file content becomes the rule body verbatim; otherwise we
    // compose "Assertion: …\nCheck: …" (+ optional Rationale) from flags.
    const promptBody = await readMemoryPromptFile(flags);
    let body;
    if (typeof promptBody === 'string') {
      body = promptBody;
    } else {
      const assertion = flags.assertion;
      const check = flags.check;
      if (typeof assertion !== 'string' || typeof check !== 'string') {
        console.error('rule add needs --assertion and --check (or --prompt-file for the body)');
        process.exit(2);
      }
      const lines = [`Assertion: ${assertion}`, `Check: ${check}`];
      if (typeof flags.rationale === 'string' && flags.rationale.length > 0) {
        lines.push(`Rationale: ${flags.rationale}`);
      }
      body = lines.join('\n');
    }
    const payload = {
      type: 'rule',
      name,
      description: typeof flags.description === 'string' ? flags.description : '',
      body,
    };
    let resp;
    try {
      resp = await fetch(`${base}/api/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data.entry ?? data);
    console.log(`[memory] added rule ${data.entry?.id ?? name}`);
    return;
  }

  if (action === 'suggest') {
    // Distil annotations into rule proposals (THREAD 1). Display-only: the
    // daemon never writes; the user Keeps a proposal (web) or pipes it into
    // `od memory rule add` (CLI) to commit it. Annotations come from a single
    // --note (+ optional --target/--file/--current-text) or a --prompt-file
    // carrying a JSON array of annotation objects or newline-separated notes.
    const annotations = await collectDistillAnnotations(flags);
    if (annotations.length === 0) {
      console.error('Usage: od memory rule suggest --note <text> [--target <label>] [--file <path>] [--current-text <text>]');
      console.error('   or: od memory rule suggest --prompt-file <path|->   (JSON array of annotations, or one note per line)');
      process.exit(2);
    }
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/rules/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annotations }),
      });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    const proposals = data.proposals ?? [];
    if (proposals.length === 0) {
      console.log('No rule proposals distilled from these annotations.');
      return;
    }
    console.log(`[memory] ${proposals.length} rule proposal(s) (source: ${data.source}, llm: ${data.attemptedLLM ? 'yes' : 'no'})`);
    for (const p of proposals) {
      console.log(`\n${p.name}`);
      if (p.description) console.log(`  ${p.description}`);
      console.log(`  Assertion: ${p.assertion}`);
      console.log(`  Check: ${p.check}`);
      if (p.rationale) console.log(`  Rationale: ${p.rationale}`);
    }
    console.log('\nTo keep one: od memory rule add --name "<name>" --assertion "<...>" --check "<...>"');
    return;
  }

  console.error(`unknown subcommand: od memory rule ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// Collect annotation inputs for `od memory rule suggest` from either a single
// --note (+ optional target context) or a --prompt-file. The prompt-file may
// hold a JSON array of annotation objects, or plain text with one note per
// line — both keep the --prompt-file embeddability contract clean for jobs
// that pipe through xargs/jq/heredoc.
async function collectDistillAnnotations(flags) {
  const annotations = [];
  if (typeof flags.note === 'string' && flags.note.trim()) {
    annotations.push({
      note: flags.note,
      ...(typeof flags.target === 'string' ? { targetLabel: flags.target } : {}),
      ...(typeof flags.file === 'string' ? { filePath: flags.file } : {}),
      ...(typeof flags['current-text'] === 'string'
        ? { currentText: flags['current-text'] }
        : {}),
    });
  }
  const promptBody = await readMemoryPromptFile(flags);
  if (typeof promptBody === 'string' && promptBody.trim()) {
    const trimmed = promptBody.trim();
    let parsedJson = null;
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        parsedJson = JSON.parse(trimmed);
      } catch {
        parsedJson = null;
      }
    }
    if (Array.isArray(parsedJson)) {
      for (const item of parsedJson) {
        const note = item && typeof item.note === 'string' ? item.note : '';
        if (!note.trim()) continue;
        annotations.push({
          note,
          ...(typeof item.targetLabel === 'string' ? { targetLabel: item.targetLabel } : {}),
          ...(typeof item.filePath === 'string' ? { filePath: item.filePath } : {}),
          ...(typeof item.currentText === 'string' ? { currentText: item.currentText } : {}),
          ...(typeof item.selectionKind === 'string' ? { selectionKind: item.selectionKind } : {}),
          ...(typeof item.htmlHint === 'string' ? { htmlHint: item.htmlHint } : {}),
        });
      }
    } else if (parsedJson && typeof parsedJson === 'object' && typeof parsedJson.note === 'string') {
      annotations.push({ note: parsedJson.note });
    } else {
      for (const line of trimmed.split(/\r?\n/)) {
        const note = line.trim();
        if (note) annotations.push({ note });
      }
    }
  }
  return annotations;
}

// `od memory verify <list|clear>` — inspect or wipe the POST self-verify
// enforcement history (THREAD 2). `list` prints recent enforcement outcomes
// (`pass` / `fail` / `missing`) the daemon recorded for artifact turns with
// active rules; `clear` drops the in-memory buffer.
async function runMemoryVerify(base, rest, flags, writeJson) {
  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'list';

  if (action === 'list') {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/verifications`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    const verifications = data.verifications ?? [];
    if (verifications.length === 0) {
      console.log('No verification records yet.');
      return;
    }
    console.log('# status\trules\tcovered\trowsFail\tat\trunId');
    for (const v of verifications) {
      const at = new Date(v.at).toISOString();
      console.log(
        `${v.status}\t${v.rulesActive}\t${v.rulesCovered}\t${v.rowsFailed}\t${at}\t${v.runId ?? '-'}`,
      );
      if (Array.isArray(v.uncoveredRules) && v.uncoveredRules.length > 0) {
        console.log(`  uncovered: ${v.uncoveredRules.join(', ')}`);
      }
    }
    return;
  }

  if (action === 'clear') {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/verifications`, { method: 'DELETE' });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    console.log(`[memory] cleared ${data.removed ?? 0} verification record(s)`);
    return;
  }

  console.error(`unknown subcommand: od memory verify ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// `od memory config` — inspect or toggle the master switch + the four hooks.
// No flags ⇒ print every switch (read off GET /api/memory). Toggle flags ⇒
// PATCH /api/memory/config and print the result. Flags accept true|false.
async function runMemoryConfig(base, rest, flags, writeJson) {
  // Map CLI flag → config field. --extraction is the chat-extraction hook;
  // --profile/--rewrite/--verify are the new PRE/POST loop hooks.
  const TOGGLE_MAP = {
    enabled: 'enabled',
    extraction: 'chatExtractionEnabled',
    profile: 'profileEnabled',
    rewrite: 'rewriteEnabled',
    verify: 'verifyEnabled',
  };
  const parseBool = (raw, flagName) => {
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false') return false;
    console.error(`--${flagName} expects true or false`);
    process.exit(2);
  };

  const patch = {};
  for (const [flagName, field] of Object.entries(TOGGLE_MAP)) {
    if (flagName in flags) {
      patch[field] = parseBool(flags[flagName], flagName);
    }
  }

  // No toggles → read-only listing of every switch off GET /api/memory.
  if (Object.keys(patch).length === 0) {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    const view = {
      enabled: data.enabled,
      chatExtractionEnabled: data.chatExtractionEnabled,
      profileEnabled: data.profileEnabled,
      rewriteEnabled: data.rewriteEnabled,
      verifyEnabled: data.verifyEnabled,
    };
    if (flags.json) return writeJson(view);
    console.log(`enabled               ${formatMemoryConfigSwitch(view.enabled)}`);
    console.log(`chatExtractionEnabled ${formatMemoryConfigSwitch(view.chatExtractionEnabled)}`);
    console.log(`profileEnabled        ${formatMemoryConfigSwitch(view.profileEnabled)}`);
    console.log(`rewriteEnabled        ${formatMemoryConfigSwitch(view.rewriteEnabled)}`);
    console.log(`verifyEnabled         ${formatMemoryConfigSwitch(view.verifyEnabled)}`);
    return;
  }

  let resp;
  try {
    resp = await fetch(`${base}/api/memory/config`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return writeJson(data);
  console.log(`enabled               ${formatMemoryConfigSwitch(data.enabled)}`);
  console.log(`chatExtractionEnabled ${formatMemoryConfigSwitch(data.chatExtractionEnabled)}`);
  console.log(`profileEnabled        ${formatMemoryConfigSwitch(data.profileEnabled)}`);
  console.log(`rewriteEnabled        ${formatMemoryConfigSwitch(data.rewriteEnabled)}`);
  console.log(`verifyEnabled         ${formatMemoryConfigSwitch(data.verifyEnabled)}`);
  return;
}
