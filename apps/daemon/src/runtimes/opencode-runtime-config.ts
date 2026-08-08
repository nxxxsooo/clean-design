import path from 'node:path';
import { realpathSync } from 'node:fs';

function normalizedVariants(directory: string): string[] {
  const normalized = path.resolve(directory).replace(/[\\/]+$/, '') || path.parse(directory).root;
  try {
    const real = realpathSync.native(directory).replace(/[\\/]+$/, '') || path.parse(directory).root;
    return real !== normalized ? [normalized, real] : [normalized];
  } catch {
    return [normalized];
  }
}

export function buildOpenCodeRuntimeConfigContent(
  extraConfig: Record<string, unknown>,
  allowedDirectories: string[],
): string | null {
  const allowlist: Record<string, 'allow'> = {};
  for (const directory of allowedDirectories) {
    if (!path.isAbsolute(directory)) continue;
    for (const normalized of normalizedVariants(directory)) {
      allowlist[normalized] = 'allow';
      allowlist[path.join(normalized, '*')] = 'allow';
      allowlist[path.join(normalized, '**')] = 'allow';
    }
  }

  if (Object.keys(extraConfig).length === 0 && Object.keys(allowlist).length === 0) return null;
  const priorPermission =
    extraConfig.permission && typeof extraConfig.permission === 'object' && !Array.isArray(extraConfig.permission)
      ? extraConfig.permission as Record<string, unknown>
      : {};
  return JSON.stringify({
    ...extraConfig,
    ...(Object.keys(allowlist).length > 0
      ? { permission: { ...priorPermission, external_directory: allowlist } }
      : {}),
  });
}
