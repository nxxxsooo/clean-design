// Plugin installer. Spec §7.2:
//
//   - `./folder` / `/abs/path`     — local-copy backend (Phase 1).
//   - `github:owner/repo[@ref][/subpath]` — fetched from
//     codeload.github.com as a tar.gz, extracted into a temp dir, then
//     copied into the daemon data-root-derived plugin registry via the local
//     backend.
//   - `https://…tar.gz` / `…tgz`   — same extraction path, no path-rewrite.
//
// Hard install constraints (spec §7.2 / plan §3.A6):
//   - Reject path-traversal segments inside the source folder when copying.
//   - Reject symlinks (we do not stage non-local pointers).
//   - Cap copied tree size at 50 MiB by default.
//   - Refuse to overwrite a different plugin id at the destination.
//   - Tarball extraction inherits the same caps via tar's strict mode.

import path from 'node:path';
import { safeExternalFetch } from './plugin-asset-cache.js';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as tarExtract } from 'tar';
import {
  defaultRegistryRoots,
  deleteInstalledPlugin,
  resolvePluginFolder,
  upsertInstalledPlugin,
  type ResolveOptions,
  type RegistryRoots,
} from './registry.js';
import type {
  InstalledPluginRecord,
  MarketplaceTrust,
  PluginSourceKind,
  TrustTier,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { recordPluginEvent } from './events.js';
import { upsertPluginLockfileEntry } from './lockfile.js';

type SqliteDb = Database.Database;

export interface InstallProgressEvent {
  kind: 'progress';
  phase: 'resolving' | 'copying' | 'parsing' | 'persisting';
  message: string;
}

export interface InstallSuccessEvent {
  kind: 'success';
  plugin: InstalledPluginRecord;
  warnings: string[];
}

export interface InstallErrorEvent {
  kind: 'error';
  message: string;
  warnings: string[];
}

export type InstallEvent = InstallProgressEvent | InstallSuccessEvent | InstallErrorEvent;

export interface InstallOptions {
  source: string;
  // Forwarded from daemon runtime context; defaults to defaultRegistryRoots()
  // so daemon tests can point at a sandboxed data root.
  roots?: RegistryRoots;
  // 50 MiB default mirrors spec §7.2; tests pin a tighter cap.
  maxBytes?: number;
  // When true (the default), an existing install with the same id is
  // replaced. Set false from CLI flows that want to surface a confirm step.
  overwriteExisting?: boolean;
  // Pluggable network fetcher for tests. Production injects globalThis.fetch.
  // The contract: returns a ReadableStream of the gzipped tar bytes.
  fetcher?: ArchiveFetcher;
  // Plan §3.JJ1 — emit 'plugin.installed' (default) or
  // 'plugin.upgraded' from the producer hook. The upgrade route
  // sets this to 'upgraded' so consumers can distinguish the two
  // operations in the live event stream.
  eventKind?: 'installed' | 'upgraded';
  sourceMarketplaceId?: string;
  sourceMarketplaceEntryName?: string;
  sourceMarketplaceEntryVersion?: string;
  marketplaceTrust?: MarketplaceTrust;
  resolvedSource?: string;
  resolvedRef?: string;
  manifestDigest?: string;
  archiveIntegrity?: string;
  // Optional runtime-data lockfile path. Daemon routes pass
  // `<OD_DATA_DIR>/od-plugin-lock.json`; tests can point at temp dirs.
  lockfilePath?: string;
}

export type ArchiveFetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  body: Readable | null;
}>;

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

