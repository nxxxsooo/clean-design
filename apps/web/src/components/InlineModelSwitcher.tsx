import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { useT } from '../i18n';
import { fetchProviderModels } from '../providers/provider-models';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { KNOWN_PROVIDERS } from '../state/config';
import type { AgentInfo, ApiProtocol, AppConfig, ExecMode } from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';
import { AgentIcon } from './AgentIcon';
import {
  effectiveAgentModelChoice,
  normalizeAgentModelChoice,
} from './agentModelSelection';
import { Icon } from './Icon';
import { SearchableModelSelect } from './modelOptions';
import {
  mergeProviderModelOptions,
  providerModelsCacheKey,
  type ProviderModelsCache,
} from './providerModelsCache';

interface Props {
  config: AppConfig;
  agents: AgentInfo[];
  providerModelsCache?: ProviderModelsCache;
  compact?: boolean;
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (id: string, choice: { model?: string; reasoning?: string }) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  onOpenSettings: (section?: 'execution' | 'media' | 'language' | 'appearance' | 'notifications' | 'pet' | 'about') => void;
}

const API_PROTOCOL_TABS: Array<{ id: ApiProtocol; title: string }> = [
  { id: 'anthropic', title: 'Anthropic' },
  { id: 'openai', title: 'OpenAI' },
  { id: 'azure', title: 'Azure' },
  { id: 'google', title: 'Google' },
  { id: 'aihubmix', title: 'AIHubMix' },
];

