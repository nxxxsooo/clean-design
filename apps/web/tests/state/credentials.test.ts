import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { DEFAULT_CONFIG } from '../../src/state/config';
import {
  protectConfigCredentials,
  stripPlaintextConfigCredentials,
} from '../../src/state/credentials';

let restoreHost: (() => void) | null = null;

afterEach(() => {
  restoreHost?.();
  restoreHost = null;
});

describe('renderer credential protection', () => {
  it('replaces chat, media, and CLI plaintext with host-owned references', async () => {
    const save = vi.fn(async (input: { slot: string; kind: string; label: string; secret: string }) => ({
      ok: true as const,
      credential: {
        ref: `credential://${input.slot.replace(/[^A-Za-z0-9_-]/g, '_').padEnd(16, '_')}`,
        slot: input.slot,
        kind: input.kind as 'chat-provider' | 'media-provider' | 'cli-override',
        label: input.label,
        mask: `****${input.secret.slice(-4)}`,
        updatedAt: '2026-08-09T00:00:00.000Z',
      },
    }));
    restoreHost = installMockOpenDesignHost({
      host: {
        credentials: {
          list: async () => ({ ok: true, credentials: [] }),
          save,
          delete: async () => ({ ok: true, deleted: true }),
        },
      },
    });
    const protectedConfig = await protectConfigCredentials({
      ...DEFAULT_CONFIG,
      mode: 'api',
      apiKey: 'chat-secret-1234',
      mediaProviders: {
        openai: { apiKey: 'media-secret-5678', baseUrl: 'https://api.openai.com' },
      },
      agentCliEnv: {
        codex: { OPENAI_API_KEY: 'cli-secret-9012', CODEX_HOME: '/tmp/codex' },
      },
    }, DEFAULT_CONFIG);

    expect(protectedConfig.apiKey).toMatch(/^credential:\/\//);
    expect(protectedConfig.mediaProviders?.openai?.apiKey).toMatch(/^credential:\/\//);
    expect(protectedConfig.agentCliEnv?.codex?.OPENAI_API_KEY).toMatch(/^credential:\/\//);
    expect(JSON.stringify(protectedConfig)).not.toContain('chat-secret-1234');
    expect(JSON.stringify(protectedConfig)).not.toContain('media-secret-5678');
    expect(JSON.stringify(protectedConfig)).not.toContain('cli-secret-9012');
    expect(protectedConfig.agentCliEnv?.codex?.CODEX_HOME).toBe('/tmp/codex');
  });

  it('fails closed when plaintext reaches synchronous persistence', () => {
    const scrubbed = stripPlaintextConfigCredentials({
      ...DEFAULT_CONFIG,
      apiKey: 'plaintext-chat-key',
      mediaProviders: {
        openai: { apiKey: 'plaintext-media-key', baseUrl: 'https://api.openai.com' },
      },
      agentCliEnv: { codex: { OPENAI_API_KEY: 'plaintext-cli-key', CODEX_HOME: '/tmp/codex' } },
    });
    expect(scrubbed.apiKey).toBe('');
    expect(scrubbed.mediaProviders?.openai?.apiKey).toBe('');
    expect(scrubbed.agentCliEnv?.codex?.OPENAI_API_KEY).toBeUndefined();
    expect(scrubbed.agentCliEnv?.codex?.CODEX_HOME).toBe('/tmp/codex');
  });
});
