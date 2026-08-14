import { describe, expect, it } from 'vitest';
import {
  defaultAgentModelId,
  effectiveAgentModelChoice,
} from '../../src/components/agentModelSelection';
import type { AgentInfo } from '../../src/types';

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }],
};

describe('agent model selection', () => {
  it('does not select a disabled local CLI model as the default', () => {
    const lockedCodexAgent: AgentInfo = {
      ...codexAgent,
      models: [
        { id: 'gpt-5.6-mini', label: 'GPT-5.6 Mini', enabled: false },
        { id: 'gpt-5.6', label: 'GPT-5.6', enabled: false, default: true },
      ],
    };

    expect(defaultAgentModelId(lockedCodexAgent)).toBeNull();
    expect(effectiveAgentModelChoice(lockedCodexAgent, undefined)).toBeUndefined();
  });

  it('keeps custom local CLI model choices unchanged', () => {
    expect(
      effectiveAgentModelChoice(codexAgent, {
        model: 'custom-codex-model',
        reasoning: 'high',
      }),
    ).toEqual({
      model: 'custom-codex-model',
      reasoning: 'high',
    });
  });
});
