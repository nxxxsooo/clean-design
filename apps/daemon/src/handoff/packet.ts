import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import {
  HANDOFF_MANIFEST_VERSION,
  type HandoffFailureCode,
  type HandoffManifestFile,
  type HandoffManifestV1,
  type HandoffPacketResponse,
  type HandoffWarning,
  type ProjectKind,
} from '@open-design/contracts';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PACKET_SOURCE_BYTES = 500 * 1024 * 1024;
const MAX_FILES = 5_000;
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'tmp', 'temp', 'logs']);
const EXCLUDED_FILES = new Set([
  'app-config.json',
  'media-config.json',
  'trusted-handoff-roots.json',
  'vault.json',
]);
const SECRET_FILES = /^(?:credentials?|secrets?|auth)(?:\.[^.]+)?$|^id_(?:rsa|ed25519)$|\.(?:pem|key|p12|pfx)$/i;
const TRANSCRIPT_FILES = /(?:^|[-_.])(?:transcript|conversation-log|chat-log)(?:[-_.]|$)/i;
const SECRET_CONTENT = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{20,}/i,
];

interface SourceEntry {
  absolutePath: string;
  relativePath: string;
  bytes: number;
  buffer: Buffer;
}

export interface HandoffPacketProject {
  id: string;
  name: string;
  metadata?: { kind?: ProjectKind; intent?: string; entryFile?: string } | null;
}

export interface HandoffRenderRequest {
  deck: boolean;
  fileName: string;
  format: 'png' | 'pdf';
  height: number;
  html: string;
  title: string;
  width: number;
}

export interface CreateHandoffPacketOptions {
  project: HandoffPacketProject;
  projectRoot: string;
  trustedRoot: string;
  render: (request: HandoffRenderRequest) => Promise<Buffer>;
  renderPptx?: (request: { fileName: string; html: string; title: string }) => Promise<Buffer>;
  now?: () => Date;
  shortId?: () => string;
}

export class HandoffPacketError extends Error {
  readonly code: HandoffFailureCode;

  constructor(code: HandoffFailureCode, message: string) {
    super(message);
    this.name = 'HandoffPacketError';
    this.code = code;
  }
}

function isContained(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 64) || 'project';
}

function timestamp(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

function isText(buffer: Buffer): boolean {
  return !buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0);
}

function assertNoSecret(relativePath: string, buffer: Buffer): void {
  const basename = path.basename(relativePath);
  if (SECRET_FILES.test(basename)) {
    throw new HandoffPacketError('secret_detected', `Secret-like file detected: ${relativePath}`);
  }
  if (!isText(buffer)) return;
  const text = buffer.toString('utf8');
  if (SECRET_CONTENT.some((pattern) => pattern.test(text))) {
    throw new HandoffPacketError('secret_detected', `Secret-like content detected in: ${relativePath}`);
  }
}

async function collectSources(projectRoot: string): Promise<SourceEntry[]> {
  const canonicalRoot = await realpath(projectRoot).catch(() => null);
  if (!canonicalRoot) throw new HandoffPacketError('write_failed', 'Project files are unavailable.');
  const collected: SourceEntry[] = [];
  let totalBytes = 0;

  const walk = async (directory: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name.toLowerCase())) continue;
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!info.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.artifact.json') || lower.endsWith('.log')) continue;
      if (EXCLUDED_FILES.has(lower) || TRANSCRIPT_FILES.test(lower)) continue;
      if (info.size > MAX_FILE_BYTES) {
        throw new HandoffPacketError('write_failed', `File exceeds handoff size limit: ${relativePath}`);
      }
      if (collected.length >= MAX_FILES) {
        throw new HandoffPacketError('write_failed', 'Project contains too many files for one handoff packet.');
      }
      const canonicalFile = await realpath(absolutePath);
      if (!isContained(canonicalFile, canonicalRoot)) {
        throw new HandoffPacketError('write_failed', `Project path escapes through a symlink: ${relativePath}`);
      }
      const buffer = await readFile(canonicalFile);
      assertNoSecret(relativePath, buffer);
      totalBytes += buffer.length;
      if (totalBytes > MAX_PACKET_SOURCE_BYTES) {
        throw new HandoffPacketError('write_failed', 'Project exceeds the handoff packet size limit.');
      }
      collected.push({ absolutePath: canonicalFile, relativePath, bytes: buffer.length, buffer });
    }
  };

  await walk(canonicalRoot, '');
  if (collected.length === 0) throw new HandoffPacketError('write_failed', 'Project has no exportable files.');
  return collected;
}

