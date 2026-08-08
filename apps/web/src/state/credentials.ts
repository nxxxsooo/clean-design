import {
  isCredentialReference,
  type CredentialKind,
  type CredentialMetadata,
} from '@open-design/contracts';
import { deleteHostCredential, saveHostCredential } from '@open-design/host';

import type { ApiProtocolConfig, AppConfig, MediaProviderCredentials } from '../types';

const SECRET_CLI_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
]);

function tailFromMask(mask: string): string {
  return mask.replace(/^\*+/, '').slice(-4);
}

function cloneApiConfig(config: ApiProtocolConfig): ApiProtocolConfig {
  return { ...config };
}

function previousCredentialRefs(config: AppConfig): Set<string> {
  const refs = new Set<string>();
  const visit = (value: unknown): void => {
    if (isCredentialReference(value)) {
      refs.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit({
    apiKey: config.apiKey,
    apiProtocolConfigs: config.apiProtocolConfigs,
    byokProviderConfigDrafts: config.byokProviderConfigDrafts,
    mediaProviders: config.mediaProviders,
    agentCliEnv: config.agentCliEnv,
  });
  return refs;
}

export function credentialInputValue(value: string | null | undefined): string {
  return isCredentialReference(value) ? '' : value ?? '';
}

export function credentialIsConfigured(value: string | null | undefined): boolean {
  return isCredentialReference(value);
}

export async function protectConfigCredentials(
  config: AppConfig,
  previous: AppConfig,
): Promise<AppConfig> {
  const next: AppConfig = {
    ...config,
    apiProtocolConfigs: Object.fromEntries(
      Object.entries(config.apiProtocolConfigs ?? {}).map(([key, value]) => [
        key,
        value ? cloneApiConfig(value) : value,
      ]),
    ),
    byokProviderConfigDrafts: Object.fromEntries(
      Object.entries(config.byokProviderConfigDrafts ?? {}).map(([key, value]) => [
        key,
        { ...value, apiConfig: cloneApiConfig(value.apiConfig) },
      ]),
    ),
    mediaProviders: Object.fromEntries(
      Object.entries(config.mediaProviders ?? {}).map(([key, value]) => [key, { ...value }]),
    ),
    agentCliEnv: Object.fromEntries(
      Object.entries(config.agentCliEnv ?? {}).map(([key, value]) => [key, { ...value }]),
    ),
    composio: { ...(config.composio ?? {}), apiKey: '' },
  };
  const desiredRefs = new Set<string>();
  const savedBySlot = new Map<string, Promise<CredentialMetadata>>();

  const protect = async (
    value: string | undefined,
    slot: string,
    kind: CredentialKind,
    label: string,
  ): Promise<CredentialMetadata | null> => {
    const secret = value?.trim() ?? '';
    if (!secret) return null;
    if (isCredentialReference(secret)) {
      desiredRefs.add(secret);
      return { ref: secret, slot, kind, label, mask: '****', updatedAt: '' };
    }
    let pending = savedBySlot.get(slot);
    if (!pending) {
      pending = saveHostCredential({ slot, kind, label, secret }).then((result) => {
        if (!result.ok) throw new Error(result.reason);
        return result.credential;
      });
      savedBySlot.set(slot, pending);
    }
    const metadata = await pending;
    desiredRefs.add(metadata.ref);
    return metadata;
  };

  for (const [protocol, apiConfig] of Object.entries(next.apiProtocolConfigs ?? {})) {
    if (!apiConfig) continue;
    const metadata = await protect(
      apiConfig.apiKey,
      `chat:protocol:${protocol}`,
      'chat-provider',
      `${protocol} chat provider`,
    );
    apiConfig.apiKey = metadata?.ref ?? '';
    apiConfig.apiKeyConfigured = Boolean(metadata);
    if (metadata && metadata.mask !== '****') apiConfig.apiKeyTail = tailFromMask(metadata.mask);
  }

  for (const [draftKey, draft] of Object.entries(next.byokProviderConfigDrafts ?? {})) {
    const metadata = await protect(
      draft.apiConfig.apiKey,
      `chat:draft:${draftKey}`,
      'chat-provider',
      `${draftKey} chat provider`,
    );
    draft.apiConfig.apiKey = metadata?.ref ?? '';
    draft.apiConfig.apiKeyConfigured = Boolean(metadata);
    if (metadata && metadata.mask !== '****') draft.apiConfig.apiKeyTail = tailFromMask(metadata.mask);
  }

  const activeProtocol = next.apiProtocol ?? 'anthropic';
  const active = await protect(
    next.apiKey,
    `chat:protocol:${activeProtocol}`,
    'chat-provider',
    `${activeProtocol} chat provider`,
  );
  next.apiKey = active?.ref ?? '';
  next.apiKeyConfigured = Boolean(active);
  if (active && active.mask !== '****') next.apiKeyTail = tailFromMask(active.mask);
  const activeSlot = next.apiProtocolConfigs?.[activeProtocol];
  if (activeSlot) {
    activeSlot.apiKey = next.apiKey;
    activeSlot.apiKeyConfigured = next.apiKeyConfigured;
    activeSlot.apiKeyTail = next.apiKeyTail;
  }

  for (const [providerId, entry] of Object.entries(next.mediaProviders ?? {})) {
    const metadata = await protect(
      entry.apiKey,
      `media:${providerId}`,
      'media-provider',
      `${providerId} media provider`,
    );
    entry.apiKey = metadata?.ref ?? '';
    entry.apiKeyConfigured = Boolean(metadata);
    if (metadata && metadata.mask !== '****') entry.apiKeyTail = tailFromMask(metadata.mask);
  }

  for (const [agentId, env] of Object.entries(next.agentCliEnv ?? {})) {
    for (const [envKey, value] of Object.entries(env)) {
      if (!SECRET_CLI_ENV_KEYS.has(envKey)) continue;
      const metadata = await protect(
        value,
        `cli:${agentId}:${envKey}`,
        'cli-override',
        `${agentId} ${envKey}`,
      );
      if (metadata) env[envKey] = metadata.ref;
      else delete env[envKey];
    }
  }

  for (const ref of previousCredentialRefs(previous)) {
    if (!desiredRefs.has(ref)) await deleteHostCredential(ref);
  }
  return next;
}

function scrubApiConfig(config: ApiProtocolConfig): ApiProtocolConfig {
  return {
    ...config,
    apiKey: isCredentialReference(config.apiKey) ? config.apiKey : '',
  };
}

function scrubMediaEntry(entry: MediaProviderCredentials): MediaProviderCredentials {
  return {
    ...entry,
    apiKey: isCredentialReference(entry.apiKey) ? entry.apiKey : '',
  };
}

export function stripPlaintextConfigCredentials(config: AppConfig): AppConfig {
  const agentCliEnv = Object.fromEntries(
    Object.entries(config.agentCliEnv ?? {}).map(([agentId, env]) => [
      agentId,
      Object.fromEntries(
        Object.entries(env).filter(([key, value]) =>
          !SECRET_CLI_ENV_KEYS.has(key) || isCredentialReference(value)),
      ),
    ]),
  );
  return {
    ...config,
    apiKey: isCredentialReference(config.apiKey) ? config.apiKey : '',
    apiProtocolConfigs: Object.fromEntries(
      Object.entries(config.apiProtocolConfigs ?? {}).map(([key, value]) => [
        key,
        value ? scrubApiConfig(value) : value,
      ]),
    ),
    byokProviderConfigDrafts: Object.fromEntries(
      Object.entries(config.byokProviderConfigDrafts ?? {}).map(([key, value]) => [
        key,
        { ...value, apiConfig: scrubApiConfig(value.apiConfig) },
      ]),
    ),
    mediaProviders: Object.fromEntries(
      Object.entries(config.mediaProviders ?? {}).map(([key, value]) => [key, scrubMediaEntry(value)]),
    ),
    agentCliEnv,
    composio: { ...(config.composio ?? {}), apiKey: '' },
  };
}
