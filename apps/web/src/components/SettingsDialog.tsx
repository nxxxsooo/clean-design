import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { Button, VisuallyHidden } from '@open-design/components';
import { validateBaseUrl } from '@open-design/contracts/api/connectionTest';
import {
  agentIdToTracking,
  byokProtocolToTracking,
  executionModeToTracking,
  settingsSectionToTracking,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import { byokErrorCode } from '../analytics/byok-error-code';
import {
  trackSettingsAppearanceClick,
  trackByokPreflightBlocked,
  trackSettingsByokModelsFetchResult,
  trackSettingsByokTestResult,
  trackSettingsCliTestResult,
  trackSettingsByokFieldClick,
  trackSettingsByokProviderOptionClick,
  trackSettingsDesignReviewClick,
  trackSettingsLanguageClick,
  trackSettingsLocalCliClick,
  trackSettingsExecutionModeTabClick,
  trackSettingsMediaProvidersClick,
  trackSettingsNotificationsClick,
  trackSettingsPrivacyClick,
  trackSettingsView,
} from '../analytics/events';
import { LOCALE_LABEL, LOCALES, useI18n } from '../i18n';
import type { Locale } from '../i18n';
import type { Dict } from '../i18n/types';
import { AgentIcon } from './AgentIcon';
import { AgentDiagnosticRow } from './AgentDiagnosticRow';
import { orderAgentsWithOpenDesignFirst } from './agentOrdering';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';
import { ExportDiagnosticsRow } from './ExportDiagnosticsButton';
import { Icon } from './Icon';
import { defaultAgentModelId, effectiveAgentModelChoice } from './agentModelSelection';
import {
  CUSTOM_MODEL_SENTINEL,
  SearchableModelSelect,
} from './modelOptions';
import {
  BYOK_PROVIDER_PRESETS,
  DEFAULT_NOTIFICATIONS,
  defaultKnownProviderModel,
  isStoredMediaProviderEntryEmpty,
  isStoredMediaProviderEntryPresent,
  KNOWN_PROVIDERS,
  hasAnyConfiguredProvider,
  mergeDaemonMediaProviders,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from '../state/config';
import {
  credentialInputValue,
  credentialIsConfigured,
} from '../state/credentials';
import type { KnownProvider } from '../state/config';
import { navigate as navigateRoute, useRoute } from '../router';
import {
  API_PROTOCOL_TABS,
  DEFAULT_BASE_URL_BY_PROTOCOL,
  API_PROTOCOL_LABELS,
  isFixedOriginGateway,
  resolveFixedOriginBaseUrl,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../state/apiProtocols';
import {
  mergeProviderModelOptions,
  providerModelsCacheKey,
  type ProviderModelsCache,
} from './providerModelsCache';
export {
  mergeProviderModelOptions,
  providerModelsCacheKey,
} from './providerModelsCache';
import {
  MAX_MAX_TOKENS,
  MIN_MAX_TOKENS,
  modelMaxTokensDefault,
} from '../state/maxTokens';
import type {
  AgentInfo,
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  AppTheme,
  AppVersionInfo,
  ConnectionTestResponse,
  DesignSystemGenerationJob,
  ExecMode,
  ProviderModelOption,
  ProviderModelsResponse,
} from '../types';
import { testAgent, testApiProvider } from '../providers/connection-test';
import { fetchProviderModels } from '../providers/provider-models';
import { openExternalUrl } from '../providers/registry';
import { MEDIA_PROVIDERS } from '../media/models';
import { useByokImageModelOptions, useByokVideoModelOptions, useByokSpeechModelOptions } from '../media/aihubmix-image-models';
import { isVisualStabilityMode } from '../utils/visualStability';
import { byokProviderRequiresApiKey } from '../utils/byokProvider';
import { XaiOAuthControl } from './XaiOAuthControl';
import type { MediaProvider } from '../media/models';
import { PetSettings } from './pet/PetSettings';
import { DesignSystemsSection } from './DesignSystemsSection';
import { ProjectLocationsSection } from './ProjectLocationsSection';
import { MemoryModelInline } from './MemoryModelInline';
import { MemorySection } from './MemorySection';
import { ByokConnectionTestControl } from './byok/ByokConnectionTestControl';
import { ByokKeyField } from './byok/ByokKeyField';
import { ByokModelField } from './byok/ByokModelField';
import { ByokProviderBaseUrl } from './byok/ByokProviderBaseUrl';
import { ByokProviderPicker } from './byok/ByokProviderPicker';
import { byokPreflightBlockReason } from './byok/preflight';
import {
  blockingByokDraftFields,
  blockingByokDraftIssues,
  cleanByokApiKey,
  resolveByokModelPreference,
  validateByokDraft,
  type ByokDraftField,
  type ByokDraftIssue,
  type ByokDraftValidation,
} from './byok/validation';
import {
  setCritiqueTheaterEnabled,
  useCritiqueTheaterEnabled,
} from './Theater';
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
  resolveAccentColor,
} from '../state/appearance';
import { isAutosaveDraftOnlyChange } from '../App';
import {
  FAILURE_SOUNDS,
  SUCCESS_SOUNDS,
  notificationPermission,
  playSound,
  requestNotificationPermission,
  showCompletionNotification,
} from '../utils/notifications';

export type SettingsSection =
  | 'execution'
  | 'instructions'
  | 'media'
  | 'language'
  | 'appearance'
  | 'critiqueTheater'
  | 'notifications'
  | 'pet'
  | 'designSystems'
  | 'projectLocations'
  | 'memory'
  // 'library' is consumed by the EntryShell library route — App opens it
  // via this same openSettings entry point, so SettingsSection must
  // accept the token even though SettingsDialog itself has no Library
  // section. Reconcile follow-up: route library through a dedicated
  // navigate() call so openSettings only owns dialog-bound sections.
  | 'library'
  | 'about';

interface ByokProviderPreset {
  id: string;
  title: string;
  protocol: ApiProtocol;
  baseUrl: string;
  preferredModels: readonly string[];
  custom?: boolean;
}

interface Props {
  initial: AppConfig;
  agents: AgentInfo[];
  agentsLoading?: boolean;
  daemonLive: boolean;
  appVersionInfo: AppVersionInfo | null;
  welcome?: boolean;
  initialSection?: SettingsSection;
  providerModelsCache?: ProviderModelsCache;
  /**
   * Persist the current draft. Invoked by the dialog's autosave loop on
   * every committed edit. Returns a promise that resolves once both
   * localStorage and the daemon have caught up so the footer status
   * indicator can flip from "Saving…" to "Saved". Should NOT close the
   * dialog and should NOT mutate onboarding state — it represents an
   * incremental save, not a final commit.
   */
  onPersist: (cfg: AppConfig, options?: { forceMediaProviderSync?: boolean }) => Promise<void> | void;
  onDraftChange?: (cfg: AppConfig) => void;
  onClose: () => void;
  onRefreshAgents: (
    options?: AgentRefreshOptions,
  ) => AgentInfo[] | Promise<AgentInfo[] | void> | void;
  daemonMediaProviders?: AppConfig['mediaProviders'] | null;
  daemonMediaProvidersFetchState?: 'idle' | 'ok' | 'error';
  mediaProvidersNotice?: string | null;
  onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  onProjectsRefresh?: () => Promise<void> | void;
  /** Same channel for skill registry mutations. */
  onSkillsChanged?: (affectedSkillId?: string) => void;
  /** Same channel for design-system registry mutations. */
  onDesignSystemsChanged?: (affectedDesignSystemId?: string) => void;
  onDesignSystemImportRebuildJob?: (designSystemId: string, job: DesignSystemGenerationJob) => void;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
}

export interface AgentRefreshOptions {
  throwOnError?: boolean;
  agentCliEnv?: AppConfig['agentCliEnv'];
}

function codexPathStrings(locale: Locale) {
  if (locale === 'zh-CN') {
    return {
      repairHint: '当前保存的 Codex 路径不适合继续使用。',
      useDetected: '使用检测到的 Codex',
      clearCustom: '清空自定义路径',
      configuredSuccess: (path: string) => `本次测试使用的是已配置的 Codex 路径：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `已配置的 Codex 路径无效或不可执行：${configuredPath}。本次测试改用 PATH 中的 Codex CLI：${detectedPath}。建议更新 CODEX_BIN 或清空自定义路径。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `已配置的 Codex 路径启动失败：${configuredPath}。本次测试改用 PATH 中的 Codex CLI：${detectedPath}。建议更新 CODEX_BIN 或清空自定义路径。`,
    };
  }
  if (locale === 'zh-TW') {
    return {
      repairHint: '目前儲存的 Codex 路徑不適合繼續使用。',
      useDetected: '使用偵測到的 Codex',
      clearCustom: '清除自訂路徑',
      configuredSuccess: (path: string) => `本次測試使用的是已設定的 Codex 路徑：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `已設定的 Codex 路徑無效或不可執行：${configuredPath}。本次測試改用 PATH 中的 Codex CLI：${detectedPath}。建議更新 CODEX_BIN 或清除自訂路徑。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `已設定的 Codex 路徑啟動失敗：${configuredPath}。本次測試改用 PATH 中的 Codex CLI：${detectedPath}。建議更新 CODEX_BIN 或清除自訂路徑。`,
    };
  }
  if (locale === 'ja') {
    return {
      repairHint: '保存されている Codex のパスは、このテストで使用すべきバイナリではありません。',
      useDetected: '検出された Codex を使用',
      clearCustom: 'カスタムパスをクリア',
      configuredSuccess: (path: string) => `このテストでは設定済みの Codex パスを使用しました：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `設定された Codex パスが無効か実行できません：${configuredPath}。このテストでは PATH 上の Codex CLI（${detectedPath}）を使用しました。CODEX_BIN を更新するか、カスタムパスをクリアしてください。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `設定された Codex パスの起動に失敗しました：${configuredPath}。このテストは PATH 上の Codex CLI（${detectedPath}）で成功しました。CODEX_BIN を更新するか、カスタムパスをクリアしてください。`,
    };
  }
  return {
    repairHint: 'The saved Codex path is not the binary this test should keep using.',
    useDetected: 'Use detected Codex',
    clearCustom: 'Clear custom path',
    configuredSuccess: (path: string) =>
      `This test used the configured Codex path: ${path}.`,
    invalidFallback: (configuredPath: string, detectedPath: string) =>
      `Configured Codex path is invalid or not executable: ${configuredPath}. This test used the PATH Codex CLI at ${detectedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`,
    failedFallback: (configuredPath: string, detectedPath: string) =>
      `Configured Codex path failed: ${configuredPath}. This test succeeded with the PATH Codex CLI at ${detectedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`,
  };
}

function sanitizeHttpsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

type RescanNotice =
  | { kind: 'success'; count: number }
  | { kind: 'error' };

type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResponse };

// Providers whose live model fetch IS their full account catalogue, so the
// per-option "from your account" badge and the "Loaded N from your account"
// hint are noise — every option carries the same badge and distinguishes
// nothing. For these we drop the source label and show a plain count instead.
// Add a protocol here when the same applies to another provider.
const ACCOUNT_MODEL_SOURCE_LABEL_HIDDEN = new Set<ApiProtocol>([
  'aihubmix',
  'bedrock',
]);

function hidesAccountModelSourceLabel(protocol: ApiProtocol): boolean {
  return ACCOUNT_MODEL_SOURCE_LABEL_HIDDEN.has(protocol);
}

// Fixed-origin gateway helpers (isFixedOriginGateway / resolveFixedOriginBaseUrl)
// live in ../state/apiProtocols so config loading and the top-bar switcher share
// the same single source of truth.

type ProviderModelsState =
  | { status: 'idle' }
  | { status: 'running'; cacheKey: string }
  | { status: 'done'; cacheKey: string; result: ProviderModelsResponse };

interface ByokProviderFormDraft {
  apiConfig: ApiProtocolConfig;
  maxTokensInput: string;
  maxTokens: AppConfig['maxTokens'];
  providerModelsCommittedKey: string | null;
  providerModelsState: ProviderModelsState;
  showApiKey: boolean;
  apiModelCustomEditing: boolean;
  apiModelUserSelected: boolean;
}

type ByokRequiredField = ByokDraftField;
type ByokPreconditionAction = 'test';
type ByokFieldMissing = 'api_key' | 'base_url' | 'model' | 'multiple' | 'none';

function byokFieldMissingFromIssues(issues: readonly ByokDraftIssue[]): ByokFieldMissing {
  const missingFields = new Set<ByokRequiredField>();
  for (const issue of issues) {
    if (
      issue.code === 'api_key_required' ||
      issue.code === 'base_url_required' ||
      issue.code === 'model_required'
    ) {
      missingFields.add(issue.field);
    }
  }
  if (missingFields.size === 0) return 'none';
  if (missingFields.size > 1) return 'multiple';
  return Array.from(missingFields)[0] ?? 'none';
}

function byokErrorKindFromIssues(issues: readonly ByokDraftIssue[]): string | undefined {
  return issues[0]?.code;
}

function byokTrackingTestResult(result: ConnectionTestResponse): 'success' | 'failed' | 'timeout' {
  if (result.ok) return 'success';
  return result.kind === 'timeout' ? 'timeout' : 'failed';
}

// Map a test result to the visual severity of its inline status node so
// the same green/red/amber palette as the Rescan status applies.
export function testStatusVariant(
  result: ConnectionTestResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited') return 'warn';
  return 'error';
}

export function shouldShowCustomModelInput(
  modelValue: string,
  knownModelIds: readonly string[],
  explicitCustomMode: boolean,
): boolean {
  return (
    explicitCustomMode ||
    !modelValue ||
    !knownModelIds.includes(modelValue)
  );
}

export function canRunProviderConnectionTest(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: { requiresApiKey?: boolean } = {},
): boolean {
  const requiresApiKey = options.requiresApiKey ?? true;
  return (
    (!requiresApiKey || Boolean(config.apiKey.trim())) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.model.trim())
  );
}

export function canFetchProviderModels(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl'>,
  protocol: ApiProtocol,
): boolean {
  return (
    !isProviderModelDiscoveryUnsupported(protocol, config.baseUrl) &&
    protocol !== 'azure' &&
    protocol !== 'ollama' &&
    (protocol === 'bedrock' || Boolean(config.apiKey.trim())) &&
    Boolean(config.baseUrl.trim()) &&
    isValidApiBaseUrl(config.baseUrl)
  );
}

export function isProviderModelDiscoveryUnsupported(
  protocol: ApiProtocol,
  baseUrl: string,
): boolean {
  if (protocol === 'azure' || protocol === 'ollama') return true;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'token-plan-cn.xiaomimimo.com';
  } catch {
    return false;
  }
}

function missingByokConnectionFields(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: { requiresApiKey?: boolean } = {},
): ByokRequiredField[] {
  const requiresApiKey = options.requiresApiKey ?? true;
  const missing: ByokRequiredField[] = [];
  if (requiresApiKey && !config.apiKey.trim()) missing.push('api_key');
  if (!config.baseUrl.trim()) missing.push('base_url');
  if (!config.model.trim()) missing.push('model');
  return missing;
}

function missingByokModelFetchFields(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl'>,
  protocol?: ApiProtocol,
): ByokRequiredField[] {
  const missing: ByokRequiredField[] = [];
  // AIHubMix publishes its catalogue on a public endpoint, so its model list
  // loads without a key (the user shouldn't need to paste a key just to browse
  // models). Bedrock uses a static model seed until AWS auth lands in BYOK.
  // Every other protocol fetches /v1/models behind the key.
  if (protocol !== 'aihubmix' && protocol !== 'bedrock' && !config.apiKey.trim()) missing.push('api_key');
  if (!config.baseUrl.trim()) missing.push('base_url');
  return missing;
}

function providerConnectionTestKey(
  protocol: ApiProtocol,
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model' | 'apiVersion'>,
): string {
  return [
    protocol,
    config.baseUrl.trim().replace(/\/+$/, ''),
    config.apiKey.trim(),
    config.model.trim(),
    protocol === 'azure' ? config.apiVersion?.trim() ?? '' : '',
  ].join('\n');
}

type ByokFirstPartyBaseUrlHint = {
  baseUrl: string;
  hostTypo: boolean;
};

function byokFirstPartyBaseUrlHint(
  protocol: ApiProtocol,
  baseUrl: string,
  protocolProviders: readonly KnownProvider[],
): ByokFirstPartyBaseUrlHint | undefined {
  if (
    protocol !== 'anthropic' &&
    protocol !== 'openai' &&
    protocol !== 'google'
  ) {
    return undefined;
  }
  const firstPartyBaseUrl = protocolProviders.find(
    (provider) => provider.baseUrl.trim(),
  )?.baseUrl;
  if (!firstPartyBaseUrl) return undefined;

  const firstPartyHost = byokDraftBaseUrlHost(firstPartyBaseUrl);
  const draftHost = byokDraftBaseUrlHost(baseUrl);
  if (!firstPartyHost || !draftHost) return undefined;
  if (draftHost === firstPartyHost) {
    return { baseUrl: firstPartyBaseUrl, hostTypo: false };
  }
  if (!draftHost.startsWith(firstPartyHost)) return undefined;

  const suffix = draftHost.slice(firstPartyHost.length);
  return suffix && !suffix.startsWith('.')
    ? { baseUrl: firstPartyBaseUrl, hostTypo: true }
    : undefined;
}

function byokDraftBaseUrlHost(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

const API_KEY_CONSOLE_LINKS: Record<ApiProtocol, { host: string; url: string }> = {
  anthropic: {
    host: 'console.anthropic.com',
    url: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    host: 'platform.openai.com',
    url: 'https://platform.openai.com/api-keys',
  },
  azure: {
    host: 'portal.azure.com',
    url: 'https://portal.azure.com/',
  },
  google: {
    host: 'aistudio.google.com',
    url: 'https://aistudio.google.com/apikey',
  },
  ollama: {
    host: 'ollama.com',
    url: 'https://ollama.com/settings/keys',
  },
  senseaudio: {
    host: 'docs.senseaudio.cn',
    url: 'https://docs.senseaudio.cn',
  },
  aihubmix: {
    host: 'aihubmix.com',
    url: 'https://aihubmix.com/?aff=JA1e',
  },
  bedrock: {
    host: 'aws.amazon.com',
    url: 'https://aws.amazon.com/bedrock/',
  },
};

const AGENT_SHORT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Anthropic official CLI',
  codex: 'OpenAI official CLI',
  'cursor-agent': 'Cursor command line',
  opencode: 'Open-source agent CLI',
  qwen: 'Qwen coding CLI',
  copilot: 'GitHub coding CLI',
  devin: 'Cognition terminal CLI',
  kimi: 'Moonshot Kimi CLI',
  qoder: 'Alibaba coding CLI',
  pi: 'Inflection chat CLI',
  kiro: 'Kiro agent CLI',
  kilo: 'Kilo Code CLI',
  vibe: 'Mistral open-source CLI',
  deepseek: 'DeepSeek terminal UI',
  hermes: 'ACP agent CLI',
  'grok-build': 'xAI coding CLI',
  reasonix: 'DeepSeek native coding CLI',
};

function cleanAgentVersionLabel(
  name: string,
  version: string | null | undefined,
): string {
  if (!version) return '';
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return version
    .replace(new RegExp(`\\s*\\(${escapedName}\\)\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s+${escapedName}\\s*$`, 'i'), '')
    .trim();
}

function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.name;
}

const AGENT_CLI_ENV_FIELDS = [
  {
    agentId: 'claude',
    envKey: 'CLAUDE_CONFIG_DIR',
    labelKey: 'settings.cliEnvClaudeConfigDir',
    placeholder: '~/.claude-2',
  },
  {
    agentId: 'claude',
    envKey: 'ANTHROPIC_BASE_URL',
    labelKey: 'settings.cliEnvClaudeBaseUrl',
    placeholder: 'https://your-proxy.example.com',
  },
  {
    agentId: 'claude',
    envKey: 'ANTHROPIC_API_KEY',
    labelKey: 'settings.cliEnvClaudeApiKey',
    placeholder: 'Paste CLI API key',
    secret: true,
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_HOME',
    labelKey: 'settings.cliEnvCodexHome',
    placeholder: '~/.codex-alt',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_BIN',
    labelKey: 'settings.cliEnvCodexBin',
    placeholder: '/absolute/path/to/codex',
  },
  {
    agentId: 'codex',
    envKey: 'OPENAI_BASE_URL',
    labelKey: 'settings.cliEnvCodexBaseUrl',
    placeholder: 'https://your-proxy.example.com/v1',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_API_KEY',
    labelKey: 'settings.cliEnvCodexApiKey',
    labelSuffix: 'CODEX_API_KEY',
    placeholder: 'Paste CODEX_API_KEY',
    secret: true,
  },
  {
    agentId: 'codex',
    envKey: 'OPENAI_API_KEY',
    labelKey: 'settings.cliEnvCodexApiKey',
    labelSuffix: 'OPENAI_API_KEY',
    placeholder: 'Paste OPENAI_API_KEY',
    secret: true,
  },
] as const;

function defaultApiProtocolConfig(protocol: ApiProtocol): ApiProtocolConfig {
  const provider = KNOWN_PROVIDERS.find((p) => p.protocol === protocol);
  return {
    apiKey: '',
    baseUrl: provider?.baseUrl ?? '',
    model: defaultKnownProviderModel(provider),
    apiVersion: '',
    apiProviderBaseUrl: provider ? provider.baseUrl : null,
  };
}

function providerFamilyLabel(provider: KnownProvider): string {
  return provider.label.replace(/\s+—\s+(Anthropic|OpenAI)$/u, '');
}

