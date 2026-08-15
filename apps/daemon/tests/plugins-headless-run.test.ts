import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolvePluginFolder, upsertInstalledPlugin } from '../src/plugins/index.js';
import { startServer } from '../src/server.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

async function seedBundledPlugin(pluginId: string, fixtureDir: string): Promise<void> {
  if (!process.env.OD_DATA_DIR) {
    throw new Error('OD_DATA_DIR is required for bundled plugin fixtures');
  }
  const resolvedPlugin = await resolvePluginFolder({
    folder: fixtureDir,
    folderId: pluginId,
    sourceKind: 'bundled',
    trust: 'bundled',
  });
  if (!resolvedPlugin.ok) {
    throw new Error(`bundled plugin fixture failed to resolve: ${resolvedPlugin.errors.join('; ')}`);
  }
  const sqlite = new Database(path.resolve(process.env.OD_DATA_DIR, 'app.sqlite'));
  try {
    upsertInstalledPlugin(sqlite, resolvedPlugin.record);
  } finally {
    sqlite.close();
  }
}

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
  await seedBundledPlugin('sample-plugin', FIXTURE_DIR);
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('bundled plugin project and run paths', () => {
  it('duplicates a bundled HTML example into a project without starting a run', async () => {
    const listResp = await fetch(`${baseUrl}/api/plugins`);
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      plugins?: Array<{
        id: string;
        title?: string;
        manifest?: { name?: string; od?: { preview?: { entry?: string } } };
      }>;
    };
    const plugin = (listBody.plugins ?? []).find((record) =>
      record.id === 'example-mobile-app' ||
      record.manifest?.name === 'example-mobile-app' ||
      record.title === 'Mobile App',
    );
    expect(plugin).toBeTruthy();

    const duplicateResp = await fetch(
      `${baseUrl}/api/plugins/${encodeURIComponent(plugin!.id)}/duplicate-project`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Duplicated mobile app' }),
      },
    );
    expect(duplicateResp.status).toBe(201);
    const duplicateBody = (await duplicateResp.json()) as {
      ok: true;
      projectId: string;
      conversationId: string;
      relPath: string;
      sourcePluginId: string;
      sourceEntry: string;
      copiedFiles: number;
      project: {
        id: string;
        name: string;
        pendingPrompt?: string | null;
        metadata?: {
          kind?: string;
          duplicatedFromPluginId?: string;
          duplicatedFromPluginEntry?: string;
          entryFile?: string;
        };
      };
    };
    expect(duplicateBody.ok).toBe(true);
    expect(duplicateBody.projectId).toBeTruthy();
    expect(duplicateBody.conversationId).toBeTruthy();
    expect(duplicateBody.relPath).toBe('index.html');
    expect(duplicateBody.sourcePluginId).toBe(plugin!.id);
    expect(duplicateBody.sourceEntry).toMatch(/example\.html$/);
    expect(duplicateBody.copiedFiles).toBeGreaterThan(0);
    expect(duplicateBody.project.name).toBe('Duplicated mobile app');
    expect(duplicateBody.project.pendingPrompt ?? null).toBeNull();
    expect(duplicateBody.project.metadata).toMatchObject({
      kind: 'prototype',
      duplicatedFromPluginId: plugin!.id,
      duplicatedFromPluginEntry: duplicateBody.sourceEntry,
      entryFile: 'index.html',
    });

    const filesResp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(duplicateBody.projectId)}/files`,
    );
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
    const fileNames = filesBody.files.map((file) => file.name).sort();
    expect(fileNames).toContain('index.html');
    expect(fileNames).toContain('assets/template.html');

    const runsResp = await fetch(
      `${baseUrl}/api/runs?projectId=${encodeURIComponent(duplicateBody.projectId)}`,
    );
    expect(runsResp.status).toBe(200);
    const runsBody = (await runsResp.json()) as { runs?: unknown[] };
    expect(runsBody.runs ?? []).toHaveLength(0);

    await fetch(`${baseUrl}/api/projects/${encodeURIComponent(duplicateBody.projectId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  });

  it('rejects bundled examples that reference files outside the duplicated directory', async () => {
    const listResp = await fetch(`${baseUrl}/api/plugins`);
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      plugins?: Array<{ id: string; manifest?: { name?: string } }>;
    };
    const plugin = (listBody.plugins ?? []).find((record) =>
      record.id === 'example-open-design-landing-deck' ||
      record.manifest?.name === 'example-open-design-landing-deck',
    );
    expect(plugin).toBeTruthy();

    const duplicateResp = await fetch(
      `${baseUrl}/api/plugins/${encodeURIComponent(plugin!.id)}/duplicate-project`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Broken duplicate should fail' }),
      },
    );

    expect(duplicateResp.status).toBe(422);
    const body = (await duplicateResp.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error).toMatchObject({ code: 'UNSUPPORTED_DUPLICATE_DEPENDENCIES' });
    expect(body.error?.message).toContain('../open-design-landing/assets/hero.png');
  });

  it('creates and reuses a bundled plugin snapshot for a local run', async () => {
    const projectId = `bundled-plugin-${randomUUID()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Bundled plugin run',
        pluginId: 'sample-plugin',
        pluginInputs: { topic: 'agentic design' },
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { id: string };
      appliedPluginSnapshotId?: string;
    };
    expect(createBody.project.id).toBe(projectId);
    expect(createBody.appliedPluginSnapshotId).toBeTruthy();

    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-test-agent',
        projectId,
        pluginId: 'sample-plugin',
        appliedPluginSnapshotId: createBody.appliedPluginSnapshotId,
        pluginInputs: { topic: 'agentic design' },
      }),
    });
    expect(runResp.status).toBe(202);
    const runBody = (await runResp.json()) as {
      runId: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
    };
    expect(runBody.pluginId).toBe('sample-plugin');
    expect(runBody.appliedPluginSnapshotId).toBe(createBody.appliedPluginSnapshotId);

    const statusResp = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}`);
    expect(statusResp.status).toBe(200);
    const statusBody = (await statusResp.json()) as {
      pluginId: string | null;
      appliedPluginSnapshotId: string | null;
    };
    expect(statusBody.pluginId).toBe('sample-plugin');
    expect(statusBody.appliedPluginSnapshotId).toBe(createBody.appliedPluginSnapshotId);

    const snapshotResp = await fetch(
      `${baseUrl}/api/applied-plugins/${encodeURIComponent(createBody.appliedPluginSnapshotId!)}`,
    );
    expect(snapshotResp.status).toBe(200);
    const snapshot = (await snapshotResp.json()) as {
      snapshotId: string;
      pluginId: string;
      query?: string;
      inputs?: Record<string, string | number | boolean>;
    };
    expect(snapshot.snapshotId).toBe(createBody.appliedPluginSnapshotId);
    expect(snapshot.pluginId).toBe('sample-plugin');
    expect(snapshot.query).toBe('Generate a {{topic}} brief for {{audience}}.');
    expect(snapshot.inputs).toEqual({ audience: 'general', topic: 'agentic design' });
  });

  it('emits pipeline_stage_started before agent output on a bundled plugin run', async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'od-bundled-pipeline-'));
    try {
      const fixture = path.join(tmpRoot, 'pipeline-plugin');
      await mkdir(fixture, { recursive: true });
      await writeFile(
        path.join(fixture, 'open-design.json'),
        JSON.stringify({
          $schema: 'https://open-design.ai/schemas/plugin.v1.json',
          name: 'pipeline-plugin',
          title: 'Pipeline Plugin',
          version: '1.0.0',
          description: 'fixture with a declared pipeline',
          license: 'MIT',
          od: {
            kind: 'skill',
            taskKind: 'new-generation',
            useCase: { query: 'Make a {{topic}} brief.' },
            inputs: [{ name: 'topic', type: 'string', required: true, label: 'Topic' }],
            pipeline: {
              stages: [
                { id: 'discovery', atoms: ['discovery-question-form'] },
                { id: 'plan', atoms: ['todo-write'] },
              ],
            },
            capabilities: ['prompt:inject'],
          },
        }, null, 2),
      );
      await writeFile(
        path.join(fixture, 'SKILL.md'),
        '---\nname: pipeline-plugin\ndescription: fixture with pipeline\n---\n# Pipeline\n',
      );
      await seedBundledPlugin('pipeline-plugin', fixture);

      const projectId = `pipeline-${randomUUID()}`;
      const createResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Pipeline run',
          pluginId: 'pipeline-plugin',
          pluginInputs: { topic: 'agentic design' },
        }),
      });
      expect(createResp.status).toBe(200);
      const createBody = (await createResp.json()) as { appliedPluginSnapshotId?: string };
      expect(createBody.appliedPluginSnapshotId).toBeTruthy();

      const runResp = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'missing-test-agent',
          projectId,
          pluginId: 'pipeline-plugin',
          appliedPluginSnapshotId: createBody.appliedPluginSnapshotId,
        }),
      });
      expect(runResp.status).toBe(202);
      const runBody = (await runResp.json()) as { runId: string };

      const eventsResp = await fetch(
        `${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}/events`,
        { headers: { accept: 'text/event-stream' } },
      );
      expect(eventsResp.body).toBeTruthy();
      const reader = eventsResp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstStageEvent: string | null = null;
      let messageChunkSeen = false;
      while (!firstStageEvent) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const eventLine = block.split('\n').find((line) => line.startsWith('event: '));
          if (!eventLine) continue;
          const event = eventLine.slice('event: '.length);
          if (event === 'pipeline_stage_started' && !messageChunkSeen) firstStageEvent = event;
          if (event === 'message_chunk') messageChunkSeen = true;
        }
      }
      void reader.cancel().catch(() => undefined);

      expect(firstStageEvent).toBe('pipeline_stage_started');
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
