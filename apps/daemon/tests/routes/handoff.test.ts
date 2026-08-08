// @ts-nocheck

import * as http from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerHandoffRoutes } from '../../src/routes/handoff.js';

describe('immutable handoff packet routes', () => {
  let root: string;
  let projectsRoot: string;
  let runtimeRoot: string;
  let trustedRoot: string;
  let configuredRoot: string | null;
  let rendererFailure: string | null;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'clean-design-handoff-route-')));
    projectsRoot = path.join(root, 'projects');
    runtimeRoot = path.join(root, 'runtime');
    trustedRoot = path.join(root, 'exports');
    configuredRoot = trustedRoot;
    rendererFailure = null;
    await mkdir(path.join(projectsRoot, 'project-1'), { recursive: true });
    await mkdir(runtimeRoot, { recursive: true });
    await mkdir(trustedRoot, { recursive: true });
    await writeFile(
      path.join(projectsRoot, 'project-1', 'index.html'),
      '<!doctype html><h1>Approved reference</h1>',
    );

    const app = express();
    app.use(express.json());
    registerHandoffRoutes(app, {
      db: {},
      http: {},
      paths: { PROJECTS_DIR: projectsRoot, RUNTIME_DATA_DIR: runtimeRoot },
      projectStore: {
        getProject: (_db: unknown, id: string) => id === 'project-1'
          ? { id, name: 'Approved Product', metadata: { kind: 'prototype', entryFile: 'index.html' } }
          : null,
      },
      validation: { isSafeId: (id: string) => /^[A-Za-z0-9_-]+$/.test(id) },
      handoff: {
        daemonUrlRef: { current: 'http://127.0.0.1:7456' },
        trustedRootStore: { get: async () => configuredRoot },
        desktopArtifactExporter: async (input: { format: string }) => {
          if (rendererFailure) return { ok: false, error: rendererFailure };
          const outputDir = await mkdtemp(path.join(runtimeRoot, 'render-'));
          const outputPath = path.join(outputDir, input.format === 'pdf' ? 'artifact.pdf' : 'artifact.png');
          const bytes = Buffer.from(input.format === 'pdf' ? '%PDF-preview' : 'PNG-preview');
          await writeFile(outputPath, bytes);
          return { ok: true, path: outputPath, bytes: bytes.length };
        },
        desktopSlideRenderer: null,
      },
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it('reports only the trusted root display name', async () => {
    const response = await fetch(`${baseUrl}/api/projects/project-1/handoff-root`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: true, displayName: 'exports' });
  });

  it('requires a native-selected trusted root', async () => {
    configuredRoot = null;
    const response = await fetch(`${baseUrl}/api/projects/project-1/handoff-packet`, { method: 'POST' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: 'root_required' });
  });

  it('publishes source, previews, prompt, and manifest as one immutable packet', async () => {
    const response = await fetch(`${baseUrl}/api/projects/project-1/handoff-packet`, { method: 'POST' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, manifest: { schemaVersion: 1 } });
    expect(body.packetPath.startsWith(path.join(trustedRoot, 'approved-product'))).toBe(true);
    expect(await readFile(path.join(body.packetPath, 'source', 'index.html'), 'utf8')).toContain('Approved reference');
    expect(await readFile(path.join(body.packetPath, 'HANDOFF.md'), 'utf8')).toContain('Inspect the receiving repository');
    expect((await readdir(path.join(body.packetPath, 'previews'))).sort()).toEqual(['desktop.png', 'mobile.png']);
  });

  it('maps required rendering failures and leaves no published packet', async () => {
    rendererFailure = 'capture failed';
    const response = await fetch(`${baseUrl}/api/projects/project-1/handoff-packet`, { method: 'POST' });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, code: 'render_failed' });
    expect(await readdir(path.join(trustedRoot, 'approved-product'))).toEqual([]);
  });
});