export function InlineModelSwitcher({
  config,
  agents,
  providerModelsCache,
  compact = false,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onProviderModelsCacheChange,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const providerModelsFetchingRef = useRef<Set<string>>(new Set());

  const visibleAgents = useMemo(
    () => agents.filter((agent) => agent.available && isVisibleLocalCliAgent(agent)),
    [agents],
  );
  const currentAgent = useMemo(
    () => visibleAgents.find((agent) => agent.id === config.agentId) ?? null,
    [config.agentId, visibleAgents],
  );
  const currentChoice = config.agentId ? config.agentModels?.[config.agentId] ?? {} : {};
  const normalizedChoice = normalizeAgentModelChoice(currentAgent, currentChoice);
  const effectiveChoice = effectiveAgentModelChoice(currentAgent, currentChoice) ?? currentChoice;
  const currentModelId = effectiveChoice.model || currentAgent?.models?.[0]?.id || '';
  const currentModelLabel = currentAgent?.models?.find((model) => model.id === currentModelId)?.label
    ?? currentModelId
    ?? t('inlineSwitcher.modelDefault');

  useEffect(() => {
    if (!currentAgent || !normalizedChoice?.model) return;
    if (
      normalizedChoice.model === currentChoice.model
      && normalizedChoice.reasoning === currentChoice.reasoning
    ) return;
    onAgentModelChange(currentAgent.id, normalizedChoice);
  }, [currentAgent, currentChoice.model, currentChoice.reasoning, normalizedChoice, onAgentModelChange]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.model-select-searchable__popover')) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const getModelPopoverBoundary = useCallback(() => {
    const scrollContainer = wrapRef.current?.closest<HTMLElement>('.entry-main--scroll');
    const scrollRect = scrollContainer?.getBoundingClientRect();
    const topbarRect = scrollContainer?.querySelector<HTMLElement>('.entry-main__topbar')?.getBoundingClientRect();
    return {
      top: Math.max(8, (topbarRect?.bottom ?? scrollRect?.top ?? 0) + 8),
      right: Math.min(window.innerWidth - 8, (scrollRect?.right ?? window.innerWidth) - 8),
      bottom: Math.min(window.innerHeight - 8, (scrollRect?.bottom ?? window.innerHeight) - 8),
      left: Math.max(8, (scrollRect?.left ?? 0) + 8),
    };
  }, []);

  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const provider = useMemo(
    () => KNOWN_PROVIDERS.find((candidate) => (
      candidate.protocol === apiProtocol
      && Boolean(config.apiProviderBaseUrl)
      && candidate.baseUrl === config.apiProviderBaseUrl
    )) ?? KNOWN_PROVIDERS.find((candidate) => candidate.protocol === apiProtocol),
    [apiProtocol, config.apiProviderBaseUrl],
  );
  const modelsKey = useMemo(
    () => providerModelsCacheKey(apiProtocol, config.baseUrl, config.apiKey, config.apiVersion ?? ''),
    [apiProtocol, config.apiKey, config.apiVersion, config.baseUrl],
  );
  const fetchedModels = providerModelsCache?.[modelsKey] ?? [];
  const suggestedModels = useMemo(
    () => Array.from(new Set(
      provider?.preferredModels.length
        ? provider.preferredModels
        : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
    )),
    [apiProtocol, provider],
  );
  const apiModels = useMemo(
    () => mergeProviderModelOptions(fetchedModels, suggestedModels),
    [fetchedModels, suggestedModels],
  );

  useEffect(() => {
    if (!open || config.mode !== 'api' || !onProviderModelsCacheChange) return;
    if (apiProtocol === 'azure' || apiProtocol === 'ollama') return;
    if (apiProtocol !== 'aihubmix' && !config.apiKey && !config.apiKeyConfigured) return;
    const baseUrl = config.baseUrl.trim();
    if (!/^https?:\/\//i.test(baseUrl) || fetchedModels.length > 0) return;
    if (providerModelsFetchingRef.current.has(modelsKey)) return;
    providerModelsFetchingRef.current.add(modelsKey);
    let active = true;
    void fetchProviderModels({
      protocol: apiProtocol,
      baseUrl,
      apiKey: config.apiKey,
    }).then((result) => {
      if (!active || !result.ok || !result.models?.length) return;
      onProviderModelsCacheChange((current) => ({ ...current, [modelsKey]: result.models ?? [] }));
    }).catch(() => undefined).finally(() => {
      providerModelsFetchingRef.current.delete(modelsKey);
    });
    return () => { active = false; };
  }, [
    apiProtocol,
    config.apiKey,
    config.apiKeyConfigured,
    config.baseUrl,
    config.mode,
    fetchedModels.length,
    modelsKey,
    onProviderModelsCacheChange,
    open,
  ]);

  const chipMode = config.mode === 'daemon' ? t('inlineSwitcher.chipCli') : t('inlineSwitcher.chipByok');
  const chipPrimary = config.mode === 'daemon'
    ? currentAgent?.name ?? t('inlineSwitcher.noAgent')
    : apiProtocolLabel(apiProtocol);
  const chipModel = config.mode === 'daemon'
    ? currentModelLabel || t('inlineSwitcher.modelDefault')
    : config.model.trim() || t('inlineSwitcher.modelDefault');

  return (
    <div
      className={`inline-switcher${compact ? ' inline-switcher--compact' : ''}`}
      ref={wrapRef}
      data-testid="inline-model-switcher"
    >
      <button
        ref={chipRef}
        type="button"
        className="inline-switcher__chip od-tooltip"
        data-testid="inline-model-switcher-chip"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${chipMode} · ${chipPrimary} · ${chipModel}`}
        data-tooltip={`${chipMode} · ${chipPrimary} · ${chipModel}`}
        data-tooltip-placement="bottom"
      >
        <span className="inline-switcher__chip-icon" aria-hidden="true">
          {config.mode === 'daemon' && currentAgent ? (
            <AgentIcon id={currentAgent.id} size={18} />
          ) : (
            <span className="inline-switcher__byok-glyph"><Icon name="link" size={12} /></span>
          )}
        </span>
        <span className="inline-switcher__chip-text">
          <span className="inline-switcher__chip-mode">{chipMode}</span>
          <span className="inline-switcher__chip-sep" aria-hidden="true">·</span>
          <span className="inline-switcher__chip-primary">{chipPrimary}</span>
          <span className="inline-switcher__chip-sep" aria-hidden="true">·</span>
          <span className="inline-switcher__chip-model">{chipModel}</span>
        </span>
        <Icon name="chevron-down" size={12} className="inline-switcher__chip-chevron" />
      </button>

      {open ? (
        <div className="inline-switcher__popover" role="menu" data-testid="inline-model-switcher-popover">
          <div className="inline-switcher__row">
            <span className="inline-switcher__label">{t('inlineSwitcher.modeLabel')}</span>
            <div className="inline-switcher__seg" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={config.mode === 'daemon'}
                className={`inline-switcher__seg-btn${config.mode === 'daemon' ? ' is-active' : ''}`}
                data-testid="inline-model-switcher-mode-daemon"
                disabled={!daemonLive && config.mode !== 'daemon'}
                onClick={() => {
                  onModeChange('daemon');
                  if (!daemonLive) {
                    setOpen(false);
                    onOpenSettings('execution');
                  }
                }}
              >
                {t('inlineSwitcher.chipCli')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={config.mode === 'api'}
                className={`inline-switcher__seg-btn${config.mode === 'api' ? ' is-active' : ''}`}
                data-testid="inline-model-switcher-mode-api"
                onClick={() => onModeChange('api')}
              >
                {t('inlineSwitcher.chipByok')}
              </button>
            </div>
          </div>

          {config.mode === 'daemon' ? (
            <>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">{t('inlineSwitcher.agentLabel')}</span>
                {visibleAgents.length === 0 ? (
                  <span className="inline-switcher__hint">{t('inlineSwitcher.noAgentsDetected')}</span>
                ) : (
                  <div className="inline-switcher__agent-grid" role="radiogroup">
                    {visibleAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        role="radio"
                        aria-checked={config.agentId === agent.id}
                        aria-label={agent.name}
                        className={`inline-switcher__agent${config.agentId === agent.id ? ' is-active' : ''}`}
                        data-testid={`inline-model-switcher-agent-${agent.id}`}
                        onClick={() => onAgentChange(agent.id)}
                        title={agent.version ? `${agent.name} · ${agent.version}` : agent.name}
                      >
                        <AgentIcon id={agent.id} size={20} />
                        <span className="inline-switcher__agent-name">{agent.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {currentAgent?.models?.length ? (
                <div className="inline-switcher__row">
                  <span className="inline-switcher__label">{t('inlineSwitcher.modelLabel')}</span>
                  <SearchableModelSelect
                    className="inline-switcher__select"
                    data-testid="inline-model-switcher-agent-model"
                    searchInputTestId="inline-model-switcher-agent-model-search"
                    popoverTestId="inline-model-switcher-agent-model-popover"
                    searchPlaceholder={t('designs.searchPlaceholder')}
                    getPopoverBoundary={getModelPopoverBoundary}
                    aria-label={t('inlineSwitcher.modelLabel')}
                    models={currentAgent.models}
                    value={currentModelId}
                    onChange={(model) => onAgentModelChange(currentAgent.id, { model })}
                    additionalOptions={
                      currentModelId && !currentAgent.models.some((model) => model.id === currentModelId)
                        ? [{ value: currentModelId, label: `${currentModelId} ${t('inlineSwitcher.customSuffix')}` }]
                        : undefined
                    }
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">{t('inlineSwitcher.providerLabel')}</span>
                <div className="inline-switcher__chips" role="tablist">
                  {API_PROTOCOL_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={apiProtocol === tab.id}
                      className={`inline-switcher__chip-tab${apiProtocol === tab.id ? ' is-active' : ''}`}
                      data-testid={`inline-model-switcher-provider-${tab.id}`}
                      onClick={() => onApiProtocolChange(tab.id)}
                    >
                      {tab.title}
                    </button>
                  ))}
                </div>
              </div>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">{t('inlineSwitcher.modelLabel')}</span>
                <SearchableModelSelect
                  className="inline-switcher__select"
                  data-testid="inline-model-switcher-api-model"
                  searchInputTestId="inline-model-switcher-api-model-search"
                  popoverTestId="inline-model-switcher-api-model-popover"
                  searchPlaceholder={t('designs.searchPlaceholder')}
                  getPopoverBoundary={getModelPopoverBoundary}
                  aria-label={t('inlineSwitcher.modelLabel')}
                  models={apiModels}
                  value={config.model}
                  onChange={onApiModelChange}
                  additionalOptions={
                    config.model && !apiModels.some((model) => model.id === config.model)
                      ? [{ value: config.model, label: `${config.model} ${t('inlineSwitcher.customSuffix')}` }]
                      : undefined
                  }
                />
              </div>
              {!config.apiKey && !config.apiKeyConfigured ? (
                <div className="inline-switcher__warn" role="status">{t('inlineSwitcher.missingApiKey')}</div>
              ) : null}
            </>
          )}

          <button
            type="button"
            className="inline-switcher__more"
            data-testid="inline-model-switcher-open-settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings('execution');
            }}
          >
            <Icon name="settings" size={13} />
            <span>{t('inlineSwitcher.openFullSettings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
