// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import type { AgentInfo, AppConfig } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { codex: { model: 'default' } },
  agentCliEnv: {},
};

const codex: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }, { id: 'gpt-5', label: 'GPT-5' }],
};

const claude: AgentInfo = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  models: [{ id: 'default', label: 'Default' }],
};

const removedCloudAgent: AgentInfo = {
  id: 'amr',
  name: 'Hosted account',
  bin: 'amr',
  available: true,
  models: [{ id: 'default', label: 'Default' }],
};

function renderSwitcher(config: Partial<AppConfig> = {}, agents = [codex, claude, removedCloudAgent]) {
  const callbacks = {
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onOpenSettings: vi.fn(),
  };
  render(
    <InlineModelSwitcher
      config={{ ...baseConfig, ...config }}
      agents={agents}
      daemonLive
      {...callbacks}
    />,
  );
  return callbacks;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InlineModelSwitcher local execution', () => {
  it('keeps the compact chip accessible when visual text is hidden by layout CSS', () => {
    renderSwitcher();
    const chip = screen.getByTestId('inline-model-switcher-chip');
    expect(chip.getAttribute('aria-label')).toMatch(/CLI.*Codex CLI.*Default/i);
  });

  it('shows local CLIs and excludes the removed hosted agent', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.getByTestId('inline-model-switcher-agent-codex')).toBeTruthy();
    expect(screen.getByTestId('inline-model-switcher-agent-claude')).toBeTruthy();
    expect(screen.queryByTestId('inline-model-switcher-agent-amr')).toBeNull();
  });

  it('switches local agents and execution modes through explicit controls', () => {
    const callbacks = renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-claude'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-mode-api'));
    expect(callbacks.onAgentChange).toHaveBeenCalledWith('claude');
    expect(callbacks.onModeChange).toHaveBeenCalledWith('api');
  });

  it('shows BYOK provider/model controls and opens full execution settings', () => {
    const callbacks = renderSwitcher({ mode: 'api', apiKeyConfigured: true });
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.getByTestId('inline-model-switcher-provider-anthropic')).toBeTruthy();
    expect(screen.getByTestId('inline-model-switcher-api-model')).toBeTruthy();
    fireEvent.click(screen.getByTestId('inline-model-switcher-open-settings'));
    expect(callbacks.onOpenSettings).toHaveBeenCalledWith('execution');
  });
});
