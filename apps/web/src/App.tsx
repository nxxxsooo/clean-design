import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { detectOpenDesignHostClientType } from '@open-design/host';
import type { ChatSessionMode, RunContextSelection } from '@open-design/contracts';
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import { EntryView } from './components/EntryView';
import type { CreateInput, ImportClaudeDesignOutcome } from './components/NewProjectPanel';
import { MemoryToast } from './components/MemoryToast';
import { Toast } from './components/Toast';
import { CenteredLoader } from './components/Loading';
import { PetOverlay, type PetTaskCenter } from './components/pet/PetOverlay';
import { buildPetTaskCenter } from './components/pet/taskCenter';
import { migrateCustomPetAtlas } from './components/pet/pets';
import { ProjectView } from './components/ProjectView';
import { TooltipLayer } from './components/TooltipLayer';
import { openWorkspaceTab, WorkspaceTabsBar } from './components/WorkspaceTabsBar';
import {
  DesignSystemCreationFlow,
  DesignSystemDetailView,
} from './components/DesignSystemFlow';
import {
  IframeKeepAliveProvider,
  useIframeKeepAlivePool,
} from './components/IframeKeepAlivePool';
import {
  SettingsDialog,
  switchApiProtocolConfig,
  updateCurrentApiProtocolConfig,
  type SettingsSection,
} from './components/SettingsDialog';
import {
  daemonIsLive,
  fetchAppVersionInfo,
  fetchAgentsStream,
  fetchByokRuntimeReadiness,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
  openExternalUrl,
  uploadProjectFiles,
  replaceProjectWorkingDir,
} from './providers/registry';
import {
  RUNS_CHANGED_EVENT,
  listProjectRuns,
} from './providers/daemon';
import { navigate, useRoute } from './router';
import {
  fetchDaemonConfig,
  DEFAULT_PET,
  fetchMediaProvidersFromDaemon,
  hasAnyConfiguredProvider,
  loadConfig,
  mergeDaemonConfig,
  mergeDaemonMediaProviders,
  saveConfig,
  shouldSyncLocalMediaProvidersToDaemon,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from './state/config';
import { applyAppearanceToDocument } from './state/appearance';
import { protectConfigCredentials } from './state/credentials';
import { isMacPlatform } from './utils/platform';
import { isVisibleLocalCliAgent } from './utils/visibleAgents';
import {
  createDesignSystemProjectFromProject,
  createProject,
  deleteProject as deleteProjectApi,
  duplicateProject,
  getProject,
  importClaudeDesignZip,
  importFolderProject,
  listProjects,
  listTemplates,
  deleteTemplate,
  patchProject,
} from './state/projects';
import { useModalWindowDragGuard } from './hooks/useModalWindowDragGuard';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useI18n } from './i18n';
import { liveArtifactTabId } from './types';
import type {
  AgentInfo,
  AgentModelChoice,
  ApiProtocol,
  AppConfig,
  AppVersionInfo,
  ChatAttachment,
  DesignSystemGenerationJob,
  DesignSystemSummary,
  Project,
  ProjectMetadata,
  ProjectTemplate,
  ProviderModelOption,
  PromptTemplateSummary,
  SkillSummary,
} from './types';

type AppCreateProjectInput = Omit<CreateInput, 'metadata'> & {
  metadata?: CreateInput['metadata'];
  pendingPrompt?: string;
  pluginId?: string;
  pluginType?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  initialRunContext?: RunContextSelection | null;
  conversationMode?: ChatSessionMode;
  autoSendFirstMessage?: boolean;
  requestId?: string;
  pendingFiles?: File[];
  userWorkingDirToken?: string;
  linkedDirs?: string[] | null;
};

const APP_CONFIG_CHANGED_EVENT = 'clean-design:app-config-changed';
const AGENT_FOCUS_REFRESH_THROTTLE_MS = 10_000;

export function shouldSyncMediaProvidersOnSave(
  mediaProviders: AppConfig['mediaProviders'],
  options?: { force?: boolean },
): boolean {
  return Boolean(options?.force) || hasAnyConfiguredProvider(mediaProviders);
}

function mergeLinkedDirsIntoMetadata(
  metadata: ProjectMetadata | undefined,
  linkedDirs?: string[] | null,
): ProjectMetadata | undefined {
  const nextDirs = (linkedDirs ?? []).map((dir) => dir.trim()).filter(Boolean);
  if (nextDirs.length === 0) return metadata;
  const baseMetadata = metadata ?? { kind: 'other' };
  return {
    ...baseMetadata,
    linkedDirs: Array.from(new Set([...(baseMetadata.linkedDirs ?? []), ...nextDirs])),
  };
}

type ProjectListRequest = {
  generation: number;
  mutationVersion: number;
};

export function buildPersistedConfig(next: AppConfig, current: AppConfig): AppConfig {
  return {
    ...next,
    onboardingCompleted: current.onboardingCompleted ? true : next.onboardingCompleted,
  };
}

/**
 * True when `next` and `last` produce an identical persisted shape —
 * i.e. the only diffs between them are fields buildPersistedConfig strips
 * before disk/daemon writes.
 *
 * The autosave loop in Settings uses this to skip the "All changes
 * saved" indicator transition when the user has only typed an unsaved
 * secret. Without it, autosave completes a no-op write and flashes
 * "Saved" — misleading users into trusting that a sensitive key has
 * been persisted when in fact only the section-local "Save key"
 * gesture commits it.
 */
export function isAutosaveDraftOnlyChange(next: AppConfig, last: AppConfig): boolean {
  return (
    JSON.stringify(buildPersistedConfig(next, next))
    === JSON.stringify(buildPersistedConfig(last, last))
  );
}

export function resolveSettingsCloseConfig(
  rendered: AppConfig,
  latestPersisted: AppConfig,
): AppConfig {
  const base = latestPersisted === rendered ? rendered : latestPersisted;
  return base.onboardingCompleted ? base : { ...base, onboardingCompleted: true };
}

const CANONICAL_AGENT_ORDER = [
  'claude',
  'codex',
  'antigravity',
  'opencode',
  'pi',
] as const;

const CANONICAL_AGENT_ORDER_INDEX = new Map<string, number>(
  CANONICAL_AGENT_ORDER.map((id, index) => [id, index]),
);

function orderAgentsByRegistry(agents: AgentInfo[]): AgentInfo[] {
  return agents
    .filter(isVisibleLocalCliAgent)
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const leftRank =
        CANONICAL_AGENT_ORDER_INDEX.get(left.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      const rightRank =
        CANONICAL_AGENT_ORDER_INDEX.get(right.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    })
    .map(({ agent }) => agent);
}

