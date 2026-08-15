import { describe, expect, it } from 'vitest';

import {
  agentDisplayName,
  agentModelDisplayName,
  exactAgentDisplayName,
} from '../../src/utils/agentLabels';

describe('agentDisplayName', () => {
  it('returns canonical labels for the five public local runtimes', () => {
    expect(agentDisplayName('claude')).toBe('Claude');
    expect(agentDisplayName('codex')).toBe('Codex');
    expect(agentDisplayName('opencode')).toBe('OpenCode');
    expect(agentDisplayName('pi')).toBe('Pi');
    expect(agentDisplayName('antigravity')).toBe('Antigravity');
  });

  it('resolves supported aliases and executable paths', () => {
    expect(agentDisplayName('Claude Code')).toBe('Claude');
    expect(agentDisplayName('agy')).toBe('Antigravity');
    expect(agentDisplayName('/opt/bin/opencode')).toBe('OpenCode');
  });

  it('falls back to a trimmed safe name for an unknown runtime', () => {
    expect(agentDisplayName('unknown-id', '  My Bot  ')).toBe('My Bot');
  });

  it('rejects path-like unknown names', () => {
    expect(agentDisplayName('/opt/unknown/runner', 'C:\\Tools\\runner.exe')).toBeNull();
  });

  it('returns null when both id and fallback are missing', () => {
    expect(agentDisplayName(undefined, null)).toBeNull();
  });
});

describe('exactAgentDisplayName', () => {
  it('matches supported normalized ids only', () => {
    expect(exactAgentDisplayName('Claude Code')).toBe('Claude');
    expect(exactAgentDisplayName('agy')).toBe('Antigravity');
    expect(exactAgentDisplayName('opencode-fork')).toBeNull();
  });

  it('returns null for empty or nullish input', () => {
    expect(exactAgentDisplayName(null)).toBeNull();
    expect(exactAgentDisplayName('')).toBeNull();
  });
});

describe('agentModelDisplayName', () => {
  it('omits an undefined or default model', () => {
    expect(agentModelDisplayName('claude', 'Claude Code', undefined)).toBe('Claude');
    expect(agentModelDisplayName('claude', 'Claude Code', 'default')).toBe('Claude');
  });

  it('joins a supported runtime and explicit model', () => {
    expect(agentModelDisplayName('codex', null, 'gpt-5.6')).toBe('Codex · gpt-5.6');
  });

  it('returns just the model id when no runtime label can be derived', () => {
    expect(agentModelDisplayName(null, null, 'sonnet-4-6')).toBe('sonnet-4-6');
  });
});
