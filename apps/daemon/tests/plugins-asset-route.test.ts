// Plan §3.L3 / spec §10.3.5 / §9.2 — plugin asset endpoint.
//
// Validates the daemon-side half of the SandboxedComponentSurface
// contract:
//
//   - 404 when the plugin id is unknown.
//   - 400 when the relpath includes traversal segments.
//   - 200 with the §9.2 CSP + nosniff headers when the asset is
//     served from a real fsPath.
//   - Requests outside the plugin's fsPath are refused even when the
//     normalized path resolves to an existing file elsewhere.

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { startServer } from '../src/server.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';
import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.OD_DATA_DIR
  ? path.resolve(projectRoot, process.env.OD_DATA_DIR)
  : path.join(projectRoot, '.od');

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let pluginRoot: string;

beforeAll(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-asset-'));
  const surfacesDir = path.join(pluginRoot, 'surfaces');
  await mkdir(surfacesDir, { recursive: true });
  await writeFile(
    path.join(surfacesDir, 'index.html'),
    '<!DOCTYPE html><title>fixture</title><script>console.log(1)</script>',
  );
  const manifest = {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: 'asset-plugin',
    title: 'Asset',
    version: '1.0.0',
    description: 'fixture',
    license: 'MIT',
    od: { kind: 'skill', capabilities: ['prompt:inject', 'genui:custom-component'] },
  } as PluginManifest;
  await writeFile(path.join(pluginRoot, 'open-design.json'), JSON.stringify(manifest));

  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;

  const now = Date.now();
  const db = new Database(path.join(serverRuntimeDataRoot, 'app.sqlite'));
  upsertInstalledPlugin(db, {
    id: 'asset-plugin',
    title: 'Asset',
    version: '1.0.0',
    sourceKind: 'bundled',
    source: pluginRoot,
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject', 'genui:custom-component'],
    manifest,
    fsPath: pluginRoot,
    installedAt: now,
    updatedAt: now,
  } as InstalledPluginRecord);
  db.close();
  const secretPath = path.join(pluginRoot, 'secret.txt');
  const outsideDir = path.join(pluginRoot, 'outside');
  await mkdir(outsideDir, { recursive: true });
  await writeFile(secretPath, 'outside secret');
  await writeFile(path.join(outsideDir, 'nested-secret.txt'), 'nested outside secret');
  const installedSurfacesDir = surfacesDir;
  const installedInternalDir = path.join(pluginRoot, 'internal-assets');
  await mkdir(installedInternalDir, { recursive: true });
  await writeFile(path.join(installedInternalDir, 'nested-internal.txt'), 'nested internal secret');
  await symlink(
    secretPath,
    path.join(installedSurfacesDir, 'leak.txt'),
  );
  await symlink(outsideDir, path.join(installedSurfacesDir, 'linked-outside'), 'dir');
  await symlink(installedInternalDir, path.join(installedSurfacesDir, 'linked-internal'), 'dir');
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    const db = new Database(path.join(serverRuntimeDataRoot, 'app.sqlite'));
    db.prepare('DELETE FROM installed_plugins WHERE id = ?').run('asset-plugin');
    db.close();
  } catch {
    // ignore cleanup failures after a failed server boot
  }
  await rm(pluginRoot, { recursive: true, force: true });
});

describe('GET /api/plugins/:id/asset/*', () => {
  it('returns 404 for an unknown plugin', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/unknown/asset/index.html`);
    expect(resp.status).toBe(404);
  });

  it('rejects path-traversal segments with 400', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/..%2Fescape`);
    expect(resp.status).toBe(400);
  });

  it('serves an asset with the §9.2 preview CSP + nosniff', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/surfaces/index.html`);
    expect(resp.status).toBe(200);
    const csp = resp.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(resp.headers.get('x-content-type-options')).toBe('nosniff');
    expect(resp.headers.get('content-type')).toMatch(/text\/html/);
    const body = await resp.text();
    expect(body).toContain('fixture');
  });

  it('returns 404 for a missing asset under a known plugin', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/does/not/exist.html`);
    expect(resp.status).toBe(404);
  });

  it('rejects symlinked assets inside the plugin root', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/surfaces/leak.txt`);
    expect(resp.status).toBe(404);
    expect(await resp.text()).not.toContain('outside secret');
  });

  it('rejects assets reached through a symlinked directory inside the plugin root', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/surfaces/linked-outside/nested-secret.txt`);
    expect(resp.status).toBe(404);
    expect(await resp.text()).not.toContain('nested outside secret');
  });

  it('rejects assets reached through an internal symlinked directory inside the plugin root', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/surfaces/linked-internal/nested-internal.txt`);
    expect(resp.status).toBe(404);
    expect(await resp.text()).not.toContain('nested internal secret');
  });
});
