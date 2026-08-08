import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import { buildDeckRenderInput } from '../deck-export.js';
import { buildDesktopArtifactExportInput } from '../pdf-export.js';
import { resolveProjectDir } from '../projects.js';
import { createHandoffPacket, HandoffPacketError } from '../handoff/packet.js';

export interface RegisterHandoffRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'validation' | 'handoff'> {}

function packetFailure(res: any, status: number, code: HandoffPacketError['code'], message: string) {
  return res.status(status).json({ ok: false, code, message });
}

export function registerHandoffRoutes(app: Express, ctx: RegisterHandoffRoutesDeps) {
  const { db } = ctx;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { isSafeId } = ctx.validation;
  const {
    trustedRootStore,
    daemonUrlRef,
    desktopArtifactExporter,
    desktopSlideRenderer,
  } = ctx.handoff;

  app.get('/api/projects/:id/handoff-root', async (req, res) => {
    if (!isSafeId(req.params.id)) return packetFailure(res, 400, 'write_failed', 'Invalid project id.');
    if (!getProject(db, req.params.id)) return packetFailure(res, 404, 'write_failed', 'Project not found.');
    try {
      const root = await trustedRootStore.get(req.params.id);
      return res.json({
        configured: Boolean(root),
        ...(root ? { displayName: path.basename(root) || root } : {}),
      });
    } catch (error) {
      return packetFailure(
        res,
        409,
        'root_unavailable',
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  app.post('/api/projects/:id/handoff-packet', async (req, res) => {
    if (!isSafeId(req.params.id)) return packetFailure(res, 400, 'write_failed', 'Invalid project id.');
    const project = getProject(db, req.params.id);
    if (!project) return packetFailure(res, 404, 'write_failed', 'Project not found.');

    let trustedRoot: string | null;
    try {
      trustedRoot = await trustedRootStore.get(req.params.id);
    } catch (error) {
      return packetFailure(
        res,
        409,
        'root_unavailable',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!trustedRoot) {
      return packetFailure(res, 409, 'root_required', 'Choose a handoff folder before exporting.');
    }

    const metadata = project.metadata ?? null;
    const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, metadata);
    const render = async (request: {
      deck: boolean;
      fileName: string;
      format: 'png' | 'pdf';
      height: number;
      html: string;
      title: string;
      width: number;
    }): Promise<Buffer> => {
      if (typeof desktopArtifactExporter !== 'function') {
        throw new Error('desktop renderer is unavailable');
      }
      const input = await buildDesktopArtifactExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: request.deck,
        fileName: request.fileName,
        format: request.format === 'pdf' ? 'pdf' : 'image',
        ...(request.format === 'png' ? { imageFormat: 'png' as const } : {}),
        metadata,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        sourceHtml: request.html,
        title: request.title,
        width: request.width,
        height: request.height,
      });
      const result = await desktopArtifactExporter(input);
      if (!result.ok || !result.path) throw new Error(result.error || 'desktop renderer returned no file');
      try {
        return await readFile(result.path);
      } finally {
        await rm(path.dirname(result.path), { recursive: true, force: true }).catch(() => undefined);
      }
    };

    const renderPptx = async (request: { fileName: string; html: string; title: string }): Promise<Buffer> => {
      if (typeof desktopSlideRenderer !== 'function') throw new Error('desktop slide renderer is unavailable');
      const outputDir = path.join(RUNTIME_DATA_DIR, 'handoff-render', randomUUID());
      await mkdir(outputDir, { recursive: true });
      try {
        const built = await buildDeckRenderInput({
          daemonUrl: daemonUrlRef.current,
          deck: true,
          editable: true,
          fileName: request.fileName,
          metadata,
          outputDir,
          projectId: req.params.id,
          projectsRoot: PROJECTS_DIR,
          sourceHtml: request.html,
          title: request.title,
        });
        const rendered = await desktopSlideRenderer(built.input);
        if (!rendered.ok || !rendered.pptxFile) throw new Error(rendered.error || 'desktop renderer returned no PPTX');
        const canonicalDir = await realpath(outputDir);
        const canonicalPptx = await realpath(rendered.pptxFile);
        const relative = path.relative(canonicalDir, canonicalPptx);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new Error('desktop renderer returned a PPTX outside its scratch directory');
        }
        return await readFile(canonicalPptx);
      } finally {
        await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
      }
    };

    try {
      const result = await createHandoffPacket({
        project: {
          id: project.id,
          name: project.name,
          metadata,
        },
        projectRoot,
        trustedRoot,
        render,
        renderPptx,
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof HandoffPacketError) {
        const status = error.code === 'secret_detected' ? 422 : error.code.startsWith('root_') ? 409 : 500;
        return packetFailure(res, status, error.code, error.message);
      }
      return packetFailure(
        res,
        500,
        'write_failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
