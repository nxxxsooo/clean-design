import type { Express, RequestHandler } from 'express';
import type {
  InstalledPluginRecord,
  PluginDuplicateProjectRequest,
  PluginDuplicateProjectResponse,
  Project,
  ProjectMetadata,
} from '@open-design/contracts';
import {
  duplicatePluginExampleIntoProject,
  PluginDuplicateProjectError,
} from '../../plugins/duplicate-project.js';

interface SqliteRowId {
  id: string;
}

interface SqliteDbLike {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

interface InstalledPluginLike {
  id?: string;
  sourceKind?: string;
  title?: string;
  manifest?: Record<string, unknown>;
  fsPath?: string;
  capabilitiesGranted?: string[];
  appliedPlugin?: { capabilitiesGranted?: string[]; [key: string]: unknown };
  assistantMessageId?: string;
  [key: string]: unknown;
}

interface AppliedPluginSnapshotLike {
  snapshotId: string;
  pluginId: string;
  [key: string]: unknown;
}

interface MissingInputErrorLike extends Error {
  fields: string[];
}

interface PluginApplyResult {
  result: {
    capabilitiesGranted: string[];
    appliedPlugin: { capabilitiesGranted: string[]; [key: string]: unknown };
    [key: string]: unknown;
  };
  warnings: unknown[];
  manifestSourceDigest?: string;
}

interface PluginRouteHelpers {
  PLUGIN_PREVIEWS_DIR: string;
  applyBakedPreviews(plugins: InstalledPluginLike[], previewsDir: string): unknown;
  assembleExample(templateHtml: string, slidesHtml: string, title: string): string;
  loadPluginRegistryView(): Promise<unknown>;
  requireLocalDaemonRequest: RequestHandler;
}

export interface RegisterPluginRoutesDeps {
  db: SqliteDbLike;
  paths: { PROJECTS_DIR: string };
  ids: { randomId(): string };
  projectStore: {
    insertProject(db: SqliteDbLike, project: unknown): Project | null;
    getProject(db: SqliteDbLike, id: string): Project | null;
    dbDeleteProject(db: SqliteDbLike, id: string): unknown;
    removeProjectDir(projectsRoot: string, projectId: string): Promise<unknown>;
  };
  conversations: {
    insertConversation(db: SqliteDbLike, conversation: unknown): unknown;
  };
  plugins: {
    listInstalledPlugins: (db: SqliteDbLike) => InstalledPluginLike[];
    getInstalledPlugin: (db: SqliteDbLike, id: string) => InstalledPluginLike | null;
    applyPlugin: (args: unknown) => PluginApplyResult;
    getSnapshot: (db: SqliteDbLike, id: string) => AppliedPluginSnapshotLike | null;
    pruneExpiredSnapshots: (db: SqliteDbLike, opts?: { before?: number }) => { removed: number; ids: string[] };
    MissingInputError: new (...args: unknown[]) => MissingInputErrorLike;
    pluginPromptBlock: (snap: AppliedPluginSnapshotLike) => string;
  };
  helpers: PluginRouteHelpers;
}

export function registerPluginRoutes(app: Express, deps: RegisterPluginRoutesDeps): void {
  const { db, paths, ids, projectStore, conversations, plugins, helpers } = deps;
  const getBundledPlugin = (id: string): InstalledPluginLike | null => {
    const plugin = plugins.getInstalledPlugin(db, id);
    return plugin?.sourceKind === 'bundled' ? plugin : null;
  };
  const getBundledSnapshot = (id: string): AppliedPluginSnapshotLike | null => {
    const snapshot = plugins.getSnapshot(db, id);
    return snapshot && getBundledPlugin(snapshot.pluginId) ? snapshot : null;
  };

  app.get('/api/plugins', async (_req, res) => {
    try {
      const bundled = plugins.listInstalledPlugins(db).filter((plugin) => plugin.sourceKind === 'bundled');
      res.json({ plugins: helpers.applyBakedPreviews(bundled, helpers.PLUGIN_PREVIEWS_DIR) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.get('/api/plugins/:id', async (req, res) => {
    try {
      const plugin = getBundledPlugin(req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      res.json(plugin);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.post('/api/plugins/:id/apply', async (req, res) => {
    try {
      const plugin = getBundledPlugin(req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
      const inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {};
      const locale = typeof body.locale === 'string' ? body.locale : undefined;
      const registry = await helpers.loadPluginRegistryView();
      const computed = plugins.applyPlugin({ plugin, inputs, registry, locale });
      res.json({ ok: true, ...computed.result, warnings: computed.warnings, manifestSourceDigest: computed.manifestSourceDigest });
    } catch (err: unknown) {
      if (err instanceof plugins.MissingInputError) return res.status(422).json({ error: 'missing_inputs', fields: err.fields });
      res.status(500).json({ error: String(err) });
    }
  });
  app.post('/api/plugins/:id/duplicate-project', helpers.requireLocalDaemonRequest, async (req, res) => {
    let cleanupProjectId: string | null = null;
    let insertedProject = false;
    try {
      const pluginId = Array.isArray(req.params.id) ? req.params.id[0] ?? '' : req.params.id ?? '';
      const plugin = getBundledPlugin(pluginId);
      if (!plugin) return res.status(404).json({ error: { code: 'plugin-not-found', message: 'plugin not found' } });
      if (typeof plugin.id !== 'string' || typeof plugin.fsPath !== 'string') {
        return res.status(422).json({ error: { code: 'plugin-not-duplicable', message: 'plugin record is missing a filesystem source' } });
      }
      const body = req.body && typeof req.body === 'object'
        ? req.body as PluginDuplicateProjectRequest
        : {};
      const projectName = typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim().slice(0, 120)
        : `${plugin.title || plugin.id}`;
      const now = Date.now();
      const projectId = ids.randomId();
      const conversationId = ids.randomId();
      cleanupProjectId = projectId;
      const metadata: ProjectMetadata = {
        kind: 'prototype',
        templateId: `plugin:${plugin.id}`,
        templateLabel: plugin.title || plugin.id,
        duplicatedFromPluginId: plugin.id,
        skipDiscoveryBrief: true,
      };
      const duplicate = await duplicatePluginExampleIntoProject({
        plugin: plugin as InstalledPluginRecord,
        projectsRoot: paths.PROJECTS_DIR,
        projectId,
        metadata,
        assembleExample: helpers.assembleExample,
      });
      metadata.duplicatedFromPluginEntry = duplicate.sourceEntry;
      metadata.entryFile = duplicate.relPath;
      const project = projectStore.insertProject(db, {
        id: projectId,
        name: projectName,
        skillId: null,
        designSystemId: null,
        pendingPrompt: null,
        metadata,
        createdAt: now,
        updatedAt: now,
      });
      insertedProject = true;
      conversations.insertConversation(db, {
        id: conversationId,
        projectId,
        title: null,
        createdAt: now,
        updatedAt: now,
      });
      const loadedProject = projectStore.getProject(db, projectId) ?? project;
      if (!loadedProject) {
        throw new PluginDuplicateProjectError(
          500,
          'project-load-failed',
          'created project could not be loaded',
        );
      }
      const response: PluginDuplicateProjectResponse = {
        ok: true,
        projectId,
        conversationId,
        relPath: duplicate.relPath,
        project: loadedProject,
        sourcePluginId: plugin.id,
        sourceEntry: duplicate.sourceEntry,
        copiedFiles: duplicate.copiedFiles,
        skippedFiles: duplicate.skippedFiles,
        warnings: duplicate.warnings,
      };
      res.status(201).json(response);
    } catch (err: unknown) {
      if (cleanupProjectId) {
        if (insertedProject) projectStore.dbDeleteProject(db, cleanupProjectId);
        await projectStore.removeProjectDir(paths.PROJECTS_DIR, cleanupProjectId).catch(() => {});
      }
      if (err instanceof PluginDuplicateProjectError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      res.status(500).json({ error: { code: 'plugin-duplicate-failed', message: err instanceof Error ? err.message : String(err) } });
    }
  });
  app.get('/api/applied-plugins/:snapshotId', (req, res) => { try { const snap = getBundledSnapshot(req.params.snapshotId); if (!snap) return res.status(404).json({ error: 'snapshot not found' }); res.json(snap); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/applied-plugins/:snapshotId/canon', (req, res) => { try { const snap = getBundledSnapshot(req.params.snapshotId); if (!snap) return res.status(404).json({ error: 'snapshot not found' }); const block = plugins.pluginPromptBlock(snap); const accepts = String(req.headers.accept ?? '').toLowerCase(); if (accepts.includes('text/plain')) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.send(block); return; } res.json({ snapshotId: snap.snapshotId, pluginId: snap.pluginId, block }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/applied-plugins', (_req, res) => { try { const rows = db.prepare(`SELECT id FROM applied_plugin_snapshots ORDER BY applied_at DESC LIMIT 500`).all() as SqliteRowId[]; res.json({ snapshots: rows.map((r) => getBundledSnapshot(r.id)).filter((x): x is AppliedPluginSnapshotLike => x !== null) }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/projects/:projectId/applied-plugins', (req, res) => { try { const rows = db.prepare(`SELECT id FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC`).all(req.params.projectId) as SqliteRowId[]; res.json({ snapshots: rows.map((r) => getBundledSnapshot(r.id)).filter((x): x is AppliedPluginSnapshotLike => x !== null) }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/applied-plugins/prune', async (req, res) => { try { const body = req.body && typeof req.body === 'object' ? req.body : {}; const before = typeof body.before === 'number' ? body.before : undefined; const result = plugins.pruneExpiredSnapshots(db, before ? { before } : {}); if (result.removed > 0) { try { const { recordPluginEvent } = await import('../../plugins/events.js'); recordPluginEvent({ kind: 'plugin.snapshot-pruned', pluginId: '', details: { removed: result.removed, ...(before ? { before } : {}) } }); } catch {} } res.json({ ok: true, removed: result.removed, ids: result.ids }); } catch (err) { res.status(500).json({ error: String(err) }); } });
}