const SAFE_BASENAME = /^[a-z0-9][a-z0-9._-]*$/;
const GITHUB_SOURCE_RE = /^github:([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(.*)$/;
const HTTPS_SOURCE_RE = /^https:\/\//i;
const GITHUB_REF_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

interface GithubArchiveCandidate {
  ref: string;
  subpath?: string;
}

interface ParsedGithubSource {
  owner: string;
  repo: string;
  candidates: GithubArchiveCandidate[];
}

interface GithubContentsEntry {
  type?: string;
  name?: string;
  path?: string;
  download_url?: string | null;
}

interface GithubContentsBudget {
  bytes: number;
  hash: ReturnType<typeof createHash>;
  maxBytes: number;
}

// Top-level dispatcher. Clean Design stages plugins only from a local folder
// that is already on this machine: the `github:` and `https://` archive
// backends were removed with the rest of the hosted plugin surface, so a
// remote source is refused before any bytes are fetched. This also retires
// the unguarded install fetcher that DNS-rebinding/SSRF probes targeted.
export async function* installPlugin(
  db: SqliteDb,
  opts: InstallOptions,
): AsyncGenerator<InstallEvent, void, void> {
  if (GITHUB_SOURCE_RE.test(opts.source) || HTTPS_SOURCE_RE.test(opts.source)) {
    yield {
      kind: 'error',
      message: `Clean Design installs plugins from a local folder only; refused remote source: ${opts.source}`,
      warnings: [],
    };
    return;
  }
  yield* installFromLocalFolder(db, opts);
}

async function measureTreeSize(root: string): Promise<number> {
  let total = 0;
  const queue: string[] = [root];
  while (queue.length > 0) {
    const next = queue.pop()!;
    const stat = await fsp.lstat(next);
    if (stat.isDirectory()) {
      const entries = await fsp.readdir(next);
      for (const entry of entries) queue.push(path.join(next, entry));
    } else if (stat.isFile()) {
      total += stat.size;
    }
  }
  return total;
}

function sanitizeRelativePath(input: string): string {
  return input
    .replace(/^[\\/]+/, '')
    .split(/[\\/]+/)
    .filter((seg) => seg !== '..' && seg !== '.' && seg !== '')
    .join(path.sep);
}

export async function* installFromLocalFolder(
  db: SqliteDb,
  opts: InstallOptions & { _stagedFolder?: string; _stagedSourceKind?: PluginSourceKind },
): AsyncGenerator<InstallEvent, void, void> {
  const warnings: string[] = [];
  const roots = opts.roots ?? defaultRegistryRoots();
  // When called from the archive backend, the bytes are already on disk
  // under `_stagedFolder`; the public `source` field still records
  // provenance (github:owner/repo, https://example.com/foo.tgz, etc.).
  const sourceFolder = opts._stagedFolder ?? path.resolve(opts.source);
  const recordedSource = opts.source;
  const recordedSourceKind: PluginSourceKind = opts._stagedSourceKind ?? 'local';
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  yield { kind: 'progress', phase: 'resolving', message: `Resolving ${sourceFolder}` };

  let stats: fs.Stats;
  try {
    stats = await fsp.stat(sourceFolder);
  } catch (err) {
    yield { kind: 'error', message: `Source folder not found: ${sourceFolder} (${(err as Error).message})`, warnings };
    return;
  }
  if (!stats.isDirectory()) {
    yield { kind: 'error', message: `Source path is not a directory: ${sourceFolder}`, warnings };
    return;
  }

  // Probe the source manifest first so the destination folder name is
  // chosen by manifest id, not by directory name. This keeps registry
  // ids deterministic when authors rename the folder on disk between
  // installs.
  yield { kind: 'progress', phase: 'parsing', message: 'Parsing manifest' };
  const tentativeId = path.basename(sourceFolder).toLowerCase();
  const probeOptions = buildResolveOptions({
    folder: sourceFolder,
    folderId: SAFE_BASENAME.test(tentativeId) ? tentativeId : 'plugin',
    sourceKind: recordedSourceKind,
    source: recordedSource,
  }, opts);
  const probe = await resolvePluginFolder(probeOptions);
  if (!probe.ok) {
    yield { kind: 'error', message: probe.errors.join('; '), warnings: probe.warnings };
    return;
  }
  warnings.push(...probe.warnings);
  const pluginId = probe.record.id;
  if (!SAFE_BASENAME.test(pluginId)) {
    yield { kind: 'error', message: `Plugin id '${pluginId}' is not a safe folder name`, warnings };
    return;
  }
  const destFolder = path.join(roots.userPluginsRoot, pluginId);

  // Block overwriting a foreign plugin id. The destination folder may
  // contain a previous version of the same id, in which case we replace it.
  if (fs.existsSync(destFolder) && (opts.overwriteExisting ?? true) === false) {
    yield { kind: 'error', message: `Destination folder already exists: ${destFolder}. Pass overwriteExisting=true to replace.`, warnings };
    return;
  }

  yield { kind: 'progress', phase: 'copying', message: `Copying to ${destFolder}` };
  await fsp.mkdir(roots.userPluginsRoot, { recursive: true });
  if (fs.existsSync(destFolder)) {
    await fsp.rm(destFolder, { recursive: true, force: true });
  }
  try {
    await safeCopyTree(sourceFolder, destFolder, maxBytes);
  } catch (err) {
    yield { kind: 'error', message: `Copy failed: ${(err as Error).message}`, warnings };
    await fsp.rm(destFolder, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  yield { kind: 'progress', phase: 'parsing', message: 'Re-parsing destination' };
  const parsedOptions = buildResolveOptions({
    folder: destFolder,
    folderId: pluginId,
    sourceKind: recordedSourceKind,
    source: recordedSource,
  }, opts);
  const parsed = await resolvePluginFolder(parsedOptions);
  if (!parsed.ok) {
    await fsp.rm(destFolder, { recursive: true, force: true }).catch(() => undefined);
    yield { kind: 'error', message: parsed.errors.join('; '), warnings: [...warnings, ...parsed.warnings] };
    return;
  }
  warnings.push(...parsed.warnings);

  yield { kind: 'progress', phase: 'persisting', message: 'Writing installed_plugins row' };
  upsertInstalledPlugin(db, parsed.record);
  if (opts.lockfilePath) {
    await upsertPluginLockfileEntry(opts.lockfilePath, parsed.record);
  }

  // Plan §3.II1 / §3.JJ1 — emit 'plugin.installed' OR
  // 'plugin.upgraded' (per opts.eventKind) so ops dashboards +
  // `od plugin events tail` see the operation land in the in-
  // memory ring buffer. Best-effort; recordPluginEvent never
  // throws.
  recordPluginEvent({
    kind:     opts.eventKind === 'upgraded' ? 'plugin.upgraded' : 'plugin.installed',
    pluginId: parsed.record.id,
    details:  {
      version:    parsed.record.version,
      sourceKind: parsed.record.sourceKind,
      source:     parsed.record.source,
      sourceMarketplaceId: parsed.record.sourceMarketplaceId,
      sourceMarketplaceEntryName: parsed.record.sourceMarketplaceEntryName,
      sourceMarketplaceEntryVersion: parsed.record.sourceMarketplaceEntryVersion,
      marketplaceTrust: parsed.record.marketplaceTrust,
      trust:      parsed.record.trust,
      warnings:   warnings.length,
    },
  });

  yield { kind: 'success', plugin: parsed.record, warnings };
}

export interface UninstallResult {
  ok: boolean;
  removedFolder?: string;
  warning?: string;
}

// A plugin id must be a single safe folder name (no path separators, no
// traversal). Exposed so the HTTP layer can reject a malformed id with 400
// before it reaches any filesystem operation.
export function isSafePluginId(id: string): boolean {
  return typeof id === 'string' && SAFE_BASENAME.test(id);
}

export async function uninstallPlugin(
  db: SqliteDb,
  id: string,
  roots: RegistryRoots = defaultRegistryRoots(),
): Promise<UninstallResult> {
  // A plugin id is a single safe folder name — never a path. Validate it
  // BEFORE it reaches `path.join(...) + rm -rf`, so an id carrying traversal
  // segments (e.g. a URL-encoded `../../…`) cannot escape the plugin registry
  // root and recursively delete an arbitrary directory. This mirrors the guard
  // the install path already enforces (`SAFE_BASENAME.test(pluginId)`); the
  // uninstall path was the one rm-capable route that skipped it.
  if (!isSafePluginId(id)) {
    return { ok: false, warning: `Plugin id '${id}' is not a safe folder name` };
  }
  const removed = deleteInstalledPlugin(db, id);
  const folder = path.join(roots.userPluginsRoot, id);
  // Defence in depth: even a SAFE_BASENAME-passing id must resolve to a direct
  // child of the registry root. If normalization lands anywhere else, refuse.
  const registryRoot = path.resolve(roots.userPluginsRoot);
  if (path.dirname(path.resolve(folder)) !== registryRoot) {
    return { ok: false, warning: `Plugin id '${id}' does not resolve inside the plugin registry root` };
  }
  let removedFolder: string | undefined;
  try {
    await fsp.rm(folder, { recursive: true, force: true });
    if (fs.existsSync(folder)) {
      // Some platforms refuse to remove read-only files; surface a hint
      // instead of silently leaving stale on-disk state.
      return { ok: removed, warning: `Folder ${folder} could not be removed` };
    }
    removedFolder = folder;
  } catch (err) {
    return { ok: removed, warning: `Folder ${folder} removal failed: ${(err as Error).message}` };
  }
  // Plan §3.II1 — emit a 'plugin.uninstalled' event when the
  // registry row was actually removed. We skip the event when
  // both removed=false AND folder didn't exist (no-op uninstall).
  if (removed || removedFolder !== undefined) {
    recordPluginEvent({
      kind:     'plugin.uninstalled',
      pluginId: id,
      details:  removedFolder ? { removedFolder } : {},
    });
  }
  return { ok: removed || removedFolder !== undefined, removedFolder };
}

// Recursive copy with budget tracking. Symlinks anywhere in the tree fail
// the copy outright; we never reach upstream paths through a clever link.
async function safeCopyTree(src: string, dest: string, maxBytes: number): Promise<void> {
  let bytesCopied = 0;
  const queue: Array<{ src: string; dest: string }> = [{ src, dest }];
  while (queue.length > 0) {
    const { src: from, dest: to } = queue.pop()!;
    const stat = await fsp.lstat(from);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected: ${from}`);
    }
    if (stat.isDirectory()) {
      await fsp.mkdir(to, { recursive: true });
      const entries = await fsp.readdir(from, { withFileTypes: true });
      for (const entry of entries) {
        if (!isSafeBasename(entry.name)) {
          throw new Error(`Unsafe path segment: ${entry.name}`);
        }
        queue.push({ src: path.join(from, entry.name), dest: path.join(to, entry.name) });
      }
      continue;
    }
    if (stat.isFile()) {
      bytesCopied += stat.size;
      if (bytesCopied > maxBytes) {
        throw new Error(`Plugin tree exceeds size cap of ${maxBytes} bytes`);
      }
      await fsp.copyFile(from, to);
      continue;
    }
    // Sockets / fifos / devices — refuse.
    throw new Error(`Unsupported file type at ${from}`);
  }
}

function isSafeBasename(name: string): boolean {
  if (name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  return true;
}

function buildResolveOptions(
  base: Pick<ResolveOptions, 'folder' | 'folderId' | 'sourceKind' | 'source'>,
  opts: InstallOptions,
): ResolveOptions {
  const resolveOptions: ResolveOptions = { ...base };
  if (opts.sourceMarketplaceId) resolveOptions.sourceMarketplaceId = opts.sourceMarketplaceId;
  if (opts.sourceMarketplaceEntryName) resolveOptions.sourceMarketplaceEntryName = opts.sourceMarketplaceEntryName;
  if (opts.sourceMarketplaceEntryVersion) resolveOptions.sourceMarketplaceEntryVersion = opts.sourceMarketplaceEntryVersion;
  if (opts.marketplaceTrust) {
    resolveOptions.marketplaceTrust = opts.marketplaceTrust;
    resolveOptions.trust = installedTrustFromMarketplace(opts.marketplaceTrust);
  }
  if (opts.resolvedSource) resolveOptions.resolvedSource = opts.resolvedSource;
  if (opts.resolvedRef) resolveOptions.resolvedRef = opts.resolvedRef;
  if (opts.manifestDigest) resolveOptions.manifestDigest = opts.manifestDigest;
  if (opts.archiveIntegrity) resolveOptions.archiveIntegrity = opts.archiveIntegrity;
  return resolveOptions;
}

function installedTrustFromMarketplace(trust: MarketplaceTrust): TrustTier {
  return trust === 'restricted' ? 'restricted' : 'trusted';
}

export type { PluginSourceKind };
