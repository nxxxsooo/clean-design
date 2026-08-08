import { mkdtemp, readFile, chmod, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DesktopCredentialVault, type ProtectedStorageAdapter } from '../../src/main/credential-vault.js';

const roots: string[] = [];

function fakeProtectedStorage(available = true): ProtectedStorageAdapter {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, ''),
  };
}

async function fixture(available = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clean-design-vault-'));
  roots.push(root);
  const filePath = path.join(root, 'credentials', 'vault.json');
  return {
    filePath,
    vault: new DesktopCredentialVault({ filePath, protectedStorage: fakeProtectedStorage(available) }),
  };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DesktopCredentialVault', () => {
  it('atomically stores ciphertext at mode 0600 and returns only metadata', async () => {
    const { filePath, vault } = await fixture();
    const metadata = await vault.save({
      slot: 'chat:anthropic',
      kind: 'chat-provider',
      label: 'Anthropic',
      secret: 'sk-ant-secret-1234',
    });
    expect(metadata.ref).toMatch(/^credential:\/\//);
    expect(metadata.mask).toBe('****1234');
    expect(JSON.stringify(metadata)).not.toContain('sk-ant-secret');
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('sk-ant-secret-1234');
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    await expect(vault.decryptAll()).resolves.toEqual([
      expect.objectContaining({ ref: metadata.ref, secret: 'sk-ant-secret-1234' }),
    ]);
  });

  it('updates a stable slot without creating duplicate references', async () => {
    const { vault } = await fixture();
    const first = await vault.save({ slot: 'media:openai', kind: 'media-provider', label: 'OpenAI', secret: 'first-1111' });
    const second = await vault.save({ slot: 'media:openai', kind: 'media-provider', label: 'OpenAI', secret: 'second-2222' });
    expect(second.ref).toBe(first.ref);
    await expect(vault.list()).resolves.toHaveLength(1);
    await expect(vault.decryptAll()).resolves.toEqual([
      expect.objectContaining({ secret: 'second-2222' }),
    ]);
  });

  it('fails closed when protected storage or vault permissions are unsafe', async () => {
    const unavailable = await fixture(false);
    await expect(unavailable.vault.list()).rejects.toThrow(/unavailable/);

    const { filePath, vault } = await fixture();
    await vault.save({ slot: 'cli:codex:OPENAI_API_KEY', kind: 'cli-override', label: 'Codex', secret: 'secret' });
    await chmod(filePath, 0o644);
    await expect(vault.list()).rejects.toThrow(/permissions are unsafe/);
  });
});
