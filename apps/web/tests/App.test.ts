import { describe, expect, it } from 'vitest';

import {
  buildPersistedConfig,
  isAutosaveDraftOnlyChange,
  resolveSettingsCloseConfig,
  shouldSyncMediaProvidersOnSave,
} from '../src/App';
import type { AppConfig } from '../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('shouldSyncMediaProvidersOnSave', () => {
  it('keeps bootstrap-style empty media maps from syncing by default', () => {
    expect(shouldSyncMediaProvidersOnSave({})).toBe(false);
  });

  it('syncs an explicit empty media map when the user save should force a clear', () => {
    expect(shouldSyncMediaProvidersOnSave({}, { force: true })).toBe(true);
  });
});

describe('buildPersistedConfig', () => {
  it('preserves onboarding completion when a stale autosave snapshot says false', () => {
    expect(
      buildPersistedConfig(
        { ...baseConfig, onboardingCompleted: false },
        { ...baseConfig, onboardingCompleted: true },
      ),
    ).toMatchObject({ onboardingCompleted: true });
  });

});

describe('isAutosaveDraftOnlyChange', () => {
  it('flags a real change (non-draft field) as persist-worthy', () => {
    const flipped: AppConfig = { ...baseConfig, model: 'claude-opus-4-7' };
    expect(isAutosaveDraftOnlyChange(flipped, baseConfig)).toBe(false);
  });

  it('returns true for an identical snapshot (no-op autosave tick)', () => {
    expect(isAutosaveDraftOnlyChange(baseConfig, baseConfig)).toBe(true);
  });
});

describe('resolveSettingsCloseConfig', () => {
  it('marks onboarding complete without discarding the latest persisted draft', () => {
    expect(
      resolveSettingsCloseConfig(
        {
          ...baseConfig,
          onboardingCompleted: false,
          model: 'stale-model',
        },
        {
          ...baseConfig,
          onboardingCompleted: false,
          model: 'fresh-model',
        },
      ),
    ).toMatchObject({
      onboardingCompleted: true,
      model: 'fresh-model',
    });
  });
});
