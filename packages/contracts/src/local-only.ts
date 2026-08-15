export const CLEAN_DESIGN_DISABLED_API_PREFIXES = Object.freeze([
  '/api/analytics',
  '/api/active',
  '/api/attribution',
  '/api/automations',
  '/api/automation-ingestions',
  '/api/automation-proposals',
  '/api/automation-source-packets',
  '/api/automation-templates',
  '/api/community',
  '/api/connectors',
  '/api/deploy',
  '/api/github/open-design',
  '/api/host-tools',
  '/api/marketplaces',
  '/api/mcp',
  '/api/observability',
  '/api/orbit',
  '/api/applied-plugins/export',
  '/api/plugins/events',
  '/api/plugins/install',
  '/api/plugins/share-tasks',
  '/api/plugins/stats',
  '/api/plugins/upload-folder',
  '/api/plugins/upload-zip',
  '/api/routines',
  '/api/social-share',
  '/api/tools/connectors',
  '/api/whats-new',
] as const);

export const CLEAN_DESIGN_PUBLIC_CLI_AGENT_IDS = Object.freeze([
  'claude',
  'codex',
  'antigravity',
  'opencode',
  'pi',
] as const);

export type CleanDesignPublicCliAgentId =
  (typeof CLEAN_DESIGN_PUBLIC_CLI_AGENT_IDS)[number];

export const CLEAN_DESIGN_INTERNAL_AGENT_IDS = Object.freeze([
  'byok-opencode',
] as const);

export type CleanDesignInternalAgentId =
  (typeof CLEAN_DESIGN_INTERNAL_AGENT_IDS)[number];

export interface CleanDesignAgentIdentity {
  id: string;
  source?: string;
  baseAgentId?: string;
}

export function isCleanDesignDisabledApiPath(pathname: string): boolean {
  const normalized = pathname.startsWith('/api/')
    ? pathname
    : `/api/${pathname.replace(/^\/+/, '')}`;
  if (CLEAN_DESIGN_DISABLED_API_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  )) return true;
  return [
    /^\/api\/projects\/[^/]+\/deploy(?:ments)?(?:\/|$)/,
    /^\/api\/projects\/[^/]+\/handoff$/,
    /^\/api\/projects\/[^/]+\/plugin-candidates(?:\/|$)/,
    /^\/api\/projects\/[^/]+\/plugins\/(?:install-folder|publish-github|contribute-open-design|share-tasks)(?:\/|$)/,
    /^\/api\/plugins\/[^/]+\/(?:doctor|share-project|trust|uninstall|upgrade)(?:\/|$)/,
    /^\/api\/runs\/[^/]+\/feedback(?:\/|$)/,
  ].some((pattern) => pattern.test(normalized));
}

export function isCleanDesignPublicCliAgent(
  agentId: string,
): agentId is CleanDesignPublicCliAgentId {
  return (CLEAN_DESIGN_PUBLIC_CLI_AGENT_IDS as readonly string[]).includes(agentId);
}

export function isCleanDesignInternalAgent(
  agentId: string,
): agentId is CleanDesignInternalAgentId {
  return (CLEAN_DESIGN_INTERNAL_AGENT_IDS as readonly string[]).includes(agentId);
}

export function isCleanDesignPublicAgent(agent: CleanDesignAgentIdentity): boolean {
  if (isCleanDesignPublicCliAgent(agent.id)) return true;
  return agent.source === 'local-profile' &&
    typeof agent.baseAgentId === 'string' &&
    isCleanDesignPublicCliAgent(agent.baseAgentId) &&
    !isCleanDesignInternalAgent(agent.id);
}