function upsertAgent(agents: AgentInfo[], agent: AgentInfo): AgentInfo[] {
  if (!isVisibleLocalCliAgent(agent)) {
    return agents.filter((item) => item.id !== agent.id);
  }
  const index = agents.findIndex((item) => item.id === agent.id);
  if (index === -1) return [...agents, agent];
  const next = agents.slice();
  next[index] = agent;
  return next;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export function App() {
  // `reducedMotion="user"` makes every motion/react component honor the OS
  // `prefers-reduced-motion` setting: transform/layout animations are zeroed
  // out while opacity-only changes are kept. The CSS `@media (prefers-reduced-
  // motion: reduce)` block covers the CSS-keyframe surfaces, but the dialogs,
  // toasts and popovers that moved to motion/react need this gate too — without
  // it they keep springing/sliding for users who asked us not to animate.
  return (
    <MotionConfig reducedMotion="user">
      <IframeKeepAliveProvider>
        <AppInner />
      </IframeKeepAliveProvider>
    </MotionConfig>
  );
}

function AppInner() {
  const { t } = useI18n();
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  const clientType = detectOpenDesignHostClientType();
  useModalWindowDragGuard();
  // Stable shell marker used by UI automation and packaged startup checks.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-od-app-mounted', '1');
      document.querySelectorAll('.od-loading-shell').forEach((node) => node.remove());
    }
  }, []);
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const configRef = useRef(config);
  configRef.current = config;
  const latestPersistedConfigRef = useRef(config);
  latestPersistedConfigRef.current = config;
  const settingsDraftConfigRef = useRef<AppConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Surfaced when a Home-picked working dir could not be applied to a freshly
  // created project (expired/invalid desktop token, daemon rejection). Without
  // this the failure was swallowed and the user believed their folder was in
  // effect while the project actually stayed in the managed root.
  const [workingDirError, setWorkingDirError] = useState<string | null>(null);
  const [projectOpenError, setProjectOpenError] = useState<string | null>(null);
  const [settingsWelcome, setSettingsWelcome] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution');
  const [daemonLive, setDaemonLive] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [byokRuntimeAvailable, setByokRuntimeAvailable] = useState(false);
  const agentStreamRequestSeqRef = useRef(0);
  const agentFocusRefreshLastRunRef = useRef(Date.now());
  const [providerModelsCache, setProviderModelsCache] = useState<
    Record<string, ProviderModelOption[]>
  >({});
  // Functional skills (capabilities the agent invokes mid-task) — stays
  // small and lives under the Settings → Skills surface.
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  // Design templates (rendering catalogue: decks, prototypes, image/video/
  // audio templates) — sourced from /api/design-templates and shown in the
  // EntryView Templates tab. See specs/current/skills-and-design-templates.md.
  const [designTemplates, setDesignTemplates] = useState<SkillSummary[]>([]);
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [pendingDesignSystemRevisionJobs, setPendingDesignSystemRevisionJobs] = useState<
    Record<string, DesignSystemGenerationJob>
  >({});
  const [projects, setProjects] = useState<Project[]>([]);
  const projectsRef = useRef<Project[]>(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  const [petTaskCenter, setPetTaskCenter] = useState<PetTaskCenter>({
    running: [],
    queued: [],
    recent: [],
  });
  const pendingLocalProjectIdsRef = useRef<Set<string>>(new Set());
  const locallyDeletedProjectIdsRef = useRef<Map<string, number>>(new Map());
  const projectListMutationVersionRef = useRef(0);
  const projectListRequestGenerationRef = useRef(0);
  const latestAppliedProjectListGenerationRef = useRef(0);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<
    PromptTemplateSummary[]
  >([]);
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(
    null,
  );
  const [daemonMediaProviders, setDaemonMediaProviders] = useState<
    AppConfig['mediaProviders'] | null
  >(null);
  const [daemonMediaProvidersFetchState, setDaemonMediaProvidersFetchState] = useState<
    'idle' | 'ok' | 'error'
  >('idle');
  const [mediaProvidersNotice, setMediaProvidersNotice] = useState<string | null>(null);
  // Per-resource loading flags. Each goes false the moment its own fetch
  // resolves so each entry-view tab can render as its data lands instead of
  // every tab waiting on the slowest endpoint (typically `/api/agents`,
  // which probes CLI versions and can take seconds on cold start). The entry
  // view picks the right flag for whichever tab the user is currently on.
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [dsLoading, setDsLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [promptTemplatesLoading, setPromptTemplatesLoading] = useState(true);
  // Goes true once the daemon-persisted config (agentId/designSystemId/etc.)
  // has merged into local state. Auto-selection effects below wait on this
  // so they don't race ahead of the daemon-stored choice and overwrite it
  // with a freshly picked first-available agent.
  const [daemonConfigLoaded, setDaemonConfigLoaded] = useState(false);
  const route = useRoute();

  const beginAgentStreamRequest = useCallback(() => {
    agentStreamRequestSeqRef.current += 1;
    return agentStreamRequestSeqRef.current;
  }, []);

  const isCurrentAgentStreamRequest = useCallback((requestId: number) => {
    return agentStreamRequestSeqRef.current === requestId;
  }, []);

  const rememberLocalProject = useCallback((projectId: string) => {
    pendingLocalProjectIdsRef.current.add(projectId);
    locallyDeletedProjectIdsRef.current.delete(projectId);
    projectListMutationVersionRef.current += 1;
  }, []);

  const clearLocalProject = useCallback((projectId: string, options?: { deleted?: boolean }) => {
    pendingLocalProjectIdsRef.current.delete(projectId);
    projectListMutationVersionRef.current += 1;
    if (options?.deleted) {
      locallyDeletedProjectIdsRef.current.set(
        projectId,
        projectListMutationVersionRef.current,
      );
    }
  }, []);

  const beginProjectListRequest = useCallback((): ProjectListRequest => {
    projectListRequestGenerationRef.current += 1;
    return {
      generation: projectListRequestGenerationRef.current,
      mutationVersion: projectListMutationVersionRef.current,
    };
  }, []);

  const reconcileFetchedProjects = useCallback((list: Project[], request: ProjectListRequest) => {
    const pendingLocalProjectIds = pendingLocalProjectIdsRef.current;
    const locallyDeletedProjectIds = locallyDeletedProjectIdsRef.current;
    const fetchedIds = new Set(list.map((project) => project.id));
    if (request.generation < latestAppliedProjectListGenerationRef.current) {
      const visibleList =
        locallyDeletedProjectIds.size > 0
          ? list.filter((project) => !locallyDeletedProjectIds.has(project.id))
          : list;
      if (visibleList.length === 0) return false;
      const hydratableProjects = visibleList.filter(
        (project) =>
          pendingLocalProjectIds.has(project.id),
      );
      if (hydratableProjects.length === 0) return false;
      const hydratableById = new Map(
        hydratableProjects.map((project) => [project.id, project]),
      );
      for (const project of hydratableProjects) {
        pendingLocalProjectIds.delete(project.id);
      }
      setProjects((current) => {
        let changed = false;
        const currentIds = new Set<string>();
        const next = current.map((project) => {
          currentIds.add(project.id);
          const hydrated = hydratableById.get(project.id);
          if (!hydrated) return project;
          changed = true;
          hydratableById.delete(project.id);
          return hydrated;
        });
        for (const project of hydratableById.values()) {
          if (currentIds.has(project.id)) continue;
          changed = true;
          next.push(project);
        }
        return changed ? next : current;
      });
      return true;
    }
    latestAppliedProjectListGenerationRef.current = request.generation;
    for (const id of fetchedIds) pendingLocalProjectIds.delete(id);
    for (const [id, deletedAtMutationVersion] of locallyDeletedProjectIds) {
      if (
        request.mutationVersion >= deletedAtMutationVersion
        && !fetchedIds.has(id)
      ) {
        locallyDeletedProjectIds.delete(id);
      }
    }
    const activeDeletedProjectIds = new Set(locallyDeletedProjectIds.keys());
    const visibleList =
      activeDeletedProjectIds.size > 0
        ? list.filter((project) => !activeDeletedProjectIds.has(project.id))
        : list;
    const visibleFetchedIds =
      activeDeletedProjectIds.size > 0
        ? new Set(visibleList.map((project) => project.id))
        : fetchedIds;
    setProjects((current) => {
      const preserved = current.filter(
        (project) =>
          pendingLocalProjectIds.has(project.id) &&
          !visibleFetchedIds.has(project.id) &&
          !activeDeletedProjectIds.has(project.id),
      );
      return preserved.length > 0 ? [...preserved, ...visibleList] : visibleList;
    });
    return true;
  }, []);

  // Sync theme preference to the <html> element so CSS variables pick it up.
  // useLayoutEffect (vs useEffect) fires before the browser paints, so a
  // live theme switch in Settings applies atomically — no 1-frame flash of
  // the old theme. Safe here because the component tree is ssr:false.
  useLayoutEffect(() => {
    applyAppearanceToDocument({
      theme: config.theme ?? 'system',
      accentColor: config.accentColor,
    });
  }, [config.theme, config.accentColor]);

  // Bootstrap — detect daemon, then fan out independent fetches so each
  // entry-view tab can render the moment its own data lands. Earlier this
  // was one Promise.all behind a global "Loading workspace…" placeholder,
  // which made the slowest endpoint (typically `/api/agents` on cold start)
  // gate every tab including the ones that don't need agents at all.
  useEffect(() => {
    let cancelled = false;
    const agentStreamAbort = new AbortController();
    (async () => {
      const alive = await daemonIsLive();
      if (cancelled) return;
      setDaemonLive(alive);
      if (!alive) {
        // No daemon — clear every loading flag so empty states render
        // instead of the entry view sitting on indefinite spinners.
        setAgentsLoading(false);
        setSkillsLoading(false);
        setDsLoading(false);
        setProjectsLoading(false);
        setPromptTemplatesLoading(false);
        setDaemonConfigLoaded(true);
        setByokRuntimeAvailable(false);
        return;
      }

      void fetchByokRuntimeReadiness().then((readiness) => {
        if (!cancelled) setByokRuntimeAvailable(readiness.available);
      });

      const agentRequestId = beginAgentStreamRequest();
      void fetchAgentsStream({
        signal: agentStreamAbort.signal,
        onAgent: (agent) => {
          if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
          setAgents((current) => upsertAgent(current, agent));
        },
      })
        .then((list) => {
          if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
          setAgents(orderAgentsByRegistry(list));
        })
        .catch((err) => {
          if (
            cancelled ||
            isAbortError(err) ||
            !isCurrentAgentStreamRequest(agentRequestId)
          ) {
            return;
          }
          setAgents([]);
        })
        .finally(() => {
          if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
          setAgentsLoading(false);
        });

      // Functional skills + design templates land independently. Both
      // gate `skillsLoading` together so the EntryView stops rendering
      // its loader once both registries respond — neither tab would have
      // a complete picture if we cleared the flag on the first reply.
      let functionalReady = false;
      let templatesReady = false;
      const maybeClearLoading = () => {
        if (functionalReady && templatesReady) setSkillsLoading(false);
      };
      void fetchSkills().then((list) => {
        if (cancelled) return;
        setSkills(list);
        functionalReady = true;
        maybeClearLoading();
      });

      void fetchDesignTemplates().then((list) => {
        if (cancelled) return;
        setDesignTemplates(list);
        templatesReady = true;
        maybeClearLoading();
      });

      void fetchDesignSystems().then((list) => {
        if (cancelled) return;
        setDesignSystems(list);
        setDsLoading(false);
      });

      const request = beginProjectListRequest();
      void listProjects().then((list) => {
        if (cancelled) return;
        reconcileFetchedProjects(list, request);
        setProjectsLoading(false);
      });

      void listTemplates().then((list) => {
        if (cancelled) return;
        setTemplates(list);
      });

      void fetchPromptTemplates().then((list) => {
        if (cancelled) return;
        setPromptTemplates(list);
        setPromptTemplatesLoading(false);
      });

      void fetchAppVersionInfo().then((info) => {
        if (cancelled) return;
        setAppVersionInfo(info);
      });

      // Daemon-persisted config and local media-provider config land together.
      void Promise.all([
        fetchDaemonConfig(),
        fetchMediaProvidersFromDaemon(),
      ]).then(async ([
        daemonConfig,
        daemonMediaProvidersResult,
      ]) => {
        if (cancelled) return;
        const daemonMediaProvidersLoaded =
          daemonMediaProvidersResult.status === 'ok'
            ? daemonMediaProvidersResult.providers
            : null;
        setDaemonMediaProviders(daemonMediaProvidersLoaded);
        setDaemonMediaProvidersFetchState(daemonMediaProvidersResult.status);
        setMediaProvidersNotice(
          daemonMediaProvidersResult.status === 'error'
            ? t('settings.mediaProviderLoadError')
            : null,
        );
        // Compute the next config outside the setConfig updater so we can
        // both (a) call navigate() after setConfig returns — calling it
        // inside the updater would trigger a Router setState during React's
        // render phase — and (b) read next.onboardingCompleted synchronously,
        // since React batches setConfig and the updater doesn't run until
        // the next render. latestPersistedConfigRef is kept in sync with
        // the rendered config and is safe to read here.
        const baseConfig = latestPersistedConfigRef.current;
        const migratedLocalMediaProviders = shouldSyncLocalMediaProvidersToDaemon(
          baseConfig.mediaProviders,
          daemonMediaProvidersLoaded,
        );
        const merged = mergeDaemonMediaProviders(
          mergeDaemonConfig(baseConfig, daemonConfig),
          daemonMediaProvidersLoaded,
        );
        const next = await protectConfigCredentials(merged, baseConfig);
        if (cancelled) return;
        saveConfig(next);
        if (
          daemonMediaProvidersResult.status === 'ok' &&
          migratedLocalMediaProviders &&
          hasAnyConfiguredProvider(next.mediaProviders)
        ) {
          void syncMediaProvidersToDaemon(next.mediaProviders, {
            daemonProviders: daemonMediaProvidersLoaded,
          });
        }
        // Migrate localStorage prefs to daemon on first boot with the new
        // endpoint. If daemon already had values the merge above used them;
        // writing back is idempotent and keeps both sides in sync.
        void syncConfigToDaemon(next);
        latestPersistedConfigRef.current = next;
        setConfig(next);
        setDaemonConfigLoaded(true);
      }).catch(() => {
        if (cancelled) return;
        // Do not persist or sync plaintext fallback config when secure
        // credential migration is unavailable.
        setDaemonMediaProviders(null);
        setDaemonMediaProvidersFetchState('error');
        setMediaProvidersNotice(t('settings.mediaProviderLoadError'));
        setDaemonConfigLoaded(true);
      });
    })();
    return () => {
      cancelled = true;
      agentStreamAbort.abort();
    };
  }, [
    beginAgentStreamRequest,
    beginProjectListRequest,
    isCurrentAgentStreamRequest,
    reconcileFetchedProjects,
  ]);

  // Auto-pick the first available agent once both the daemon-stored config
  // and the agents listing have landed. Splitting this out of bootstrap
  // avoids racing the local-config initial value against a slow agents
  // probe — by the time this runs, daemonConfig has already overlaid the
  // user's previous choice, so we only fill an empty slot.
  //
  useEffect(() => {
    if (!daemonConfigLoaded || agentsLoading) return;
    const firstAvailable = agents.find((a) => a.available);
    const selectedAgentIsPublic = config.agentId != null
      && agents.some((agent) => agent.id === config.agentId);
    if (selectedAgentIsPublic) return;
    setConfig((prev) => {
      const previousAgentIsPublic = prev.agentId != null
        && agents.some((agent) => agent.id === prev.agentId);
      if (previousAgentIsPublic) return prev;
      const nextAgentId = firstAvailable?.id ?? null;
      if (prev.agentId === nextAgentId) return prev;
      const next: AppConfig = { ...prev, agentId: nextAgentId };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [
    daemonConfigLoaded,
    agentsLoading,
    agents,
    config.agentId,
    config.onboardingCompleted,
  ]);

  // Auto-pick the default design system the same way — only after daemon
  // config has merged so we never overwrite a daemon-stored selection.
  useEffect(() => {
    if (!daemonConfigLoaded || dsLoading) return;
    if (config.designSystemId) return;
    if (designSystems.length === 0) return;
    const id =
      designSystems.find((d) => d.id === 'default')?.id ?? designSystems[0]!.id;
    setConfig((prev) => {
      if (prev.designSystemId) return prev;
      const next: AppConfig = { ...prev, designSystemId: id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [daemonConfigLoaded, dsLoading, designSystems, config.designSystemId]);

  // One-shot self-healing migration for pets adopted before the
  // overlay learned atlas-row switching. If the stored pet is a
  // custom / codex pet whose imageUrl is a single-row strip
  // (no atlas), we silently re-download the full spritesheet so
  // hover, drag, and idle-ambient variety all light up on next render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const upgraded = await migrateCustomPetAtlas(config);
      if (!upgraded || cancelled) return;
      setConfig((prev) => {
        if (!prev.pet) return prev;
        const next: AppConfig = {
          ...prev,
          pet: { ...prev.pet, custom: upgraded },
        };
        saveConfig(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot the config at mount; migration is one-shot per session
    // and should not re-run every time config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProjects = useCallback(async () => {
    const request = beginProjectListRequest();
    const list = await listProjects();
    reconcileFetchedProjects(list, request);
  }, [beginProjectListRequest, reconcileFetchedProjects]);

  const refreshProjectsStrict = useCallback(async () => {
    const request = beginProjectListRequest();
    const list = await listProjects({ throwOnError: true });
    reconcileFetchedProjects(list, request);
  }, [beginProjectListRequest, reconcileFetchedProjects]);

  const refreshDesignSystems = useCallback(async () => {
    const list = await fetchDesignSystems();
    setDesignSystems(list);
  }, []);

  const refreshSkills = useCallback(async () => {
    const list = await fetchSkills();
    setSkills(list);
  }, []);

  const refreshTemplates = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    const ok = await deleteTemplate(id);
    if (ok) await refreshTemplates();
    return ok;
  }, [refreshTemplates]);

  const reloadMediaProvidersFromDaemon = useCallback(async () => {
    const result = await fetchMediaProvidersFromDaemon();
    if (result.status !== 'ok') {
      setDaemonMediaProvidersFetchState('error');
      setMediaProvidersNotice(
        t('settings.mediaProviderLoadError'),
      );
      return null;
    }
    setDaemonMediaProviders(result.providers);
    setDaemonMediaProvidersFetchState('ok');
    setMediaProvidersNotice(null);
    setConfig((prev) => {
      const merged = mergeDaemonMediaProviders(prev, result.providers);
      saveConfig(merged);
      return merged;
    });
    return result.providers;
  }, []);

  /**
   * Autosave-driven persistence path. The settings dialog calls this on
   * every committed edit (via a debounced effect) so localStorage and
   * the daemon stay in lock-step with the user's draft. We deliberately
   * do not persist plaintext provider credentials from the renderer.
   * Onboarding is also left alone; the dialog's close path
   * is the canonical "I'm done" signal.
   */
  const handleConfigPersist = useCallback(async (
    next: AppConfig,
    options?: { forceMediaProviderSync?: boolean },
  ) => {
    // Strip in-flight credentials before anything hits disk so a
    // half-typed key can't survive in localStorage. If the dialog is
    // closing, preserve any onboarding completion that the close gesture
    // already committed so an unmount autosave cannot re-open the welcome flow.
    const protectedNext = await protectConfigCredentials(
      next,
      latestPersistedConfigRef.current,
    );
    const persisted = buildPersistedConfig(protectedNext, configRef.current);
    latestPersistedConfigRef.current = persisted;
    saveConfig(persisted);
    setConfig(persisted);
    const shouldSyncMediaProviders =
      daemonMediaProvidersFetchState === 'ok'
      && shouldSyncMediaProvidersOnSave(persisted.mediaProviders, {
        force: options?.forceMediaProviderSync,
      });
    await Promise.all([
      shouldSyncMediaProviders
        ? syncMediaProvidersToDaemon(persisted.mediaProviders, {
            force: options?.forceMediaProviderSync,
            daemonProviders: daemonMediaProviders,
            throwOnError: options?.forceMediaProviderSync,
          })
        : Promise.resolve(),
      syncConfigToDaemon(persisted, { throwOnError: true }),
    ]);
  }, [daemonMediaProviders, daemonMediaProvidersFetchState]);

  const handleSettingsDraftChange = useCallback((draft: AppConfig) => {
    settingsDraftConfigRef.current = draft;
  }, []);

  const handleModeChange = useCallback(
    (mode: AppConfig['mode']) => {
      const next = { ...latestPersistedConfigRef.current, mode };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      setConfig(next);
    },
    [],
  );

  // Quick theme switch from the settings dropdown in the entry view.
  // Skips the full SettingsDialog round-trip so the appearance flip
  // feels instantaneous; the live preview comes for free because the
  // `useLayoutEffect` above re-runs `applyAppearanceToDocument` the
  // moment `config.theme` changes. We still persist to localStorage
  // and the daemon so the choice survives reloads.
  const handleThemeChange = useCallback(
    (theme: AppConfig['theme']) => {
      const next = { ...config, theme };
      // Apply to the DOM synchronously inside the click handler so the theme
      // flips instantly. Otherwise the visible switch waits on the (heavier)
      // React re-render of the whole tree before the layout effect re-applies
      // it — which reads as a perceptible lag after the click.
      applyAppearanceToDocument({
        theme: theme ?? 'system',
        accentColor: config.accentColor,
      });
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleAgentChange = useCallback(
    (agentId: string) => {
      if (!agents.some((agent) => agent.id === agentId)) return;
      const next = { ...latestPersistedConfigRef.current, agentId };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [agents],
  );

  const handleAgentModelChange = useCallback(
    (agentId: string, choice: { model?: string; reasoning?: string }) => {
      const current = latestPersistedConfigRef.current;
      const prev = current.agentModels?.[agentId] ?? {};
      const merged = { ...prev, ...choice };
      const nextAgentModels = {
        ...(current.agentModels ?? {}),
        [agentId]: merged,
      };
      const next = { ...current, agentModels: nextAgentModels };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [],
  );

  // BYOK protocol switch — also flips `mode` to 'api' so the user does
  // not have to take a second step after picking a provider from the
  // inline switcher. The helper preserves any per-protocol fields the
  // user had previously configured for the target protocol.
  const handleApiProtocolChange = useCallback(
    (protocol: ApiProtocol) => {
      const next = switchApiProtocolConfig(config, protocol);
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  // BYOK model picker — patches `model` (and the per-protocol shadow
  // copy) without touching apiKey/baseUrl so the user can swap models
  // mid-session without retyping their key.
  const handleApiModelChange = useCallback(
    (model: string) => {
      const next = updateCurrentApiProtocolConfig(config, { model });
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleChangeDefaultDesignSystem = useCallback(
    (designSystemId: string | null) => {
      const next = { ...config, designSystemId };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const refreshAgents = useCallback(
    async (options?: { throwOnError?: boolean; agentCliEnv?: AppConfig['agentCliEnv'] }) => {
      if (options && Object.prototype.hasOwnProperty.call(options, 'agentCliEnv')) {
        const nextConfig = {
          ...config,
          agentCliEnv: options.agentCliEnv ?? {},
        };
        saveConfig(nextConfig);
        await syncConfigToDaemon(nextConfig);
        setConfig(nextConfig);
      }
      const agentRequestId = beginAgentStreamRequest();
      setAgentsLoading(true);
      void fetchByokRuntimeReadiness().then((readiness) => {
        setByokRuntimeAvailable(readiness.available);
      });
      try {
        const next = await fetchAgentsStream({
          onAgent: (agent) => {
            if (!isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgents((current) => upsertAgent(current, agent));
          },
        });
        const ordered = orderAgentsByRegistry(next);
        if (isCurrentAgentStreamRequest(agentRequestId)) {
          setAgents(ordered);
          setAgentsLoading(false);
        }
        return ordered;
      } catch (err) {
        if (!isCurrentAgentStreamRequest(agentRequestId)) return [];
        setAgentsLoading(false);
        if (options?.throwOnError) throw err;
        setAgents([]);
        return [];
      }
    },
    [beginAgentStreamRequest, config, isCurrentAgentStreamRequest],
  );

  useEffect(() => {
    if (!daemonLive || agentsLoading) return;

    const refreshIfDue = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - agentFocusRefreshLastRunRef.current < AGENT_FOCUS_REFRESH_THROTTLE_MS) return;
      agentFocusRefreshLastRunRef.current = now;
      void refreshAgents();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfDue();
    };

    window.addEventListener('focus', refreshIfDue);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshIfDue);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [agentsLoading, daemonLive, refreshAgents]);

  useEffect(() => {
    const handleAppConfigChanged = () => {
      void fetchDaemonConfig().then((daemonConfig) => {
        const next = mergeDaemonConfig(latestPersistedConfigRef.current, daemonConfig);
        latestPersistedConfigRef.current = next;
        saveConfig(next);
        setConfig(next);
        void refreshAgents();
      });
    };
    window.addEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
    return () => window.removeEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
  }, [refreshAgents]);

  const handleCreateProject = useCallback(
    async (
      input: AppCreateProjectInput,
    ): Promise<boolean> => {
      // Honor an explicit `null` design system — the create panel defaults
      // to "None" for every kind now, and the user expects that to land
      // as a no-design-system project rather than silently inheriting the
      // workspace default.
      const derivedPendingPrompt =
      input.pendingPrompt ??
      (input.metadata?.promptTemplate?.prompt?.trim() || undefined);

      const metadata = mergeLinkedDirsIntoMetadata(input.metadata, input.linkedDirs);
      let result;
      try {
        result = await createProject({
          name: input.name,
          skillId: input.skillId,
          designSystemId: input.designSystemId,
          pendingPrompt: derivedPendingPrompt,
          metadata,
          ...(input.conversationMode ? { conversationMode: input.conversationMode } : {}),
          ...(input.pluginId ? { pluginId: input.pluginId } : {}),
          ...(input.appliedPluginSnapshotId
            ? { appliedPluginSnapshotId: input.appliedPluginSnapshotId }
            : {}),
          ...(input.pluginInputs ? { pluginInputs: input.pluginInputs } : {}),
        });
      } catch (err) {
        throw err;
      }
      if (!result) {
        return false;
      }
      const pendingFiles = Array.isArray(input.pendingFiles)
        ? input.pendingFiles.filter((file): file is File => file instanceof File)
        : [];
      // Flip the project onto the user-picked working directory BEFORE
      // uploading staged Home attachments. `replaceProjectWorkingDir` changes
      // `metadata.baseDir`, so the project starts reading from the external
      // folder. If we uploaded first, the staged files would land in the
      // temporary managed `.od/projects/<id>` root and then silently vanish
      // from Design Files and the first auto-send context once the working
      // dir flips. Doing the handoff first means the initial upload lands in
      // the final tree.
      const userWorkingDir = metadata?.userWorkingDir;
      let workingDirHandoffFailed = false;
      if (userWorkingDir) {
        try {
          await replaceProjectWorkingDir(
            result.project.id,
            userWorkingDir,
            input.userWorkingDirToken,
          );
        } catch (err) {
          // The desktop working-dir token is short-lived (~60s TTL); if the
          // user lingered on Home or the POST was otherwise rejected, the
          // handoff fails AFTER the project already exists. Do NOT swallow
          // this and do NOT proceed: uploading staged attachments or
          // auto-sending the first message would target the managed
          // `.od/projects/<id>` root the user did not choose. Mark the
          // handoff as failed so the upload + auto-send branches below are
          // skipped, then surface a create-time error so the user can
          // re-pick the working directory from inside the project.
          console.warn('Failed to set working directory for new project', userWorkingDir, err);
          workingDirHandoffFailed = true;
          setWorkingDirError(
            `Couldn't apply the chosen folder "${userWorkingDir}". The project was created in the default location — re-pick the working directory from the project before uploading files or sending a message.`,
          );
        }
      }
      let firstMessageAttachments: ChatAttachment[] = [];
      if (!workingDirHandoffFailed && pendingFiles.length > 0) {
        // Home composer attachments stay client-side until submit lands a
        // project; upload them only after the final working directory exists.
        const uploadResult = await uploadProjectFiles(result.project.id, pendingFiles);
        firstMessageAttachments = uploadResult.uploaded;
        const partial = uploadResult.failed.length > 0;
        if (partial) {
          console.warn('Some Home attachments failed to upload', uploadResult.failed);
        }
      }
      // PluginLoopHome flow: the user already typed (or accepted) the
      // first message on Home. Mark this project so ProjectView fires
      // sendMessage(pendingPrompt) once on mount instead of just
      // pre-filling the composer. Scoped to sessionStorage so a page
      // reload after the run has started does not refire.
      if (
        !workingDirHandoffFailed &&
        input.autoSendFirstMessage &&
        (derivedPendingPrompt !== undefined || firstMessageAttachments.length > 0)
      ) {
        try {
          window.sessionStorage.setItem(
            `od:auto-send-first:${result.project.id}`,
            '1',
          );
          if (firstMessageAttachments.length > 0) {
            window.sessionStorage.setItem(
              `od:auto-send-attachments:${result.project.id}`,
              JSON.stringify(firstMessageAttachments),
            );
          } else {
            window.sessionStorage.removeItem(
              `od:auto-send-attachments:${result.project.id}`,
            );
          }
          if (input.initialRunContext && Object.keys(input.initialRunContext).length > 0) {
            window.sessionStorage.setItem(
              `od:auto-send-context:${result.project.id}`,
              JSON.stringify(input.initialRunContext),
            );
          } else {
            window.sessionStorage.removeItem(
              `od:auto-send-context:${result.project.id}`,
            );
          }
        } catch {
          /* sessionStorage may be unavailable (e.g. SSR / private mode); fall
             back to manual send. */
        }
      }
      const project = result.appliedPluginSnapshotId
        ? {
            ...result.project,
            appliedPluginSnapshotId: result.appliedPluginSnapshotId,
          }
        : result.project;
      rememberLocalProject(project.id);
      flushSync(() => {
        setProjects((curr) => [
          project,
          ...curr.filter((p) => p.id !== project.id),
        ]);
      });
      const projectRoute = {
        kind: 'project',
        projectId: project.id,
        fileName: null,
      } as const;
      openWorkspaceTab(projectRoute);
      navigate(projectRoute);
      return true;
    },
    [rememberLocalProject],
  );

  const handleCreateProjectFromDesignSystem = useCallback(
    async (designSystemId: string, designSystemTitle: string) => {
      // "Create with this design system" must NOT assume a prototype. Route
      // the click through the hidden default design router (od-default) —
      // exactly like a free-form Home prompt — so the agent first asks (via
      // the task-type question-form) what to build with this system instead
      // of silently binding the web-prototype scenario + high-fidelity
      // metadata. The preset prompt seeds the conversation and is auto-sent
      // so the router surfaces the confirmation form immediately; `kind`
      // stays the neutral 'other' so no surface-specific default leaks back
      // in on the daemon side.
      const presetPrompt = t('nextStep.brandCreateDesignPrompt', {
        designSystem: designSystemTitle,
      });
      await handleCreateProject({
        name: t('common.untitled'),
        skillId: null,
        designSystemId,
        pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
        pluginInputs: { prompt: presetPrompt },
        pendingPrompt: presetPrompt,
        autoSendFirstMessage: true,
        conversationMode: 'design',
        metadata: {
          kind: 'other',
          nameSource: 'generated',
        },
      });
    },
    [handleCreateProject, t],
  );

  const handleCreateDesignSystemFromProject = useCallback(
    async (
      sourceProjectId: string,
      input: { name?: string; pendingPrompt?: string },
    ) => {
      const result = await createDesignSystemProjectFromProject(sourceProjectId, input);
      try {
        window.sessionStorage.setItem(`od:auto-send-first:${result.project.id}`, '1');
      } catch {
        // If sessionStorage is unavailable, the project still opens with the
        // pending prompt ready for the user to send manually.
      }
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      void refreshDesignSystems();
      navigate({
        kind: 'project',
        projectId: result.project.id,
        conversationId: result.conversationId,
        fileName: null,
      });
    },
    [refreshDesignSystems, rememberLocalProject],
  );

  const handleDuplicateProject = useCallback(
    async (sourceProjectId: string, input: { name?: string } = {}) => {
      const result = await duplicateProject(sourceProjectId, input);
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: result.project.id,
        conversationId: result.conversationId,
        fileName: null,
      });
    },
    [rememberLocalProject],
  );

  const handleImportClaudeDesign = useCallback(async (
    file: File,
  ): Promise<ImportClaudeDesignOutcome> => {
    try {
      const result = await importClaudeDesignZip(file);
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: result.project.id,
        fileName: result.entryFile,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'The ZIP could not be imported.',
      };
    }
  }, [rememberLocalProject]);

  const handleImportFolder = useCallback(async (baseDir: string) => {
    const result = await importFolderProject({ baseDir });
    rememberLocalProject(result.project.id);
    setProjects((curr) => [result.project, ...curr.filter((p) => p.id !== result.project.id)]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: null,
    });
  }, [rememberLocalProject]);

  // PR #974: on desktop, the host bridge owns the picker and import POST
  // atomically. The renderer never sees the path, token, or daemon DTO;
  // it receives host-owned project identifiers and refreshes project state
  // through the normal daemon API.
  const handleImportFolderResponse = useCallback(async (result: OpenDesignHostProjectImportSuccess) => {
    rememberLocalProject(result.projectId);
    const project = await getProject(result.projectId);
    if (project != null) {
      setProjects((curr) => [project, ...curr.filter((p) => p.id !== project.id)]);
    } else {
      // Daemon hasn't materialized the full record yet (race between the
      // host's import POST and our /api/projects read). Seed a minimal
      // placeholder so the route stays alive and ProjectView mounts; the
      // pending-local id keeps reconcileFetchedProjects from evicting the
      // stub until a project-list snapshot actually includes it, and the
      // next refresh swaps it for the real Project record. Without the
      // stub, a stale `[]` list response would replace `projects` with `[]`
      // and the route-guard effect would bounce the user back to Home.
      const stub: Project = {
        id: result.projectId,
        name: '',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setProjects((curr) => [stub, ...curr.filter((p) => p.id !== stub.id)]);
      const request = beginProjectListRequest();
      const list = await listProjects();
      reconcileFetchedProjects(list, request);
    }
    navigate({
      kind: 'project',
      projectId: result.projectId,
      fileName: null,
    });
  }, [beginProjectListRequest, rememberLocalProject, reconcileFetchedProjects]);

  const handleOpenProject = useCallback(async (id: string, fileName?: string): Promise<boolean> => {
    const routeFileName = fileName ?? null;
    if (projectsRef.current.some((project) => project.id === id)) {
      navigate({ kind: 'project', projectId: id, fileName: routeFileName });
      return true;
    }
    try {
      const project = await getProject(id);
      if (project) {
        setProjects((curr) => [project, ...curr.filter((candidate) => candidate.id !== project.id)]);
        navigate({ kind: 'project', projectId: id, fileName: routeFileName });
        return true;
      }
      const request = beginProjectListRequest();
      const list = await listProjects();
      reconcileFetchedProjects(list, request);
      const fetchedProject = locallyDeletedProjectIdsRef.current.has(id)
        ? undefined
        : list.find((candidate) => candidate.id === id);
      if (fetchedProject) {
        navigate({ kind: 'project', projectId: id, fileName: routeFileName });
        return true;
      }
    } catch {
      // Fall through to the same visible missing-project state. The daemon can
      // return 404 or transiently fail while reconciling a deleted backing
      // project; either way the user needs feedback instead of a silent bounce.
    }
    setProjectOpenError(t('project.missing'));
    return false;
  }, [beginProjectListRequest, reconcileFetchedProjects, t]);

  useEffect(() => {
    if (!config.pet?.enabled || !daemonLive) {
      setPetTaskCenter({ running: [], queued: [], recent: [] });
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      const runs = await listProjectRuns();
      if (cancelled) return;
      setPetTaskCenter(buildPetTaskCenter(projects, runs));
    };
    const handleRunsChanged = () => {
      void refresh();
    };

    void refresh();
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    const id = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
      window.clearInterval(id);
    };
  }, [config.pet?.enabled, daemonLive, projects]);

  const handleOpenLiveArtifact = useCallback((projectId: string, artifactId: string) => {
    navigate({ kind: 'project', projectId, fileName: liveArtifactTabId(artifactId) });
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    const ok = await deleteProjectApi(id);
    if (!ok) return false;
    clearLocalProject(id, { deleted: true });
    iframeKeepAlivePool.evictProject(id, { includeActive: true });
    setProjects((curr) => curr.filter((p) => p.id !== id));
    if (route.kind === 'project' && route.projectId === id) {
      navigate({ kind: 'home', view: 'home' });
    }
    return true;
  }, [clearLocalProject, iframeKeepAlivePool, route]);

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects((curr) =>
      curr.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    );
    void patchProject(id, { name: trimmed });
  }, []);

  // The project header back button is an escape hatch back to Home. Avoid
  // depending on browser history here: tab restores and template-create flows
  // can leave an in-app history entry that points back to the same project.
  const handleBack = useCallback(() => {
    const currentProjectId = route.kind === 'project' ? route.projectId : null;
    navigate({ kind: 'home', view: 'home' });
    if (currentProjectId && typeof window !== 'undefined') {
      window.setTimeout(() => {
        iframeKeepAlivePool.evictProject(currentProjectId, { includeActive: true });
      }, 0);
    }
  }, [iframeKeepAlivePool, route]);

  const handleClearPendingPrompt = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    setProjects((curr) =>
      curr.map((p) =>
        p.id === projectId ? { ...p, pendingPrompt: undefined } : p,
      ),
    );
    void patchProject(projectId, { pendingPrompt: null });
  }, [route]);

  const handleTouchProject = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    const updatedAt = Date.now();
    setProjects((curr) =>
      curr.map((p) => (p.id === projectId ? { ...p, updatedAt } : p)),
    );
    void patchProject(projectId, { updatedAt });
  }, [route]);

  const handleProjectChange = useCallback((updated: Project) => {
    setProjects((curr) => {
      const previous = curr.find((p) => p.id === updated.id);
      if (
        previous
        && (
          previous.skillId !== updated.skillId
          || previous.designSystemId !== updated.designSystemId
          || previous.customInstructions !== updated.customInstructions
        )
      ) {
        iframeKeepAlivePool.evictProject(updated.id, { includeActive: true });
      }
      return curr.map((p) => (p.id === updated.id ? updated : p));
    });
  }, [iframeKeepAlivePool]);

  // ProjectView's prompt-context signature derives from SkillSummary /
  // DesignSystemSummary fields, so a body-only registry edit (same name,
  // description, etc.) leaves every signature unchanged and the active
  // preview keeps serving stale prompt context. Settings → Skills /
  // Settings → Design Systems call back through these handlers after
  // every successful mutation; we drop any pool entry whose project
  // depends on the affected id — active or parked — so the next mount
  // recomposes the system prompt with the new body.

  const handleSkillsChanged = useCallback(
    (affectedSkillId?: string) => {
      void fetchSkills().then((list) => setSkills(list));
      void fetchDesignTemplates().then((list) => setDesignTemplates(list));
      iframeKeepAlivePool.evictMatching(
        (entry) => {
          const proj = projectsRef.current.find((p) => p.id === entry.projectId);
          if (!proj) return false;
          if (affectedSkillId) return proj.skillId === affectedSkillId;
          return proj.skillId != null;
        },
        { includeActive: true },
      );
    },
    [iframeKeepAlivePool],
  );

  const handleDesignSystemsChanged = useCallback(
    (affectedDesignSystemId?: string) => {
      void fetchDesignSystems().then((list) => setDesignSystems(list));
      iframeKeepAlivePool.evictMatching(
        (entry) => {
          const proj = projectsRef.current.find((p) => p.id === entry.projectId);
          if (!proj) return false;
          if (affectedDesignSystemId) {
            return proj.designSystemId === affectedDesignSystemId;
          }
          return proj.designSystemId != null;
        },
        { includeActive: true },
      );
    },
    [iframeKeepAlivePool],
  );
  const handleDesignSystemImportRebuildJob = useCallback(
    (designSystemId: string, job: DesignSystemGenerationJob) => {
      setPendingDesignSystemRevisionJobs((current) => ({
        ...current,
        [designSystemId]: job,
      }));
    },
    [],
  );
  const handleDesignSystemRevisionJobConsumed = useCallback((designSystemId: string, jobId: string) => {
    setPendingDesignSystemRevisionJobs((current) => {
      if (current[designSystemId]?.id !== jobId) return current;
      const next = { ...current };
      delete next[designSystemId];
      return next;
    });
  }, []);

  const loadedActiveProject =
    route.kind === 'project'
      ? (projects.find((p) => p.id === route.projectId) ?? null)
      : null;
  const routeProjectPlaceholder = useMemo<Project | null>(() => {
    if (route.kind !== 'project') return null;
    const now = Date.now();
    return {
      id: route.projectId,
      name: 'Untitled',
      skillId: null,
      designSystemId: null,
      createdAt: now,
      updatedAt: now,
    };
  }, [route]);
  const activeProject = loadedActiveProject ?? routeProjectPlaceholder;

  // Deep-linked route to a project we don't have yet (e.g. after a refresh
  // that finishes after the project list comes back). Fetch it in the
  // background so the view can render rather than bouncing to home.
  useEffect(() => {
    if (route.kind !== 'project') return;
    if (loadedActiveProject) return;
    if (!projects.length && !daemonLive) return;
    if (projects.some((p) => p.id === route.projectId)) return;
    let cancelled = false;
    (async () => {
      const project = await getProject(route.projectId).catch(() => null);
      if (cancelled) return;
      if (project) {
        setProjects((curr) => {
          const existingIndex = curr.findIndex((candidate) => candidate.id === project.id);
          if (existingIndex < 0) {
            return [...curr, project];
          }
          return curr.map((candidate) => (candidate.id === project.id ? project : candidate));
        });
        return;
      }
      const request = beginProjectListRequest();
      const list = await listProjects().catch(() => []);
      if (cancelled) return;
      const applied = reconcileFetchedProjects(list, request);
      if (!applied) return;
      const fetchedProject = locallyDeletedProjectIdsRef.current.has(route.projectId)
        ? undefined
        : list.find((p) => p.id === route.projectId);
      const staleRequest = request.mutationVersion < projectListMutationVersionRef.current;
      const knownLocalProject =
        staleRequest && pendingLocalProjectIdsRef.current.has(route.projectId);
      if (!fetchedProject && !knownLocalProject) {
        setProjectOpenError(t('project.missing'));
        navigate({ kind: 'home', view: 'home' }, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, loadedActiveProject, projects, daemonLive, beginProjectListRequest, reconcileFetchedProjects, t]);

  const openSettings = useCallback((section: SettingsSection = 'execution') => {
    setSettingsWelcome(false);
    setSettingsInitialSection(section);
    setSettingsOpen(true);
  }, []);

  const openPetSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsInitialSection('pet');
    setSettingsOpen(true);
  }, []);


  // Cmd+, (mac) / Ctrl+, (win/linux) opens Settings. Capture phase so we
  // beat the browser's default Preferences dialog. Platform-gated so
  // meta/ctrl don't conflict across OS.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key === ',') {
        if (e.isComposing) return;
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [openSettings]);

  // Explicit enabled toggle — true = wake, false = tuck. Persists to
  // localStorage so the overlay state survives across reloads. We keep
  // `adopted` untouched so the entry-view CTA does not regress to
  // "adopt me" once the user has already chosen.
  const handleSetPetEnabled = useCallback((enabled: boolean) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = { ...curr, pet: { ...prev, enabled } };
      saveConfig(next);
      return next;
    });
  }, []);

  const handleTuckPet = useCallback(
    () => handleSetPetEnabled(false),
    [handleSetPetEnabled],
  );

  // Toggle wake/tuck — used by the pet rail and the composer button.
  const handleTogglePet = useCallback(() => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, enabled: !prev.enabled },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // Inline adopt — the right-hand pet rail and the composer's pet menu
  // both call this to switch pets without bouncing the user into
  // Settings. It always wakes the overlay so the change is visible.
  const handleAdoptPet = useCallback((petId: string) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, adopted: true, enabled: true, petId },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // When the user lands on the entry view (route.kind === 'home'), pull
  // a fresh template list. The template store is global — if they just
  // saved a template inside a project, returning home should reflect it
  // immediately in the From-template tab without forcing a page reload.
  // Same rationale for design systems: a brand extraction (or any in-project
  // design-system creation) registers a `user:<id>` system out of band, so the
  // Design systems tab must re-fetch to show it — and the brand-ready prompt
  // relies on the new system being present so it can preselect it.
  useEffect(() => {
    if (route.kind !== 'home') return;
    void refreshTemplates();
    void refreshDesignSystems();
  }, [route.kind, refreshTemplates, refreshDesignSystems]);

  // Existing card grids (DesignsTab, ProjectView), pickers (NewProjectPanel,
  // ChatComposer mention) all look skills up by id without caring whether
  // the id resolves to a functional skill or a design template. Pass them
  // the union so the post-split refactor stays invisible to those callers.
  const allSkillSummaries = useMemo(
    () => [...skills, ...designTemplates],
    [skills, designTemplates],
  );
  const enabledSkills = useMemo(
    () =>
      allSkillSummaries.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [allSkillSummaries, config.disabledSkills],
  );
  // Functional-skills-only enabled subset — what ProjectView's chat
  // composer @-picker should see. Without this, a skill the user has
  // disabled in Settings still appears in an existing project's @-mention
  // popover and can ride along to the daemon via skillIds, breaking the
  // Library toggle for projects opened on the post-split branch.
  const enabledFunctionalSkills = useMemo(
    () =>
      skills.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [skills, config.disabledSkills],
  );
  // Templates-only enabled subset — what the EntryView Templates gallery
  // actually renders. Filtering in App keeps the EntryView prop surface
  // narrow ("here are the templates the user has not disabled").
  const enabledDesignTemplates = useMemo(
    () =>
      designTemplates.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [designTemplates, config.disabledSkills],
  );
  const enabledDS = useMemo(
    () =>
      designSystems.filter(
        (d) => !(config.disabledDesignSystems ?? []).includes(d.id),
      ),
    [designSystems, config.disabledDesignSystems],
  );

  let appMain: ReactNode;
  if (route.kind === 'design-system-create') {
    appMain = (
      <DesignSystemCreationFlow
        onBack={() => navigate({ kind: 'home', view: 'design-systems' })}
        designSystems={enabledDS}
        onCreated={(projectId, project, conversationId) => {
          if (project) {
            setProjects((curr) => [
              project,
              ...curr.filter((p) => p.id !== project.id),
            ]);
          }
          navigate({ kind: 'project', projectId, conversationId: conversationId ?? null, fileName: null });
        }}
        onProjectPrepared={(project) => {
          setProjects((curr) => [
            project,
            ...curr.filter((p) => p.id !== project.id),
          ]);
        }}
        onSystemsRefresh={refreshDesignSystems}
      />
    );
  } else if (route.kind === 'design-system-detail') {
    appMain = (
      <DesignSystemDetailView
        id={route.designSystemId}
        selectedId={config.designSystemId}
        config={config}
        agents={agents}
        onBack={() => navigate({ kind: 'home', view: 'design-systems' })}
        onOpenProject={(projectId) => void handleOpenProject(projectId)}
        onSetDefault={handleChangeDefaultDesignSystem}
        onSystemsRefresh={refreshDesignSystems}
        onProjectsRefresh={refreshProjects}
        initialRevisionJob={pendingDesignSystemRevisionJobs[route.designSystemId] ?? null}
        onInitialRevisionJobConsumed={(jobId) =>
          handleDesignSystemRevisionJobConsumed(route.designSystemId, jobId)
        }
      />
    );
  } else if (activeProject) {
    appMain = (
      <ProjectView
        key={activeProject.id}
        project={activeProject}
        routeFileName={route.kind === 'project' ? route.fileName : null}
        routeConversationId={route.kind === 'project' ? route.conversationId : null}
        config={config}
        agents={agents}
        skills={enabledFunctionalSkills}
        designTemplates={designTemplates}
        designSystems={designSystems}
        daemonLive={daemonLive}
        byokRuntimeAvailable={byokRuntimeAvailable}
        onModeChange={handleModeChange}
        onAgentChange={handleAgentChange}
        onAgentModelChange={handleAgentModelChange}
        onApiModelChange={handleApiModelChange}
        onRefreshAgents={refreshAgents}
        onThemeChange={handleThemeChange}
        onOpenSettings={openSettings}
        onAdoptPetInline={handleAdoptPet}
        onTogglePet={handleTogglePet}
        onOpenPetSettings={openPetSettings}
        onBack={handleBack}
        onClearPendingPrompt={handleClearPendingPrompt}
        onTouchProject={handleTouchProject}
        onProjectChange={handleProjectChange}
        onProjectsRefresh={refreshProjects}
        onDeleteProject={handleDeleteProject}
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        onDesignSystemsRefresh={refreshDesignSystems}
        onCreateProjectFromDesignSystem={handleCreateProjectFromDesignSystem}
        onCreateDesignSystemFromProject={handleCreateDesignSystemFromProject}
        onDuplicateProject={handleDuplicateProject}
      />
    );
  } else {
    appMain = (
      <EntryView
        skills={enabledSkills}
        designTemplates={enabledDesignTemplates}
        designSystems={enabledDS}
        projects={projects}
        templates={templates}
        onDeleteTemplate={handleDeleteTemplate}
        promptTemplates={promptTemplates}
        defaultDesignSystemId={config.designSystemId}
        agents={agents}
        config={config}
        providerModelsCache={providerModelsCache}
        onProviderModelsCacheChange={setProviderModelsCache}
        daemonLive={daemonLive}
        onModeChange={handleModeChange}
        onAgentChange={handleAgentChange}
        onAgentModelChange={handleAgentModelChange}
        onApiProtocolChange={handleApiProtocolChange}
        onApiModelChange={handleApiModelChange}
        onConfigPersist={handleConfigPersist}
        onSkillsRefresh={refreshSkills}
        onSkillsChanged={handleSkillsChanged}
        onRefreshAgents={refreshAgents}
        onThemeChange={handleThemeChange}
        skillsLoading={skillsLoading}
        designSystemsLoading={dsLoading}
        projectsLoading={projectsLoading}
        promptTemplatesLoading={promptTemplatesLoading}
        onCreateProject={handleCreateProject}
        onImportClaudeDesign={handleImportClaudeDesign}
        onImportFolder={handleImportFolder}
        onImportFolderResponse={handleImportFolderResponse}
        onOpenProject={handleOpenProject}
        onOpenLiveArtifact={handleOpenLiveArtifact}
        onDeleteProject={handleDeleteProject}
        onDuplicateProject={handleDuplicateProject}
        onRenameProject={handleRenameProject}
        onProjectsRefresh={refreshProjectsStrict}
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        onCreateDesignSystem={() => {
          navigate({ kind: 'design-system-create' });
        }}
        onOpenDesignSystem={(id: string) => navigate({ kind: 'design-system-detail', designSystemId: id })}
        onDesignSystemsRefresh={refreshDesignSystems}
        onOpenSettings={openSettings}
      />
    );
  }
  return (
    <>
      <div
        className={`workspace-shell workspace-shell--${clientType}`}
        data-client-type={clientType}
      >
        <WorkspaceTabsBar
          route={route}
          projects={projects}
          onboardingCompleted={config.onboardingCompleted === true}
        />
        <div className="workspace-shell__body">
          {appMain}
        </div>
      </div>
      {clientType === 'desktop' ? null : (
        <PetOverlay
          pet={config.pet?.enabled ? config.pet : undefined}
          taskCenter={petTaskCenter}
          onOpenProject={handleOpenProject}
        />
      )}
      <TooltipLayer />
      <AnimatePresence>
      {settingsOpen ? (
        <SettingsDialog
          initial={config}
          agents={agents}
          agentsLoading={agentsLoading}
          daemonLive={daemonLive}
          appVersionInfo={appVersionInfo}
          welcome={settingsWelcome}
          initialSection={settingsInitialSection}
          onPersist={handleConfigPersist}
          onDraftChange={handleSettingsDraftChange}
          onClose={() => {
            // Closing the dialog is the canonical "I'm done" gesture
            // now that there is no global Save button. We mark
            // onboardingCompleted on close so the welcome modal stops
            // re-prompting on every refresh, regardless of whether
            // the user changed anything during the session.
            const next = resolveSettingsCloseConfig(config, latestPersistedConfigRef.current);
            if (!next.onboardingCompleted || !config.onboardingCompleted) {
              latestPersistedConfigRef.current = next;
              saveConfig(next);
              void syncConfigToDaemon(next);
              setConfig(next);
            }
            setSettingsOpen(false);
            settingsDraftConfigRef.current = null;
          }}
          onRefreshAgents={refreshAgents}
          daemonMediaProviders={daemonMediaProviders}
          daemonMediaProvidersFetchState={daemonMediaProvidersFetchState}
          mediaProvidersNotice={mediaProvidersNotice}
          onReloadMediaProviders={reloadMediaProvidersFromDaemon}
          onProjectsRefresh={refreshProjects}
          onSkillsChanged={handleSkillsChanged}
          onDesignSystemsChanged={handleDesignSystemsChanged}
          onDesignSystemImportRebuildJob={handleDesignSystemImportRebuildJob}
          providerModelsCache={providerModelsCache}
          onProviderModelsCacheChange={setProviderModelsCache}
        />
      ) : null}
      </AnimatePresence>
      <MemoryToast onOpenMemory={() => openSettings('memory')} />
      {workingDirError ? (
        <Toast
          message={workingDirError}
          role="alert"
          onDismiss={() => setWorkingDirError(null)}
        />
      ) : null}
      {projectOpenError ? (
        <Toast
          message={projectOpenError}
          role="alert"
          tone="error"
          onDismiss={() => setProjectOpenError(null)}
        />
      ) : null}
    </>
  );
}

function generateInstallationIdSafe(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
