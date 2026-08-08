// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import type { AgentInfo, AppConfig } from '../../src/types';

vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));

const codex: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }],
  reasoningOptions: [{ id: 'default', label: 'Default' }, { id: 'high', label: 'High' }],
};

const config: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  model: 'claude-sonnet-4-5',
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { codex: { model: 'default', reasoning: 'default' } },
  agentCliEnv: {},
};

function mount(overrides: Partial<AppConfig> = {}, agents: AgentInfo[] = [codex]) {
  const callbacks = {
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onRefreshAgents: vi.fn(),
  };
  render(
    <AvatarMenu
      config={{ ...config, ...overrides }}
      agents={agents}
      daemonLive
      {...callbacks}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'avatar.title' }));
  return callbacks;
}

afterEach(cleanup);

describe('AvatarMenu local execution', () => {
  it('shows local CLI state and excludes removed hosted agents', () => {
    mount({}, [codex, { ...codex, id: 'amr', name: 'Hosted account' }]);
    expect(screen.getByTestId('avatar-agent-option-codex')).toBeTruthy();
    expect(screen.queryByTestId('avatar-agent-option-amr')).toBeNull();
  });

  it('routes mode, agent, refresh, and settings commands', () => {
    const callbacks = mount();
    fireEvent.click(screen.getByText('avatar.useApi'));
    fireEvent.click(screen.getByText('avatar.rescan'));
    fireEvent.click(screen.getByText('inlineSwitcher.openFullSettings'));
    expect(callbacks.onModeChange).toHaveBeenCalledWith('api');
    expect(callbacks.onRefreshAgents).toHaveBeenCalledOnce();
    expect(callbacks.onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('routes reasoning changes through the selected local agent', () => {
    const callbacks = mount();
    const reasoning = screen.getAllByRole('combobox').find((element) => element.tagName === 'SELECT');
    if (!reasoning) throw new Error('reasoning select is missing');
    fireEvent.change(reasoning, { target: { value: 'high' } });
    expect(callbacks.onAgentModelChange).toHaveBeenCalledWith('codex', { reasoning: 'high' });
  });

  it('uses the link glyph for BYOK mode', () => {
    mount({ mode: 'api', apiKeyConfigured: true });
    expect(screen.getByRole('button', { name: 'avatar.title' }).querySelector('.ri-link')).toBeTruthy();
    expect(screen.getByText('api.anthropic.com')).toBeTruthy();
  });
});