function siblingProviderForProtocol(
  providerBaseUrl: string | null | undefined,
  protocol: ApiProtocol,
): KnownProvider | null {
  if (!providerBaseUrl) return null;
  const currentProvider = KNOWN_PROVIDERS.find(
    (p) => p.baseUrl === providerBaseUrl,
  );
  if (!currentProvider) return null;

  const currentFamily = providerFamilyLabel(currentProvider);
  return (
    KNOWN_PROVIDERS.find(
      (p) => p.protocol === protocol && providerFamilyLabel(p) === currentFamily,
    ) ?? null
  );
}

function nextApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): ApiProtocolConfig {
  const savedConfig = config.apiProtocolConfigs?.[protocol];
  if (savedConfig) return savedConfig;

  const currentConfig = currentApiProtocolConfig(config);
  const siblingProvider = siblingProviderForProtocol(
    currentConfig.apiProviderBaseUrl,
    protocol,
  );
  if (siblingProvider) {
    return {
      ...defaultApiProtocolConfig(protocol),
      baseUrl: siblingProvider.baseUrl,
      model: defaultKnownProviderModel(siblingProvider),
      apiProviderBaseUrl: siblingProvider.baseUrl,
    };
  }

  if (currentConfig.apiProviderBaseUrl === null) {
    return {
      ...currentConfig,
      apiKey: '',
      apiVersion: protocol === 'azure' ? currentConfig.apiVersion : '',
      apiProviderBaseUrl: null,
    };
  }

  return {
    ...defaultApiProtocolConfig(protocol),
  };
}

function currentApiProtocolConfig(config: AppConfig): ApiProtocolConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    apiVersion: config.apiVersion ?? '',
    apiProviderBaseUrl: config.apiProviderBaseUrl ?? null,
    byokImageModel: config.byokImageModel ?? '',
    byokVideoModel: config.byokVideoModel ?? '',
    byokSpeechModel: config.byokSpeechModel ?? '',
    byokSpeechVoice: config.byokSpeechVoice ?? '',
  };
}

function persistByokProviderConfigDraft(
  config: AppConfig,
  draftKey: string,
  apiConfig: ApiProtocolConfig,
): AppConfig {
  return {
    ...config,
    byokProviderConfigDrafts: {
      ...(config.byokProviderConfigDrafts ?? {}),
      [draftKey]: {
        apiConfig,
        maxTokens: config.maxTokens,
      },
    },
  };
}

function byokProviderDraftKey(
  protocol: ApiProtocol,
  apiProviderBaseUrl: string | null | undefined,
  baseUrl: string,
): string {
  return `${protocol}:${apiProviderBaseUrl ?? `custom:${baseUrl}`}`;
}

function byokProviderKeyForConfig(config: AppConfig): string {
  const apiConfig = currentApiProtocolConfig(config);
  return byokProviderDraftKey(
    config.apiProtocol ?? 'anthropic',
    apiConfig.apiProviderBaseUrl,
    apiConfig.baseUrl,
  );
}

/**
 * Keeps an incomplete replacement BYOK form durable without promoting it to
 * the active execution config. The selected provider's current fields are
 * stored under `byokProviderConfigDrafts`; the last successfully persisted
 * execution mode and BYOK projection stay active until the replacement is
 * complete.
 */
export function resolveSettingsAutosavePayload(
  draft: AppConfig,
  active: AppConfig,
  intent: { commitClearedActiveApiKey?: boolean } = {},
): AppConfig {
  if (draft.mode !== 'api') return draft;
  if (byokPreflightBlockReason(draft) === null) {
    if (!draft.byokPendingProviderKey) return draft;
    return { ...draft, byokPendingProviderKey: undefined };
  }

  const draftKey = byokProviderKeyForConfig(draft);
  const clearsActiveApiKey =
    intent.commitClearedActiveApiKey === true
    && active.mode === 'api'
    && draftKey === byokProviderKeyForConfig(active)
    && active.apiKey.trim() !== ''
    && draft.apiKey.trim() === '';
  if (clearsActiveApiKey) {
    if (!draft.byokPendingProviderKey) return draft;
    return { ...draft, byokPendingProviderKey: undefined };
  }

  const withCurrentDraft = persistByokProviderConfigDraft(
    draft,
    draftKey,
    currentApiProtocolConfig(draft),
  );
  return {
    ...withCurrentDraft,
    byokPendingProviderKey: draftKey,
    mode: active.mode,
    apiKey: active.apiKey,
    apiProtocol: active.apiProtocol,
    apiVersion: active.apiVersion,
    apiProviderBaseUrl: active.apiProviderBaseUrl,
    apiProtocolConfigs: active.apiProtocolConfigs,
    baseUrl: active.baseUrl,
    model: active.model,
    byokImageModel: active.byokImageModel,
    byokVideoModel: active.byokVideoModel,
    byokSpeechModel: active.byokSpeechModel,
    byokSpeechVoice: active.byokSpeechVoice,
    maxTokens: active.maxTokens,
  };
}

function apiProtocolFromProviderDraftKey(draftKey: string): ApiProtocol | null {
  const separator = draftKey.indexOf(':');
  if (separator <= 0) return null;
  const protocol = draftKey.slice(0, separator);
  return API_PROTOCOL_TABS.some((tab) => tab.id === protocol)
    ? (protocol as ApiProtocol)
    : null;
}

function restorePendingByokProviderDraft(config: AppConfig): AppConfig {
  const currentDraftKey = byokProviderKeyForConfig(config);
  const candidateKeys = config.byokPendingProviderKey
    ? [config.byokPendingProviderKey, currentDraftKey]
    : [currentDraftKey];
  for (const draftKey of candidateKeys) {
    const draft = config.byokProviderConfigDrafts?.[draftKey];
    const protocol = apiProtocolFromProviderDraftKey(draftKey);
    if (!draft || !protocol) continue;
    return applyApiProtocolConfig(
      {
        ...config,
        maxTokens: draft.maxTokens,
      },
      protocol,
      draft.apiConfig,
    );
  }
  return config;
}

function applyApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
  apiConfig: ApiProtocolConfig,
): AppConfig {
  return {
    ...config,
    apiProtocol: protocol,
    apiKey: apiConfig.apiKey,
    baseUrl: resolveFixedOriginBaseUrl(protocol, apiConfig.baseUrl),
    model: apiConfig.model,
    apiProviderBaseUrl: apiConfig.apiProviderBaseUrl ?? null,
    apiVersion: protocol === 'azure' ? (apiConfig.apiVersion ?? '') : '',
    // byokImageModel applies to the protocols that inject the daemon-side
    // generate_image tool (SenseAudio, AIHubMix) — flipping to another BYOK
    // tab shouldn't carry an image-model choice into, say, the OpenAI form.
    // Mirrors the apiVersion guarding above.
    byokImageModel:
      protocol === 'senseaudio' || protocol === 'aihubmix'
        ? (apiConfig.byokImageModel ?? '')
        : '',
    // byokVideoModel only applies to AIHubMix today (the only BYOK chat with a
    // video-model picker; SenseAudio's video tool uses a fixed model).
    byokVideoModel:
      protocol === 'aihubmix' ? (apiConfig.byokVideoModel ?? '') : '',
    // Speech model + voice also AIHubMix-only today.
    byokSpeechModel:
      protocol === 'aihubmix' ? (apiConfig.byokSpeechModel ?? '') : '',
    byokSpeechVoice:
      protocol === 'aihubmix' ? (apiConfig.byokSpeechVoice ?? '') : '',
  };
}

export function isValidApiBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const result = validateBaseUrl(trimmed);
  // The internal-IP / SSRF decision belongs to the daemon, which is the single
  // source of truth and honors the operator's OD_ALLOWED_INTERNAL_HOSTS
  // allowlist — a value the browser cannot see (#3225). A `forbidden` result
  // here is a syntactically-valid URL that points at an internal address; keep
  // it UI-valid so the operator can run the connection test / model fetch and
  // get the daemon's authoritative answer (allowed when listed, a clear
  // "Internal IPs blocked" otherwise). Only genuinely malformed URLs stay
  // invalid client-side.
  if (result.forbidden) return true;
  return Boolean(result.parsed && !result.error);
}

const AGENT_CLI_AUTH_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
]);
const AGENT_CLI_BASE_URL_ENV_KEYS = new Set(['ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL']);

export function updateCurrentApiProtocolConfig(
  config: AppConfig,
  patch: Partial<ApiProtocolConfig>,
): AppConfig {
  const protocol = config.apiProtocol ?? 'anthropic';
  const clearedApiKey =
    patch.apiKey !== undefined &&
    !patch.apiKey.trim() &&
    Boolean(currentApiProtocolConfig(config).apiKey.trim());
  const defaultModel = defaultApiProtocolConfig(protocol).model;
  const nextApiConfig: ApiProtocolConfig = {
    ...currentApiProtocolConfig(config),
    ...patch,
    ...(clearedApiKey && defaultModel && patch.model === undefined
      ? { model: defaultModel }
      : {}),
  };
  return applyApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs: {
        ...(config.apiProtocolConfigs ?? {}),
        [protocol]: nextApiConfig,
      },
    },
    protocol,
    nextApiConfig,
  );
}

export function updateAgentCliEnvValue(
  config: AppConfig,
  agentId: string,
  envKey: string,
  rawValue: string,
): AppConfig {
  const value = rawValue.trim();
  const agentCliEnv = { ...(config.agentCliEnv ?? {}) };
  const agentCliEnvIntent = { ...(config.agentCliEnvIntent ?? {}) };
  const nextAgentEnv = { ...(agentCliEnv[agentId] ?? {}) };
  const nextAgentIntent = { ...(agentCliEnvIntent[agentId] ?? {}) };
  if (value) {
    nextAgentEnv[envKey] = value;
  } else {
    delete nextAgentEnv[envKey];
  }

  const hasAuthKey = Object.keys(nextAgentEnv).some((key) => AGENT_CLI_AUTH_ENV_KEYS.has(key));
  if (
    (AGENT_CLI_AUTH_ENV_KEYS.has(envKey) && value) ||
    (AGENT_CLI_BASE_URL_ENV_KEYS.has(envKey) && hasAuthKey)
  ) {
    nextAgentIntent.apiKeyOverride = true;
  } else if (AGENT_CLI_AUTH_ENV_KEYS.has(envKey) && !hasAuthKey) {
    delete nextAgentIntent.apiKeyOverride;
  }

  if (Object.keys(nextAgentEnv).length > 0) {
    agentCliEnv[agentId] = nextAgentEnv;
  } else {
    delete agentCliEnv[agentId];
  }

  if (Object.keys(nextAgentEnv).length > 0 && Object.keys(nextAgentIntent).length > 0) {
    agentCliEnvIntent[agentId] = nextAgentIntent;
  } else {
    delete agentCliEnvIntent[agentId];
  }

  return {
    ...config,
    agentCliEnv: Object.keys(agentCliEnv).length > 0 ? agentCliEnv : {},
    agentCliEnvIntent: Object.keys(agentCliEnvIntent).length > 0 ? agentCliEnvIntent : {},
  };
}

export function agentRefreshOptionsForConfig(cfg: AppConfig): AgentRefreshOptions {
  return {
    throwOnError: true,
    agentCliEnv: cfg.agentCliEnv ?? {},
  };
}

function apiModelOptionLabel(
  model: ProviderModelOption,
  sourceLabel?: string,
): string {
  const baseLabel = model.label && model.label !== model.id
    ? `${model.label} (${model.id})`
    : model.id;
  return sourceLabel ? `${baseLabel} · ${sourceLabel}` : baseLabel;
}

function codexPathRepairState(
  result: ConnectionTestResponse,
): { detectedPath: string; canUseDetected: boolean } | null {
  if (!result.ok) return null;
  if (
    result.usedExecutableSource !== 'fallback_invalid' &&
    result.usedExecutableSource !== 'fallback_failed'
  ) {
    return null;
  }
  const detectedPath = result.detectedExecutablePath?.trim() || '';
  if (!detectedPath) return null;
  return {
    detectedPath,
    canUseDetected: true,
  };
}

/**
 * Returns whether the modal's footer Save button should be enabled for the
 * currently active sidebar section.
 *
 * The mode-completeness check (BYOK requires apiKey + model + valid baseUrl;
 * Local CLI requires a selected available agent) is only meaningful on the
 * execution-mode section, where the user is actively editing those fields.
 * On every other sidebar section (language, appearance, media,
 * notifications, pet, library, about), partial state from a
 * draft mode toggle (e.g. user clicked BYOK on the execution section without
 * filling in fields, then navigated to language) must NOT block saving
 * changes the user is making in those unrelated sections. Issue #739.
 */
export function shouldEnableSettingsSave(
  cfg: AppConfig,
  activeSection: SettingsSection,
  agents: ReadonlyArray<{ id: string; available: boolean }>,
  isBaseUrlValid: boolean,
): boolean {
  if (activeSection !== 'execution') return true;
  if (cfg.mode === 'daemon') {
    return Boolean(
      cfg.agentId && agents.find((a) => a.id === cfg.agentId)?.available,
    );
  }
  return Boolean(cfg.apiKey.trim() && cfg.model.trim() && isBaseUrlValid);
}

/**
 * Returns the config that should actually be persisted by `onSave`.
 *
 * Counterpart to {@link shouldEnableSettingsSave}: when Save is enabled on a
 * non-execution sidebar section but the user's draft execution config is
 * incomplete (e.g. they toggled BYOK on the execution section, never filled
 * in apiKey, then navigated to Language and clicked Save), the raw `cfg`
 * still carries that broken draft. Persisting it would leave the app in an
 * unusable execution state after the modal closes. This helper reverts the
 * execution-related fields to their `initial` values in that case, so saving
 * an unrelated section change never silently commits an incomplete execution
 * mode.
 *
 * Within the execution section, or when execution is already valid, the
 * config passes through unchanged. Issue #739.
 */
export function sanitizeSettingsSavePayload(
  cfg: AppConfig,
  initial: AppConfig,
  activeSection: SettingsSection,
  agents: ReadonlyArray<{ id: string; available: boolean }>,
  isBaseUrlValid: boolean,
): AppConfig {
  if (activeSection === 'execution') return cfg;
  // Reuse the existing execution-section validity gate so the two helpers
  // share one source of truth for "execution config is complete enough."
  const executionValid = shouldEnableSettingsSave(cfg, 'execution', agents, isBaseUrlValid);
  if (executionValid) return cfg;
  return {
    ...cfg,
    mode: initial.mode,
    apiKey: initial.apiKey,
    apiProtocol: initial.apiProtocol,
    apiVersion: initial.apiVersion,
    apiProtocolConfigs: initial.apiProtocolConfigs,
    byokProviderConfigDrafts: initial.byokProviderConfigDrafts,
    byokPendingProviderKey: initial.byokPendingProviderKey,
    apiProviderBaseUrl: initial.apiProviderBaseUrl,
    baseUrl: initial.baseUrl,
    model: initial.model,
    agentId: initial.agentId,
    agentCliEnv: initial.agentCliEnv,
    maxTokens: initial.maxTokens,
  };
}

export function switchApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): AppConfig {
  const currentProtocol = config.apiProtocol ?? 'anthropic';
  const apiProtocolConfigs = {
    ...(config.apiProtocolConfigs ?? {}),
    [currentProtocol]: currentApiProtocolConfig(config),
  };
  const nextApiConfig = nextApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs,
    },
    protocol,
  );
  return applyApiProtocolConfig(
    {
      ...config,
      mode: 'api',
      apiProtocolConfigs,
    },
    protocol,
    nextApiConfig,
  );
}

