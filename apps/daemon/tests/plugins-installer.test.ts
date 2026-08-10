// Installer integration: copies a local-folder plugin into a sandbox
// userPluginsRoot, persists the installed_plugins row, and surfaces SSE
// events. Clean Design keeps only the local-folder source path — the
// `github:` and `https://` archive backends were removed with the rest of
// the hosted plugin surface, so the dispatcher must refuse a remote source
// instead of fetching it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { installFromLocalFolder, installPlugin, uninstallPlugin } from '../src/plugins/installer.js';
import { listInstalledPlugins } from '../src/plugins/registry.js';
import type { InstalledPluginRecord } from '@open-design/contracts';

let tmpRoot: string;
let pluginsRoot: string;
let sourceFolder: string;
let db: Database.Database;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-installer-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  sourceFolder = path.join(tmpRoot, 'source-plugin');
  await mkdir(sourceFolder, { recursive: true });
  await writeFile(
    path.join(sourceFolder, 'open-design.json'),
    JSON.stringify({
      name: 'sample-plugin',
      version: '1.0.0',
      title: 'Sample Plugin',
      od: {
        kind: 'skill',
        taskKind: 'new-generation',
        useCase: { query: 'Make a {{topic}} brief.' },
        inputs: [{ name: 'topic', type: 'string', required: true }],
      },
    }, null, 2),
  );
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('installFromLocalFolder', () => {
  it('copies the folder and writes installed_plugins', async () => {
    const events: string[] = [];
    let installedRecord: InstalledPluginRecord | null = null;

    for await (const ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      events.push(ev.kind);
      if (ev.kind === 'success') installedRecord = ev.plugin;
      if (ev.kind === 'error') throw new Error(ev.message);
    }

    expect(events.at(-1)).toBe('success');
    expect(installedRecord?.id).toBe('sample-plugin');
    expect(installedRecord?.version).toBe('1.0.0');
    const list = listInstalledPlugins(db);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('sample-plugin');
    expect(list[0]?.sourceKind).toBe('local');
    // Local installs are implicitly trusted (the user copied the folder here
    // themselves) — see trust.ts defaultTrustForRecord / resolvePluginFolder.
    expect(list[0]?.trust).toBe('trusted');
    expect(list[0]?.fsPath).toBe(path.join(pluginsRoot, 'sample-plugin'));
  });

  it('rejects symbolic links inside the source tree', async () => {
    // Create a benign symlink — the installer must refuse anything that
    // could escape the staged folder.
    const linkPath = path.join(sourceFolder, 'evil-link');
    await mkdir(path.dirname(linkPath), { recursive: true });
    const fs = await import('node:fs/promises');
    await fs.symlink('/etc/passwd', linkPath).catch(() => undefined);

    let errored = false;
    for await (const ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      if (ev.kind === 'error') errored = true;
    }
    expect(errored).toBe(true);
  });

  it('uninstall removes the row and on-disk staged folder', async () => {
    for await (const _ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      void _ev;
    }
    const result = await uninstallPlugin(db, 'sample-plugin', { userPluginsRoot: pluginsRoot });
    expect(result.ok).toBe(true);
    expect(listInstalledPlugins(db)).toHaveLength(0);
  });

  // Zero-egress regression: the removed github:/https: backends were the
  // only outbound fetchers in the install path, and they had no SSRF guard.
  // A remote source must now fail as a plain install error with no network
  // call at all, so a hostile source string cannot reach loopback, RFC1918,
  // or cloud-metadata addresses.
  it.each([
    'github:owner/repo',
    'github:owner/repo@main/subpath',
    'https://example.com/plugin.tar.gz',
    'https://127.0.0.1/plugin.tgz',
    'https://169.254.169.254/latest/meta-data',
  ])('refuses the remote source %s without attempting a fetch', async (source) => {
    const realFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      fetchCalls += 1;
      throw new Error(`unexpected outbound fetch: ${String(args[0])}`);
    }) as typeof fetch;
    try {
      const events: Array<{ kind: string; message?: string }> = [];
      for await (const ev of installPlugin(db, {
        source,
        roots: { userPluginsRoot: pluginsRoot },
      }) as AsyncGenerator<{ kind: string; message?: string }>) {
        events.push(ev);
      }
      const error = events.find((ev) => ev.kind === 'error');
      expect(error?.message).toMatch(/local folder only/);
      expect(events.some((ev) => ev.kind === 'success')).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(fetchCalls).toBe(0);
    expect(listInstalledPlugins(db)).toHaveLength(0);
  });
});
