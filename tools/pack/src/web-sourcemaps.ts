import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ToolPackConfig } from './config.js';

export interface WebSourcemapOptions {
  releaseVersion?: string;
}

async function findMapFiles(dir: string): Promise<string[]> {
  const maps: string[] = [];
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      if (entry.isFile() && entry.name.endsWith('.map')) maps.push(entryPath);
    }
  }
  return maps;
}

export async function processWebSourcemaps(
  config: ToolPackConfig,
  _options: WebSourcemapOptions = {},
): Promise<void> {
  const chunksDir = join(config.workspaceRoot, 'apps', 'web', '.next', 'static');
  if (!existsSync(chunksDir)) return;
  const maps = await findMapFiles(chunksDir);
  for (const mapPath of maps) await rm(mapPath, { force: true });
}
