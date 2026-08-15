import { claudeAgentDef } from './defs/claude.js';
import { codexAgentDef } from './defs/codex.js';
import { opencodeAgentDef } from './defs/opencode.js';
import { byokOpenCodeAgentDef } from './defs/byok-opencode.js';
import { piAgentDef } from './defs/pi.js';
import { antigravityAgentDef } from './defs/antigravity.js';
import { readLocalAgentProfileDefs as readLocalAgentProfileDefsFromFile } from './local-profiles.js';
import type { RuntimeAgentDef } from './types.js';

export const PUBLIC_CLI_AGENT_DEFS: RuntimeAgentDef[] = [
  claudeAgentDef,
  codexAgentDef,
  opencodeAgentDef,
  piAgentDef,
  antigravityAgentDef,
];

export const BUILT_IN_AGENT_DEFS: RuntimeAgentDef[] = [
  ...PUBLIC_CLI_AGENT_DEFS,
  byokOpenCodeAgentDef,
];

const RESERVED_PROFILE_IDS = new Set([
  ...BUILT_IN_AGENT_DEFS.map((def) => def.id),
]);

export function readLocalAgentProfileDefs(): RuntimeAgentDef[] {
  return readLocalAgentProfileDefsFromFile(
    PUBLIC_CLI_AGENT_DEFS,
    RESERVED_PROFILE_IDS,
  );
}

export const PUBLIC_AGENT_DEFS: RuntimeAgentDef[] = [
  ...PUBLIC_CLI_AGENT_DEFS,
  ...readLocalAgentProfileDefs(),
];

export const AGENT_DEFS: RuntimeAgentDef[] = [
  ...PUBLIC_AGENT_DEFS,
  byokOpenCodeAgentDef,
];

const ids = new Set();
for (const def of AGENT_DEFS) {
  if (ids.has(def.id)) {
    throw new Error(`Duplicate agent definition id: ${def.id}`);
  }
  ids.add(def.id);
}

export function getAgentDef(id: string): RuntimeAgentDef | null {
  return AGENT_DEFS.find((a) => a.id === id) || null;
}
