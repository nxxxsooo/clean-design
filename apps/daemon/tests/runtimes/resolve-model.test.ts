/**
 * Coverage for `resolveModelForAgent` — the safety net that turns the
 * null model into a concrete fallback id for adapters that need an
 * explicit model when the caller did not choose one.
 *
 * The chat-run path in server.ts goes:
 *
 *   user/plugin model -> isKnownModel | sanitizeCustomModel -> resolveModelForAgent
 *
 * Explicit `model: 'default'` is intentionally preserved so runtimes can use
 * their upstream default without the daemon substituting a fallback model.
 */

import { describe, expect, it } from 'vitest';

import {
  getRememberedLiveModels,
  isKnownModel,
  preferFreshLiveModels,
  rememberLiveModels,
  resolveDefaultModelFromOptions,
  resolveModelForAgent,
} from '../../src/runtimes/models.js';
import type { RuntimeAgentDef } from '../../src/runtimes/types.js';

function defWith(fallbackIds: string[]): RuntimeAgentDef {
  return {
    id: 'test',
    name: 'Test',
    bin: 'test',
    versionArgs: ['--version'],
    fallbackModels: fallbackIds.map((id) => ({ id, label: id })),
    buildArgs: () => [],
    streamFormat: 'plain',
  };
}

function defWithId(id: string, fallbackIds: string[]): RuntimeAgentDef {
  return {
    ...defWith(fallbackIds),
    id,
  };
}

describe('resolveModelForAgent', () => {
  it('substitutes the first concrete fallback when the resolved model is null and the def has no "default" option', () => {
    const def = defWith(['gpt-5.4-mini', 'gpt-5.4']);
    expect(resolveModelForAgent(def, null)).toBe('gpt-5.4-mini');
  });

  it('preserves an explicit synthetic "default" id even when the def omits "default"', () => {
    const def = defWith(['gpt-5.4-mini', 'gpt-5.4']);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('prefers the first remembered live model when no model was selected', () => {
    const def = defWithId('live-default-test', []);
    rememberLiveModels(def.id, [
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ]);

    expect(resolveModelForAgent(def, null)).toBe('deepseek-v3.2');
    expect(resolveModelForAgent(def, 'default')).toBe('default');
    expect(getRememberedLiveModels(def.id)).toEqual([
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ]);
  });

  it('prefers an enabled default remembered model over a disabled first catalog entry', () => {
    const def = defWithId('disabled-default-test', []);
    const models = [
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false },
      { id: 'enabled-default-model', label: 'Enabled default', enabled: true, default: true },
      { id: 'enabled-model', label: 'Enabled', enabled: true },
    ];
    rememberLiveModels(def.id, models);

    expect(resolveModelForAgent(def, null)).toBe('enabled-default-model');
    expect(resolveModelForAgent(def, 'default')).toBe('default');
    expect(isKnownModel(def, 'locked-upgrade-model')).toBe(true);
    expect(getRememberedLiveModels(def.id)).toEqual(models);
  });

  it('uses the first enabled remembered model when no enabled model is marked default', () => {
    const def = defWithId('disabled-first-test', []);
    rememberLiveModels(def.id, [
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false },
      { id: 'enabled-model', label: 'Enabled', enabled: true },
    ]);

    expect(resolveModelForAgent(def, null)).toBe('enabled-model');
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('resolves fresh default candidates from enabled models only', () => {
    expect(resolveDefaultModelFromOptions([
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false, default: true },
      { id: 'enabled-default-model', label: 'Enabled default', enabled: true, default: true },
      { id: 'enabled-model', label: 'Enabled', enabled: true },
    ])).toBe('enabled-default-model');
    expect(resolveDefaultModelFromOptions([
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false },
      { id: 'enabled-model', label: 'Enabled' },
    ])).toBe('enabled-model');
    expect(resolveDefaultModelFromOptions([
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false, default: true },
    ])).toBeNull();
  });

  it('keeps common default-capable defs untouched even when live models are remembered', () => {
    const def = defWithId('live-default-capable-test', ['default', 'sonnet']);
    rememberLiveModels(def.id, [
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
    ]);

    expect(resolveModelForAgent(def, null)).toBe(null);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('leaves the resolved model alone when the def lists "default" itself (the common case for hermes/devin/kimi)', () => {
    const def = defWith(['default', 'sonnet']);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
    expect(resolveModelForAgent(def, null)).toBe(null);
  });

  it('leaves real model ids untouched even when the def omits "default"', () => {
    const def = defWith(['gpt-5.4-mini']);
    expect(resolveModelForAgent(def, 'gpt-5.4')).toBe('gpt-5.4');
  });

  it('returns the original value when fallbackModels is empty (no substitution possible)', () => {
    const def = defWith([]);
    expect(resolveModelForAgent(def, null)).toBe(null);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

});