async function writeBuffer(filePath: string, buffer: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'wx', 0o644);
  try {
    await handle.writeFile(buffer);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function hashFile(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const buffer = await readFile(filePath);
  return {
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function markdownDocumentHtml(markdown: string, title: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:820px;margin:64px auto;padding:0 32px;color:#171717}pre{white-space:pre-wrap;font:inherit}</style></head><body><pre>${escaped}</pre></body></html>`;
}

function buildPrompt(input: {
  project: HandoffPacketProject;
  entryFile: string | null;
  previewPaths: string[];
  warnings: HandoffWarning[];
}): string {
  const previewList = input.previewPaths.length > 0
    ? input.previewPaths.map((file) => `- \`${file}\``).join('\n')
    : '- No rendered preview was required for this artifact type.';
  const warnings = input.warnings.length > 0
    ? `\n## Export warnings\n${input.warnings.map((warning) => `- ${warning.message}`).join('\n')}\n`
    : '';
  const primarySource = input.entryFile === 'DESIGN.md'
    ? '`DESIGN.md`'
    : input.entryFile
      ? `\`source/${input.entryFile}\``
      : 'inspect `source/`';
  return `# Implement the approved Clean Design reference

Inspect the receiving repository before changing code. Identify its framework, conventions, tests, security boundaries, data contracts, and existing behavior.

Use this packet as the approved visual and interaction reference. Adapt it to the repository's architecture rather than transplanting prototype architecture or generated scaffolding. Preserve existing behavior, security controls, persistence rules, API contracts, and accessibility unless the reference explicitly requires a compatible change.

## Packet map
- Project: ${input.project.name}
- Project kind: ${input.project.metadata?.kind ?? 'other'}
- Primary source: ${primarySource}
- Design guidance: ${input.entryFile === 'DESIGN.md' ? '`DESIGN.md`' : 'read `DESIGN.md` when present'}
- Machine-readable inventory: \`manifest.json\`

## Approved previews
${previewList}

## Required implementation workflow
1. Inspect the repository first and map the reference onto its existing routes, components, tokens, and state model.
2. Preserve behavior, security, and data contracts while implementing the approved reference.
3. Rebuild interactions and responsive states as native production behavior; do not ship prototype-only controls or annotations.
4. Run the repository's native checks and tests.
5. Compare the result against the recorded desktop viewport (1440x900) and mobile viewport (390x844) when those previews are present.
6. Report meaningful differences, test gaps, and any intentionally deferred behavior.
${warnings}`;
}

function primaryMedia(entries: SourceEntry[], kind: ProjectKind): SourceEntry | null {
  const patterns: Partial<Record<ProjectKind, RegExp>> = {
    image: /\.(?:png|jpe?g|webp|gif|avif)$/i,
    video: /\.(?:mp4|mov|webm|m4v)$/i,
    audio: /\.(?:mp3|wav|m4a|aac|flac|ogg)$/i,
  };
  const pattern = patterns[kind];
  return pattern ? entries.find((entry) => pattern.test(entry.relativePath)) ?? null : null;
}

async function allocatePacketPath(
  projectDirectory: string,
  baseName: string,
): Promise<{ staging: string; final: string; packetName: string }> {
  for (let suffix = 1; suffix <= 1_000; suffix += 1) {
    const packetName = suffix === 1 ? baseName : `${baseName}-${suffix}`;
    const final = path.join(projectDirectory, packetName);
    try {
      await lstat(final);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const staging = path.join(projectDirectory, `.${packetName}.tmp-${randomUUID()}`);
    return { staging, final, packetName };
  }
  throw new HandoffPacketError('write_failed', 'Could not allocate an immutable handoff packet path.');
}

export async function createHandoffPacket(
  options: CreateHandoffPacketOptions,
): Promise<Extract<HandoffPacketResponse, { ok: true }>> {
  const projectRoot = await realpath(options.projectRoot).catch(() => null);
  const trustedRoot = await realpath(options.trustedRoot).catch(() => null);
  if (!projectRoot || !trustedRoot) throw new HandoffPacketError('root_unavailable', 'The trusted handoff root is unavailable.');
  if (isContained(trustedRoot, projectRoot) || isContained(projectRoot, trustedRoot)) {
    throw new HandoffPacketError('root_unavailable', 'The handoff root must be outside the project and application data.');
  }
  const rootInfo = await stat(trustedRoot);
  if (!rootInfo.isDirectory()) throw new HandoffPacketError('root_unavailable', 'The trusted handoff root is not a directory.');

  const createdAt = (options.now ?? (() => new Date()))();
  const shortId = (options.shortId ?? (() => randomUUID().replace(/-/g, '').slice(0, 8)))();
  const slug = slugify(options.project.name);
  const projectDirectory = path.join(trustedRoot, slug);
  await mkdir(projectDirectory, { recursive: true });
  const canonicalProjectDirectory = await realpath(projectDirectory);
  if (!isContained(canonicalProjectDirectory, trustedRoot)) {
    throw new HandoffPacketError('root_unavailable', 'The project handoff directory escapes its trusted root.');
  }
  const allocated = await allocatePacketPath(
    canonicalProjectDirectory,
    `${timestamp(createdAt)}-${shortId}`,
  );
  const warnings: HandoffWarning[] = [];
  const files: HandoffManifestFile[] = [];
  const previewPaths: string[] = [];

  try {
    await mkdir(allocated.staging, { mode: 0o700 });
    const sources = await collectSources(projectRoot);
    for (const source of sources) {
      const packetPath = source.relativePath.toLowerCase() === 'design.md'
        ? 'DESIGN.md'
        : path.posix.join('source', source.relativePath);
      const target = path.join(allocated.staging, ...packetPath.split('/'));
      await writeBuffer(target, source.buffer);
      const digest = await hashFile(target);
      files.push({ path: packetPath, ...digest, role: packetPath === 'DESIGN.md' ? 'design' : 'source' });
    }

    const kind = options.project.metadata?.kind ?? 'other';
    const intent = options.project.metadata?.intent;
    const design = sources.find((entry) => entry.relativePath.toLowerCase() === 'design.md') ?? null;
    const html = sources.find((entry) => entry.relativePath === options.project.metadata?.entryFile)
      ?? sources.find((entry) => /\.html?$/i.test(entry.relativePath))
      ?? null;
    const entryFile = html?.relativePath ?? design?.relativePath ?? sources[0]?.relativePath ?? null;

    const renderRequired = async (packetPath: string, request: HandoffRenderRequest): Promise<void> => {
      try {
        const output = await options.render(request);
        if (!output.length) throw new Error('renderer returned an empty file');
        const target = path.join(allocated.staging, ...packetPath.split('/'));
        await writeBuffer(target, output);
        const digest = await hashFile(target);
        files.push({ path: packetPath, ...digest, role: 'preview' });
        previewPaths.push(packetPath);
      } catch (error) {
        throw new HandoffPacketError(
          'render_failed',
          `Required preview failed (${packetPath}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    if (kind === 'deck') {
      if (!html) throw new HandoffPacketError('render_failed', 'Deck handoff requires an HTML deck artifact.');
      const source = html.buffer.toString('utf8');
      await renderRequired('previews/deck.pdf', { deck: true, fileName: html.relativePath, format: 'pdf', height: 1080, html: source, title: options.project.name, width: 1920 });
      await renderRequired('previews/cover.png', { deck: true, fileName: html.relativePath, format: 'png', height: 1080, html: source, title: options.project.name, width: 1920 });
      if (options.renderPptx) {
        try {
          const pptx = await options.renderPptx({ fileName: html.relativePath, html: source, title: options.project.name });
          if (!pptx.length) throw new Error('renderer returned an empty PPTX');
          const target = path.join(allocated.staging, 'previews', 'deck.pptx');
          await writeBuffer(target, pptx);
          files.push({ path: 'previews/deck.pptx', ...(await hashFile(target)), role: 'preview' });
          previewPaths.push('previews/deck.pptx');
        } catch (error) {
          warnings.push({ code: 'pptx_failed', message: `Optional PPTX export failed: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
    } else if (intent === 'document') {
      const documentSource = html?.buffer.toString('utf8')
        ?? (design ? markdownDocumentHtml(design.buffer.toString('utf8'), options.project.name) : null)
        ?? (() => {
          const markdown = sources.find((entry) => /\.md$/i.test(entry.relativePath));
          return markdown ? markdownDocumentHtml(markdown.buffer.toString('utf8'), options.project.name) : null;
        })();
      if (!documentSource) throw new HandoffPacketError('render_failed', 'Document handoff requires an HTML or Markdown artifact.');
      await renderRequired('previews/document.pdf', { deck: false, fileName: html?.relativePath ?? entryFile ?? 'document.md', format: 'pdf', height: 1100, html: documentSource, title: options.project.name, width: 850 });
    } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
      const media = primaryMedia(sources, kind);
      if (!media) throw new HandoffPacketError('render_failed', `${kind} handoff requires a primary ${kind} artifact.`);
      const extension = path.extname(media.relativePath).toLowerCase();
      const packetPath = `previews/primary${extension}`;
      const target = path.join(allocated.staging, 'previews', `primary${extension}`);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(media.absolutePath, target);
      files.push({ path: packetPath, ...(await hashFile(target)), role: 'preview' });
      previewPaths.push(packetPath);
    } else if (kind === 'brand') {
      if (!design) throw new HandoffPacketError('render_failed', 'Brand handoff requires DESIGN.md.');
      const source = html?.buffer.toString('utf8')
        ?? markdownDocumentHtml(design.buffer.toString('utf8'), options.project.name);
      await renderRequired('previews/brand.png', { deck: false, fileName: html?.relativePath ?? 'DESIGN.md', format: 'png', height: 900, html: source, title: options.project.name, width: 1440 });
    } else if (html) {
      const source = html.buffer.toString('utf8');
      await renderRequired('previews/desktop.png', { deck: false, fileName: html.relativePath, format: 'png', height: 900, html: source, title: options.project.name, width: 1440 });
      await renderRequired('previews/mobile.png', { deck: false, fileName: html.relativePath, format: 'png', height: 844, html: source, title: options.project.name, width: 390 });
    }

    const prompt = buildPrompt({ project: options.project, entryFile, previewPaths, warnings });
    const handoffPath = path.join(allocated.staging, 'HANDOFF.md');
    await writeBuffer(handoffPath, Buffer.from(prompt, 'utf8'));
    files.push({ path: 'HANDOFF.md', ...(await hashFile(handoffPath)), role: 'handoff' });
    files.sort((a, b) => a.path.localeCompare(b.path));
    const manifest: HandoffManifestV1 = {
      schemaVersion: HANDOFF_MANIFEST_VERSION,
      packetId: allocated.packetName,
      createdAt: createdAt.toISOString(),
      project: {
        id: options.project.id,
        name: options.project.name,
        slug,
        kind,
        ...(intent ? { intent } : {}),
      },
      viewports: previewPaths.some((file) => /(?:desktop|mobile)\.png$/.test(file))
        ? [
            { name: 'desktop', width: 1440, height: 900 },
            { name: 'mobile', width: 390, height: 844 },
          ]
        : [],
      files,
      warnings,
    };
    await writeBuffer(
      path.join(allocated.staging, 'manifest.json'),
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    );
    const directoryHandle = await open(allocated.staging, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    await rename(allocated.staging, allocated.final);
    return { ok: true, packetPath: allocated.final, prompt, manifest, warnings };
  } catch (error) {
    await rm(allocated.staging, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof HandoffPacketError) throw error;
    throw new HandoffPacketError('write_failed', error instanceof Error ? error.message : String(error));
  }
}