export function SettingsDialog({
  initial,
  agents,
  agentsLoading = false,
  daemonLive,
  appVersionInfo,
  welcome,
  initialSection = 'execution',
  onPersist,
  onClose,
  onRefreshAgents,
  daemonMediaProviders,
  daemonMediaProvidersFetchState = 'idle',
  mediaProvidersNotice,
  onReloadMediaProviders,
  onProjectsRefresh,
  onDesignSystemsChanged,
  onDesignSystemImportRebuildJob,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  onDraftChange,
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const analytics = useAnalytics();
  // Backfill the fixed-origin base URL on mount too, so a config persisted with
  // an empty baseUrl (e.g. selected AIHubMix before this resolution existed)
  // isn't stuck blocking the live model fetch until the user re-selects the tab.
  const normalizedInitialConfig: AppConfig = {
    ...initial,
    baseUrl: resolveFixedOriginBaseUrl(initial.apiProtocol ?? 'anthropic', initial.baseUrl),
  };
  const initialFormConfig = initial.mode === 'api'
    ? restorePendingByokProviderDraft(normalizedInitialConfig)
    : normalizedInitialConfig;
  const [cfg, setCfg] = useState<AppConfig>(() => initialFormConfig);
  const [maxTokensInput, setMaxTokensInput] = useState(
    initialFormConfig.maxTokens == null ? '' : String(initialFormConfig.maxTokens),
  );
  const [pendingMediaProviderEditIds, setPendingMediaProviderEditIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const lastSavedAppearanceRef = useRef({
    theme: initial.theme ?? 'system',
    accentColor: resolveAccentColor(initial.accentColor),
  });

  useEffect(() => {
    onDraftChange?.(cfg);
  }, [cfg, onDraftChange]);

  // settings_view — fire on dialog open and on every section switch so the
  // configuration funnel can see which section the user spent time in.
  // The fire is keyed on section so a section bounce (open → switch →
  // close) emits one event per surface.
  const lastViewSectionRef = useRef<string | null>(null);

  useEffect(() => {
    lastSavedAppearanceRef.current = {
      theme: initial.theme ?? 'system',
      accentColor: resolveAccentColor(initial.accentColor),
    };
  }, [initial.theme, initial.accentColor]);

  // Revert the live theme preview to the most recently persisted appearance.
  // That is the initial appearance until autosave succeeds; after autosave,
  // closing Settings must not roll the document back to stale colors.
  useLayoutEffect(() => {
    return () => {
      applyAppearanceToDocument(lastSavedAppearanceRef.current);
    };
  }, []);
  const [showApiKey, setShowApiKey] = useState(false);
  const byokProviderFormDraftsRef = useRef<Record<string, ByokProviderFormDraft>>({});
  const lastCustomByokProviderDraftKeysRef = useRef<Partial<Record<ApiProtocol, string>>>(
    (initial.apiProviderBaseUrl ?? null) === null
      ? { [initial.apiProtocol ?? 'anthropic']: byokProviderKeyForConfig(initial) }
      : {},
  );
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    initialSection,
  );
  const [settingsSidebarCollapsed, setSettingsSidebarCollapsed] = useState(false);
  const [settingsFullscreen, setSettingsFullscreen] = useState(false);
  // Scroll the right-hand content pane back to the top whenever the user
  // picks a different settings section. Without this, switching from a
  // long section the user had scrolled (e.g. Library) into a short one
  // (About) keeps the previous scrollTop, so the new section's header
  // can land out of view and the panel reads as half-loaded. Issue #634.
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  const [agentRescanRunning, setAgentRescanRunning] = useState(false);
  const [agentRescanNotice, setAgentRescanNotice] =
    useState<RescanNotice | null>(null);
  const [agentTestState, setAgentTestState] = useState<TestState>({
    status: 'idle',
  });
  const [providerTestState, setProviderTestState] = useState<TestState>({
    status: 'idle',
  });

  const [byokPreconditionNotice, setByokPreconditionNotice] = useState<{
    action: ByokPreconditionAction;
    field?: ByokRequiredField;
    message: string;
  } | null>(null);
  const [providerModelsState, setProviderModelsState] =
    useState<ProviderModelsState>({ status: 'idle' });
  const [localProviderModelsCache, setLocalProviderModelsCache] =
    useState<ProviderModelsCache>({});
  const hasSharedProviderModelsCache =
    Boolean(sharedProviderModelsCache) && Boolean(onProviderModelsCacheChange);
  const activeProviderModelsCache =
    hasSharedProviderModelsCache
      ? sharedProviderModelsCache!
      : localProviderModelsCache;
  const activeSetProviderModelsCache =
    hasSharedProviderModelsCache
      ? onProviderModelsCacheChange!
      : setLocalProviderModelsCache;
  const [providerModelsCommittedKey, setProviderModelsCommittedKey] =
    useState<string | null>(() => {
      const protocol = initial.apiProtocol ?? 'anthropic';
      if (
        initial.mode !== 'api' ||
        protocol === 'azure' ||
        protocol === 'ollama' ||
        missingByokModelFetchFields(initial, protocol).length > 0 ||
        !isValidApiBaseUrl(initial.baseUrl)
      ) {
        return null;
      }
      return providerModelsCacheKey(
        protocol,
        initial.baseUrl,
        initial.apiKey,
        initial.apiVersion ?? '',
      );
    });
  const agentTestAbortRef = useRef<AbortController | null>(null);
  const providerTestAbortRef = useRef<AbortController | null>(null);
  const providerModelsAbortRef = useRef<AbortController | null>(null);
  const pendingAgentInstallRescanRef = useRef(false);
  const agentTestRevisionRef = useRef(0);
  const providerTestRevisionRef = useRef(0);
  const providerModelsRevisionRef = useRef(0);
  const providerTestFirstResetRef = useRef(true);
  const providerModelsFirstResetRef = useRef(true);
  const providerModelsSkipNextResetRef = useRef(false);
  const deferAfterKeyCleanRef = useRef(false);
  const providerAutoTestKeyRef = useRef<string | null>(null);
  const byokLastUnsuccessfulTestKeyRef = useRef<string | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const baseUrlInputRef = useRef<HTMLInputElement | null>(null);
  const modelSelectRef = useRef<HTMLButtonElement | null>(null);
  const customModelInputRef = useRef<HTMLInputElement | null>(null);
  const focusByokRequiredFieldAfterProtocolSwitchRef = useRef(false);
  const visualStabilityMode = isVisualStabilityMode();
  // Tracks whether the current BYOK model value came from an explicit user
  // pick (combobox selection or custom entry) rather than an auto-populated
  // provider preset. The account-model auto-switch must never overwrite a
  // deliberate choice, even when that choice equals the provider preset id.
  const apiModelUserSelectedRef = useRef(false);
  const [apiModelCustomEditing, setApiModelCustomEditing] = useState(false);
  const [agentCustomModelIds, setAgentCustomModelIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // settings_view — fires whenever the active section changes (and once on
  // mount). Keying the fire on a section+section-string lets us dedupe
  // accidental double-renders while still capturing genuine tab switches.
  useEffect(() => {
    if (lastViewSectionRef.current === activeSection) return;
    lastViewSectionRef.current = activeSection;
    // v2 settings_view collapses to `{ page=settings, area }`; the
    // execution_mode / has_available_cli / selected_cli_id signal that v1
    // tagged onto every view now lives in the configure-state global
    // properties (registered once and inherited by every event).
    trackSettingsView(analytics.track, {
      page_name: 'settings',
      area: settingsSectionToTracking(activeSection),
    });
  }, [activeSection, analytics.track]);
  useEffect(() => {
    const el = settingsContentRef.current;
    if (el) el.scrollTop = 0;
  }, [activeSection]);

  const agentChoiceForTest =
    cfg.mode === 'daemon' && cfg.agentId
      ? cfg.agentModels?.[cfg.agentId]
      : null;
  useEffect(() => {
    agentTestRevisionRef.current += 1;
    setAgentTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.agentId,
    agentChoiceForTest?.model,
    agentChoiceForTest?.reasoning,
    cfg.agentCliEnv,
  ]);
  // Rescan notices are list-level feedback for a one-shot action and
  // shouldn't linger in the content stream. After 6s, fade them out so
  // repeated Rescan clicks don't pile up; the next click resets the
  // notice immediately, so this only affects "user moved on" cases.
  useEffect(() => {
    if (!agentRescanNotice) return;
    const id = window.setTimeout(() => setAgentRescanNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [agentRescanNotice]);
  useEffect(() => {
    if (providerTestFirstResetRef.current) {
      providerTestFirstResetRef.current = false;
      return;
    }
    providerTestRevisionRef.current += 1;
    providerAutoTestKeyRef.current = null;
    setByokPreconditionNotice(null);
    setProviderTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.model,
    cfg.apiVersion,
  ]);
  useEffect(() => {
    if (providerModelsFirstResetRef.current) {
      providerModelsFirstResetRef.current = false;
      return;
    }
    if (providerModelsSkipNextResetRef.current) {
      providerModelsSkipNextResetRef.current = false;
      return;
    }
    providerModelsRevisionRef.current += 1;
    providerModelsAbortRef.current?.abort();
    providerModelsAbortRef.current = null;
    setProviderModelsCommittedKey(null);
    setByokPreconditionNotice(null);
    setProviderModelsState({ status: 'idle' });
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.apiVersion,
  ]);
  // Releasing the abort controllers on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a test is still running.
  useEffect(() => {
    return () => {
      agentTestAbortRef.current?.abort();
      providerTestAbortRef.current?.abort();
      providerModelsAbortRef.current?.abort();
    };
  }, []);

  const installedCount = useMemo(
    () => agents.filter((a) => a.available && isVisibleLocalCliAgent(a)).length,
    [agents],
  );

  const setMode = (mode: ExecMode) => {
    setCfg((c) => {
      const modeBefore = executionModeToTracking(c.mode);
      const modeAfter = executionModeToTracking(mode);
      if (modeBefore !== modeAfter) {
        trackSettingsExecutionModeTabClick(analytics.track, {
          page_name: 'settings',
          area: 'configure_execution_mode',
          element: 'execution_mode_tab',
          action: 'switch_execution_mode',
          mode_before: modeBefore,
          mode_after: modeAfter,
        });
      }
      if (mode === 'api' && c.mode !== 'api') {
        return restorePendingByokProviderDraft({ ...c, mode });
      }
      return { ...c, mode };
    });
  };
  const setByokProvider = (provider: ByokProviderPreset) => {
    const currentDraftKey = byokProviderKeyForConfig(cfg);
    const currentApiConfig = currentApiProtocolConfig(cfg);
    if ((cfg.apiProviderBaseUrl ?? null) === null) {
      lastCustomByokProviderDraftKeysRef.current[cfg.apiProtocol ?? 'anthropic'] =
        currentDraftKey;
    }
    byokProviderFormDraftsRef.current[currentDraftKey] = {
      apiConfig: currentApiConfig,
      maxTokens: cfg.maxTokens,
      maxTokensInput,
      providerModelsCommittedKey,
      providerModelsState,
      showApiKey,
      apiModelCustomEditing,
      apiModelUserSelected: apiModelUserSelectedRef.current,
    };
    const nextProviderBaseUrlForCurrent = provider.custom ? null : provider.baseUrl;
    const providerChangedBeforeSwitch = provider.custom
      ? (cfg.apiProviderBaseUrl ?? null) !== null
      : (cfg.apiProtocol ?? 'anthropic') !== provider.protocol ||
        (cfg.apiProviderBaseUrl ?? null) !== nextProviderBaseUrlForCurrent;
    focusByokRequiredFieldAfterProtocolSwitchRef.current = !provider.custom;
    providerModelsSkipNextResetRef.current = providerChangedBeforeSwitch;
    setCfg((current) => {
      const currentProtocol = current.apiProtocol ?? 'anthropic';
      const nextProviderBaseUrl = provider.custom ? null : provider.baseUrl;
      const providerChanged = provider.custom
        ? (current.apiProviderBaseUrl ?? null) !== null
        : currentProtocol !== provider.protocol ||
          (current.apiProviderBaseUrl ?? null) !== nextProviderBaseUrl;
      const switched = switchApiProtocolConfig(current, provider.protocol);
      const fallbackApiConfig = currentApiProtocolConfig(switched);
      const customDraftKey = provider.custom
        ? lastCustomByokProviderDraftKeysRef.current[provider.protocol]
        : null;
      const nextProviderDraftKey = customDraftKey ?? byokProviderDraftKey(
        provider.protocol,
        nextProviderBaseUrl,
        provider.custom ? fallbackApiConfig.baseUrl : provider.baseUrl,
      );
      const savedDraft = nextProviderDraftKey
        ? byokProviderFormDraftsRef.current[nextProviderDraftKey]
        : undefined;
      const persistedDraft = nextProviderDraftKey
        ? current.byokProviderConfigDrafts?.[nextProviderDraftKey]
        : undefined;
      const applyDraftUiState = (draft: ByokProviderFormDraft | undefined) => {
        setShowApiKey(draft?.showApiKey ?? false);
        setApiModelCustomEditing(draft?.apiModelCustomEditing ?? false);
        apiModelUserSelectedRef.current = draft?.apiModelUserSelected ?? false;
        setMaxTokensInput(
          draft
            ? draft.maxTokensInput
            : switched.maxTokens == null ? '' : String(switched.maxTokens),
        );
        setProviderModelsCommittedKey(draft?.providerModelsCommittedKey ?? null);
        setProviderModelsState(draft?.providerModelsState ?? { status: 'idle' });
      };
      if (savedDraft) {
        applyDraftUiState(savedDraft);
        return applyApiProtocolConfig(
          persistByokProviderConfigDraft(
            {
              ...switched,
              maxTokens: savedDraft.maxTokens,
            },
            currentDraftKey,
            currentApiProtocolConfig(current),
          ),
          provider.protocol,
          savedDraft.apiConfig,
        );
      }
      if (persistedDraft) {
        applyDraftUiState(undefined);
        return applyApiProtocolConfig(
          persistByokProviderConfigDraft(
            {
              ...switched,
              maxTokens: persistedDraft.maxTokens,
            },
            currentDraftKey,
            currentApiProtocolConfig(current),
          ),
          provider.protocol,
          persistedDraft.apiConfig,
        );
      }
      const switchedWithCurrentDraft = persistByokProviderConfigDraft(
        switched,
        currentDraftKey,
        currentApiProtocolConfig(current),
      );
      if (provider.custom) {
        applyDraftUiState(undefined);
        return updateCurrentApiProtocolConfig(switchedWithCurrentDraft, {
          apiProviderBaseUrl: null,
          ...(providerChanged ? { model: '' } : {}),
        });
      }
      applyDraftUiState(undefined);
      return updateCurrentApiProtocolConfig(switchedWithCurrentDraft, {
        ...(providerChanged ? { apiKey: '' } : {}),
        baseUrl: provider.baseUrl,
        model: provider.preferredModels[0] ?? '',
        apiProviderBaseUrl: provider.baseUrl,
      });
    });
  };
  const updateApiConfig = (patch: Partial<ApiProtocolConfig>) =>
    setCfg((c) => updateCurrentApiProtocolConfig(c, patch));
  const updateMaxTokensInput = (raw: string) => {
    setMaxTokensInput(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setCfg((c) => ({ ...c, maxTokens: undefined }));
      return;
    }
    const value = Number(trimmed);
    const nextMaxTokens =
      Number.isInteger(value) &&
      value >= MIN_MAX_TOKENS &&
      value <= MAX_MAX_TOKENS
        ? value
        : undefined;
    setCfg((c) => ({ ...c, maxTokens: nextMaxTokens }));
  };
  const markAgentInstallIntent = () => {
    pendingAgentInstallRescanRef.current = true;
  };
  const handleRefreshAgents = async () => {
    if (agentRescanRunning) return;
    setAgentRescanRunning(true);
    setAgentRescanNotice(null);
    try {
      const refreshed = await onRefreshAgents(agentRefreshOptionsForConfig(cfg));
      const nextAgents = Array.isArray(refreshed) ? refreshed : agents;
      setAgentRescanNotice({
        kind: 'success',
        count: nextAgents.filter((a) => a.available).length,
      });
    } catch {
      setAgentRescanNotice({ kind: 'error' });
    } finally {
      setAgentRescanRunning(false);
    }
  };
  const openAgentFixUrl = (url: string | undefined) => {
    const href = sanitizeHttpsUrl(url);
    if (!href) return;
    markAgentInstallIntent();
    void openExternalUrl(href);
  };
  const diagnosticHandlersForAgent = (agent: AgentInfo) => {
    const docsUrl = sanitizeHttpsUrl(agent.docsUrl);
    const installUrl = sanitizeHttpsUrl(agent.installUrl);
    return {
      onRescan: () => void handleRefreshAgents(),
      ...(docsUrl ? { onOpenDocs: () => openAgentFixUrl(docsUrl) } : {}),
      ...(installUrl
        ? {
            onOpenInstall: () => openAgentFixUrl(installUrl),
          }
        : {}),
    };
  };
  useEffect(() => {
    const handleReturnToSettings = () => {
      if (
        !pendingAgentInstallRescanRef.current ||
        agentRescanRunning ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      pendingAgentInstallRescanRef.current = false;
      void handleRefreshAgents();
    };
    document.addEventListener('visibilitychange', handleReturnToSettings);
    window.addEventListener('focus', handleReturnToSettings);
    return () => {
      document.removeEventListener('visibilitychange', handleReturnToSettings);
      window.removeEventListener('focus', handleReturnToSettings);
    };
  }, [agentRescanRunning, handleRefreshAgents]);

  const handleTestAgent = async () => {
    if (agentTestState.status === 'running') {
      return;
    }
    const selected = agents.find((a) => a.id === cfg.agentId && a.available);
    if (!selected) return;
    const choice = cfg.agentModels?.[selected.id] ?? {};
    const controller = new AbortController();
    const revision = agentTestRevisionRef.current;
    agentTestAbortRef.current = controller;
    setAgentTestState({ status: 'running' });
    const startedAt = performance.now();
    const cliProviderId = agentIdToTracking(selected.id);
    const clearIfStale = () => {
      if (agentTestAbortRef.current === controller) {
        setAgentTestState({ status: 'idle' });
      }
    };
    try {
      const result = await testAgent(
        {
          agentId: selected.id,
          model: choice.model || undefined,
          reasoning: choice.reasoning || undefined,
          agentCliEnv: cfg.agentCliEnv ?? {},
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (agentTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setAgentTestState({ status: 'done', result });
      trackSettingsCliTestResult(analytics.track, {
        page_name: 'settings',
        area: 'configure_execution_mode',
        cli_provider_id: cliProviderId,
        result: result.ok ? 'success' : 'failed',
        ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (agentTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setAgentTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: choice.model || 'default',
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
      trackSettingsCliTestResult(analytics.track, {
        page_name: 'settings',
        area: 'configure_execution_mode',
        cli_provider_id: cliProviderId,
        result: 'failed',
        error_code: err instanceof Error ? err.name : 'UNKNOWN',
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      if (agentTestAbortRef.current === controller) {
        agentTestAbortRef.current = null;
      }
    }
  };

  const handleTestProvider = async (
    options: { silentPreconditions?: boolean } = {},
  ) => {
    if (providerTestState.status === 'running') {
      return;
    }
    const blockingIssues = blockingByokDraftIssues(byokDraftValidation);
    const hasFirstPartyHostTypo = Boolean(byokFirstPartyBaseUrl?.hostTypo);
    const currentConfigKey = providerConnectionTestKey(apiProtocol, cfg);
    const lastUnsuccessfulConfigKey = byokLastUnsuccessfulTestKeyRef.current;
    const configKeyChanged = lastUnsuccessfulConfigKey !== null &&
      lastUnsuccessfulConfigKey !== currentConfigKey;
    if (hasFirstPartyHostTypo) {
      if (!options.silentPreconditions) {
        setByokPreconditionNotice({
          action: 'test',
          field: 'base_url',
          message: t('settings.testInvalidBaseUrl'),
        });
        focusByokRequiredField('base_url');
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
      return;
    }
    if (blockingIssues.length > 0) {
      if (options.silentPreconditions) {
        return;
      }
      showByokDraftValidationNotice('test', byokDraftValidation);
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(analytics.track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: 'failed',
          error_code: byokErrorKindFromIssues(blockingIssues),
          error_kind: byokErrorKindFromIssues(blockingIssues),
          field_missing: byokFieldMissingFromIssues(blockingIssues),
          config_key_changed: configKeyChanged,
          success_after_action: false,
          duration_ms: 0,
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
      return;
    }
    const controller = new AbortController();
    const revision = providerTestRevisionRef.current;
    providerTestAbortRef.current = controller;
    setProviderTestState({ status: 'running' });
    const startedAt = performance.now();
    const clearIfStale = () => {
      if (providerTestAbortRef.current === controller) {
        setProviderTestState({ status: 'idle' });
      }
    };
    try {
      const result = await testApiProvider(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cleanByokApiKey(cfg.apiKey),
          model: cfg.model,
          apiVersion:
            apiProtocol === 'azure'
              ? cfg.apiVersion?.trim() || undefined
              : undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({ status: 'done', result });
      if (!result.ok && result.kind === 'not_found_model') {
        focusByokRequiredField('model');
      }
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(analytics.track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: byokTrackingTestResult(result),
          ...(result.ok ? {} : { error_code: byokErrorCode(result) }),
          ...(result.ok ? {} : { error_kind: result.kind || 'UNKNOWN' }),
          field_missing: 'none',
          config_key_changed: configKeyChanged,
          success_after_action: result.ok && configKeyChanged,
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = result.ok ? null : currentConfigKey;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: cfg.model,
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(analytics.track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: 'failed',
          error_code: err instanceof Error ? err.name : 'UNKNOWN',
          error_kind: err instanceof Error ? err.name : 'UNKNOWN',
          field_missing: 'none',
          config_key_changed: configKeyChanged,
          success_after_action: false,
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
    } finally {
      if (providerTestAbortRef.current === controller) {
        providerTestAbortRef.current = null;
      }
    }
  };

  const handleAutoTestProvider = () => {
    if (providerTestState.status === 'running') {
      return;
    }
    if (byokFirstPartyBaseUrl?.hostTypo) {
      return;
    }
    if (blockingByokDraftIssues(byokDraftValidation).length > 0) {
      return;
    }
    const key = providerConnectionTestKey(apiProtocol, cfg);
    if (providerAutoTestKeyRef.current === key) {
      return;
    }
    providerAutoTestKeyRef.current = key;
    void handleTestProvider({ silentPreconditions: true });
  };

  const handleFetchProviderModels = async (
    options: { silent?: boolean; trigger?: 'auto' | 'manual' } = {},
  ) => {
    const trigger = options.trigger ?? (options.silent ? 'auto' : 'manual');
    const byokProviderId = byokProtocolToTracking(apiProtocol);
    const trackModelsFetchResult = (
      props: Omit<
        Parameters<typeof trackSettingsByokModelsFetchResult>[1],
        'page_name' | 'area' | 'provider_id' | 'trigger' | 'source'
      >,
      source: 'network' | 'cache' = 'network',
    ) => {
      if (!byokProviderId) return;
      trackSettingsByokModelsFetchResult(analytics.track, {
        page_name: 'settings',
        area: 'configure_execution_mode_byok',
        provider_id: byokProviderId,
        trigger,
        source,
        ...props,
      });
    };
    if (providerModelsState.status === 'running') {
      return;
    }
    if (apiProtocol === 'azure') {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_azure',
        error_kind: 'unsupported_azure',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupportedAzure'),
        });
      }
      return;
    }
    if (apiProtocol === 'ollama') {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_ollama',
        error_kind: 'unsupported_ollama',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupportedOllama'),
        });
      }
      return;
    }
    if (isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)) {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_provider_models',
        error_kind: 'unsupported_provider_models',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupported'),
        });
      }
      return;
    }
    const modelFetchBlockingIssues = blockingByokDraftIssues(
      byokModelFetchDraftValidation,
    );
    if (byokFirstPartyBaseUrl?.hostTypo) {
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          field: 'base_url',
          message: t('settings.testInvalidBaseUrl'),
        });
        focusByokRequiredField('base_url');
      }
      return;
    }
    if (modelFetchBlockingIssues.length > 0) {
      trackModelsFetchResult({
        result: 'failed',
        error_code: byokErrorKindFromIssues(modelFetchBlockingIssues),
        error_kind: byokErrorKindFromIssues(modelFetchBlockingIssues),
        field_missing: byokFieldMissingFromIssues(modelFetchBlockingIssues),
        duration_ms: 0,
      });
      if (!options.silent) {
        showByokDraftValidationNotice('test', byokModelFetchDraftValidation);
      }
      return;
    }
    const cacheKey = providerModelsCacheKey(
      apiProtocol,
      cfg.baseUrl,
      cfg.apiKey,
      cfg.apiVersion ?? '',
    );
    const cachedModels = activeProviderModelsCache[cacheKey];
    if (cachedModels) {
      trackModelsFetchResult(
        {
          result: 'success',
          model_count: cachedModels.length,
          duration_ms: 0,
        },
        'cache',
      );
      setProviderModelsState({
        status: 'done',
        cacheKey,
        result: {
          ok: true,
          kind: 'success',
          latencyMs: 0,
          models: cachedModels,
        },
      });
      return;
    }
    const controller = new AbortController();
    const revision = providerModelsRevisionRef.current;
    providerModelsAbortRef.current = controller;
    setProviderModelsState({ status: 'running', cacheKey });
    const startedAt = performance.now();
    const clearIfStale = () => {
      if (providerModelsAbortRef.current === controller) {
        setProviderModelsState({ status: 'idle' });
      }
    };
    try {
      const result = await fetchProviderModels(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cleanByokApiKey(cfg.apiKey),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerModelsRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      if (result.ok && result.models?.length) {
        activeSetProviderModelsCache((prev) => ({
          ...prev,
          [cacheKey]: result.models ?? [],
        }));
      }
      trackModelsFetchResult({
        result: result.ok ? 'success' : 'failed',
        ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
        ...(result.ok ? {} : { error_kind: result.kind || 'UNKNOWN' }),
        model_count: result.ok ? result.models?.length ?? 0 : 0,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      setProviderModelsState({ status: 'done', cacheKey, result });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerModelsRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderModelsState({
        status: 'done',
        cacheKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          detail: err instanceof Error ? err.message : 'Model list request failed',
        },
      });
      trackModelsFetchResult({
        result: 'failed',
        error_code: err instanceof Error ? err.name : 'UNKNOWN',
        error_kind: err instanceof Error ? err.name : 'UNKNOWN',
        model_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      if (providerModelsAbortRef.current === controller) {
        providerModelsAbortRef.current = null;
      }
    }
  };

  const renderTestMessage = (
    result: ConnectionTestResponse,
    kindForSuccess: 'api' | 'cli',
  ): string => {
    const ms = Math.max(0, Math.round(result.latencyMs));
    const sample = result.sample ?? '';
    const agentName = result.agentName ?? '';
    const testedModel = result.model ?? cfg.model;
    if (result.ok) {
      const baseMessage = kindForSuccess === 'api'
        ? t('settings.testSuccessApi', { ms, sample })
        : t('settings.testSuccessCli', { agentName, ms, sample });
      if (kindForSuccess === 'cli' && cfg.agentId === 'codex') {
        const codexStrings = codexPathStrings(locale);
        if (
          result.usedExecutableSource === 'configured' &&
          result.configuredExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.configuredSuccess(result.configuredExecutablePath)}`;
        }
        if (
          result.usedExecutableSource === 'fallback_invalid' &&
          result.configuredExecutablePath &&
          result.detectedExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.invalidFallback(
            result.configuredExecutablePath,
            result.detectedExecutablePath,
          )}`;
        }
        if (
          result.usedExecutableSource === 'fallback_failed' &&
          result.configuredExecutablePath &&
          result.detectedExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.failedFallback(
            result.configuredExecutablePath,
            result.detectedExecutablePath,
          )}`;
        }
      }
      return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
    }
    switch (result.kind) {
      case 'auth_failed':
        return t('settings.testAuthFailed');
      case 'forbidden':
        return t('settings.testForbidden');
      case 'not_found_model':
        return t('settings.testNotFoundModel', { model: testedModel });
      case 'invalid_model_id':
        return t('settings.testInvalidModelId', { model: testedModel });
      case 'invalid_base_url':
        return t('settings.testInvalidBaseUrl');
      case 'rate_limited':
        return t('settings.testRateLimited');
      case 'upstream_unavailable': {
        const baseMessage = t('settings.testUpstream', {
          status: result.status ?? 0,
        });
        return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
      }
      case 'timeout':
        return t('settings.testTimeout', { ms });
      case 'agent_not_installed':
        return t('settings.testAgentMissing', { agentName });
      case 'agent_auth_required':
        return result.detail || 'Agent authentication is required.';
      case 'agent_spawn_failed':
        return t('settings.testAgentSpawn', {
          agentName,
          detail: result.detail ?? '',
        });
      default:
        return t('settings.testUnknown', { detail: result.detail ?? '' });
    }
  };

  const applyCodexDetectedPath = (detectedPath: string) => {
    setCfg((c) => updateAgentCliEnvValue(c, 'codex', 'CODEX_BIN', detectedPath));
    setAgentTestState({ status: 'idle' });
  };

  const clearCodexCustomPath = () => {
    setCfg((c) => updateAgentCliEnvValue(c, 'codex', 'CODEX_BIN', ''));
    setAgentTestState({ status: 'idle' });
  };

  const apiProtocol = cfg.apiProtocol ?? 'anthropic';
  const defaultApiKeyConsoleLink = API_KEY_CONSOLE_LINKS[apiProtocol];
  const byokProviderPresets: ReadonlyArray<ByokProviderPreset> = [
    ...BYOK_PROVIDER_PRESETS,
    {
      id: 'custom',
      title: t('settings.customProvider'),
      protocol: apiProtocol,
      baseUrl: cfg.baseUrl,
      preferredModels: cfg.model ? [cfg.model] : [],
      custom: true,
    },
  ];
  const customByokProvider = byokProviderPresets.find((provider) => provider.custom) ?? {
    id: 'custom',
    title: t('settings.customProvider'),
    protocol: apiProtocol,
    baseUrl: cfg.baseUrl,
    preferredModels: cfg.model ? [cfg.model] : [],
    custom: true,
  };
  const byokPresetProtocols = new Set(
    byokProviderPresets
      .filter((provider) => !provider.custom)
      .map((provider) => provider.protocol),
  );
  const byokProviderOptions: ReadonlyArray<ByokProviderPreset> = [
    ...byokProviderPresets.filter((provider) => !provider.custom),
    ...API_PROTOCOL_TABS.filter((tab) => !byokPresetProtocols.has(tab.id)).map((tab) => {
      const fallback = defaultApiProtocolConfig(tab.id);
      return {
        id: `protocol-${tab.id}`,
        title: tab.title,
        protocol: tab.id,
        baseUrl: fallback.baseUrl || DEFAULT_BASE_URL_BY_PROTOCOL[tab.id],
        preferredModels: [
          fallback.model || SUGGESTED_MODELS_BY_PROTOCOL[tab.id][0] || '',
        ].filter(Boolean),
      };
    }),
    customByokProvider,
  ];
  const selectedByokProvider =
    cfg.apiProviderBaseUrl === null
      ? customByokProvider
      : byokProviderOptions.find(
        (provider) =>
          !provider.custom &&
          provider.protocol === apiProtocol &&
          provider.baseUrl === cfg.apiProviderBaseUrl,
      ) ?? customByokProvider;
  const baseUrlValid = isValidApiBaseUrl(cfg.baseUrl);
  const baseUrlInvalid = Boolean(cfg.baseUrl.trim() && !baseUrlValid);
  const byokRequiredLabel = (field: ByokRequiredField): string => {
    switch (field) {
      case 'api_key':
        return t('settings.apiKey');
      case 'base_url':
        return t('settings.baseUrl');
      case 'model':
        return apiProtocol === 'azure'
          ? t('settings.azureDeploymentModel')
          : t('settings.model');
      default: {
        const exhaustive: never = field;
        return exhaustive;
      }
    }
  };
  const formatByokMissingFields = (fields: ByokRequiredField[]): string =>
    fields.map(byokRequiredLabel).join(', ');
  const focusByokRequiredField = (field: ByokRequiredField | undefined) => {
    if (!field) return;
    window.setTimeout(() => {
      if (field === 'api_key') {
        apiKeyInputRef.current?.focus();
        return;
      }
      if (field === 'base_url') {
        baseUrlInputRef.current?.focus();
        return;
      }
      if (customModelInputRef.current) {
        customModelInputRef.current.focus();
        return;
      }
      modelSelectRef.current?.focus();
    }, 0);
  };
  const showByokPreconditionNotice = (
    action: ByokPreconditionAction,
    fields: ByokRequiredField[],
  ) => {
    setByokPreconditionNotice({
      action,
      message: t('settings.testMissingFields', {
        fields: formatByokMissingFields(fields),
      }),
    });
    focusByokRequiredField(fields[0]);
  };
  const byokDraftIssueMessage = (issue: ByokDraftIssue): string => {
    switch (issue.code) {
      case 'api_key_required':
      case 'base_url_required':
      case 'model_required':
        return t('settings.testMissingFields', {
          fields: byokRequiredLabel(issue.field),
        });
      case 'api_key_extra_whitespace':
      case 'api_key_malformed':
      case 'api_key_wrong_protocol':
        return t('settings.apiKeyInvalid');
      case 'base_url_invalid':
        return t('settings.baseUrlInvalid');
      default: {
        const exhaustive: never = issue.code;
        return exhaustive;
      }
    }
  };
  const showByokDraftValidationNotice = (
    action: ByokPreconditionAction,
    validation: ByokDraftValidation,
  ) => {
    const blockingFields = blockingByokDraftFields(validation);
    if (blockingFields.length === 0) return;
    const blockingIssues = blockingByokDraftIssues(validation);
    const missingFields = blockingIssues
      .filter((issue) =>
        issue.code === 'api_key_required' ||
        issue.code === 'base_url_required' ||
        issue.code === 'model_required'
      )
      .map((issue) => issue.field);
    if (missingFields.length > 0) {
      showByokPreconditionNotice(action, missingFields);
      return;
    }
    const firstIssue = blockingIssues[0];
    if (!firstIssue) return;
    setByokPreconditionNotice({
      action,
      field: firstIssue.field,
      message: byokDraftIssueMessage(firstIssue),
    });
    focusByokRequiredField(firstIssue.field);
  };
  // Autosave loop. Every committed edit to `cfg` schedules a debounced
  // sync to localStorage + the daemon. We keep a 400ms debounce so rapid
  // typing in text fields doesn't flood the daemon with PUTs while still
  // feeling near-instant for toggles/selects (which fire once and settle).
  // The status here drives the footer indicator: 'idle' = no draft to
  // flush, 'pending' = scheduled, 'saving' = request in flight, 'saved'
  // = recent successful sync, 'error' = recent failure.
  const [autosaveStatus, setAutosaveStatus] =
    useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  // Skip the very first effect tick so just opening the dialog doesn't
  // appear to "save" anything before the user has touched a field.
  const autosaveSkipFirstRef = useRef(true);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveSavedTimerRef = useRef<number | null>(null);
  const autosaveRetryTimerRef = useRef<number | null>(null);
  const autosavePendingFlushRef = useRef(false);
  const byokPreflightTrackingRef = useRef<string | null>(null);
  const committedClearedByokProviderKeyRef = useRef<string | null>(null);
  const autosaveLatestRef = useRef<AppConfig>(cfg);
  // Baseline used by the draft-only detector: the snapshot at the most
  // recent successful autosave (or the initial cfg on mount).
  const autosaveLastSavedRef = useRef<AppConfig>(normalizedInitialConfig);
  const mediaProvidersChangeVersionRef = useRef(0);
  const lastSyncedMediaProvidersVersionRef = useRef(0);
  const [autosaveCommitTick, setAutosaveCommitTick] = useState(0);
  const [autosaveRetryTick, setAutosaveRetryTick] = useState(0);
  autosaveLatestRef.current = cfg;
  useEffect(() => {
    if (autosaveSkipFirstRef.current) {
      autosaveSkipFirstRef.current = false;
      return;
    }
    setAutosaveStatus('pending');
    if (autosaveSavedTimerRef.current != null) {
      window.clearTimeout(autosaveSavedTimerRef.current);
      autosaveSavedTimerRef.current = null;
    }
    if (autosaveRetryTimerRef.current != null) {
      window.clearTimeout(autosaveRetryTimerRef.current);
      autosaveRetryTimerRef.current = null;
    }
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosavePendingFlushRef.current = true;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosavePendingFlushRef.current = false;
      autosaveTimerRef.current = null;
      const snapshot = autosaveLatestRef.current;
      const preflightReason = snapshot.mode === 'api'
        ? byokPreflightBlockReason(snapshot)
        : null;
      if (preflightReason) {
        const providerId = byokProtocolToTracking(snapshot.apiProtocol) ?? 'unknown';
        const activeExecutionMode = executionModeToTracking(autosaveLastSavedRef.current.mode);
        const trackingKey = [
          byokProviderKeyForConfig(snapshot),
          preflightReason,
          activeExecutionMode,
        ].join(':');
        if (byokPreflightTrackingRef.current !== trackingKey) {
          byokPreflightTrackingRef.current = trackingKey;
          trackByokPreflightBlocked(analytics.track, {
            source: 'settings',
            reason: preflightReason,
            provider_id: providerId,
            active_execution_mode: activeExecutionMode,
          });
        }
      } else {
        byokPreflightTrackingRef.current = null;
      }
      const committedClearedProviderKey = committedClearedByokProviderKeyRef.current;
      const persistedSnapshot = resolveSettingsAutosavePayload(
        snapshot,
        autosaveLastSavedRef.current,
        {
          commitClearedActiveApiKey:
            committedClearedProviderKey === byokProviderKeyForConfig(snapshot),
        },
      );
      const mediaProvidersVersion = mediaProvidersChangeVersionRef.current;
      const persistOptions = {
        forceMediaProviderSync: mediaProvidersVersion > lastSyncedMediaProvidersVersionRef.current,
      };
      // Draft-only edit, such as an in-flight credential value:
      // the persisted shape would be identical to what is already on
      // disk, so a save would be a no-op that mis-reports "Saved" and
      // makes users trust that a sensitive key was persisted when it
      // was not. Skip the persist and settle the indicator to idle.
      // The forced media-provider sync path still runs because that
      // is a real outbound effect even when the persisted shape
      // hasn't changed.
      if (
        !persistOptions.forceMediaProviderSync
        && isAutosaveDraftOnlyChange(persistedSnapshot, autosaveLastSavedRef.current)
      ) {
        setAutosaveStatus('idle');
        return;
      }
      setAutosaveStatus('saving');
      void (async () => {
        try {
          await onPersist(persistedSnapshot, persistOptions);
          autosaveLastSavedRef.current = persistedSnapshot;
          if (
            committedClearedProviderKey
            && committedClearedByokProviderKeyRef.current === committedClearedProviderKey
          ) {
            committedClearedByokProviderKeyRef.current = null;
          }
          lastSavedAppearanceRef.current = {
            theme: persistedSnapshot.theme ?? 'system',
            accentColor: resolveAccentColor(persistedSnapshot.accentColor),
          };
          // If a newer edit landed while the request was in flight,
          // leave the status as 'pending' so the next debounce tick
          // owns the indicator instead of flashing "Saved".
          if (autosaveLatestRef.current !== snapshot) {
            setAutosaveStatus('pending');
            return;
          }
          if (persistOptions.forceMediaProviderSync) {
            lastSyncedMediaProvidersVersionRef.current = mediaProvidersVersion;
            setPendingMediaProviderEditIds(new Set());
          }
          setAutosaveStatus('saved');
          autosaveSavedTimerRef.current = window.setTimeout(() => {
            autosaveSavedTimerRef.current = null;
            // Settle to idle after a moment so the indicator doesn't
            // stay on "Saved" forever and become noise.
            setAutosaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
          }, 1800);
        } catch {
          if (
            persistOptions.forceMediaProviderSync
            && autosaveLatestRef.current === snapshot
            && mediaProvidersChangeVersionRef.current === mediaProvidersVersion
            && lastSyncedMediaProvidersVersionRef.current < mediaProvidersVersion
          ) {
            setAutosaveStatus('pending');
            autosaveRetryTimerRef.current = window.setTimeout(() => {
              autosaveRetryTimerRef.current = null;
              if (
                autosaveLatestRef.current !== snapshot
                || mediaProvidersChangeVersionRef.current !== mediaProvidersVersion
                || lastSyncedMediaProvidersVersionRef.current >= mediaProvidersVersion
              ) {
                return;
              }
              setAutosaveRetryTick((tick) => tick + 1);
            }, 1500);
            return;
          }
          setAutosaveStatus('error');
        }
      })();
    }, 400);
    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [analytics.track, autosaveCommitTick, cfg, onPersist, autosaveRetryTick]);
  // Flush any pending autosave on unmount so a fast-closing dialog
  // never strands an in-flight edit. We also clear the "Saved" toast
  // timer to avoid setState after unmount.
  useEffect(() => {
    return () => {
      if (autosavePendingFlushRef.current) {
        const mediaProvidersVersion = mediaProvidersChangeVersionRef.current;
        // Best-effort flush; if it rejects, localStorage already has
        // the latest copy from the synchronous saveConfig call inside
        // onPersist.
        autosavePendingFlushRef.current = false;
        const persistedSnapshot = resolveSettingsAutosavePayload(
          autosaveLatestRef.current,
          autosaveLastSavedRef.current,
          {
            commitClearedActiveApiKey:
              committedClearedByokProviderKeyRef.current ===
              byokProviderKeyForConfig(autosaveLatestRef.current),
          },
        );
        void Promise.resolve(onPersist(persistedSnapshot, {
          forceMediaProviderSync: mediaProvidersVersion > lastSyncedMediaProvidersVersionRef.current,
        })).catch(() => undefined);
      }
      if (autosaveSavedTimerRef.current != null) {
        window.clearTimeout(autosaveSavedTimerRef.current);
        autosaveSavedTimerRef.current = null;
      }
      if (autosaveRetryTimerRef.current != null) {
        window.clearTimeout(autosaveRetryTimerRef.current);
        autosaveRetryTimerRef.current = null;
      }
    };
  }, [onPersist]);

  // Global Escape closes the dialog. With no footer button anymore the
  // close affordances are: top-right X · backdrop click · Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const protocolProviders = useMemo(
    () => KNOWN_PROVIDERS.filter((p) => p.protocol === apiProtocol),
    [apiProtocol],
  );
  const selectedProviderIndex =
    cfg.apiProviderBaseUrl == null
      ? -1
      : protocolProviders.findIndex(
          (p) => p.baseUrl === cfg.apiProviderBaseUrl && p.baseUrl === cfg.baseUrl,
        );
  const selectedProvider = selectedProviderIndex >= 0 ? protocolProviders[selectedProviderIndex] : undefined;
  const apiKeyConsoleLink =
    selectedProvider?.apiKeyConsoleLink ?? defaultApiKeyConsoleLink;
  const showProviderPreset =
    protocolProviders.length > 0 && !isFixedOriginGateway(apiProtocol);
  // Fixed-origin gateways resolve their Base URL automatically; nothing for the
  // user to edit, so hide the field entirely.
  const showBaseUrlField = !isFixedOriginGateway(apiProtocol);
  const byokRequiresApiKey = byokProviderRequiresApiKey(
    apiProtocol,
    selectedProvider,
    cfg.baseUrl,
  );
  const byokProviderConfigured = (provider: ByokProviderPreset): boolean => {
    if (provider.custom) {
      return canRunProviderConnectionTest(currentApiProtocolConfig(cfg), {
        requiresApiKey: byokRequiresApiKey,
      }) && isValidApiBaseUrl(cfg.baseUrl);
    }
    const providerDraft = cfg.byokProviderConfigDrafts?.[
      byokProviderDraftKey(provider.protocol, provider.baseUrl, provider.baseUrl)
    ]?.apiConfig;
    const activeProvider = selectedByokProvider?.id === provider.id;
    const entry = activeProvider
      ? currentApiProtocolConfig(cfg)
      : providerDraft ?? (
        provider.protocol === apiProtocol
          ? undefined
          : cfg.apiProtocolConfigs?.[provider.protocol]
      );
    if (!entry || entry.baseUrl !== provider.baseUrl) return false;
    const knownProvider = KNOWN_PROVIDERS.find((item) => item.baseUrl === provider.baseUrl);
    return canRunProviderConnectionTest(entry, {
      requiresApiKey: byokProviderRequiresApiKey(
        provider.protocol,
        knownProvider,
        entry.baseUrl,
      ),
    }) && isValidApiBaseUrl(entry.baseUrl);
  };
  const byokFirstPartyBaseUrl = useMemo(
    () => byokFirstPartyBaseUrlHint(
      apiProtocol,
      cfg.baseUrl,
      protocolProviders,
    ),
    [apiProtocol, cfg.baseUrl, protocolProviders],
  );
  const byokKeyValidationBaseUrl = byokFirstPartyBaseUrl?.baseUrl;
  const byokDraftValidation = useMemo(
    () => validateByokDraft(
      apiProtocol,
      {
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      },
      {
        requiresApiKey: byokRequiresApiKey,
        keyValidationBaseUrl: byokKeyValidationBaseUrl,
      },
    ),
    [
      apiProtocol,
      byokKeyValidationBaseUrl,
      byokRequiresApiKey,
      cfg.apiKey,
      cfg.baseUrl,
      cfg.model,
    ],
  );
  const byokBlockingDraftIssues = useMemo(
    () => blockingByokDraftIssues(byokDraftValidation),
    [byokDraftValidation],
  );
  const byokActivationPreflightReason = useMemo(
    () => byokPreflightBlockReason(cfg),
    [
      cfg.apiKey,
      cfg.apiProtocol,
      cfg.apiProviderBaseUrl,
      cfg.baseUrl,
      cfg.model,
    ],
  );
  const apiKeyDraftInvalid = byokBlockingDraftIssues.some((issue) =>
    issue.field === 'api_key' && issue.code !== 'api_key_required'
  );
  const byokModelFetchDraftValidation = useMemo(
    () => validateByokDraft(
      apiProtocol,
      {
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      },
      {
        requiresApiKey: byokRequiresApiKey,
        requireModel: false,
        keyValidationBaseUrl: byokKeyValidationBaseUrl,
      },
    ),
    [
      apiProtocol,
      byokKeyValidationBaseUrl,
      byokRequiresApiKey,
      cfg.apiKey,
      cfg.baseUrl,
      cfg.model,
    ],
  );
  const providerModelsKey = useMemo(
    () => providerModelsCacheKey(
      apiProtocol,
      cfg.baseUrl,
      cfg.apiKey,
      cfg.apiVersion ?? '',
    ),
    [apiProtocol, cfg.baseUrl, cfg.apiKey, cfg.apiVersion],
  );
  const providerModelDiscoveryUnavailable =
    apiProtocol !== 'azure' &&
    apiProtocol !== 'ollama' &&
    isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl);
  const providerModelDiscoverySupported =
    apiProtocol !== 'azure' &&
    apiProtocol !== 'ollama' &&
    !providerModelDiscoveryUnavailable;
  const fetchedApiModelOptions =
    providerModelDiscoveryUnavailable
      ? []
      : activeProviderModelsCache[providerModelsKey] ?? [];
  const providerPreferredModels =
    selectedProvider?.preferredModels ?? SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol];
  const providerManagedModelIds = useMemo(
    () => new Set([
      ...providerPreferredModels,
      ...(selectedProvider?.retiredModels ?? []),
    ]),
    [providerPreferredModels, selectedProvider],
  );
  const fetchedApiModelIds = useMemo(
    () => new Set(fetchedApiModelOptions.map((model) => model.id.trim())),
    [fetchedApiModelOptions],
  );
  const pendingProviderModelReconciliation = (() => {
    if (cfg.mode !== 'api' || apiModelCustomEditing) return null;
    if (apiModelUserSelectedRef.current) return null;
    if (fetchedApiModelOptions.length === 0) return null;
    const currentModel = cfg.model.trim();
    if (currentModel && fetchedApiModelIds.has(currentModel)) return null;
    if (currentModel && !providerManagedModelIds.has(currentModel)) return null;
    const preference = resolveByokModelPreference({
      currentModel: '',
      accountModels: fetchedApiModelOptions,
      providerPreferredModels,
    });
    return preference.model === currentModel ? null : preference.model;
  })();
  const commitProviderModelsInputs = () => {
    if (
      byokFirstPartyBaseUrl?.hostTypo ||
      blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0
    ) {
      setProviderModelsCommittedKey(null);
      return;
    }
    setProviderModelsCommittedKey(providerModelsKey);
  };
  const onByokKeyCommit = () => {
    if (credentialIsConfigured(cfg.apiKey)) {
      commitProviderModelsInputs();
      return;
    }
    // Normalize the stored key on blur so the value that flows into the
    // connection-test / model-fetch requests below (and back to the daemon
    // via autosave) is already free of pasted whitespace / zero-width
    // characters — otherwise a key like "sk-ant-...\n" would only raise a
    // non-blocking warning yet still go out malformed over the wire.
    const cleanedApiKey = cleanByokApiKey(cfg.apiKey);
    const currentProviderKey = byokProviderKeyForConfig(cfg);
    const activeConfig = autosaveLastSavedRef.current;
    const commitsClearedActiveApiKey =
      cleanedApiKey === ''
      && activeConfig.mode === 'api'
      && activeConfig.apiKey.trim() !== ''
      && currentProviderKey === byokProviderKeyForConfig(activeConfig);
    committedClearedByokProviderKeyRef.current = commitsClearedActiveApiKey
      ? currentProviderKey
      : null;
    if (commitsClearedActiveApiKey) {
      setAutosaveCommitTick((tick) => tick + 1);
    }
    if (cleanedApiKey !== cfg.apiKey) {
      // Writing the cleaned key changes cfg.apiKey, which re-runs the reset
      // effects above: one nulls providerModelsCommittedKey, the other bumps
      // providerTestRevisionRef / clears providerAutoTestKeyRef. So committing
      // the model key or starting the auto-test here would be clobbered — the
      // model commit before the auto-fetch effect reads it. Defer the commit
      // until the cleaned value has landed (effect below); connection testing
      // waits for model discovery and reconciliation.
      deferAfterKeyCleanRef.current = true;
      updateApiConfig({ apiKey: cleanedApiKey });
      return;
    }
    commitProviderModelsInputs();
  };
  useEffect(() => {
    if (!deferAfterKeyCleanRef.current) return;
    deferAfterKeyCleanRef.current = false;
    if (
      byokFirstPartyBaseUrl?.hostTypo ||
      blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0
    ) {
      setProviderModelsCommittedKey(null);
    } else {
      setProviderModelsCommittedKey(providerModelsKey);
    }
  }, [
    byokFirstPartyBaseUrl?.hostTypo,
    byokModelFetchDraftValidation,
    cfg.apiKey,
    providerModelsKey,
  ]);
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (visualStabilityMode) return;
    if (providerTestState.status === 'running') return;
    if (byokFirstPartyBaseUrl?.hostTypo) return;
    if (blockingByokDraftIssues(byokDraftValidation).length > 0) return;
    if (providerModelDiscoverySupported) {
      if (
        apiProtocol !== 'aihubmix' &&
        providerModelsCommittedKey !== providerModelsKey
      ) {
        const timer = window.setTimeout(() => {
          setProviderModelsCommittedKey(providerModelsKey);
        }, 200);
        return () => window.clearTimeout(timer);
      }
      if (
        providerModelsState.status !== 'done' ||
        providerModelsState.cacheKey !== providerModelsKey
      ) return;
      if (
        !providerModelsState.result.ok &&
        (
          providerModelsState.result.kind === 'auth_failed' ||
          providerModelsState.result.kind === 'forbidden'
        )
      ) return;
      if (pendingProviderModelReconciliation !== null) return;
    }
    const key = providerConnectionTestKey(apiProtocol, cfg);
    if (providerAutoTestKeyRef.current === key) return;
    const timer = window.setTimeout(() => {
      handleAutoTestProvider();
    }, providerModelDiscoverySupported ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [
    apiProtocol,
    byokFirstPartyBaseUrl?.hostTypo,
    byokDraftValidation,
    cfg.apiKey,
    cfg.apiVersion,
    cfg.baseUrl,
    cfg.mode,
    cfg.model,
    providerModelDiscoverySupported,
    pendingProviderModelReconciliation,
    providerModelsCommittedKey,
    providerModelsKey,
    providerModelsState,
    providerTestState.status,
    visualStabilityMode,
  ]);
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (visualStabilityMode) return;
    if (isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)) return;
    if (byokFirstPartyBaseUrl?.hostTypo) return;
    if (blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0) return;
    // AIHubMix needs no key and prefills its base URL, so there's nothing to
    // debounce-commit — fetch as soon as the tab is selected. Every other
    // protocol waits until the key/baseUrl inputs are committed (on blur) so we
    // don't fire on each keystroke.
    if (apiProtocol !== 'aihubmix' && providerModelsCommittedKey !== providerModelsKey) return;
    const timer = window.setTimeout(() => {
      void handleFetchProviderModels({ silent: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    apiProtocol,
    byokFirstPartyBaseUrl?.hostTypo,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.mode,
    cfg.apiVersion,
    byokModelFetchDraftValidation,
    providerModelsCommittedKey,
    providerModelsKey,
    visualStabilityMode,
  ]);
  const currentProviderModelsResult =
    providerModelsState.status === 'done' &&
    providerModelsState.cacheKey === providerModelsKey
      ? providerModelsState.result
      : null;
  const loadedAccountModelCount =
    currentProviderModelsResult?.ok && currentProviderModelsResult.models?.length
      ? currentProviderModelsResult.models.length
      : 0;
  const apiKeyAuthFailed =
    currentProviderModelsResult?.ok === false &&
    currentProviderModelsResult.kind === 'auth_failed';
  const providerModelsFailureMessage =
    currentProviderModelsResult?.ok === false && !apiKeyAuthFailed
      ? t('settings.fetchModelsFailed', {
          detail:
            currentProviderModelsResult.detail ||
            currentProviderModelsResult.kind,
        })
      : null;
  const providerTestBaseUrlInvalid =
    providerTestState.status === 'done' &&
    !providerTestState.result.ok &&
    providerTestState.result.kind === 'invalid_base_url';
  const providerTestApiKeyAuthFailed =
    providerTestState.status === 'done' &&
    !providerTestState.result.ok &&
    providerTestState.result.kind === 'auth_failed';
  const apiKeyFieldAuthFailed =
    providerTestApiKeyAuthFailed ||
    (apiKeyAuthFailed && providerTestState.status === 'idle');
  const baseUrlErrorMessage = baseUrlInvalid
    ? t('settings.baseUrlInvalid')
    : providerTestBaseUrlInvalid || byokFirstPartyBaseUrl?.hostTypo
      ? (
        providerTestState.status === 'done' &&
        providerTestState.result.detail?.trim()
          ? providerTestState.result.detail.trim()
          : t('settings.testInvalidBaseUrl')
      )
      : null;
  const suggestedApiModelIds = useMemo(
    () => {
      if (providerModelDiscoveryUnavailable) {
        return selectedProvider?.preferredModels.length
          ? Array.from(new Set(selectedProvider.preferredModels))
          : [];
      }
      return Array.from(new Set(
        selectedProvider?.preferredModels.length
          ? selectedProvider.preferredModels
          : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
      ));
    },
    [apiProtocol, selectedProvider, providerModelDiscoveryUnavailable],
  );
  const apiModelOptions = useMemo(
    () => mergeProviderModelOptions(
      fetchedApiModelOptions,
      suggestedApiModelIds,
    ),
    [fetchedApiModelOptions, suggestedApiModelIds],
  );
  // Shared hook: live AIHubMix catalogue for aihubmix, static registry for
  // other providers (same list the chat composer's image picker uses).
  const byokImageModelOptions = useByokImageModelOptions(apiProtocol);
  const byokVideoModelOptions = useByokVideoModelOptions(apiProtocol);
  const byokSpeechModelOptions = useByokSpeechModelOptions(apiProtocol);
  const apiModelIds = useMemo(
    () => apiModelOptions.map((m) => m.id),
    [apiModelOptions],
  );
  useEffect(() => {
    if (pendingProviderModelReconciliation === null) return;
    updateApiConfig({ model: pendingProviderModelReconciliation });
  }, [
    pendingProviderModelReconciliation,
  ]);
  const apiModelCustomActive =
    shouldShowCustomModelInput(
      cfg.model,
      apiModelIds,
      apiModelCustomEditing,
    );
  const baseUrlReadOnly =
    (apiProtocol === 'anthropic' || apiProtocol === 'google') &&
    cfg.apiProviderBaseUrl !== null &&
    Boolean(cfg.baseUrl.trim()) &&
    !baseUrlInvalid;
  const baseUrlPlaceholder =
    apiProtocol === 'azure'
      ? t('settings.azureBaseUrlPlaceholder')
      : apiProtocol === 'ollama'
        ? 'http://localhost:11434'
        : undefined;
  useEffect(() => {
    if (!focusByokRequiredFieldAfterProtocolSwitchRef.current) return;
    focusByokRequiredFieldAfterProtocolSwitchRef.current = false;
    focusByokRequiredField(
      missingByokConnectionFields(cfg, {
        requiresApiKey: byokRequiresApiKey,
      })[0],
    );
  }, [apiModelCustomActive, cfg, apiProtocol, byokRequiresApiKey]);

  // Header title/subtitle follow the active sidebar section so the dialog
  // header always reflects what the user is looking at, instead of being
  // pinned to one section's copy. The execution section's header doubles
  // as the section heading — there is no inner h3 inside the Local CLI /
  // BYOK content so "Local CLI" only renders once (in the seg-control tab),
  // not twice (heading + tab).
  const sectionHeader: Record<SettingsSection, { title: string; subtitle: string }> = {
    execution: { title: t('settings.title'), subtitle: t('settings.subtitle') },
    instructions: {
      title: t('settings.instructionsTitle'),
      subtitle: t('settings.instructionsSubtitle'),
    },
    media: { title: t('settings.mediaProviders'), subtitle: t('settings.mediaProvidersHint') },
    language: { title: t('settings.language'), subtitle: t('settings.languageHint') },
    appearance: { title: t('settings.appearance'), subtitle: t('settings.appearanceHint') },
    critiqueTheater: {
      title: t('critiqueTheater.settingsNav'),
      subtitle: t('critiqueTheater.settingsNavHint'),
    },
    notifications: { title: t('settings.notifications'), subtitle: t('settings.notificationsHint') },
    pet: { title: t('pet.title'), subtitle: t('pet.subtitle') },
    designSystems: {
      title: t('settings.designSystems'),
      subtitle: t('settings.designSystemsHint'),
    },
    projectLocations: {
      title: t('settings.projectLocations'),
      subtitle: t('settings.projectLocationsHint'),
    },
    memory: { title: t('settings.memory'), subtitle: t('settings.memoryHint') },
    // 'library' is opened via EntryShell route — SettingsDialog doesn't
    // render it but SettingsSection must accept the token (see type def).
    library: { title: '', subtitle: '' },
    about: { title: t('settings.about'), subtitle: t('settings.aboutHint') },
  };
  const activeHeader = sectionHeader[activeSection];
  const visibleAgents = agents.filter(isVisibleLocalCliAgent);
  const installedAgents = orderAgentsWithOpenDesignFirst(
    visibleAgents.filter((a) => a.available),
  );
  const unavailableAgents = visibleAgents.filter((a) => !a.available);
  const initialAgentScanRunning = agentsLoading && agents.length === 0;
  const agentModelOptionLabel = (
    model: ProviderModelOption | undefined,
    fallback: string,
  ) => {
    if (!model) return fallback;
    const label = model.label?.trim();
    const id = model.id.trim();
    if (label && label !== id) {
      return label.toLowerCase().includes(id.toLowerCase())
        ? label
        : `${label} (${id})`;
    }
    return label || id;
  };
  const agentModelSummary = (agent: AgentInfo) => {
    if (!Array.isArray(agent.models) || agent.models.length === 0) return null;
    const choice = effectiveAgentModelChoice(agent, cfg.agentModels?.[agent.id]) ?? cfg.agentModels?.[agent.id] ?? {};
    const modelValue = choice.model ?? defaultAgentModelId(agent) ?? '';
    if (!modelValue) return t('settings.modelCustom');
    return agentModelOptionLabel(
      agent.models.find((m) => m.id === modelValue),
      modelValue,
    );
  };
  const renderAgentModelConfig = (selected: AgentInfo) => {
    const hasModels =
      Array.isArray(selected.models) && selected.models.length > 0;
    const hasReasoning =
      Array.isArray(selected.reasoningOptions) &&
      selected.reasoningOptions.length > 0;
    if (!hasModels && !hasReasoning) return null;
    const choice = cfg.agentModels?.[selected.id] ?? {};
    const effectiveChoice = effectiveAgentModelChoice(selected, choice) ?? choice;
    const modelsForSelect = selected.models;
    const knownModelIds = selected.models?.map((m) => m.id) ?? [];
    // Adapters opt out via `supportsCustomModel: false` on their
    // RuntimeAgentDef when their CLI has no `--model` flag. Undefined means
    // allow, matching the inherited local CLI behavior.
    const allowCustomModel = selected.supportsCustomModel !== false;
    const explicitCustomMode = agentCustomModelIds.has(selected.id);
    const configuredModel =
      typeof effectiveChoice.model === 'string' && effectiveChoice.model
        ? effectiveChoice.model
        : null;
    const customModelDraft =
      explicitCustomMode && typeof choice.model === 'string'
        ? choice.model
        : null;
    const setChoice = (
      next: { model?: string; reasoning?: string },
    ) => {
      setCfg((c) => {
        const prev = c.agentModels?.[selected.id] ?? {};
        return {
          ...c,
          agentModels: {
            ...(c.agentModels ?? {}),
            [selected.id]: { ...prev, ...next },
          },
        };
      });
    };
    const fallbackModelValue = configuredModel ?? defaultAgentModelId(selected) ?? '';
    const modelValue = customModelDraft ?? fallbackModelValue;
    const reasoningValue =
      effectiveChoice.reasoning ??
      choice.reasoning ??
      selected.reasoningOptions?.[0]?.id ?? '';
    const customActive =
      allowCustomModel &&
      hasModels &&
      shouldShowCustomModelInput(
        modelValue,
        knownModelIds,
        explicitCustomMode,
      );
    const selectValue = customActive
      ? CUSTOM_MODEL_SENTINEL
      : modelValue;
    const modelSource = selected.modelsSource ?? 'fallback';
    const modelSourceLabel =
      modelSource === 'live'
        ? t('settings.modelSourceLive')
        : t('settings.modelSourceFallback');
    const modelSourceHint =
      modelSource === 'live'
        ? selected.supportsCustomModel === false
          ? t('settings.modelPickerLiveCatalogOnlyHint')
          : t('settings.modelPickerLiveHint')
        : t('settings.modelPickerFallbackHint');
    return (
      <div className="agent-card-config">
        {hasModels ? (
          <>
            <label className="field">
              <span className="field-label">
                {t('settings.modelPicker')}
                <span
                  className={`agent-model-source-badge ${modelSource}`}
                  aria-hidden="true"
                >
                  {modelSourceLabel}
                </span>
              </span>
              <div className="agent-model-select-wrap">
                <SearchableModelSelect
                  className="inline-switcher__select settings-model-select"
                  value={selectValue}
                  aria-label={t('settings.modelPicker')}
                  searchPlaceholder={t('designs.searchPlaceholder')}
                  searchInputTestId={`settings-agent-model-search-${selected.id}`}
                  popoverTestId={`settings-agent-model-popover-${selected.id}`}
                  minSearchableOptions={5}
                  popoverMinWidth={340}
                  models={modelsForSelect!}
                  onChange={(nextValue) => {
                    if (nextValue === CUSTOM_MODEL_SENTINEL) {
                      setAgentCustomModelIds((prev) => {
                        const next = new Set(prev);
                        next.add(selected.id);
                        return next;
                      });
                      setChoice({ model: '' });
                    } else {
                      setAgentCustomModelIds((prev) => {
                        if (!prev.has(selected.id)) return prev;
                        const next = new Set(prev);
                        next.delete(selected.id);
                        return next;
                      });
                      setChoice({ model: nextValue });
                    }
                  }}
                  additionalOptions={
                    allowCustomModel
                      ? [
                          {
                            value: CUSTOM_MODEL_SENTINEL,
                            label: t('settings.modelCustom'),
                          },
                        ]
                      : undefined
                  }
                />
              </div>
            </label>
            <p className="hint agent-model-row-hint">
              {modelSourceHint}
            </p>
          </>
        ) : null}
        {customActive ? (
          <label className="field">
            <span className="field-label">
              {t('settings.modelCustomLabel')}
            </span>
            <input
              type="text"
              value={modelValue}
              placeholder={t('settings.modelCustomPlaceholder')}
              onChange={(e) =>
                setChoice({ model: e.target.value.trim() })
              }
            />
          </label>
        ) : null}
        {hasReasoning ? (
          <label className="field">
            <span className="field-label">
              {t('settings.reasoningPicker')}
            </span>
            <div className="agent-model-select-wrap">
              <select
                value={reasoningValue}
                onChange={(e) =>
                  setChoice({ reasoning: e.target.value })
                }
              >
                {selected.reasoningOptions!.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={12}
                className="agent-model-select-chevron"
              />
            </div>
          </label>
        ) : null}
      </div>
    );
  };

  const settingsSidebarToggleLabel = settingsSidebarCollapsed
    ? 'Expand settings sidebar'
    : 'Collapse settings sidebar';
  const settingsFullscreenLabel = settingsFullscreen
    ? t('common.exitFullscreen')
    : t('common.fullscreen');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={
          'modal modal-settings' +
          (settingsSidebarCollapsed ? ' settings-sidebar-collapsed' : '') +
          (settingsFullscreen ? ' settings-fullscreen' : '')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-right chrome strip — anchored to the modal corner so the
            autosave indicator and the close button float above the
            sidebar/content rhythm without competing with the title.
            We use `position: absolute` instead of putting these inside
            `.modal-head` so the welcome variant's tall hero (kicker /
            title / subtitle / pet teaser) keeps its centred reading
            measure, and the close button always lands at the same
            optical location regardless of how much copy the header
            renders. */}
        <div className="settings-chrome" aria-hidden={false}>
          {/* Autosave status pill. Only renders something while a save
              is in flight or has just completed — idle = invisible so
              first-open feels calm. The chrome strip itself stays
              mounted so the close button never shifts when the pill
              appears, and the pill is announced via aria-live for
              assistive tech. */}
          <div
            className={`settings-autosave is-${autosaveStatus}`}
            role="status"
            aria-live="polite"
          >
            {autosaveStatus === 'saving' || autosaveStatus === 'pending' ? (
              <>
                <Icon name="spinner" size={12} className="icon-spin" />
                <span>{t('settings.autosaveSaving')}</span>
              </>
            ) : autosaveStatus === 'saved' ? (
              <>
                <Icon name="check" size={12} />
                <span>{t('settings.autosaveSaved')}</span>
              </>
            ) : autosaveStatus === 'error' ? (
              <>
                <Icon name="close" size={12} />
                <span>{t('settings.autosaveError')}</span>
              </>
            ) : null}
          </div>
          <button
            type="button"
            className="settings-chrome-btn settings-fullscreen-toggle"
            onClick={() => setSettingsFullscreen((current) => !current)}
            aria-label={settingsFullscreenLabel}
            aria-pressed={settingsFullscreen}
            title={settingsFullscreenLabel}
          >
            <Icon
              name={settingsFullscreen ? 'minimize' : 'maximize'}
              size={15}
              strokeWidth={2}
            />
          </button>
          <button
            type="button"
            className="settings-chrome-btn settings-close"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
        <header className="modal-head" id="settings-dialog-title">
          {welcome ? (
            <>
              <span className="kicker">{t('settings.welcomeKicker')}</span>
              <h2>{t('settings.welcomeTitle')}</h2>
              <p className="subtitle">{t('settings.welcomeSubtitle')}</p>
            </>
          ) : (
            <>
              <span className="kicker">{t('settings.kicker')}</span>
              <div className="modal-head-line">
                <h2>{activeHeader.title}</h2>
                <p className="subtitle">{activeHeader.subtitle}</p>
              </div>
            </>
          )}
        </header>

        <div className="modal-body">
          <button
            type="button"
            className="settings-sidebar-toggle"
            onClick={() => setSettingsSidebarCollapsed((current) => !current)}
            aria-label={settingsSidebarToggleLabel}
            aria-pressed={settingsSidebarCollapsed}
            aria-controls="settings-sidebar"
            title={settingsSidebarToggleLabel}
          >
            <Icon
              name={settingsSidebarCollapsed ? 'chevron-right' : 'chevron-left'}
              size={15}
              strokeWidth={2}
            />
          </button>
          <aside
            id="settings-sidebar"
            className="settings-sidebar"
            aria-label="Settings sections"
            aria-hidden={settingsSidebarCollapsed ? true : undefined}
          >
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'execution' ? ' active' : ''}`}
              onClick={() => setActiveSection('execution')}
            >
              <Icon name="sliders" size={18} />
              <span>
                <strong>{t('settings.envConfigure')}</strong>
                <small>{`${t('settings.localCli')} / ${t('settings.modeApiMeta')}`}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'instructions' ? ' active' : ''}`}
              onClick={() => setActiveSection('instructions')}
            >
              <Icon name="edit" size={18} />
              <span>
                <strong>{t('settings.instructionsTitle')}</strong>
                <small>{t('settings.instructionsNavSub')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'memory' ? ' active' : ''}`}
              onClick={() => setActiveSection('memory')}
            >
              <Icon name="history" size={18} />
              <span>
                <strong>{t('settings.memory')}</strong>
                <small>{t('settings.memoryHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'media' ? ' active' : ''}`}
              onClick={() => setActiveSection('media')}
            >
              <Icon name="image" size={18} />
              <span>
                <strong>{t('settings.mediaProviders')}</strong>
                <small>Image / video / audio</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'language' ? ' active' : ''}`}
              onClick={() => setActiveSection('language')}
            >
              <Icon name="languages" size={18} />
              <span>
                <strong>{t('settings.language')}</strong>
                <small>{t('settings.languageHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'appearance' ? ' active' : ''}`}
              onClick={() => setActiveSection('appearance')}
            >
              <Icon name="sun-moon" size={18} />
              <span>
                <strong>{t('settings.appearance')}</strong>
                <small>{t('settings.appearanceHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'critiqueTheater' ? ' active' : ''}`}
              onClick={() => setActiveSection('critiqueTheater')}
            >
              <Icon name="comment" size={18} />
              <span>
                <strong>{t('critiqueTheater.settingsNav')}</strong>
                <small>{t('critiqueTheater.settingsNavHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'notifications' ? ' active' : ''}`}
              onClick={() => setActiveSection('notifications')}
            >
              <Icon name="bell" size={18} />
              <span>
                <strong>{t('settings.notifications')}</strong>
                <small>{t('settings.notificationsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'pet' ? ' active' : ''}`}
              onClick={() => setActiveSection('pet')}
            >
              <Icon name="sparkles" size={18} />
              <span>
                <strong>{t('pet.navTitle')}</strong>
                <small>{t('pet.navHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'designSystems' ? ' active' : ''}`}
              onClick={() => setActiveSection('designSystems')}
            >
              <Icon name="draw" size={18} />
              <span>
                <strong>{t('settings.designSystems')}</strong>
                <small>{t('settings.designSystemsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'projectLocations' ? ' active' : ''}`}
              onClick={() => setActiveSection('projectLocations')}
            >
              <Icon name="folder" size={18} />
              <span>
                <strong>{t('settings.projectLocations')}</strong>
                <small>{t('settings.projectLocationsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'about' ? ' active' : ''}`}
              onClick={() => setActiveSection('about')}
            >
              <Icon name="settings" size={18} />
              <span>
                <strong>{t('settings.about')}</strong>
                <small>{t('settings.aboutHint')}</small>
              </span>
            </button>
          </aside>
          <div className="settings-content" ref={settingsContentRef}>
          {activeSection === 'execution' ? (
            <>
              <div
                className="seg-control"
                role="tablist"
                aria-label={t('settings.modeAria')}
                style={{ ['--seg-cols' as string]: 2 } as CSSProperties}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cfg.mode === 'daemon'}
                  className={
                    'seg-btn seg-btn--inline' +
                    (cfg.mode === 'daemon' ? ' active' : '')
                  }
                  disabled={!daemonLive}
                  onClick={() => setMode('daemon')}
                  title={
                    daemonLive
                      ? t('settings.modeDaemonHelp')
                      : t('settings.modeDaemonOffline')
                  }
                >
                  <span className="seg-title">{t('settings.localCli')}</span>
                  <span className="seg-meta">
                    {daemonLive
                      ? t('settings.modeDaemonInstalledMeta', { count: installedCount })
                      : t('settings.modeDaemonOfflineMeta')}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cfg.mode === 'api'}
                  className={
                    'seg-btn seg-btn--inline' +
                    (cfg.mode === 'api' ? ' active' : '')
                  }
                  onClick={() => setMode('api')}
                >
                  <span className="seg-title">{t('settings.modeApiMeta')}</span>
                  <span className="seg-meta">{t('settings.modeApi')}</span>
                </button>
              </div>
              {cfg.mode === 'api' ? (
                <div
                  className="protocol-chips protocol-chips--providers"
                  role="tablist"
                  aria-label={t('settings.protocolAria')}
                >
                  <div className="protocol-chip-group protocol-chip-group--providers">
                    <div className="protocol-chip-group-options">
                      {byokProviderOptions.map((provider) => {
                        const active = selectedByokProvider?.id === provider.id;
                        const configured = byokProviderConfigured(provider);
                        const statusLabel = configured
                          ? t('settings.mediaProviderConfigured')
                          : t('settings.mediaProviderUnset');
                        return (
                          <button
                            key={provider.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={provider.title}
                            className={'protocol-chip protocol-chip--provider' + (active ? ' active' : '')}
                            title={`${provider.title} - ${statusLabel}`}
                            onClick={() => {
                              const byokProviderId = byokProtocolToTracking(provider.protocol);
                              if (byokProviderId) {
                                trackSettingsByokProviderOptionClick(analytics.track, {
                                  page_name: 'settings',
                                  area: 'configure_execution_mode_byok',
                                  element: 'byok_provider_option',
                                  action: 'select_byok_provider',
                                  provider_id: byokProviderId,
                                  is_selected: active,
                                });
                              }
                              if (!active) {
                                setByokProvider(provider);
                              }
                            }}
                          >
                            <span
                              className={`protocol-chip-status${configured ? ' is-configured' : ' is-unset'}`}
                              aria-hidden
                            />
                            <span>{provider.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
          {cfg.mode === 'daemon' ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <p className="hint">{t('settings.codeAgentHint')}</p>
                </div>
              </div>
              {initialAgentScanRunning ? (
                <div className="agent-scan-card" role="status" aria-live="polite">
                  <div className="agent-scan-card__stage">
                    <span className="agent-scan-card__ring" aria-hidden />
                    <strong>{t('settings.rescanRunning')}</strong>
                    <span>{t('settings.codeAgentHint')}</span>
                    <div className="agent-scan-card__progress" aria-hidden>
                      <span />
                    </div>
                  </div>
                  <div className="agent-scan-card__rows" aria-hidden>
                    <span><i /><b /><em /></span>
                    <span><i /><b /><em /></span>
                    <span><i /><b /><em /></span>
                  </div>
                </div>
              ) : agents.length === 0 ? (
                <div className="empty-card">
                  {t('settings.noAgentsDetected')}
                </div>
              ) : (
                <>
                  <div className="agent-group">
                    <div className="agent-group-head">
                      <h4>
                        {t('settings.agentInstalledGroup', {
                          count: installedAgents.length,
                        })}
                      </h4>
                      <div className="agent-group-head-actions">
                        {agentRescanNotice ? (
                          <span
                            className={
                              'settings-rescan-status settings-rescan-status-inline ' +
                              agentRescanNotice.kind
                            }
                            role={
                              agentRescanNotice.kind === 'error'
                                ? 'alert'
                                : 'status'
                            }
                          >
                            {agentRescanNotice.kind === 'success'
                              ? t('settings.rescanSuccess', {
                                  count: agentRescanNotice.count,
                                })
                              : t('settings.rescanFailed')}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={
                            'ghost icon-btn settings-rescan-btn agent-group-rescan-btn' +
                            (agentRescanRunning ? ' loading' : '')
                          }
                          onClick={() => void handleRefreshAgents()}
                          disabled={agentRescanRunning}
                          title={t('settings.rescanTitle')}
                        >
                          {agentRescanRunning ? (
                            <>
                              <Icon
                                name="spinner"
                                size={13}
                                className="icon-spin"
                              />
                              <span>{t('settings.rescanRunning')}</span>
                            </>
                          ) : (
                            t('settings.rescan')
                          )}
                        </button>
                      </div>
                    </div>
                    {installedAgents.length > 0 ? (
                      <div className="agent-grid agent-grid-installed">
                        {installedAgents.map((a) => {
                          const active = cfg.agentId === a.id;
                          const running =
                            active && agentTestState.status === 'running';
                          const description = AGENT_SHORT_DESCRIPTIONS[a.id];
                          const agentName = displayAgentName(a);
                          const diagnosticHandlers = diagnosticHandlersForAgent(a);
                          const modelSummary = agentModelSummary(a);
                          const versionLabel = cleanAgentVersionLabel(a.name, a.version);
                          const metaLabel =
                            a.authStatus === 'missing'
                              ? t('settings.agentAuthRequired')
                              : a.authStatus === 'unknown'
                                ? t('settings.agentAuthUnknown')
                                : versionLabel || t('common.installed');
                          const metaTitle =
                            a.authStatus === 'missing' ||
                            a.authStatus === 'unknown'
                              ? (a.authMessage ?? a.path ?? '')
                              : (a.path ?? '');
                          const cardEl = (
                            <div
                              key={a.id}
                              data-testid={`settings-agent-card-${a.id}`}
                              className={`agent-card agent-card-installed${active ? ' active' : ''}`}
                            >
                              <div className="agent-card-main">
                                <button
                                  type="button"
                                  className="agent-card-select"
                                  data-testid={`settings-agent-select-${a.id}`}
                                  onClick={() => {
                                    trackSettingsLocalCliClick(analytics.track, {
                                      page_name: 'settings',
                                      area: 'configure_execution_mode_local_cli',
                                      element: 'cli_provider',
                                      cli_provider_id: agentIdToTracking(a.id),
                                      install_status: 'installed',
                                    });
                                    setCfg((c) => ({ ...c, agentId: a.id }));
                                  }}
                                  aria-pressed={active}
                                  >
                                    <AgentIcon id={a.id} size={32} />
                                    <div className="agent-card-body">
                                      <div className="agent-card-name">
                                        <span className="agent-card-title">
                                          {agentName}
                                        </span>
                                        {description ? (
                                          <>
                                            <span
                                              className="agent-card-name-divider"
                                              aria-hidden="true"
                                            >
                                              ·
                                            </span>
                                            <span className="agent-card-tagline">
                                              {description}
                                            </span>
                                          </>
                                        ) : null}
                                      </div>
                                      {metaLabel ? (
                                        <div className="agent-card-meta">
                                          <span title={metaTitle}>
                                            {metaLabel}
                                          </span>
                                        </div>
                                      ) : null}
                                      {!active && modelSummary ? (
                                        <div className="agent-card-model-summary">
                                          <span>{t('settings.modelPicker')}</span>
                                          <strong>{modelSummary}</strong>
                                        </div>
                                      ) : null}
                                  </div>
                                </button>
                                {active ? (
                                  <button
                                    type="button"
                                    className={
                                      'ghost icon-btn settings-test-btn agent-card-test-btn' +
                                      (running ? ' loading' : '')
                                    }
                                    onClick={() => void handleTestAgent()}
                                    disabled={running}
                                    title={t('settings.testTitle')}
                                  >
                                    {running ? (
                                      <>
                                        <Icon
                                          name="spinner"
                                          size={13}
                                          className="icon-spin"
                                        />
                                        <span>{t('settings.test')}</span>
                                      </>
                                    ) : (
                                      t('settings.test')
                                    )}
                                  </button>
                                ) : null}
                              </div>
                              {(a.diagnostics ?? []).map((diagnostic, i) => (
                                <AgentDiagnosticRow
                                  key={`${diagnostic.reason}-${i}`}
                                  diagnostic={diagnostic}
                                  handlers={diagnosticHandlers}
                                />
                              ))}
                              {active ? renderAgentModelConfig(a) : null}
                            </div>
                          );
                          if (active && agentTestState.status !== 'idle') {
                            const resultRow = (
                              <div
                                key={`${a.id}__test-result`}
                                className="agent-test-result-row"
                              >
                                {agentTestState.status === 'running' ? (
                                  <p
                                    className="settings-test-status running"
                                    role="status"
                                    aria-live="polite"
                                  >
                                    {t('settings.testRunning')}
                                  </p>
                                ) : (
                                  <>
                                    <p
                                      className={
                                        'settings-test-status ' +
                                        testStatusVariant(agentTestState.result)
                                      }
                                      role={
                                        agentTestState.result.ok
                                          ? 'status'
                                          : 'alert'
                                      }
                                    >
                                      {renderTestMessage(
                                        agentTestState.result,
                                        'cli',
                                      )}
                                    </p>
                                    {!agentTestState.result.ok ? (
                                      <div className="settings-test-actions">
                                        <div className="settings-test-actions-row">
                                          <button
                                            type="button"
                                            className="ghost icon-btn settings-test-btn"
                                            onClick={() => void handleTestAgent()}
                                          >
                                            <Icon name="reload" size={13} />
                                            <span>{t('settings.testRetry')}</span>
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                    {cfg.agentId === 'codex' && (() => {
                                      const repair = codexPathRepairState(
                                        agentTestState.result,
                                      );
                                      if (!repair) return null;
                                      const codexStrings = codexPathStrings(locale);
                                      return (
                                        <div className="settings-test-actions">
                                          <span className="settings-test-actions-hint">
                                            {codexStrings.repairHint}
                                          </span>
                                          <div className="settings-test-actions-row">
                                            {repair.canUseDetected ? (
                                              <button
                                                type="button"
                                                className="settings-test-btn"
                                                onClick={() =>
                                                  applyCodexDetectedPath(
                                                    repair.detectedPath,
                                                  )
                                                }
                                              >
                                                {codexStrings.useDetected}
                                              </button>
                                            ) : null}
                                            <button
                                              type="button"
                                              className="ghost icon-btn settings-rescan-btn"
                                              onClick={clearCodexCustomPath}
                                            >
                                              {codexStrings.clearCustom}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            );
                            return [cardEl, resultRow];
                          }
                          return [cardEl];
                        })}
                      </div>
                    ) : (
                      <div className="empty-card">
                        {t('settings.noAgentsDetected')}
                      </div>
                    )}
                  </div>
                  {unavailableAgents.length > 0 ? (
                    <details
                      className="agent-install-collapse"
                      open={installedAgents.length > 0 ? undefined : true}
                    >
                      <summary className="agent-install-collapse-summary">
                        <span>
                          {t('settings.agentInstallGroup', {
                            count: unavailableAgents.length,
                          })}
                        </span>
                      </summary>
                      <div className="agent-grid agent-grid-unavailable">
                        {unavailableAgents.map((a) => {
                          const installUrl = sanitizeHttpsUrl(a.installUrl);
                          const docsUrl = sanitizeHttpsUrl(a.docsUrl);
                          const hasLinks = Boolean(installUrl || docsUrl);
                          const description = AGENT_SHORT_DESCRIPTIONS[a.id];
                          const agentName = displayAgentName(a);
                          const diagnosticHandlers = diagnosticHandlersForAgent(a);
                          const cardLabel = `${agentName} · ${t('common.notInstalled')}`;
                          return (
                            <div
                              key={a.id}
                              className="agent-card disabled agent-card-unavailable"
                              role="group"
                              aria-label={cardLabel}
                            >
                              <div className="agent-card-unavailable-row">
                                <AgentIcon id={a.id} size={30} />
                                <div className="agent-card-body">
                                  <div className="agent-card-name">
                                    {agentName}
                                  </div>
                                  {description ? (
                                    <div className="agent-card-description">
                                      {description}
                                    </div>
                                  ) : null}
                                </div>
                                {hasLinks ? (
                                  <div className="agent-card-actions agent-card-actions--inline">
                                    {docsUrl ? (
                                      <a
                                        href={docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="agent-card-link agent-card-link--muted agent-card-link--icon"
                                        onClick={markAgentInstallIntent}
                                        title={t('settings.agentInstall.docs')}
                                        aria-label={t('settings.agentInstall.docs')}
                                      >
                                        <Icon name="file" size={15} />
                                      </a>
                                    ) : null}
                                    {installUrl ? (
                                      <a
                                        href={installUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="agent-card-link agent-card-link--ghost"
                                        onClick={markAgentInstallIntent}
                                      >
                                        {t('settings.agentInstall.install')}
                                      </a>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              {/* Why is it unavailable? not-on-path vs a broken
                                  shim vs a bad *_BIN override each get a
                                  distinct, actionable line. It spans the full
                                  card width on its own row below the
                                  logo/name/links so it never crowds the inline
                                  Docs/Install actions. */}
                              {(a.diagnostics ?? []).map((diagnostic, i) => (
                                <AgentDiagnosticRow
                                  key={`${diagnostic.reason}-${i}`}
                                  diagnostic={diagnostic}
                                  handlers={diagnosticHandlers}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                  {/*
                    Show the install guide only when the user has *no*
                    working agent picked yet. Older logic surfaced it
                    whenever any agent on the support list was missing,
                    which fired for almost everyone (few people install
                    all 14 supported CLIs) — the four-step quickstart
                    then sat between the agent grid and the model picker
                    forever, even after the user had successfully picked
                    Claude Code months ago. Once a working agent is
                    selected, the guide has done its job and only adds
                    noise.
                  */}
                  {!agents.find(
                    (a) => a.id === cfg.agentId && a.available,
                  ) ? (
                    <div className="agent-install-guide">
                      <p className="hint agent-install-path-hint">
                        {t('settings.agentInstall.pathHint')}
                      </p>
                      <ol className="agent-install-steps">
                        <li>{t('settings.agentInstall.stepOpenLinks')}</li>
                        <li>{t('settings.agentInstall.stepAuth')}</li>
                        <li>{t('settings.agentInstall.stepRescan')}</li>
                        <li>{t('settings.agentInstall.stepSelect')}</li>
                      </ol>
                    </div>
                  ) : null}
                </>
              )}
              {(() => {
                const selected = agents.find(
                  (a) => a.id === cfg.agentId && a.available,
                );
                if (!selected) return null;
                const hasModels =
                  Array.isArray(selected.models) && selected.models.length > 0;
                const choice = cfg.agentModels?.[selected.id] ?? {};
                const configuredModel =
                  typeof choice.model === 'string' && choice.model
                    ? choice.model
                    : null;
                const modelValue = configuredModel ?? selected.models?.[0]?.id ?? '';
                return (
                  <details className="agent-cli-env settings-memory-advanced">
                    <summary className="agent-cli-env-summary">
                      <span className="agent-cli-env-summary-title">
                        {t('settings.memoryModelInlineLabel')}
                      </span>
                    </summary>
                    <div className="agent-cli-env-body">
                      <MemoryModelInline
                        mode="daemon"
                        apiProtocol={apiProtocol}
                        chatApiKey={cfg.apiKey}
                        chatBaseUrl={cfg.baseUrl}
                        chatApiVersion={cfg.apiVersion ?? ''}
                        chatModel={modelValue}
                        cliAgentId={selected.id}
                        cliModelOptions={
                          hasModels ? selected.models!.map((m) => m.id) : []
                        }
                      />
                    </div>
                  </details>
                );
              })()}
              {(() => {
                /*
                  Per-agent CLI environment overrides — proxy URLs, custom
                  config dirs, and a binary path override. The previous
                  layout listed every supported agent's variables in one
                  long always-expanded block; for users on Claude Code
                  the Codex fields were just visual filler (and vice
                  versa), and the section hijacked Settings real estate
                  on every open even though nine in ten users never
                  touch it. Now: filtered to the *currently selected*
                  agent only, and folded into a collapsed disclosure
                  that opens to "Advanced: proxy & custom paths" — power
                  users who route through LiteLLM or installed the
                  binary out-of-PATH still have one click access; new
                  users no longer wonder "are these fields I forgot to
                  fill in?".
                */
                const cliEnvFields = AGENT_CLI_ENV_FIELDS.filter(
                  (field) => field.agentId === cfg.agentId,
                );
                if (cliEnvFields.length === 0) return null;
                return (
                  <details
                    className="agent-cli-env"
                    data-testid="settings-cli-env"
                  >
                    <summary className="agent-cli-env-summary">
                      <span className="agent-cli-env-summary-title">
                        {t('settings.cliEnvTitle')}
                      </span>
                    </summary>
                    <div className="agent-cli-env-body">
                      <p className="hint">{t('settings.cliEnvHint')}</p>
                      <div className="agent-cli-env-grid">
                        {cliEnvFields.map((field) => (
                          <label
                            className="field"
                            key={`${field.agentId}:${field.envKey}`}
                          >
                            <span className="field-label">
                              {t(field.labelKey)}
                              {'labelSuffix' in field
                                ? ` (${field.labelSuffix})`
                                : ''}
                            </span>
                            <input
                              type={
                                'secret' in field && field.secret
                                  ? 'password'
                                  : 'text'
                              }
                              value={
                                'secret' in field && field.secret
                                  ? credentialInputValue(cfg.agentCliEnv?.[field.agentId]?.[field.envKey])
                                  : cfg.agentCliEnv?.[field.agentId]?.[field.envKey] ?? ''
                              }
                              placeholder={field.placeholder}
                              spellCheck={false}
                              autoComplete="off"
                              onChange={(e) =>
                                setCfg((c) =>
                                  updateAgentCliEnvValue(
                                    c,
                                    field.agentId,
                                    field.envKey,
                                    e.target.value,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })()}
            </section>
          ) : (
            /*
              BYOK panel — wrap the per-protocol form in a bordered card so
              the chips above (Anthropic / OpenAI / Azure / Gemini / Ollama)
              visually own the content below. Without the card, the chip
              row and the form looked like two unrelated stripes; users
              had no anchor for "this is what I configured for the active
              tab", and switching tabs felt like the whole right column
              just reshuffled. The card lives on the same white-with-soft-
              border pattern as `.agent-model-row` so the two BYOK / CLI
              panels feel like the same family.
            */
            <section className="settings-section settings-section-card settings-section-byok">
              <div className="section-head">
                <div>
                  <div className="settings-byok-title">
                    <h3>{API_PROTOCOL_LABELS[apiProtocol]}</h3>
                    <span className="settings-byok-info-wrap">
                      <button
                        type="button"
                        className="settings-byok-info-button"
                        aria-label={t('settings.byokNoFileToolsNotice')}
                        aria-describedby="settings-byok-no-file-tools-tooltip"
                        data-testid="settings-byok-no-file-tools-trigger"
                      >
                        <Icon name="info" size={13} />
                      </button>
                      <span
                        id="settings-byok-no-file-tools-tooltip"
                        className="settings-byok-info-tooltip"
                        role="tooltip"
                        data-testid="settings-byok-no-file-tools-notice"
                      >
                        {t('settings.byokNoFileToolsNotice')}
                      </span>
                    </span>
                  </div>
                </div>
                <ByokConnectionTestControl
                  baseUrlValid={baseUrlValid}
                  canRunConnectionTest={
                    !byokFirstPartyBaseUrl?.hostTypo &&
                    canRunProviderConnectionTest(cfg, {
                      requiresApiKey: byokRequiresApiKey,
                    })
                  }
                  labels={{
                    readyToTest: t('settings.byokReadyToTest'),
                    test: t('settings.test'),
                    testRetry: t('settings.testRetry'),
                    testRunning: t('settings.testRunning'),
                    testTitle: t('settings.testTitle'),
                  }}
                  providerTestState={providerTestState}
                  renderTestMessage={(result) => renderTestMessage(result, 'api')}
                  suppressResultStatus={
                    providerTestBaseUrlInvalid || providerTestApiKeyAuthFailed
                  }
                  suppressReadyState={Boolean(
                    byokPreconditionNotice ||
                      apiKeyFieldAuthFailed ||
                      providerTestBaseUrlInvalid ||
                      byokBlockingDraftIssues.length > 0,
                  )}
                  onTestProvider={() => handleTestProvider()}
                />
              </div>
              {byokActivationPreflightReason ? (
                <p
                  className="settings-test-status warn"
                  role="status"
                  data-testid="settings-byok-draft-notice"
                >
                  {t('settings.byokDraftNotice')}
                </p>
              ) : null}
              {byokPreconditionNotice && !byokPreconditionNotice.field ? (
                <p
                  className="settings-test-status error"
                  role="alert"
                  aria-live="polite"
                  data-action={byokPreconditionNotice.action}
                >
                  {byokPreconditionNotice.message}
                </p>
              ) : null}
              {showProviderPreset ? (
                <ByokProviderPicker
                  label={t('settings.providerPreset')}
                  customProviderLabel={t('settings.customProvider')}
                  providers={protocolProviders}
                  selectedProviderIndex={selectedProviderIndex}
                  onCustomProviderSelect={() => {
                    setApiModelCustomEditing(false);
                    updateApiConfig({
                      baseUrl: '',
                      model: '',
                      apiProviderBaseUrl: null,
                    });
                  }}
                  onProviderSelect={(p) => {
                    setApiModelCustomEditing(false);
                    updateApiConfig({
                      baseUrl: p.baseUrl,
                      model: defaultKnownProviderModel(p),
                      apiProviderBaseUrl: p.baseUrl,
                    });
                  }}
                />
              ) : null}
              <ByokKeyField
                apiKey={credentialInputValue(cfg.apiKey)}
                configured={credentialIsConfigured(cfg.apiKey)}
                savedTail={cfg.apiKeyTail}
                apiKeyConsoleLink={apiKeyConsoleLink}
                apiProtocol={apiProtocol}
                inputRef={apiKeyInputRef}
                labels={{
                  apiHint: t('settings.apiHint'),
                  apiKey: t('settings.apiKey'),
                  apiKeyCleaned: t('settings.apiKeyCleaned'),
                  apiKeyGetLink: t('settings.apiKeyGetLink', {
                    host: apiKeyConsoleLink.host,
                  }),
                  apiKeyInvalid: t('settings.apiKeyInvalid'),
                  hide: t('settings.hide'),
                  hideKey: t('settings.hideKey'),
                  required: t('settings.required'),
                  show: t('settings.show'),
                  showKey: t('settings.showKey'),
                }}
                requiresApiKey={byokRequiresApiKey}
                showApiKeyInvalid={Boolean(
                  apiKeyFieldAuthFailed ||
                    byokPreconditionNotice?.field === 'api_key' ||
                    apiKeyDraftInvalid,
                )}
                showApiKey={showApiKey}
                onBlur={onByokKeyCommit}
                onChange={(value) => {
                  committedClearedByokProviderKeyRef.current = null;
                  updateApiConfig({ apiKey: value });
                }}
                onClear={() => {
                  committedClearedByokProviderKeyRef.current = byokProviderKeyForConfig(cfg);
                  updateApiConfig({ apiKey: '', apiKeyConfigured: false, apiKeyTail: '' });
                  setAutosaveCommitTick((tick) => tick + 1);
                }}
                onFocus={() => {
                  const byokProviderId = byokProtocolToTracking(apiProtocol);
                  if (byokProviderId) {
                    trackSettingsByokFieldClick(analytics.track, {
                      page_name: 'settings',
                      area: 'configure_execution_mode_byok',
                      element: 'api_key',
                      provider_id: byokProviderId,
                      has_value: Boolean(cfg.apiKey?.trim()),
                    });
                  }
                }}
                onToggleShowApiKey={() => setShowApiKey((v) => !v)}
              />
              {showBaseUrlField ? (
                <ByokProviderBaseUrl
                  apiProtocol={apiProtocol}
                  inputRef={baseUrlInputRef}
                  baseUrl={cfg.baseUrl}
                  baseUrlError={baseUrlErrorMessage}
                  baseUrlInvalid={Boolean(baseUrlErrorMessage)}
                  baseUrlPlaceholder={baseUrlPlaceholder}
                  baseUrlReadOnly={baseUrlReadOnly}
                  labels={{
                    baseUrl: t('settings.baseUrl'),
                    required: t('settings.required'),
                    customize: t('settings.baseUrlCustomize'),
                    invalid: t('settings.baseUrlInvalid'),
                    defaultHint: t('settings.baseUrlDefaultHint'),
                    azureHint: t('settings.azureBaseUrlHint'),
                  }}
                  onBlur={commitProviderModelsInputs}
                  onChange={(value) => updateApiConfig({ baseUrl: value, apiProviderBaseUrl: null })}
                  onCustomize={() => {
                    updateApiConfig({ apiProviderBaseUrl: null });
                    window.setTimeout(() => baseUrlInputRef.current?.focus(), 0);
                  }}
                  onFocus={() => {
                    const byokProviderId = byokProtocolToTracking(apiProtocol);
                    if (byokProviderId) {
                      trackSettingsByokFieldClick(analytics.track, {
                        page_name: 'settings',
                        area: 'configure_execution_mode_byok',
                        element: 'base_url',
                        provider_id: byokProviderId,
                        has_value: Boolean(cfg.baseUrl?.trim()),
                      });
                    }
                  }}
                />
              ) : null}
              <label className="field">
                <span className="field-label">{t('settings.maxTokens')}</span>
                <input
                  type="number"
                  min={MIN_MAX_TOKENS}
                  max={MAX_MAX_TOKENS}
                  step={1}
                  placeholder={String(modelMaxTokensDefault(cfg.model))}
                  value={maxTokensInput}
                  onChange={(e) => updateMaxTokensInput(e.target.value)}
                  onBlur={() => setMaxTokensInput(cfg.maxTokens == null ? '' : String(cfg.maxTokens))}
                />
                <p className="hint">{t('settings.maxTokensHint')}</p>
              </label>
              <ByokModelField
                customActive={apiModelCustomActive}
                customInputRef={customModelInputRef}
                labels={{
                  customModel: t('settings.modelCustom'),
                  customModelLabel: apiProtocol === 'azure'
                    ? t('settings.azureCustomDeploymentName')
                    : t('settings.modelCustomLabel'),
                  customModelPlaceholder: apiProtocol === 'azure'
                    ? 'e.g. gpt-4o-production'
                    : t('settings.modelCustomPlaceholder'),
                  fetchModelsUnsupported: t('settings.fetchModelsUnsupported'),
                  model: apiProtocol === 'azure'
                    ? t('settings.azureDeploymentModel')
                    : t('settings.model'),
                  required: t('settings.required'),
                  searchPlaceholder: t('designs.searchPlaceholder'),
                  suggestedModelsHint: t('settings.suggestedModelsHint'),
                }}
                model={cfg.model}
                modelSelectRef={modelSelectRef}
                models={apiModelOptions.map((m) => ({
                  ...m,
                  label: apiModelOptionLabel(
                    m,
                    !hidesAccountModelSourceLabel(apiProtocol) &&
                    loadedAccountModelCount > 0
                      ? fetchedApiModelIds.has(m.id)
                        ? t('settings.modelSourceAccount')
                        : t('settings.modelSourceSuggested')
                      : undefined,
                  ),
                }))}
                modelsLoadedFromAccountMessage={
                  loadedAccountModelCount > 0
                    ? t(
                        hidesAccountModelSourceLabel(apiProtocol)
                          ? 'settings.modelsLoadedCount'
                          : 'settings.modelsLoadedFromAccount',
                        {
                          count: loadedAccountModelCount,
                        },
                      )
                    : null
                }
                providerModelsFailureMessage={providerModelsFailureMessage}
                showAzureModelFetchHint={apiProtocol === 'azure'}
                showFetchModelsUnsupportedHint={
                  apiProtocol !== 'azure' &&
                  isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)
                }
                showSuggestedModelsHint={apiProtocol !== 'azure' && !selectedProvider}
                azureModelFetchHint={t('settings.azureModelFetchHint')}
                onCustomModelChange={(value) => updateApiConfig({ model: value })}
                onCustomModelSelect={() => {
                  apiModelUserSelectedRef.current = true;
                  setApiModelCustomEditing(true);
                  updateApiConfig({ model: '' });
                }}
                onFocus={() => {
                  const byokProviderId = byokProtocolToTracking(apiProtocol);
                  if (byokProviderId) {
                    trackSettingsByokFieldClick(analytics.track, {
                      page_name: 'settings',
                      area: 'configure_execution_mode_byok',
                      element: 'model',
                      provider_id: byokProviderId,
                      has_value: Boolean(cfg.model?.trim()),
                    });
                  }
                }}
                onModelSelect={(nextValue) => {
                  apiModelUserSelectedRef.current = true;
                  setApiModelCustomEditing(false);
                  updateApiConfig({ model: nextValue });
                }}
              />
              <details className="agent-cli-env settings-memory-advanced">
                <summary className="agent-cli-env-summary">
                  <span className="agent-cli-env-summary-title">
                    {t('settings.memoryModelInlineLabel')}
                  </span>
                  <span className="settings-memory-summary-value">
                    {cfg.model.trim()
                      ? t('settings.memoryModelInlineSameAsChatWithModel', {
                          model: cfg.model.trim(),
                        })
                      : t('settings.memoryModelInlineSameAsChat')}
                  </span>
                </summary>
                <div className="agent-cli-env-body">
                  <MemoryModelInline
                    mode="api"
                    apiProtocol={apiProtocol}
                    chatApiKey={cfg.apiKey}
                    chatBaseUrl={cfg.baseUrl}
                    chatApiVersion={cfg.apiVersion ?? ''}
                    chatModel={cfg.model}
                    apiModelOptions={apiModelOptions}
                  />
                </div>
              </details>
              {apiProtocol === 'azure' ? (
                <label className="field">
                  <span className="field-label">{t('settings.apiVersion')}</span>
                  <input
                    type="text"
                    value={cfg.apiVersion ?? ''}
                    placeholder="2024-10-21"
                    onBlur={commitProviderModelsInputs}
                    onChange={(e) => updateApiConfig({ apiVersion: e.target.value.trim() })}
                  />
                </label>
              ) : null}
              {apiProtocol === 'senseaudio' || apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokImageModel')}</span>
                  <SearchableModelSelect
                    className="inline-switcher__select settings-model-select settings-model-select--byok"
                    aria-label={t('settings.byokImageModel')}
                    searchPlaceholder={t('designs.searchPlaceholder')}
                    popoverClassName="settings-byok-select-popover"
                    minSearchableOptions={Number.POSITIVE_INFINITY}
                    // Live catalogue from the shared hook: AIHubMix's image
                    // models for aihubmix, the static SenseAudio registry
                    // otherwise. The default-empty option (first entry) resolves
                    // to the registry default on the daemon side.
                    models={[
                      {
                        id: '',
                        label: byokImageModelOptions[0]?.label
                          ? `${byokImageModelOptions[0].label} (${t('settings.byokModelDefaultOption')})`
                          : t('settings.byokModelDefaultOption'),
                      },
                      ...byokImageModelOptions.map((m) => ({ id: m.id, label: m.label })),
                    ]}
                    value={cfg.byokImageModel ?? ''}
                    onChange={(value) =>
                      updateApiConfig({ byokImageModel: value })
                    }
                  />
                </label>
              ) : null}
              {apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokVideoModel')}</span>
                  <select
                    value={cfg.byokVideoModel ?? ''}
                    onChange={(e) =>
                      updateApiConfig({ byokVideoModel: e.target.value })
                    }
                  >
                    {/* Empty resolves to the default video model on the daemon
                        side. The LLM can still override per-call via the tool's
                        `model` arg. */}
                    <option value="">
                      {byokVideoModelOptions[0]?.label
                        ? `${byokVideoModelOptions[0].label} (${t('settings.byokModelDefaultOption')})`
                        : t('settings.byokModelDefaultOption')}
                    </option>
                    {byokVideoModelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokSpeechModel')}</span>
                  <select
                    value={cfg.byokSpeechModel ?? ''}
                    onChange={(e) => updateApiConfig({ byokSpeechModel: e.target.value })}
                  >
                    <option value="">
                      {byokSpeechModelOptions[0]?.label
                        ? `${byokSpeechModelOptions[0].label} (${t('settings.byokModelDefaultOption')})`
                        : t('settings.byokModelDefaultOption')}
                    </option>
                    {byokSpeechModelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokSpeechVoice')}</span>
                  <select
                    value={cfg.byokSpeechVoice ?? ''}
                    onChange={(e) => updateApiConfig({ byokSpeechVoice: e.target.value })}
                  >
                    <option value="">alloy (default)</option>
                    {['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          )}
            </>
          ) : null}

          {activeSection === 'media' ? (
            <MediaProvidersSection
              cfg={cfg}
              setCfg={setCfg}
              mediaProvidersNotice={mediaProvidersNotice}
              onReloadMediaProviders={onReloadMediaProviders}
              pendingLocalProviderIds={pendingMediaProviderEditIds}
              onChange={(providerId) => {
                mediaProvidersChangeVersionRef.current += 1;
                setPendingMediaProviderEditIds((current) => {
                  if (current.has(providerId)) return current;
                  const next = new Set(current);
                  next.add(providerId);
                  return next;
                });
              }}
            />
          ) : null}
          {activeSection === 'language' ? (
          <section className="settings-section">
            <div className="settings-language-grid" role="radiogroup" aria-label={t('settings.language')}>
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`settings-language-tile${active ? ' active' : ''}`}
                    onClick={() => {
                      // P1 ui_click area=language — record the locale id
                      // that was picked, regardless of whether it differs
                      // from the current one (user clicked = signal).
                      trackSettingsLanguageClick(analytics.track, {
                        page_name: 'settings',
                        area: 'language',
                        element: code,
                      });
                      setLocale(code as Locale);
                    }}
                  >
                    <span className="settings-language-tile-text">
                      <span className="settings-language-tile-title">
                        {LOCALE_LABEL[code]}
                      </span>
                      <span className="settings-language-tile-code">
                        {code}
                      </span>
                    </span>
                    {active ? <Icon name="check" size={16} /> : null}
                  </button>
                );
              })}
            </div>
          </section>
          ) : null}

          {activeSection === 'appearance' ? (
            <AppearanceSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'critiqueTheater' ? (
            <CritiqueTheaterSection />
          ) : null}

          {activeSection === 'notifications' ? (
            <NotificationsSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'pet' ? (
            <PetSettings cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'designSystems' ? (
            <DesignSystemsSection
              cfg={cfg}
              setCfg={setCfg}
              onDesignSystemsChanged={onDesignSystemsChanged}
              onDesignSystemImportRebuildJob={onDesignSystemImportRebuildJob}
            />
          ) : null}

          {activeSection === 'projectLocations' ? (
            <ProjectLocationsSection cfg={cfg} setCfg={setCfg} onProjectsRefresh={onProjectsRefresh} />
          ) : null}

          {activeSection === 'instructions' ? (
            <section className="settings-section settings-section-card instructions-rules-section">
              <div className="memory-field-block instructions-rules-card">
                <div className="memory-block-head">
                  <div>
                    <h4>{t('settings.customInstructionsTitle')}</h4>
                    <p className="hint">
                      {t('settings.customInstructionsDesc')}
                    </p>
                  </div>
                </div>
                <textarea
                  className="custom-instructions-input memory-global-rules-input instructions-rules-input"
                  rows={5}
                  maxLength={5000}
                  placeholder={t('settings.customInstructionsPlaceholder')}
                  value={cfg.customInstructions ?? ''}
                  onChange={(event) =>
                    setCfg({
                      ...cfg,
                      customInstructions: event.target.value || undefined,
                    })
                  }
                />
              </div>
            </section>
          ) : null}

          {activeSection === 'memory' ? (
            <MemorySection
            />
          ) : null}

          {activeSection === 'about' ? (
            <section className="settings-section">
              {appVersionInfo ? (
                <dl className="settings-about-list">
                  <div className="settings-about-version-row">
                    <div className="settings-about-version-copy">
                      <div className="settings-about-version-left">
                        <dt>{t('settings.appVersion')}</dt>
                        <span className="settings-about-version-num">{appVersionInfo.version}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <dt>{t('settings.appChannel')}</dt>
                    <dd>{appVersionInfo.channel}</dd>
                  </div>
                  <div>
                    <dt>{t('settings.appRuntime')}</dt>
                    <dd>
                      {appVersionInfo.packaged
                        ? t('settings.runtimePackaged')
                        : t('settings.runtimeDevelopment')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('settings.appPlatform')}</dt>
                    <dd>{appVersionInfo.platform}</dd>
                  </div>
                  <div>
                    <dt>{t('settings.appArchitecture')}</dt>
                    <dd>{appVersionInfo.arch}</dd>
                  </div>
                </dl>
              ) : (
                <div className="empty-card">{t('settings.versionUnavailable')}</div>
              )}
              <div className="settings-about-diagnostics">
                <div className="settings-about-diagnostics-text">
                  <h4>{t('diagnostics.exportTitle')}</h4>
                  <p className="hint">{t('diagnostics.exportHint')}</p>
                </div>
                <ExportDiagnosticsRow />
              </div>
            </section>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaProvidersSection({
  cfg,
  setCfg,
  mediaProvidersNotice,
  onReloadMediaProviders,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  pendingLocalProviderIds,
  onChange,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  mediaProvidersNotice?: string | null;
  onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<Record<string, ProviderModelOption[]>>>;
  pendingLocalProviderIds: ReadonlySet<string>;
  onChange: (providerId: string) => void;
}) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const [reloadRunning, setReloadRunning] = useState(false);
  const [reloadNotice, setReloadNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [visibleApiKeys, setVisibleApiKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    setVisibleApiKeys((current) => {
      const next = new Set<string>();
      for (const providerId of current) {
        const apiKey = cfg.mediaProviders?.[providerId]?.apiKey ?? '';
        if (apiKey.trim()) next.add(providerId);
      }
      return next.size === current.size ? current : next;
    });
  }, [cfg.mediaProviders]);
  const visibleProviders = MEDIA_PROVIDERS.filter(
    (p) => p.settingsVisible !== false,
  );
  // Split the catalog into two surfaces:
  //   - "Available" — daemon ships a real client, user can paste a key
  //     and it works. Rendered as full editable cards.
  //   - "Coming soon" — listed for transparency / roadmap signaling but
  //     the daemon has no client yet, so the form fields would be
  //     disabled placeholders. Hiding them behind a <details> keeps the
  //     primary list focused (was 16 cards, now 8) without dropping the
  //     informational value.
  const availableProviders = visibleProviders
    .filter((p) => p.integrated)
    .slice()
    .sort((a, b) => {
      const aEntry = cfg.mediaProviders?.[a.id];
      const bEntry = cfg.mediaProviders?.[b.id];
      const aConfigured = isStoredMediaProviderEntryPresent(aEntry);
      const bConfigured = isStoredMediaProviderEntryPresent(bEntry);
      if (aConfigured !== bConfigured) return aConfigured ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  const comingSoonProviders = visibleProviders
    .filter((p) => !p.integrated)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
  const updateProvider = (
    provider: MediaProvider,
    patch: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      apiKeyConfigured?: boolean;
      apiKeyTail?: string;
    },
  ) => {
    onChange(provider.id);
    setCfg((curr) => {
      const prev = curr.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
      const next = { ...prev, ...patch };
      const map = { ...(curr.mediaProviders ?? {}) };
      if (isStoredMediaProviderEntryEmpty(next)) {
        delete map[provider.id];
      } else {
        map[provider.id] = next;
      }
      return { ...curr, mediaProviders: map };
    });
  };
  const handleReload = async () => {
    if (!onReloadMediaProviders || reloadRunning) return;
    setReloadRunning(true);
    setReloadNotice(null);
    try {
      const next = await onReloadMediaProviders();
      if (!next) {
        setReloadNotice({ kind: 'error', message: t('settings.mediaProviderReloadError') });
        return;
      }
      setCfg((curr) => mergeDaemonMediaProviders(curr, next, {
        preserveLocalProviderIds: pendingLocalProviderIds,
      }));
      setReloadNotice({ kind: 'success', message: t('settings.mediaProviderReloadSuccess') });
    } finally {
      setReloadRunning(false);
    }
  };
  // Successful reload acknowledgement lives on the button (✓ Reloaded)
  // for ~2s then disappears. Keeping it as a permanent paragraph under
  // the section header was noise — the user just clicked a button and
  // got a visible state change, an extra "we did the thing" line is
  // redundant. Errors stay sticky because they actually require user
  // attention.
  useEffect(() => {
    if (reloadNotice?.kind !== 'success') return;
    const handle = window.setTimeout(() => setReloadNotice(null), 2000);
    return () => window.clearTimeout(handle);
  }, [reloadNotice]);

  const toggleApiKeyVisibility = (providerId: string) => {
    setVisibleApiKeys((current) => {
      const next = new Set(current);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  return (
    <section className="settings-section">
      {mediaProvidersNotice ? (
        <p className="hint" role="alert">{mediaProvidersNotice}</p>
      ) : null}
      {reloadNotice && reloadNotice.kind === 'error' ? (
        // Errors only — successful reload feedback now rides on the
        // button (see is-success-flash above) and clears itself after
        // 2s, so the section header doesn't get colonised by a
        // permanent "yes I did the thing" paragraph.
        <p className="hint" role="alert">{reloadNotice.message}</p>
      ) : null}
      {reloadNotice && reloadNotice.kind === 'success' ? (
        // Off-screen announcement so assistive tech still hears the
        // success state even though the visible feedback collapses
        // into a transient button label change.
        <VisuallyHidden role="status">
          {reloadNotice.message}
        </VisuallyHidden>
      ) : null}
      {onReloadMediaProviders ? (
        <div className="media-provider-reload-row">
          <button
            type="button"
            className={`ghost media-provider-reload-btn${
              reloadNotice?.kind === 'success' ? ' is-success-flash' : ''
            }`}
            onClick={() => {
              trackSettingsMediaProvidersClick(analytics.track, {
                page_name: 'settings',
                area: 'media_providers',
                element: 'reload',
              });
              void handleReload();
            }}
            disabled={reloadRunning}
            aria-live="polite"
          >
            {reloadRunning ? (
              t('common.loading')
            ) : reloadNotice?.kind === 'success' ? (
              <>
                <Icon name="check" size={13} />
                <span style={{ marginLeft: 4 }}>Reloaded</span>
              </>
            ) : (
              <>
                <Icon name="refresh" size={13} />
                <span style={{ marginLeft: 4 }}>{t('settings.mediaProviderReload')}</span>
              </>
            )}
          </button>
        </div>
      ) : null}
      <div className="media-provider-list">
        {availableProviders.map((provider) => {
          const entry = cfg.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
          const hasPendingEdit = Boolean(entry.apiKey.trim()) && !credentialIsConfigured(entry.apiKey);
          const isSavedState = credentialIsConfigured(entry.apiKey) || Boolean(entry.apiKeyConfigured && !hasPendingEdit);
          const tail = entry.apiKeyTail?.trim();
          // Every provider rendered in the main list is integrated by
          // construction (see availableProviders filter), so the inputs
          // are always editable here. Non-integrated entries live in
          // the "Coming soon" <details> below.
          const disabled = false;
          const supportsCustomModel = provider.supportsCustomModel === true;
          const requiresCredentials = provider.credentialsRequired !== false;
          const clearable = isStoredMediaProviderEntryPresent(entry);
          const apiKeyVisible = visibleApiKeys.has(provider.id);
          return (
            <div key={provider.id} className="media-provider-row">
              <div className="media-provider-head">
                <div className="media-provider-meta">
                  {/*
                    Provider name + "Saved" badge sit on a single row.
                    The badge used to render below the name with a green
                    success-pill treatment, which clashed with the green
                    "Integrated" badge on the right of the same row and
                    pushed the model hint two lines down. Inline + a
                    neutral muted treatment keeps the row scannable: green
                    means "we support this", blue means "you configured
                    it", gray means "your key is persisted" — three
                    distinct hues, three distinct meanings.
                  */}
                  <div className="media-provider-name-row">
                    <span className="media-provider-name">{provider.label}</span>
                    {isSavedState ? (
                      <span
                        className="field-status-badge field-status-badge--inline"
                        title={t('settings.mediaProviderConfigured')}
                      >
                        {t('settings.mediaProviderConfigured')}{tail ? ` · ••••${tail}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <span className="media-provider-hint">{provider.hint}</span>
                </div>
                {/*
                  Right-side badges deliberately omitted now: every row
                  in this list is "Integrated" by definition and the
                  "Configured" pill duplicated the inline "Saved" chip
                  next to the provider name. Three pills per row read
                  as warnings; one chip reads as status.
                */}
              </div>
              {provider.id === 'grok' ? <XaiOAuthControl /> : null}
              {requiresCredentials ? (
                <div className="media-provider-body">
                  <div className="media-provider-secret-field">
                    <input
                      type={apiKeyVisible ? 'text' : 'password'}
                      value={credentialInputValue(entry.apiKey)}
                      placeholder={t('settings.mediaProviderPlaceholder')}
                      aria-label={`${provider.label} ${t('settings.mediaProviderApiKey')}`}
                      disabled={disabled}
                      onFocus={() => {
                        trackSettingsMediaProvidersClick(analytics.track, {
                          page_name: 'settings',
                          area: 'media_providers',
                          element: 'key_input',
                          providers_id: provider.id,
                          is_configured: clearable,
                        });
                      }}
                      onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                    />
                    <button
                      type="button"
                      className="secret-visibility-button"
                      disabled={disabled}
                      aria-label={
                        apiKeyVisible
                          ? `${provider.label} ${t('settings.hideKey')}`
                          : `${provider.label} ${t('settings.showKey')}`
                      }
                      aria-pressed={apiKeyVisible}
                      onClick={() => toggleApiKeyVisibility(provider.id)}
                    >
                        <Icon name={apiKeyVisible ? 'eye' : 'eye-off'} size={15} />
                      </button>
                    </div>
                  <input
                    value={entry.baseUrl}
                    placeholder={provider.defaultBaseUrl || t('settings.mediaProviderBaseUrlPlaceholder')}
                    aria-label={`${provider.label} ${t('settings.mediaProviderBaseUrl')}`}
                    disabled={disabled}
                    onFocus={() => {
                      trackSettingsMediaProvidersClick(analytics.track, {
                        page_name: 'settings',
                        area: 'media_providers',
                        element: 'url_input',
                        providers_id: provider.id,
                        is_configured: clearable,
                      });
                    }}
                    onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
                  />
                  {supportsCustomModel ? (
                    <input
                      value={entry.model ?? ''}
                      placeholder="gemini-3.1-flash-image-preview"
                      aria-label={`${provider.label} model`}
                      disabled={disabled}
                      onChange={(e) => updateProvider(provider, { model: e.target.value })}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    disabled={!clearable}
                    onClick={() => {
                      trackSettingsMediaProvidersClick(analytics.track, {
                        page_name: 'settings',
                        area: 'media_providers',
                        element: 'clear',
                        providers_id: provider.id,
                        // The click reports the state at the moment the
                        // user pressed Clear; the actual clear only lands
                        // after they confirm the dialog below, but the
                        // dashboard cares about the intent signal.
                        is_configured: clearable,
                      });
                      // Match the existing window.confirm guard the rest of
                      // the app uses for destructive actions (conversation
                      // delete, design delete, file delete in FileWorkspace).
                      // Without this a stray click on the row's Clear button
                      // wipes the saved key with no recovery. Issue #737.
                      if (
                        !confirm(
                          t('settings.mediaProviderClearConfirm', {
                            name: provider.label,
                          }),
                        )
                      ) {
                        return;
                      }
                      updateProvider(provider, {
                        apiKey: '',
                        baseUrl: '',
                        model: '',
                        apiKeyConfigured: false,
                        apiKeyTail: '',
                      });
                    }}
                  >
                    {t('settings.mediaProviderClear')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {comingSoonProviders.length > 0 ? (
        // Roadmap drawer. We still want to advertise that we know
        // these providers exist (so users don't ask "where is Fal?"),
        // but disabled placeholder cards in the main list were noise.
        // Closed by default — opens to a compact name + hint + docs
        // link list, no inputs because there's nothing to wire up yet.
        // TODO(i18n): inline English placeholders; promote to locale
        // keys when we touch this section again.
        <details className="library-group media-provider-coming-soon">
          <summary className="memory-details-summary">
            <span className="memory-details-title">
              {t('common.comingSoon')}
            </span>
            <span className="filter-pill-count">
              {comingSoonProviders.length}
            </span>
          </summary>
          <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
            {t('settings.mediaProviderComingSoonHint')}
          </p>
          <ul className="media-provider-coming-soon-list">
            {comingSoonProviders.map((provider) => {
              const docsHref = sanitizeHttpsUrl(provider.docsUrl);
              return (
                <li
                  key={provider.id}
                  className="media-provider-coming-soon-item"
                >
                  <div className="media-provider-coming-soon-meta">
                    <span className="media-provider-name">
                      {provider.label}
                    </span>
                    <span className="media-provider-hint">
                      {provider.hint}
                    </span>
                  </div>
                  {docsHref ? (
                    <a
                      href={docsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghost-link"
                    >
                      {t('settings.agentInstall.docs')}
                      <Icon name="external-link" size={11} />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

// Appearance settings remain local to the renderer.

const THEMES: Array<{ value: AppTheme; labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark'; icon?: 'sun' | 'moon' }> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight', icon: 'sun' },
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'moon' },
];

function AppearanceSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const current = cfg.theme ?? 'system';
  const currentAccent = normalizeAccentColor(cfg.accentColor) ?? DEFAULT_ACCENT_COLOR;
  const accentLabel = t('pet.fieldAccent');
  const defaultAccentLabel = t('pet.fieldAccentDefault');
  const customAccentLabel = t('pet.fieldAccentCustom');

  // Apply the draft theme immediately so the user sees a live preview
  // before hitting Save. SettingsDialog's cleanup reverts this on cancel.
  useLayoutEffect(() => {
    applyAppearanceToDocument({
      theme: current,
      accentColor: currentAccent,
    });
  }, [current, currentAccent]);

  const setAccentColor = (color: string) => {
    setCfg((c) => ({ ...c, accentColor: normalizeAccentColor(color) ?? c.accentColor ?? DEFAULT_ACCENT_COLOR }));
  };

  return (
    <section className="settings-section">
      <div className="seg-control" role="group" aria-label={t('settings.appearance')} style={{ '--seg-cols': THEMES.length } as React.CSSProperties}>
        {THEMES.map(({ value, labelKey, icon }) => (
          <button
            key={value}
            type="button"
            className={'seg-btn' + (current === value ? ' active' : '')}
            aria-pressed={current === value}
            onClick={() => {
              // P1 ui_click area=appearance — `system|light|dark` only
              // emits from the segmented control; accent swatch picks
              // use `accent_color` with the swatch hex below.
              if (value === 'system' || value === 'light' || value === 'dark') {
                trackSettingsAppearanceClick(analytics.track, {
                  page_name: 'settings',
                  area: 'appearance',
                  element: value,
                });
              }
              setCfg((c) => ({ ...c, theme: value }));
            }}
          >
            {icon ? <Icon name={icon} size={14} aria-hidden="true" /> : null}
            <span className="seg-title">{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <span className="field-label">{accentLabel}</span>
        <div className="pet-swatches" role="radiogroup" aria-label={accentLabel}>
          {ACCENT_SWATCHES.map((color) => {
            const active = currentAccent === color;
            return (
              <button
                key={color}
                type="button"
                className={`pet-swatch${active ? ' active' : ''}`}
                style={{ background: color }}
                aria-label={color === DEFAULT_ACCENT_COLOR ? defaultAccentLabel : color}
                aria-checked={active}
                role="radio"
                onClick={() => {
                  trackSettingsAppearanceClick(analytics.track, {
                    page_name: 'settings',
                    area: 'appearance',
                    element: 'accent_color',
                    color,
                  });
                  setAccentColor(color);
                }}
              />
            );
          })}
          <input
            type="color"
            aria-label={customAccentLabel}
            className="pet-swatch-picker"
            value={currentAccent}
            onChange={(e) => setAccentColor(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Settings surface for the M1 Critique Theater rollout toggle.
 *
 * The toggle has two halves on opposite sides of the HTTP boundary:
 *
 *   * Browser-side: `useCritiqueTheaterEnabled` reads / writes the
 *     `clean-design:config` localStorage blob; this is what gates
 *     whether `<CritiqueTheaterMount>` actually renders.
 *   * Daemon-side: the rollout resolver in `server.ts` reads
 *     `project.metadata.critiqueTheaterEnabled`, so the daemon only
 *     routes runs through the critique pipeline when the active
 *     project's metadata row says yes (or env / phase / skill policy
 *     overrides it).
 *
 * If we only wrote localStorage, the user would see the mount but
 * every generation would still skip the critique pipeline server-side
 * (Codex + lefarcen P1 on PR #1484). To keep the two halves in
 * lockstep, the setter takes an optional `{ projectId }` and, when
 * provided, does the read-merge-write PATCH on the project's metadata
 * (already shipped by Phase 15 and exercised by the wireup PR).
 *
 * This section threads the currently-open project id when the dialog
 * is opened from `/projects/:id`. When opened from the entry gallery
 * (`/`), the toggle is localStorage-only, and a contextual hint tells
 * the user that per-project persistence requires opening a project
 * first. That matches the actual scope of the wire-up.
 */
function CritiqueTheaterSection() {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const enabled = useCritiqueTheaterEnabled();
  const route = useRoute();
  const activeProjectId = route.kind === 'project' ? route.projectId : null;
  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('critiqueTheater.settingsNav')}</h3>
          <p className="hint">{t('critiqueTheater.settingsNavHint')}</p>
        </div>
      </div>
      <label className="field">
        <span className="field-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              trackSettingsDesignReviewClick(analytics.track, {
                page_name: 'settings',
                area: 'design_review',
                element: 'enable_toggle',
                status_before: enabled ? 'on' : 'off',
                status_after: next ? 'on' : 'off',
                has_active_project: activeProjectId !== null,
              });
              if (activeProjectId !== null) {
                void setCritiqueTheaterEnabled(next, { projectId: activeProjectId });
              } else {
                void setCritiqueTheaterEnabled(next);
              }
            }}
          />
          {' '}
          {t('critiqueTheater.settingsEnabledLabel')}
        </span>
        <small className="hint">
          {t('critiqueTheater.settingsEnabledDescription')}
        </small>
        {activeProjectId !== null ? (
          <small className="hint">
            {t('critiqueTheater.settingsEnabledProjectHint')}
          </small>
        ) : (
          <small className="hint">
            {t('critiqueTheater.settingsEnabledNoProjectHint')}
          </small>
        )}
      </label>
    </section>
  );
}

// Map the runtime SoundId (hyphenated, used by utils/notifications.ts) onto
// the contract's underscored enum. Sounds that don't have a tracking entry
// drop to undefined so we never emit an off-enum value.
function soundIdToTracking(
  id: string,
):
  | 'ding'
  | 'chime'
  | 'two_tone_up'
  | 'pluck'
  | 'buzz'
  | 'two_tone_down'
  | 'thud'
  | undefined {
  switch (id) {
    case 'ding':
      return 'ding';
    case 'chime':
      return 'chime';
    case 'two-tone-up':
      return 'two_tone_up';
    case 'pluck':
      return 'pluck';
    case 'buzz':
      return 'buzz';
    case 'two-tone-down':
      return 'two_tone_down';
    case 'thud':
      return 'thud';
    default:
      return undefined;
  }
}

function NotificationsSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const notif = cfg.notifications ?? DEFAULT_NOTIFICATIONS;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    () => notificationPermission(),
  );
  const [testStatus, setTestStatus] = useState<ReturnType<typeof testNotificationStatusText> | null>(null);

  const updateNotif = (
    patch: Partial<NonNullable<AppConfig['notifications']>>,
  ) => {
    setCfg((c) => ({
      ...c,
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(c.notifications ?? {}), ...patch },
    }));
  };

  const toggleSound = () => {
    const next = !notif.soundEnabled;
    // P1 ui_click area=notifications element=completion_sound — the toggle
    // emits the post-click state on `completion_sound_status` so a single
    // event captures intent + outcome.
    trackSettingsNotificationsClick(analytics.track, {
      page_name: 'settings',
      area: 'notifications',
      element: 'completion_sound',
      completion_sound_status: next ? 'on' : 'off',
    });
    updateNotif({ soundEnabled: next });
    // Give the user immediate audible feedback when turning the master
    // switch on so they know which sound they're signing up for. Resuming
    // the AudioContext also bakes in their gesture for later auto-plays.
    if (next) playSound(notif.successSoundId);
  };

  const toggleDesktop = async () => {
    if (notif.desktopEnabled) {
      trackSettingsNotificationsClick(analytics.track, {
        page_name: 'settings',
        area: 'notifications',
        element: 'desktop_notification',
        desktop_notification_status: 'off',
      });
      updateNotif({ desktopEnabled: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      trackSettingsNotificationsClick(analytics.track, {
        page_name: 'settings',
        area: 'notifications',
        element: 'desktop_notification',
        desktop_notification_status: 'on',
      });
      updateNotif({ desktopEnabled: true });
    } else {
      trackSettingsNotificationsClick(analytics.track, {
        page_name: 'settings',
        area: 'notifications',
        element: 'desktop_notification',
        desktop_notification_status: 'off',
      });
      updateNotif({ desktopEnabled: false });
    }
  };

  const sendTestNotification = async () => {
    const result = await showCompletionNotification({
      status: 'succeeded',
      title: t('notify.successTitle'),
      body: t('notify.successBody'),
    });
    setPermission(notificationPermission());
    setTestStatus(testNotificationStatusText(result));
  };

  return (
    <section className="settings-section">
      <div className="settings-subsection">
        <div className="settings-notify-card">
          <div className="settings-notify-card-header">
            <h4>{t('settings.notifyCompletionSound')}</h4>
            <div className="section-head-actions">
              <div className="seg-control" role="group" aria-label={t('settings.notifyCompletionSound')} style={{ '--seg-cols': 1 } as React.CSSProperties}>
                <button
                  type="button"
                  className={'seg-btn' + (notif.soundEnabled ? ' active' : '')}
                  aria-pressed={notif.soundEnabled}
                  onClick={toggleSound}
                >
                  <span className="seg-title">{notif.soundEnabled ? t('common.active') : t('common.offline')}</span>
                </button>
              </div>
            </div>
          </div>
          <p className="hint settings-notify-card-hint">{t('settings.notifyCompletionSoundHint')}</p>
        </div>

        {notif.soundEnabled ? (
          <>
            <div className="settings-field">
              <label>{t('settings.notifySuccessSound')}</label>
              <div className="seg-control" role="group" aria-label={t('settings.notifySuccessSound')} style={{ '--seg-cols': SUCCESS_SOUNDS.length } as React.CSSProperties}>
                {SUCCESS_SOUNDS.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={'seg-btn' + (notif.successSoundId === sound.id ? ' active' : '')}
                    aria-pressed={notif.successSoundId === sound.id}
                    onClick={() => {
                      const trackingSoundId = soundIdToTracking(sound.id);
                      trackSettingsNotificationsClick(analytics.track, {
                        page_name: 'settings',
                        area: 'notifications',
                        element: 'success_sound',
                        ...(trackingSoundId ? { sound_id: trackingSoundId } : {}),
                      });
                      updateNotif({ successSoundId: sound.id });
                      playSound(sound.id);
                    }}
                  >
                    <span className="seg-title">{t(sound.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field">
              <label>{t('settings.notifyFailureSound')}</label>
              <div className="seg-control" role="group" aria-label={t('settings.notifyFailureSound')} style={{ '--seg-cols': FAILURE_SOUNDS.length } as React.CSSProperties}>
                {FAILURE_SOUNDS.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={'seg-btn' + (notif.failureSoundId === sound.id ? ' active' : '')}
                    aria-pressed={notif.failureSoundId === sound.id}
                    onClick={() => {
                      const trackingSoundId = soundIdToTracking(sound.id);
                      trackSettingsNotificationsClick(analytics.track, {
                        page_name: 'settings',
                        area: 'notifications',
                        element: 'failure_sound',
                        ...(trackingSoundId ? { sound_id: trackingSoundId } : {}),
                      });
                      updateNotif({ failureSoundId: sound.id });
                      playSound(sound.id);
                    }}
                  >
                    <span className="seg-title">{t(sound.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="settings-subsection">
        <div className="settings-notify-card">
          <div className="settings-notify-card-header">
            <h4>{t('settings.notifyDesktop')}</h4>
            <div className="section-head-actions">
              <div className="seg-control" role="group" aria-label={t('settings.notifyDesktop')} style={{ '--seg-cols': 1 } as React.CSSProperties}>
                <button
                  type="button"
                  className={'seg-btn' + (notif.desktopEnabled ? ' active' : '')}
                  aria-pressed={notif.desktopEnabled}
                  disabled={permission === 'unsupported'}
                  onClick={() => { void toggleDesktop(); }}
                >
                  <span className="seg-title">{notif.desktopEnabled ? t('common.active') : t('common.offline')}</span>
                </button>
              </div>
            </div>
          </div>
          <p className="hint settings-notify-card-hint">{t('settings.notifyDesktopHint')}</p>
        </div>
        {permission === 'unsupported' ? (
          <p className="hint">{t('settings.notifyDesktopUnsupported')}</p>
        ) : null}
        {permission === 'denied' ? (
          <p className="hint">{t('settings.notifyDesktopBlocked')}</p>
        ) : null}
        {notif.desktopEnabled && permission === 'granted' ? (
          <>
            <Button variant="ghost" onClick={() => {
              trackSettingsNotificationsClick(analytics.track, {
                page_name: 'settings',
                area: 'notifications',
                element: 'send_test',
              });
              void sendTestNotification();
            }}>
              {t('settings.notifyTest')}
            </Button>
            {testStatus ? <p className="hint" role="status">{t(testStatus)}</p> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function testNotificationStatusText(
  result: Awaited<ReturnType<typeof showCompletionNotification>>,
):
  | 'settings.notifyTestSent'
  | 'settings.notifyDesktopBlocked'
  | 'settings.notifyDesktopUnsupported'
  | 'settings.notifyTestFailed' {
  if (result === 'shown') return 'settings.notifyTestSent';
  if (result === 'permission-denied') return 'settings.notifyDesktopBlocked';
  if (result === 'unsupported') return 'settings.notifyDesktopUnsupported';
  return 'settings.notifyTestFailed';
}
