import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../i18n';
import { fetchProviderModels } from '../providers/provider-models';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { KNOWN_PROVIDERS } from '../state/config';
import type { AgentInfo, AppConfig, ExecMode, ProviderModelOption } from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';
import { AgentIcon } from './AgentIcon';
import { defaultAgentModelId, effectiveAgentModelChoice } from './agentModelSelection';
import { SearchableModelSelect } from './modelOptions';
import { mergeProviderModelOptions, providerModelsCacheKey } from './providerModelsCache';
import { RemixIcon } from './RemixIcon';

interface Props {
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (id: string, choice: { model?: string; reasoning?: string }) => void;
  onApiModelChange?: (model: string) => void;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onOpenSettings: (section?: 'execution') => void;
  onRefreshAgents: () => void;
  onBack?: () => void;
  placement?: 'down' | 'up';
  onOpen?: () => void;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function AvatarMenu({
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiModelChange,
  providerModelsCache,
  onOpenSettings,
  onRefreshAgents,
  onBack,
  placement = 'down',
  onOpen,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, ProviderModelOption[]>>({});
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const installedAgents = useMemo(
    () => agents.filter((agent) => agent.available && isVisibleLocalCliAgent(agent)),
    [agents],
  );
  const currentAgent = useMemo(
    () => installedAgents.find((agent) => agent.id === config.agentId) ?? null,
    [config.agentId, installedAgents],
  );
  const currentChoice = config.agentId ? config.agentModels?.[config.agentId] ?? {} : {};
  const effectiveChoice = effectiveAgentModelChoice(currentAgent, currentChoice) ?? currentChoice;
  const currentModelId = effectiveChoice.model ?? defaultAgentModelId(currentAgent);
  const currentReasoningId = currentChoice.reasoning ?? currentAgent?.reasoningOptions?.[0]?.id ?? null;
  const currentModelLabel = currentAgent?.models?.find((model) => model.id === currentModelId)?.label;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.model-select-searchable__popover')) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 16;
      const gap = 8;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, margin),
        window.innerWidth - width - margin,
      );
      if (placement === 'up') {
        setPopoverStyle({
          position: 'fixed',
          top: 'auto',
          bottom: Math.max(margin, window.innerHeight - rect.top + gap),
          left,
          right: 'auto',
          width,
          maxHeight: Math.min(520, Math.max(160, rect.top - margin - gap)),
          overflowY: 'auto',
          zIndex: 1000,
        });
      } else {
        const top = rect.bottom + gap;
        setPopoverStyle({
          position: 'fixed',
          top,
          bottom: 'auto',
          left,
          right: 'auto',
          width,
          maxHeight: Math.min(520, Math.max(160, window.innerHeight - top - margin)),
          overflowY: 'auto',
          zIndex: 1000,
        });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, placement]);

  const apiProtocol = config.apiProtocol ?? 'openai';
  const provider = KNOWN_PROVIDERS.find((candidate) => (
    candidate.protocol === apiProtocol
    && (config.apiProviderBaseUrl
      ? candidate.baseUrl === config.apiProviderBaseUrl
      : candidate.baseUrl === config.baseUrl)
  )) ?? KNOWN_PROVIDERS.find((candidate) => candidate.protocol === apiProtocol);
  const modelsKey = providerModelsCacheKey(apiProtocol, config.baseUrl, config.apiKey, config.apiVersion ?? '');
  const fetchedModels = providerModelsCache?.[modelsKey] ?? discoveredModels[modelsKey] ?? [];
  const byokModels = mergeProviderModelOptions(
    fetchedModels,
    provider?.preferredModels.length
      ? provider.preferredModels
      : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol] ?? [],
  );

  useEffect(() => {
    if (!open || config.mode !== 'api' || fetchedModels.length > 0) return;
    if (apiProtocol === 'azure' || apiProtocol === 'ollama') return;
    const baseUrl = config.baseUrl.trim();
    if (!baseUrl || (!config.apiKey && !config.apiKeyConfigured)) return;
    let active = true;
    void fetchProviderModels({ protocol: apiProtocol, baseUrl, apiKey: config.apiKey })
      .then((result) => {
        if (!active || !result.ok || !result.models?.length) return;
        setDiscoveredModels((current) => ({ ...current, [modelsKey]: result.models ?? [] }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [
    apiProtocol,
    config.apiKey,
    config.apiKeyConfigured,
    config.baseUrl,
    config.mode,
    fetchedModels.length,
    modelsKey,
    open,
  ]);

  const toggleOpen = () => {
    setOpen((value) => {
      if (!value) onOpen?.();
      return !value;
    });
  };

  return (
    <div className={`avatar-menu avatar-menu--${placement}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="avatar-agent-trigger"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip={t('avatar.settings')}
        title={t('avatar.settings')}
        aria-label={t('avatar.settings')}
      >
        {config.mode === 'daemon' && currentAgent ? (
          <AgentIcon id={currentAgent.id} size={20} />
        ) : (
          <RemixIcon name="link" size={20} />
        )}
        <RemixIcon name="arrow-down-s-line" size={14} />
      </button>

      {open && popoverStyle ? createPortal(
        <div
          ref={popoverRef}
          className="avatar-popover"
          role="dialog"
          aria-label={t('avatar.settings')}
          style={popoverStyle}
        >
          <div className="avatar-popover-head">
            <span className="who">{config.mode === 'daemon' ? t('avatar.localCli') : apiProtocolLabel(apiProtocol)}</span>
            <span className="where">
              {config.mode === 'api'
                ? safeHost(config.baseUrl)
                : currentAgent
                  ? [currentAgent.name, currentAgent.version, currentModelId !== 'default' ? currentModelLabel : null].filter(Boolean).join(' · ')
                  : t('avatar.noAgentSelected')}
            </span>
          </div>
          <button
            type="button"
            className={`avatar-item avatar-item--mode${config.mode === 'daemon' ? ' active' : ''}`}
            aria-current={config.mode === 'daemon' ? 'true' : undefined}
            disabled={!daemonLive && config.mode !== 'daemon'}
            onClick={() => {
              onModeChange('daemon');
              if (!daemonLive) {
                setOpen(false);
                onOpenSettings('execution');
              }
            }}
          >
            <span className="avatar-item-icon" aria-hidden><RemixIcon name="file-code-line" size={15} /></span>
            <span>{t('avatar.useLocal')}</span>
            {!daemonLive ? <span className="avatar-item-meta">{t('avatar.metaOffline')}</span> : null}
            {config.mode === 'daemon' ? <span className="avatar-item__check" aria-hidden><RemixIcon name="check-line" size={15} /></span> : null}
          </button>
          <button
            type="button"
            className={`avatar-item avatar-item--mode${config.mode === 'api' ? ' active' : ''}`}
            aria-current={config.mode === 'api' ? 'true' : undefined}
            onClick={() => onModeChange('api')}
          >
            <span className="avatar-item-icon" aria-hidden><RemixIcon name="link" size={15} /></span>
            <span>{t('avatar.useApi')}</span>
            {config.mode === 'api' ? <span className="avatar-item__check" aria-hidden><RemixIcon name="check-line" size={15} /></span> : null}
          </button>

          {config.mode === 'daemon' ? (
            <>
              <div className="avatar-section-label">{t('avatar.codeAgent')}</div>
              {installedAgents.map((agent) => (
                <button
                  type="button"
                  key={agent.id}
                  className={`avatar-item${config.agentId === agent.id ? ' active' : ''}`}
                  data-testid={`avatar-agent-option-${agent.id}`}
                  aria-current={config.agentId === agent.id ? 'true' : undefined}
                  onClick={() => onAgentChange(agent.id)}
                >
                  <AgentIcon id={agent.id} size={18} />
                  <span>{agent.name}</span>
                  {agent.version ? <span className="avatar-item-meta">{agent.version}</span> : null}
                </button>
              ))}
              {currentAgent?.models?.length || currentAgent?.reasoningOptions?.length ? (
                <div className="avatar-model-section">
                  {currentAgent.models?.length ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">{t('avatar.modelLabel')}</span>
                      <SearchableModelSelect
                        className="inline-switcher__select avatar-select"
                        value={currentModelId ?? ''}
                        onChange={(model) => onAgentModelChange(currentAgent.id, { model })}
                        models={currentAgent.models}
                        additionalOptions={
                          currentModelId && !currentAgent.models.some((model) => model.id === currentModelId)
                            ? [{ value: currentModelId, label: `${currentModelId} ${t('avatar.customSuffix')}` }]
                            : undefined
                        }
                        searchPlaceholder={t('newproj.modelSearch')}
                        searchInputTestId="avatar-model-search"
                        popoverTestId="avatar-model-popover"
                        minSearchableOptions={5}
                      />
                    </label>
                  ) : null}
                  {currentAgent.reasoningOptions?.length ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">{t('avatar.reasoningLabel')}</span>
                      <select
                        className="avatar-select"
                        value={currentReasoningId ?? ''}
                        onChange={(event) => onAgentModelChange(currentAgent.id, { reasoning: event.target.value })}
                      >
                        {currentAgent.reasoningOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
              <button type="button" className="avatar-item" onClick={onRefreshAgents}>
                <span className="avatar-item-icon" aria-hidden><RemixIcon name="refresh-line" size={15} /></span>
                <span>{t('avatar.rescan')}</span>
              </button>
            </>
          ) : (
            <div className="avatar-model-section">
              <label className="avatar-select-row">
                <span className="avatar-select-label">{t('avatar.modelLabel')}</span>
                <SearchableModelSelect
                  className="inline-switcher__select avatar-select"
                  value={config.model}
                  onChange={(model) => onApiModelChange?.(model)}
                  models={byokModels}
                  additionalOptions={
                    config.model && !byokModels.some((model) => model.id === config.model)
                      ? [{ value: config.model, label: `${config.model} ${t('avatar.customSuffix')}` }]
                      : undefined
                  }
                  searchPlaceholder={t('newproj.modelSearch')}
                  searchInputTestId="avatar-byok-model-search"
                  popoverTestId="avatar-byok-model-popover"
                  minSearchableOptions={5}
                />
              </label>
            </div>
          )}

          <div className="avatar-menu-divider" />
          <button
            type="button"
            className="avatar-item avatar-item--execution-settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings('execution');
            }}
          >
            <span className="avatar-item-icon" aria-hidden><RemixIcon name="settings-3-line" size={15} /></span>
            <span>{t('inlineSwitcher.openFullSettings')}</span>
          </button>
          {onBack ? (
            <button
              type="button"
              className="avatar-item"
              onClick={() => {
                setOpen(false);
                onBack();
              }}
            >
              <span className="avatar-item-icon" aria-hidden><RemixIcon name="arrow-left-line" size={15} /></span>
              <span>{t('avatar.backToProjects')}</span>
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
