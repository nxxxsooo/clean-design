// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  defaultScenarioPluginIdForProjectMetadata,
  type ChatSessionMode,
  type ConnectorDetail,
  type InstalledPluginRecord,
  type RunContextSelection,
} from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import type { DesignSystemGenerateSnapshot } from './DesignSystemFlow';
import { useAnalytics } from '../analytics/provider';
import {
  trackHomeNavClick,
  trackHomeToolbarClick,
} from '../analytics/events';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { CenteredLoader } from './Loading';
import { DesignsTab } from './DesignsTab';
import { DesignSystemsTab } from './DesignSystemsTab';
import { BrandsTab } from './BrandsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { LibrarySection } from './LibrarySection';
import { HomeView } from './HomeView';
import {
  createPluginAuthoringHandoff,
  createPluginUseHandoff,
  type HomePromptHandoff,
} from './home-hero/plugin-authoring';
import type { PluginUseAction } from './plugins-home/useActions';
import { Icon } from './Icon';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import {
  EntrySettingsMenu,
  type EntrySettingsSection,
} from './EntrySettingsMenu';
import { NewProjectModal } from './NewProjectModal';
import type { CreateInput, CreateTab, ImportClaudeDesignOutcome } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import { smoothScrollToTop } from '../utils/smoothScrollToTop';
import { summarizeProjectNameFromPrompt } from '../utils/projectName';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import {
  providerModelsCacheKey,
  type ProviderModelsCache,
} from './providerModelsCache';
import { resolveByokModelPreference } from './byok/validation';

// Persist the entry nav-rail open/collapsed state so it survives both a
// home -> project -> home navigation (EntryShell unmounts on the project
// route) and a full reload. Without this the rail always reset to its
// collapsed default on return.
const RAIL_OPEN_STORAGE_KEY = 'od.entry.railOpen';

function readStoredRailOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredRailOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* ignore quota / disabled storage */
  }
}

// The topbar chips (GitHub star, model switcher, Use everywhere)
// collapse into the settings dropdown when the viewport gets
// narrow. The transition is driven entirely by CSS @media queries
// in `entry-layout.css` so server and client render identical
// markup — both surfaces are always present, and CSS toggles
// `display` based on `--compact-topbar` breakpoint (900px).

// Default scenario plugin for each project kind/intent. The mapping
// lives in `@open-design/contracts` so the daemon's `/api/projects`
// and `/api/runs` fallbacks resolve to the same plugin id when no
// `pluginId` is on the request body — plan §3.3 of
// `specs/current/plugin-driven-flow-plan.md`.
type EntryCreateProjectInput = Omit<CreateInput, 'metadata'> & {
  metadata?: CreateInput['metadata'];
  pendingPrompt?: string;
  pluginId?: string;
  pluginType?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  initialRunContext?: RunContextSelection | null;
  conversationMode?: ChatSessionMode;
  autoSendFirstMessage?: boolean;
  /** The home submit already ran the Clean Design Cloud balance gate; the
   *  project's first auto-send must not re-gate. */
  requestId?: string;
  pendingFiles?: File[];
  userWorkingDirToken?: string;
  linkedDirs?: string[] | null;
};

function defaultPluginIdForMetadata(metadata: ProjectMetadata): string | null {
  return defaultScenarioPluginIdForProjectMetadata(metadata);
}

function defaultPluginInputsForCreate(
  input: CreateInput,
  pluginId: string | null,
): Record<string, unknown> | null {
  const kind = input.metadata.kind;
  const projectName = input.name.trim();

  if (pluginId === 'example-web-prototype') {
    return {
      artifactKind: input.metadata.includeLandingPage
        ? 'landing page'
        : 'web prototype',
      fidelity: input.metadata.fidelity ?? 'high-fidelity',
      audience: 'product evaluators',
      designSystem: 'the active project design system',
      template: input.metadata.templateLabel ?? 'the bundled web prototype seed',
    };
  }

  if (pluginId === 'example-simple-deck') {
    return {
      deckType: 'pitch deck',
      topic: projectName || 'the user brief',
      audience: 'decision makers',
      slideCount: '10-15 pages',
      speakerNotes: input.metadata.speakerNotes
        ? 'include speaker notes'
        : 'no speaker notes',
      designSystem: 'the active project design system',
    };
  }

  if (pluginId === 'od-new-generation') {
    const templateLabel = input.metadata.templateLabel?.trim();
    const artifactKind =
      kind === 'template'
        ? 'artifact based on a saved template'
        : kind === 'other'
          ? 'custom design artifact'
          : `${kind} artifact`;
    return {
      artifactKind,
      audience: 'product and design reviewers',
      topic: templateLabel || projectName || 'the user brief',
    };
  }

  if (pluginId !== 'od-media-generation') return null;
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') return null;

  const promptTemplate = input.metadata.promptTemplate;
  const subject =
    promptTemplate?.prompt?.trim()
    || projectName
    || promptTemplate?.title?.trim()
    || `${kind} concept`;
  const style =
    promptTemplate?.summary?.trim()
    || 'cinematic, high-quality, on-brand';
  const aspect =
    kind === 'image'
      ? input.metadata.imageAspect
      : kind === 'video'
        ? input.metadata.videoAspect
        : undefined;

  return {
    mediaKind: kind,
    subject,
    style,
    ...(aspect ? { aspect } : {}),
  };
}

