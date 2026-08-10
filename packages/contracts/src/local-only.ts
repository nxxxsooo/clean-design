export const CLEAN_DESIGN_DISABLED_API_PREFIXES = Object.freeze([
  '/api/amr',
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
  '/api/integrations/vela',
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

export const CLEAN_DESIGN_DISABLED_AGENT_IDS = Object.freeze(['amr'] as const);

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

export function isCleanDesignDisabledAgent(agentId: string): boolean {
  return CLEAN_DESIGN_DISABLED_AGENT_IDS.some((disabled) => disabled === agentId);
}
