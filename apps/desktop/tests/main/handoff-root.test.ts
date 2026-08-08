import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateDesktopHandoffRoot } from '../../src/main/handoff-root.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('desktop handoff root selection', () => {
  it('accepts a canonical external directory and rejects app data or aliases', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'clean-design-desktop-root-')));
    roots.push(root);
    const home = path.join(root, 'home');
    const exportRoot = path.join(home, 'Documents', 'handoffs');
    const userData = path.join(home, 'Library', 'Application Support', 'Clean Design');
    await mkdir(exportRoot, { recursive: true });
    await mkdir(userData, { recursive: true });
    const options = { homeDir: home, userDataRoot: userData, systemRoots: [] };
    await expect(validateDesktopHandoffRoot(exportRoot, options)).resolves.toBe(exportRoot);
    await expect(validateDesktopHandoffRoot(userData, options)).rejects.toThrow(/protected/);
    const alias = path.join(home, 'Documents', 'alias');
    await symlink(exportRoot, alias);
    await expect(validateDesktopHandoffRoot(alias, options)).rejects.toThrow(/symlink/);
  });
});