interface Props {
  skills: SkillSummary[];
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  onDeleteTemplate?: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  connectors: ConnectorDetail[];
  connectorsLoading: boolean;
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  // Execution / model-switching context. Threaded down from `App` so the
  // top-bar `InlineModelSwitcher` can render the active mode/agent/model
  // and persist changes through the same callbacks the project view uses.
  config: AppConfig;
  providerModelsCache?: ProviderModelsCache;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onConfigPersist: (cfg: AppConfig) => Promise<void> | void;
  /** True only when GET /api/app-config returned a real config object. */
  daemonAppConfigReady?: boolean;
  /** Non-optimistic daemon write for the silent-update preference. */
  onSilentUpdatePreferenceChange?: (allowSilentUpdates: boolean) => Promise<void>;
  onSkillsRefresh?: () => Promise<void> | void;
  onSkillsChanged?: (affectedSkillId?: string) => void;
  onRefreshAgents: () => Promise<AgentInfo[]> | AgentInfo[];
  // Quick theme switch from the avatar-popover dropdown. Lets the user
  // flip between system / light / dark without opening the full Settings
  // dialog. App owns persistence; this component just calls the callback.
  onThemeChange: (theme: AppTheme) => void;
  onCreateProject: (input: EntryCreateProjectInput) => Promise<boolean> | boolean | void;
  onImportClaudeDesign: (
    file: File,
  ) => Promise<ImportClaudeDesignOutcome | void> | ImportClaudeDesignOutcome | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  onOpenProject: (id: string, fileName?: string) => Promise<boolean> | boolean | void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicateProject?: (id: string) => Promise<void> | void;
  onRenameProject: (id: string, name: string) => void;
  onProjectsRefresh?: () => Promise<void> | void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  // NOTE: first-run onboarding intentionally no longer hosts guided
  // design-system creation. The previous step-3 design-system surface was
  // replaced by the newsletter and brand-extraction steps, so EntryShell does
  // not accept a `renderDesignSystemCreation` renderer. Guided creation stays
  // reachable from the standalone `design-system-create` route and the
  // Design Systems tab; do not re-thread an onboarding renderer here.
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onOpenSettings: (section?: EntrySettingsSection) => void;
}

// Map an EntryNavRail view id to the analytics `element` enum on
// `home/nav` ui_click. Returns `null` for views without a dedicated nav
// button (the rail's "Home" target is the brand logo, which gets its own
// element value via the logo click handler — not the changeView path).
function navElementForView(
  next: EntryViewKind,
):
  | 'home'
  | 'projects'
  | 'design_systems'
  | null {
  switch (next) {
    case 'home':
      return 'home';
    case 'projects':
      return 'projects';
    case 'design-systems':
      return 'design_systems';
    case 'brands':
      // No dedicated brands analytics element yet; reuse the design_systems
      // slot since Brands replaces that nav destination.
      return 'design_systems';
    default:
      return null;
  }
}

// Tab views stay mounted (so previews/thumbnails survive a tab switch) but the
// inactive ones must leave layout, the accessibility tree, and tab order.
// `content-visibility: hidden` still reserves the hidden pane's block size,
// which pushes later sidebar destinations far below the sticky topbar.
function inactiveViewProps(active: boolean) {
  return {
    style: active ? undefined : ({ display: 'none' } as const),
    inert: !active,
    'aria-hidden': !active,
  };
}

