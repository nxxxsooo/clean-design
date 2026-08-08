import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  handoffRootSigningPayload,
  type SetHandoffRootInput,
} from '@open-design/sidecar-proto';

interface TrustedRootDocument {
  version: 1;
  projects: Record<string, { root: string; updatedAt: string }>;
}

export interface TrustedRootValidationOptions {
  applicationDataRoots: string[];
  homeDir?: string;
  systemRoots?: string[];
}

const DEFAULT_SYSTEM_ROOTS = [
  '/',
  '/Applications',
  '/Library',
  '/System',
  '/Volumes',
  '/bin',
  '/etc',
  '/opt',
  '/private',
  '/sbin',
  '/usr',
  '/var',
];

function containedBy(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function equalStringTimingSafe(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function validateTrustedHandoffRoot(
  requestedRoot: string,
  options: TrustedRootValidationOptions,
): Promise<string> {
  if (typeof requestedRoot !== 'string' || !path.isAbsolute(requestedRoot)) {
    throw new Error('handoff root must be an absolute directory');
  }
  const requested = path.resolve(requestedRoot);
  const canonical = await realpath(requested).catch(() => null);
  if (!canonical) throw new Error('handoff root is unavailable');
  if (canonical !== requested) throw new Error('handoff root cannot contain symlink aliases');
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new Error('handoff root is not a directory');

  const home = path.resolve(options.homeDir ?? os.homedir());
  if (canonical === home) throw new Error('home directory cannot be used as a handoff root');
  const credentialRoots = ['.ssh', '.gnupg', '.aws', '.config', 'Library'].map((name) => path.join(home, name));
  const systemRoots = options.systemRoots ?? DEFAULT_SYSTEM_ROOTS;
  for (const blocked of [...systemRoots, ...credentialRoots, ...options.applicationDataRoots]) {
    const normalized = path.resolve(blocked);
    const isFilesystemRoot = normalized === path.parse(normalized).root;
    if (
      (isFilesystemRoot ? canonical === normalized : containedBy(canonical, normalized))
      || containedBy(normalized, canonical)
    ) {
      throw new Error('handoff root overlaps a protected system or application-data directory');
    }
  }
  if (canonical.split(path.sep).some((segment) => segment.startsWith('.'))) {
    throw new Error('hidden directories cannot be used as a handoff root');
  }
  return canonical;
}

export class TrustedHandoffRootStore {
  private readonly filePath: string;
  private readonly validation: TrustedRootValidationOptions;

  constructor(filePath: string, validation: TrustedRootValidationOptions) {
    this.filePath = path.resolve(filePath);
    this.validation = validation;
  }

  async get(projectId: string): Promise<string | null> {
    const root = (await this.read()).projects[projectId]?.root;
    if (!root) return null;
    return await validateTrustedHandoffRoot(root, this.validation);
  }

  async set(projectId: string, requestedRoot: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(projectId)) throw new Error('project id is invalid');
    const root = await validateTrustedHandoffRoot(requestedRoot, this.validation);
    const document = await this.read();
    document.projects[projectId] = { root, updatedAt: new Date().toISOString() };
    await this.write(document);
    return root;
  }

  private async read(): Promise<TrustedRootDocument> {
    try {
      const info = await stat(this.filePath);
      if (!info.isFile() || (info.mode & 0o077) !== 0) {
        throw new Error('trusted handoff root metadata has unsafe permissions');
      }
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<TrustedRootDocument>;
      if (parsed.version !== 1 || !parsed.projects || typeof parsed.projects !== 'object') {
        throw new Error('trusted handoff root metadata is invalid');
      }
      return parsed as TrustedRootDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, projects: {} };
      throw error;
    }
  }

  private async write(document: TrustedRootDocument): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await chmod(temporary, 0o600);
      await rename(temporary, this.filePath);
      await chmod(this.filePath, 0o600);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}

const consumedRootNonces = new Map<string, number>();
const ROOT_AUTH_WINDOW_MS = 60_000;

export async function setAuthenticatedTrustedHandoffRoot(
  input: SetHandoffRootInput,
  desktopAuthSecret: Buffer,
  store: TrustedHandoffRootStore,
  now = Date.now(),
): Promise<string> {
  const issuedAt = Date.parse(input.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > ROOT_AUTH_WINDOW_MS) {
    throw new Error('handoff root authorization timestamp is invalid');
  }
  for (const [nonce, expiry] of consumedRootNonces) {
    if (expiry <= now) consumedRootNonces.delete(nonce);
  }
  if (consumedRootNonces.has(input.nonce)) throw new Error('handoff root authorization was already used');
  const expected = createHmac('sha256', desktopAuthSecret)
    .update(handoffRootSigningPayload(input))
    .digest('base64url');
  if (!equalStringTimingSafe(expected, input.signature)) {
    throw new Error('handoff root authorization signature is invalid');
  }
  const root = await store.set(input.projectId, input.root);
  consumedRootNonces.set(input.nonce, now + ROOT_AUTH_WINDOW_MS);
  return root;
}

export function resetTrustedHandoffRootAuthForTests(): void {
  consumedRootNonces.clear();
}
