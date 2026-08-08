import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

import {
  CREDENTIAL_REFERENCE_PREFIX,
  isCredentialReference,
  maskCredential,
  type CredentialMetadata,
  type RegisteredCredential,
  type SaveCredentialRequest,
} from '@open-design/contracts';

export interface ProtectedStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface VaultRecord extends CredentialMetadata {
  ciphertext: string;
  createdAt: string;
}

interface VaultDocument {
  version: 1;
  records: VaultRecord[];
}

export interface DesktopCredentialVaultOptions {
  filePath: string;
  protectedStorage: ProtectedStorageAdapter;
  now?: () => Date;
}

function emptyVault(): VaultDocument {
  return { version: 1, records: [] };
}

function validateSaveRequest(input: SaveCredentialRequest): SaveCredentialRequest {
  const slot = input.slot.trim();
  const label = input.label.trim();
  const secret = input.secret.trim();
  if (!/^[A-Za-z0-9._:/-]{1,240}$/.test(slot)) throw new Error('credential slot is invalid');
  if (!label || label.length > 160) throw new Error('credential label is invalid');
  if (!secret || secret.length > 64 * 1024) throw new Error('credential secret is invalid');
  if (!['chat-provider', 'media-provider', 'cli-override'].includes(input.kind)) {
    throw new Error('credential kind is invalid');
  }
  return { ...input, slot, label, secret };
}

function referenceForSlot(slot: string): string {
  const id = createHash('sha256').update(slot).digest('base64url').slice(0, 32);
  return `${CREDENTIAL_REFERENCE_PREFIX}${id}`;
}

function publicMetadata(record: VaultRecord): CredentialMetadata {
  return {
    ref: record.ref,
    slot: record.slot,
    kind: record.kind,
    label: record.label,
    mask: record.mask,
    updatedAt: record.updatedAt,
  };
}

export class DesktopCredentialVault {
  private readonly filePath: string;
  private readonly protectedStorage: ProtectedStorageAdapter;
  private readonly now: () => Date;

  constructor(options: DesktopCredentialVaultOptions) {
    this.filePath = path.resolve(options.filePath);
    this.protectedStorage = options.protectedStorage;
    this.now = options.now ?? (() => new Date());
  }

  isAvailable(): boolean {
    return this.protectedStorage.isEncryptionAvailable();
  }

  async list(): Promise<CredentialMetadata[]> {
    const document = await this.readDocument();
    return document.records.map(publicMetadata);
  }

  async save(raw: SaveCredentialRequest): Promise<CredentialMetadata> {
    this.requireAvailable();
    const input = validateSaveRequest(raw);
    const document = await this.readDocument();
    const now = this.now().toISOString();
    const ref = referenceForSlot(input.slot);
    const existing = document.records.find((record) => record.ref === ref);
    const record: VaultRecord = {
      ref,
      slot: input.slot,
      kind: input.kind,
      label: input.label,
      mask: maskCredential(input.secret),
      ciphertext: this.protectedStorage.encryptString(input.secret).toString('base64'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    document.records = [
      ...document.records.filter((candidate) => candidate.ref !== ref),
      record,
    ].sort((a, b) => a.slot.localeCompare(b.slot));
    await this.writeDocument(document);
    return publicMetadata(record);
  }

  async delete(ref: string): Promise<boolean> {
    if (!isCredentialReference(ref)) throw new Error('credential reference is invalid');
    const document = await this.readDocument();
    const next = document.records.filter((record) => record.ref !== ref);
    if (next.length === document.records.length) return false;
    document.records = next;
    await this.writeDocument(document);
    return true;
  }

  async decryptAll(): Promise<RegisteredCredential[]> {
    this.requireAvailable();
    const document = await this.readDocument();
    return document.records.map((record) => ({
      ...publicMetadata(record),
      secret: this.protectedStorage.decryptString(Buffer.from(record.ciphertext, 'base64')),
    }));
  }

  private requireAvailable(): void {
    if (!this.isAvailable()) throw new Error('protected credential storage is unavailable');
  }

  private async readDocument(): Promise<VaultDocument> {
    this.requireAvailable();
    try {
      const info = await stat(this.filePath);
      if (!info.isFile()) throw new Error('credential vault is not a regular file');
      if ((info.mode & 0o077) !== 0) throw new Error('credential vault permissions are unsafe');
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<VaultDocument>;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
        throw new Error('credential vault format is invalid');
      }
      for (const record of parsed.records) {
        if (!record || !isCredentialReference(record.ref) || typeof record.ciphertext !== 'string') {
          throw new Error('credential vault record is invalid');
        }
      }
      return parsed as VaultDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyVault();
      throw error;
    }
  }

  private async writeDocument(document: VaultDocument): Promise<void> {
    this.requireAvailable();
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporaryPath = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.filePath);
      await chmod(this.filePath, 0o600);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
