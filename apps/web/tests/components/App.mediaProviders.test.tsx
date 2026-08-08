// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { App } from '../../src/App';
import type { AppConfig } from '../../src/types';
import {
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';

const navigateMock = vi.fn();
const useRouteMock = vi.fn(() => ({ kind: 'home' as const, view: 'home' as const }));

vi.mock('../../src/router', () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
  useRoute: () => useRouteMock(),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    agents,
    onOpenSettings,
  }: {
    agents: Array<{ id: string }>;
    onOpenSettings: (section?: 'execution' | 'media') => void;
  }) => (
    <div>
      <div data-testid="visible-agent-ids">{agents.map((agent) => agent.id).join(',')}</div>
      <button type="button" onClick={() => onOpenSettings('media')}>
        Open media settings
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <div>Project view</div>,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: ({
    initial,
    initialSection,
    mediaProvidersNotice,
    onPersist,
    onClose,
  }: {
    initial: AppConfig;
    initialSection?: string;
    mediaProvidersNotice?: string | null;
    onPersist: (next: AppConfig) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Settings dialog">
      <div>Section: {initialSection}</div>
      {mediaProvidersNotice ? <div>{mediaProvidersNotice}</div> : null}
      <button
        type="button"
        onClick={() =>
          onPersist({
            ...initial,
            mediaProviders: {
              openai: {
                apiKey: 'media-key',
                baseUrl: 'https://api.openai.com/v1',
                model: '',
              },
            },
          })
        }
      >
        Save media provider
      </button>
      <button type="button" onClick={onClose}>
        Close settings
      </button>
    </div>
  ),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncMediaProvidersToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedSyncConfigToDaemon = vi.mocked(syncConfigToDaemon);
const mockedSyncMediaProvidersToDaemon = vi.mocked(syncMediaProvidersToDaemon);
const MEDIA_CREDENTIAL_REF = 'credential://media_openai_key';
let restoreHost: (() => void) | null = null;

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

describe('App media provider sync flows', () => {
  beforeEach(() => {
    restoreHost = installMockOpenDesignHost({
      host: {
        credentials: {
          list: async () => ({ ok: true, credentials: [] }),
          save: async (input) => ({
            ok: true,
            credential: {
              ref: MEDIA_CREDENTIAL_REF,
              slot: input.slot,
              kind: input.kind,
              label: input.label,
              mask: '****-key',
              updatedAt: '2026-08-09T00:00:00.000Z',
            },
          }),
          delete: async () => ({ ok: true, deleted: true }),
        },
      },
    });
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    restoreHost?.();
    restoreHost = null;
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('syncs configured media providers to the daemon during bootstrap when the daemon is live', async () => {
    const configuredProviders = {
      openai: {
        apiKey: 'media-key',
        baseUrl: 'https://api.openai.com/v1',
        model: '',
      },
    };
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      mediaProviders: configuredProviders,
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedSyncMediaProvidersToDaemon).toHaveBeenCalledWith(
        {
          openai: {
            apiKey: MEDIA_CREDENTIAL_REF,
            apiKeyConfigured: true,
            apiKeyTail: '-key',
            baseUrl: 'https://api.openai.com/v1',
            model: '',
          },
        },
        { daemonProviders: {} },
      );
    });
  });

  it('forces a media provider sync when settings are saved', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      onboardingCompleted: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open media settings' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings dialog' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save media provider' }));

    await waitFor(() => {
      expect(mockedSyncMediaProvidersToDaemon).toHaveBeenCalledWith(
        {
          openai: {
            apiKey: MEDIA_CREDENTIAL_REF,
            apiKeyConfigured: true,
            apiKeyTail: '-key',
            baseUrl: 'https://api.openai.com/v1',
            model: '',
          },
        },
        { daemonProviders: {}, force: undefined, throwOnError: undefined },
      );
    });

    expect(mockedSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
        mediaProviders: {
          openai: {
            apiKey: MEDIA_CREDENTIAL_REF,
            apiKeyConfigured: true,
            apiKeyTail: '-key',
            baseUrl: 'https://api.openai.com/v1',
            model: '',
          },
        },
      }),
    );
    expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
        mediaProviders: {
          openai: {
            apiKey: MEDIA_CREDENTIAL_REF,
            apiKeyConfigured: true,
            apiKeyTail: '-key',
            baseUrl: 'https://api.openai.com/v1',
            model: '',
          },
        },
      }),
      expect.objectContaining({ throwOnError: true }),
    );
  });

  it('filters removed service agents before rendering the workspace', async () => {
    mockedFetchAgentsStream.mockResolvedValue([
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        version: '1.0.0',
        models: [],
      },
      {
        id: 'codex',
        name: 'Codex CLI',
        bin: 'codex',
        available: true,
        version: '1.0.0',
        models: [],
      },
      {
        id: 'byok-opencode',
        name: 'OpenCode BYOK',
        bin: 'opencode',
        available: true,
        version: '1.0.0',
        models: [],
      },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('visible-agent-ids').textContent).toBe('codex');
    });
  });

  it('fails closed when plaintext credential migration cannot use the desktop vault', async () => {
    restoreHost?.();
    const saveCredential = vi.fn(async () => ({
      ok: false as const,
      reason: 'secure-storage-unavailable' as const,
    }));
    restoreHost = installMockOpenDesignHost({
      host: {
        credentials: {
          list: async () => ({ ok: true, credentials: [] }),
          save: saveCredential,
          delete: async () => ({ ok: true, deleted: true }),
        },
      },
    });
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      mediaProviders: {
        openai: {
          apiKey: 'must-not-persist',
          baseUrl: 'https://api.openai.com/v1',
          model: '',
        },
      },
    });

    render(<App />);

    await waitFor(() => expect(saveCredential).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Open media settings' }));
    expect(await screen.findByText(/Could not load media provider settings/)).toBeTruthy();
    expect(mockedSaveConfig).not.toHaveBeenCalled();
    expect(mockedSyncConfigToDaemon).not.toHaveBeenCalled();
    expect(mockedSyncMediaProvidersToDaemon).not.toHaveBeenCalled();
  });
});
