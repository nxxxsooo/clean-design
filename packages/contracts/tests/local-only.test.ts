import { describe, expect, it } from 'vitest';

import {
  CLEAN_DESIGN_INTERNAL_AGENT_IDS,
  CLEAN_DESIGN_PUBLIC_CLI_AGENT_IDS,
  CLEAN_DESIGN_DISABLED_API_PREFIXES,
  isCleanDesignDisabledApiPath,
  isCleanDesignInternalAgent,
  isCleanDesignPublicAgent,
  isCleanDesignPublicCliAgent,
} from '../src/local-only.js';

describe('Clean Design local-only policy', () => {
  it.each(CLEAN_DESIGN_DISABLED_API_PREFIXES)('denies %s and descendants', (prefix) => {
    expect(isCleanDesignDisabledApiPath(prefix)).toBe(true);
    expect(isCleanDesignDisabledApiPath(`${prefix}/probe`)).toBe(true);
    expect(isCleanDesignDisabledApiPath(prefix.replace(/^\/api\//, '/'))).toBe(true);
  });

  it('does not deny retained local creation routes', () => {
    for (const path of [
      '/api/projects',
      '/api/chat',
      '/api/media/generate',
      '/api/design-systems',
      '/api/plugins',
      '/api/plugins/example-template/apply',
      '/api/plugins/example-template/duplicate-project',
      '/api/plugins/example-template/preview',
      '/api/projects/example/export',
    ]) {
      expect(isCleanDesignDisabledApiPath(path)).toBe(false);
    }
  });

  it('denies dynamic deploy, publication, and feedback routes', () => {
    for (const path of [
      '/api/projects/project-1/deploy',
      '/api/projects/project-1/deployments',
      '/api/projects/project-1/handoff',
      '/api/projects/project-1/plugins/publish-github',
      '/api/projects/project-1/plugins/contribute-open-design',
      '/api/projects/project-1/plugins/install-folder',
      '/api/projects/project-1/plugin-candidates/candidate-1/draft',
      '/api/plugins/install',
      '/api/plugins/plugin-1/uninstall',
      '/api/plugins/plugin-1/upgrade',
      '/api/plugins/plugin-1/trust',
      '/api/plugins/plugin-1/doctor',
      '/api/plugins/plugin-1/share-project',
      '/api/applied-plugins/export',
      '/api/runs/run-1/feedback',
    ]) {
      expect(isCleanDesignDisabledApiPath(path)).toBe(true);
    }
  });

  it('exposes exactly the five supported public CLI ids', () => {
    expect(CLEAN_DESIGN_PUBLIC_CLI_AGENT_IDS).toEqual([
      'claude',
      'codex',
      'antigravity',
      'opencode',
      'pi',
    ]);
    for (const agentId of CLEAN_DESIGN_PUBLIC_CLI_AGENT_IDS) {
      expect(isCleanDesignPublicCliAgent(agentId)).toBe(true);
      expect(isCleanDesignPublicAgent({ id: agentId })).toBe(true);
    }
    for (const agentId of ['custom-one', 'custom-two', 'unknown']) {
      expect(isCleanDesignPublicCliAgent(agentId)).toBe(false);
      expect(isCleanDesignPublicAgent({ id: agentId })).toBe(false);
    }
  });

  it('keeps the BYOK adapter internal and out of public discovery', () => {
    expect(CLEAN_DESIGN_INTERNAL_AGENT_IDS).toEqual(['byok-opencode']);
    expect(isCleanDesignInternalAgent('byok-opencode')).toBe(true);
    expect(isCleanDesignPublicCliAgent('byok-opencode')).toBe(false);
    expect(isCleanDesignPublicAgent({ id: 'byok-opencode' })).toBe(false);
  });

  it('accepts only explicitly marked profiles based on a public CLI', () => {
    expect(isCleanDesignPublicAgent({
      id: 'my-claude-wrapper',
      source: 'local-profile',
      baseAgentId: 'claude',
    })).toBe(true);
    expect(isCleanDesignPublicAgent({
      id: 'unmarked-wrapper',
      baseAgentId: 'claude',
    })).toBe(false);
    expect(isCleanDesignPublicAgent({
      id: 'internal-wrapper',
      source: 'local-profile',
      baseAgentId: 'byok-opencode',
    })).toBe(false);
    expect(isCleanDesignPublicAgent({
      id: 'custom-claude',
      source: 'local-profile',
      baseAgentId: 'claude',
    })).toBe(true);
  });
});
