import { describe, expect, it } from 'vitest';
import { apiProtocolLabel, apiProtocolModelLabel } from '../../src/utils/apiProtocol';
import {
  agentDisplayName,
  agentModelDisplayName,
  exactAgentDisplayName,
} from '../../src/utils/agentLabels';

describe('api protocol labels', () => {
  it('labels the selected API protocol instead of assuming Anthropic', () => {
    expect(apiProtocolLabel('openai')).toBe('OpenAI API');
    expect(apiProtocolLabel('google')).toBe('Google Gemini');
    expect(apiProtocolLabel(undefined)).toBe('Anthropic API');
  });

  it('includes the selected model when labeling API assistant messages', () => {
    expect(apiProtocolModelLabel('openai', 'google/gemma-4-e4b')).toBe(
      'OpenAI API via OpenCode · google/gemma-4-e4b',
    );
    expect(apiProtocolModelLabel('azure', '  ')).toBe('Azure OpenAI via OpenCode');
  });

  it('includes explicit local CLI models when labeling agent messages', () => {
    expect(agentModelDisplayName('claude', 'Claude Code', 'claude-sonnet-4-6')).toBe(
      'Claude · claude-sonnet-4-6',
    );
    expect(agentModelDisplayName('claude', 'Claude Code', 'default')).toBe('Claude');
  });

  it('labels OpenCode-backed BYOK protocol agent ids', () => {
    expect(agentDisplayName('senseaudio-api')).toBe('SenseAudio API');
  });

  it('normalizes the Antigravity CLI alias', () => {
    expect(agentDisplayName('agy')).toBe('Antigravity');
    expect(exactAgentDisplayName('agy')).toBe('Antigravity');
    expect(agentModelDisplayName('antigravity', 'agy', 'gemini-3.1-pro')).toBe(
      'Antigravity · gemini-3.1-pro',
    );
  });
});