export function EntryShell({
  skills,
  designTemplates,
  designSystems,
  projects,
  templates,
  onDeleteTemplate,
  promptTemplates,
  defaultDesignSystemId,
  connectors,
  connectorsLoading,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  config,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  daemonAppConfigReady = false,
  onSilentUpdatePreferenceChange,
  onSkillsRefresh,
  onSkillsChanged,
  onRefreshAgents,
  onThemeChange,
  onCreateProject,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onDuplicateProject,
  onRenameProject,
  onProjectsRefresh,
  onChangeDefaultDesignSystem,
  onCreateDesignSystem,
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onOpenSettings,
}: Props) {
  const t = useT();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  useEffect(() => {
    if (view !== 'design-systems') return;
    void onDesignSystemsRefresh?.();
  }, [onDesignSystemsRefresh, view]);
  // The entry nav rail is collapsed by default (Manus-style) so the entry
  // view opens clean and full-width; the panel toggle in the topbar opens it
  // as an overlay that dismisses on selection / backdrop click / Escape.
  // Its open/collapsed state is persisted (localStorage) so it survives a
  // home -> project -> home round trip (EntryShell unmounts on the project
  // route) and a reload, instead of snapping back to collapsed.
  const [railOpen, setRailOpen] = useState<boolean>(readStoredRailOpen);
  useEffect(() => {
    writeStoredRailOpen(railOpen);
  }, [railOpen]);
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
  const [newProjectInitialTab, setNewProjectInitialTab] =
    useState<CreateTab>('prototype');
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(null);
  const entryMainScrollRef = useRef<HTMLElement | null>(null);
  // Entry views share this element, so route changes must not inherit the previous view's offset.
  useLayoutEffect(() => {
    const scrollContainer = entryMainScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
  }, [view]);
  const analytics = useAnalytics();
  function changeView(next: EntryViewKind) {
    const navElement = navElementForView(next);
    if (navElement) {
      trackHomeNavClick(analytics.track, {
        page_name: 'home',
        area: 'nav',
        element: navElement,
      });
    }
    navigate({ kind: 'home', view: next });
  }

  function startPluginAuthoring(goal?: string) {
    setHomePromptHandoff(
      createPluginAuthoringHandoff(Date.now(), goal),
    );
    changeView('home');
  }

  function usePluginFromLibrary(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
  ) {
    setHomePromptHandoff(
      createPluginUseHandoff(Date.now(), record.id, { action }),
    );
    changeView('home');
  }

  useEffect(() => {
    if (view !== 'home' || !homePromptHandoff) return;
    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = entryMainScrollRef.current;
      if (!scrollContainer) return;
      smoothScrollToTop(scrollContainer);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [homePromptHandoff?.id, view]);

  function openNewProject(tab: CreateTab = 'prototype') {
    setNewProjectInitialTab(tab);
    setNewProjectOpen(true);
  }

  function startBlankProjectFromRail() {
    void Promise.resolve(
      onCreateProject({
        name: t('common.untitled'),
        skillId: null,
        designSystemId: null,
      }),
    ).catch((err) => {
      console.warn('Failed to create blank project from entry rail', err);
    });
  }

  function handleCreate(input: CreateInput) {
    // The NewProjectModal no longer asks the user to pick a plugin.
    // Each project kind is silently bound to its default scenario
    // pipeline at creation time so the user lands in a running flow
    // without having to reason about pipeline internals. The mapping
    // is intentionally explicit so future kind-specific scenarios
    // (e.g. a deck- or image-specialized pipeline) can take over a
    // single row without touching the form.
    const pluginId = defaultPluginIdForMetadata(input.metadata);
    const pluginInputs = defaultPluginInputsForCreate(input, pluginId);
    return onCreateProject({
      ...input,
      ...(pluginId ? { pluginId } : {}),
      ...(pluginInputs ? { pluginInputs } : {}),
    });
  }

  // Plan §3.F5 — the home prompt-loop submit path. The user picks a
  // plugin (which calls /api/plugins/:id/apply and binds a snapshot),
  // edits the rendered example query if any, then presses Enter. We
  // derive a project name from the active plugin (or prompt head),
  // forward the pluginId so POST /api/projects pins the snapshot to
  // project + conversation, and request auto-send of the first
  // message so the user lands inside a running pipeline.
  //
  // Stage B of plugin-driven-flow-plan: the rail can stamp a
  // `projectKind` on the payload so the created project records the
  // chosen surface (image / video / audio, etc.). Free-form Home
  // submits now arrive with the hidden od-default router plugin and
  // projectKind='other', so the agent asks for the exact task type
  // before continuing.
  async function handlePluginLoopSubmit(payload: PluginLoopSubmit) {
    const summarizedName = summarizeProjectNameFromPrompt(payload.prompt);
    const head = payload.prompt.trim().split(/\s+/).slice(0, 8).join(' ');
    const firstAttachmentName = payload.attachments?.[0]?.name ?? '';
    const fallbackName =
      summarizedName || (head.length > 0 ? head : firstAttachmentName || 'Untitled');
    const name =
      payload.pluginTitle && payload.pluginTitle.trim().length > 0
        ? payload.pluginTitle.trim()
        : fallbackName;
    const linkedDirs = Array.from(
      new Set(
        [
          ...(payload.workingDir ? [payload.workingDir] : []),
          ...(payload.linkedDirs ?? []),
        ].map((dir) => dir.trim()).filter(Boolean),
      ),
    );
    const metadata: ProjectMetadata = {
      ...(payload.projectMetadata ?? {}),
      kind: payload.projectKind ?? payload.projectMetadata?.kind ?? 'prototype',
      nameSource: 'prompt',
      ...(payload.contextPlugins && payload.contextPlugins.length > 0
        ? { contextPlugins: payload.contextPlugins }
        : {}),
      ...(payload.contextMcpServers && payload.contextMcpServers.length > 0
        ? { contextMcpServers: payload.contextMcpServers }
        : {}),
      ...(payload.contextConnectors && payload.contextConnectors.length > 0
        ? { contextConnectors: payload.contextConnectors }
        : {}),
      // The Home working-directory picker grants the agent read-only
      // awareness of a local folder (via `--add-dir`), it does NOT import
      // that folder into Design Files. So the picked path becomes the new
      // project's `linkedDirs` rather than its `baseDir`/`userWorkingDir`:
      // Design Files stays the managed `.od/projects/<id>` artifact store,
      // independent of the user's local files.
      ...(linkedDirs.length > 0 ? { linkedDirs } : {}),
      ...(payload.examplePromptContext ? {
        examplePrompt: true,
        examplePromptTitle: payload.examplePromptContext.title,
        examplePromptBrief: payload.examplePromptContext.brief,
      } : {}),
    };
    return onCreateProject({
      name,
      skillId: payload.skillId ?? null,
      designSystemId: payload.designSystemId ?? null,
      metadata,
      pendingPrompt: payload.prompt,
      ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
      ...(payload.pluginType ? { pluginType: payload.pluginType } : {}),
      ...(payload.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: payload.appliedPluginSnapshotId }
        : {}),
      ...(payload.pluginInputs ? { pluginInputs: payload.pluginInputs } : {}),
      ...(payload.initialRunContext ? { initialRunContext: payload.initialRunContext } : {}),
      ...(payload.conversationMode ? { conversationMode: payload.conversationMode } : {}),
      ...(payload.attachments && payload.attachments.length > 0
        ? { pendingFiles: payload.attachments }
        : {}),
      // No `userWorkingDirToken`: linkedDirs grant read-only `--add-dir`
      // access and are validated by the daemon at create time, so they do
      // not need the desktop main-process trust token that baseDir imports
      // require for write access.
      autoSendFirstMessage: true,
    });
  }

  const avatarMenu = (
    <EntrySettingsMenu
      config={config}
      onThemeChange={onThemeChange}
      onOpenSettings={onOpenSettings}
      onTrackTriggerClick={() => {
        trackHomeToolbarClick(analytics.track, {
          page_name: 'home',
          area: 'toolbar',
          element: 'settings',
        });
      }}
    />
  );


  const executionSwitcher = (
    <InlineModelSwitcher
      config={config}
      agents={agents}
      providerModelsCache={activeProviderModelsCache}
      onProviderModelsCacheChange={activeSetProviderModelsCache}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onOpenSettings={onOpenSettings}
    />
  );
  const homeExecutionSwitcher = (
    <InlineModelSwitcher
      compact
      config={config}
      agents={agents}
      providerModelsCache={activeProviderModelsCache}
      onProviderModelsCacheChange={activeSetProviderModelsCache}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onOpenSettings={onOpenSettings}
    />
  );

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className={`entry${railOpen ? ' entry--rail-open' : ''}`}>
        <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => {
            trackHomeNavClick(analytics.track, {
              page_name: 'home',
              area: 'nav',
              element: 'new_project_plus',
            });
            openNewProject();
          }}
          open={railOpen}
          onClose={() => setRailOpen(false)}
        />
        <main className="entry-main entry-main--scroll" ref={entryMainScrollRef}>
          <div className="entry-main__topbar">
            <button
              type="button"
              className="entry-rail-toggle"
              onClick={() => setRailOpen((prev) => !prev)}
              aria-label={t('entry.navExpand')}
              aria-expanded={railOpen}
              data-testid="entry-rail-toggle"
            >
              <Icon name="panel-left" size={20} />
            </button>
            <div className="entry-main__topbar-chips entry-main__topbar-chips--icon-only">
              {view === 'home' ? null : executionSwitcher}
            </div>
            {avatarMenu}
          </div>
          <div
            className={`entry-main__inner${
              view === 'home' ? '' : ' entry-main__inner--wide'
            }`}
          >
            <div data-testid="entry-view-home" data-active={view === 'home' ? 'true' : 'false'} {...inactiveViewProps(view === 'home')}>
              <HomeView
                isActive={view === 'home'}
                projects={projects}
                projectsLoading={projectsLoading}
                designSystems={designSystems}
                defaultDesignSystemId={defaultDesignSystemId}
                onSubmit={handlePluginLoopSubmit}
                onOpenProject={onOpenProject}
                onViewAllProjects={() => changeView('projects')}
                onDeleteProject={onDeleteProject}
                onDuplicateProject={onDuplicateProject}
                onRenameProject={onRenameProject}
                onOpenNewProject={(tab) => {
                  openNewProject(tab);
                }}
                onStartBlankProject={startBlankProjectFromRail}
                promptHandoff={homePromptHandoff}
                skills={skills}
                skillsLoading={skillsLoading}
                promptTemplates={promptTemplates}
                executionSwitcher={view === 'home' ? homeExecutionSwitcher : undefined}
              />
            </div>
            <div data-testid="entry-view-projects" data-active={view === 'projects' ? 'true' : 'false'} {...inactiveViewProps(view === 'projects')}>
              {projectsLoading || skillsLoading || designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navProjects')}</h1>
                  </header>
                  <DesignsTab
                    projects={projects}
                    skills={skills}
                    designSystems={designSystems}
                    onOpen={onOpenProject}
                    onOpenLiveArtifact={onOpenLiveArtifact}
                    onDelete={onDeleteProject}
                    onDuplicate={onDuplicateProject}
                    onRename={onRenameProject}
                    onRefresh={onProjectsRefresh}
                    isActive={view === 'projects'}
                    onNewProject={() => {
                      openNewProject();
                    }}
                  />
                </div>
              )}
            </div>
            <div data-testid="entry-view-design-systems" data-active={view === 'design-systems' ? 'true' : 'false'} {...inactiveViewProps(view === 'design-systems')}>
              {designSystemsLoading ? (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navDesignSystems')}</h1>
                  </header>
                  <DesignSystemsTab
                    loading
                    systems={[]}
                    templates={templates}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onCreate={onCreateDesignSystem}
                    onOpenSystem={onOpenDesignSystem}
                    onSystemsRefresh={onDesignSystemsRefresh}
                  />
                </div>
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navDesignSystems')}</h1>
                  </header>
                  <DesignSystemsTab
                    systems={designSystems}
                    templates={templates}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onCreate={onCreateDesignSystem}
                    onOpenSystem={onOpenDesignSystem}
                    onSystemsRefresh={onDesignSystemsRefresh}
                  />
                </div>
              )}
            </div>
            {LIBRARY_UI_VISIBLE ? (
              <div data-testid="entry-view-library" data-active={view === 'library' ? 'true' : 'false'} {...inactiveViewProps(view === 'library')}>
                <LibrarySection
                  active={view === 'library'}
                  onOpenProject={(projectId, fileName) =>
                    navigate({ kind: 'project', projectId, conversationId: null, fileName: fileName ?? null })
                  }
                />
              </div>
            ) : null}
            <div data-testid="entry-view-brands" data-active={view === 'brands' ? 'true' : 'false'} {...inactiveViewProps(view === 'brands')}>
              <BrandsTab
                onApplyDesignSystem={onChangeDefaultDesignSystem}
                onOpenProject={onOpenProject}
                onDesignSystemsRefresh={onDesignSystemsRefresh}
              />
            </div>
          </div>
        </main>
      </div>
      <NewProjectModal
        open={newProjectOpen}
        initialTab={newProjectInitialTab}
        skills={skills}
        designTemplates={designTemplates}
        designSystems={designSystems}
        defaultDesignSystemId={defaultDesignSystemId}
        templates={templates}
        {...(onDeleteTemplate ? { onDeleteTemplate } : {})}
        promptTemplates={promptTemplates}
        mediaProviders={config.mediaProviders}
        connectors={connectors}
        connectorsLoading={connectorsLoading}
        loading={skillsLoading}
        onCreate={handleCreate}
        onImportClaudeDesign={onImportClaudeDesign}
        {...(onImportFolder ? { onImportFolder } : {})}
        {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
        onClose={() => setNewProjectOpen(false)}
      />
    </div>
  );
}
