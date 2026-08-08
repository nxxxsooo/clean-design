import { realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function containedBy(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const SYSTEM_ROOTS = [
  '/', '/Applications', '/Library', '/System', '/Volumes', '/bin', '/etc', '/opt', '/private', '/sbin', '/usr', '/var',
];

export async function validateDesktopHandoffRoot(
  requestedRoot: string,
  options: { userDataRoot: string; homeDir?: string; systemRoots?: string[] },
): Promise<string> {
  if (!path.isAbsolute(requestedRoot)) throw new Error('handoff root must be absolute');
  const requested = path.resolve(requestedRoot);
  const canonical = await realpath(requested).catch(() => null);
  if (!canonical) throw new Error('handoff root is unavailable');
  if (canonical !== requested) throw new Error('handoff root cannot contain symlink aliases');
  if (!(await stat(canonical)).isDirectory()) throw new Error('handoff root is not a directory');

  const home = path.resolve(options.homeDir ?? os.homedir());
  if (canonical === home) throw new Error('home directory cannot be used as a handoff root');
  const blocked = [
    ...(options.systemRoots ?? SYSTEM_ROOTS),
    path.join(home, '.ssh'),
    path.join(home, '.gnupg'),
    path.join(home, '.aws'),
    path.join(home, '.config'),
    path.join(home, 'Library'),
    path.resolve(options.userDataRoot),
  ];
  for (const item of blocked) {
    const normalized = path.resolve(item);
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
