import { createHmac } from 'node:crypto';
import { chmod, mkdir, mkdtemp, realpath, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { handoffRootSigningPayload } from '@open-design/sidecar-proto';

import {
  resetTrustedHandoffRootAuthForTests,
  setAuthenticatedTrustedHandoffRoot,
  TrustedHandoffRootStore,
  validateTrustedHandoffRoot,
} from '../src/handoff/trusted-roots.js';

const roots: string[] = [];

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'clean-design-handoff-root-')));
  roots.push(root);
  const target = path.join(root, 'exports');
  const dataRoot = path.join(root, 'app-data');
  await mkdir(target);
  await mkdir(dataRoot);
  return {
    root,
    target,
    dataRoot,
    store: new TrustedHandoffRootStore(path.join(dataRoot, 'handoff-roots.json'), {
      applicationDataRoots: [dataRoot],
      homeDir: path.join(root, 'home'),
      systemRoots: [],
    }),
  };
}

afterEach(async () => {
  resetTrustedHandoffRootAuthForTests();
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('trusted handoff roots', () => {
  it('persists only an authenticated native-picker root at mode 0600', async () => {
    const { store, target, dataRoot } = await fixture();
    const secret = Buffer.alloc(32, 4);
    const unsigned = {
      projectId: 'project-1',
      root: target,
      issuedAt: new Date(1_000_000).toISOString(),
      nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGH',
    };
    const input = {
      ...unsigned,
      signature: createHmac('sha256', secret).update(handoffRootSigningPayload(unsigned)).digest('base64url'),
    };
    await expect(setAuthenticatedTrustedHandoffRoot(input, secret, store, 1_000_000)).resolves.toBe(target);
    await expect(store.get('project-1')).resolves.toBe(target);
    expect((await stat(path.join(dataRoot, 'handoff-roots.json'))).mode & 0o777).toBe(0o600);
    await expect(setAuthenticatedTrustedHandoffRoot(input, secret, store, 1_000_000)).rejects.toThrow(/already used/);
  });

  it('rejects application data, credential roots, broad home, and symlink aliases', async () => {
    const { root, target, dataRoot } = await fixture();
    const home = path.join(root, 'home');
    const ssh = path.join(home, '.ssh');
    await mkdir(ssh, { recursive: true });
    const options = { applicationDataRoots: [dataRoot], homeDir: home, systemRoots: [] };
    await expect(validateTrustedHandoffRoot(dataRoot, options)).rejects.toThrow(/protected/);
    await expect(validateTrustedHandoffRoot(home, options)).rejects.toThrow(/home directory/);
    await expect(validateTrustedHandoffRoot(ssh, options)).rejects.toThrow(/protected/);
    const alias = path.join(root, 'alias');
    await symlink(target, alias);
    await expect(validateTrustedHandoffRoot(alias, options)).rejects.toThrow(/symlink/);
  });

  it('fails closed when root metadata permissions become unsafe', async () => {
    const { store, target, dataRoot } = await fixture();
    await store.set('project-1', target);
    await chmod(path.join(dataRoot, 'handoff-roots.json'), 0o644);
    await expect(store.get('project-1')).rejects.toThrow(/unsafe permissions/);
  });
});
