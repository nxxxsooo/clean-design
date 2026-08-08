import {
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { ChatSessionMode } from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../media/models';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  ProviderModelOption,
  SkillSummary,
} from '../types';
// `EntryShell` owns the redesigned home layout (left rail + centered
// hero + recent projects + plugins). Keeping the redesign in a sibling
// component lets future rebases against upstream `EntryView` (props,
// connector lifecycle, exported helpers) stay close to a no-op here.
import { EntryShell } from './EntryShell';
import type { CreateInput, ImportClaudeDesignOutcome } from './NewProjectPanel';

type EntryCreateProjectInput = Omit<CreateInput, 'metadata'> & {
  metadata?: CreateInput['metadata'];
  pendingPrompt?: string;
  pluginId?: string;
  pluginType?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  conversationMode?: ChatSessionMode;
  autoSendFirstMessage?: boolean;
  requestId?: string;
  pendingFiles?: File[];
  userWorkingDirToken?: string;
};

interface Props {
  // Union of functional skills + design templates — used for id-based
  // lookups (DesignsTab project chips, NewProjectPanel skill picker).
  // The Templates gallery itself reads `designTemplates` instead so it
  // doesn't accidentally show functional skills as renderable cards.
  skills: SkillSummary[];
  // Design templates only. Sourced from /api/design-templates. See
  // specs/current/skills-and-design-templates.md.
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  onDeleteTemplate: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  agents: AgentInfo[];
  // Execution / model-switching context forwarded to the EntryShell so the
  // sticky top-bar can expose the active CLI/BYOK + model and persist
  // changes through the same channels as the project view.
  config: AppConfig;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<Record<string, ProviderModelOption[]>>>;
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
  onSkillsRefresh?: () => Promise<void> | void;
  onSkillsChanged?: (affectedSkillId?: string) => void;
  onRefreshAgents: () => Promise<AgentInfo[]> | AgentInfo[];
  // Quick theme switch invoked from the avatar-popover dropdown so the
  // user can flip light/dark/system without opening the full Settings
  // dialog. Persistence happens in `App`; this component just forwards.
  onThemeChange: (theme: AppTheme) => void;
  // Per-resource loading flags. Each tab gates its own content on whichever
  // flag matches the data it renders, so a slow `/api/agents` probe does
  // not block tabs that don't need agents. Templates are not gated here —
  // the New project modal renders an empty state until they arrive (fast
  // fetch), which keeps the prop surface narrower.
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  promptTemplatesLoading?: boolean;
  onCreateProject: (input: EntryCreateProjectInput) => Promise<boolean> | boolean | void;
  onImportClaudeDesign: (
    file: File,
  ) => Promise<ImportClaudeDesignOutcome | void> | ImportClaudeDesignOutcome | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  onOpenProject: (id: string) => Promise<boolean> | boolean | void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject?: (id: string) => Promise<void> | void;
  onRenameProject: (id: string, name: string) => void;
  onProjectsRefresh?: () => Promise<void> | void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onOpenSettings: (section?: 'execution' | 'media' | 'language' | 'appearance' | 'notifications' | 'pet' | 'projectLocations' | 'library' | 'about' | 'memory' | 'designSystems') => void;
}

export function EntryView({
  skills,
  designTemplates,
  designSystems,
  projects,
  templates,
  onDeleteTemplate,
  promptTemplates,
  defaultDesignSystemId,
  agents,
  config,
  providerModelsCache,
  onProviderModelsCacheChange,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onSkillsRefresh,
  onSkillsChanged,
  onRefreshAgents,
  onThemeChange,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  promptTemplatesLoading: _promptTemplatesLoading = false,
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
  return (
    <EntryShell
      skills={skills}
      designTemplates={designTemplates}
      designSystems={designSystems}
      projects={projects}
      templates={templates}
      onDeleteTemplate={onDeleteTemplate}
      promptTemplates={promptTemplates}
      defaultDesignSystemId={defaultDesignSystemId}
      skillsLoading={skillsLoading}
      designSystemsLoading={designSystemsLoading}
      projectsLoading={projectsLoading}
      config={config}
      providerModelsCache={providerModelsCache}
      onProviderModelsCacheChange={onProviderModelsCacheChange}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onConfigPersist={onConfigPersist}
      onSkillsRefresh={onSkillsRefresh}
      onSkillsChanged={onSkillsChanged}
      onRefreshAgents={onRefreshAgents}
      onThemeChange={onThemeChange}
      onCreateProject={onCreateProject}
      onImportClaudeDesign={onImportClaudeDesign}
      {...(onImportFolder ? { onImportFolder } : {})}
      {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
      onOpenProject={onOpenProject}
      onOpenLiveArtifact={onOpenLiveArtifact}
      onDeleteProject={onDeleteProject}
      onDuplicateProject={onDuplicateProject}
      onRenameProject={onRenameProject}
      onProjectsRefresh={onProjectsRefresh}
      onChangeDefaultDesignSystem={onChangeDefaultDesignSystem}
      onCreateDesignSystem={onCreateDesignSystem}
      onOpenDesignSystem={onOpenDesignSystem}
      onDesignSystemsRefresh={onDesignSystemsRefresh}
      onOpenSettings={onOpenSettings}
    />
  );
}

// Map a skill's declared mode to project metadata. Falls back to the same
// defaults the new-project form would apply (high-fidelity prototype, no
// speaker notes on decks, no template animations) so 'Use this prompt'
// produces a project indistinguishable from one created via the form. Per-
// skill hints in SKILL.md frontmatter (od.fidelity, od.speaker_notes,
// od.animations) override the defaults so each example reproduces the
// shipped example.html — e.g. wireframe-sketch declares fidelity:wireframe.
//
// Kept exported (and the kindForSkill helper too) so the New project modal
// and any future skill-driven creation surface can share the mapping.
export function metadataForSkill(skill: SkillSummary): ProjectMetadata {
  const kind = kindForSkill(skill);
  if (kind === 'prototype') {
    return { kind, fidelity: skill.fidelity ?? 'high-fidelity' };
  }
  if (kind === 'deck') {
    return {
      kind,
      speakerNotes:
        typeof skill.speakerNotes === 'boolean' ? skill.speakerNotes : false,
    };
  }
  if (kind === 'template') {
    return {
      kind,
      animations:
        typeof skill.animations === 'boolean' ? skill.animations : false,
    };
  }
  if (kind === 'image') {
    return { kind, imageModel: DEFAULT_IMAGE_MODEL, imageAspect: '1:1' };
  }
  if (kind === 'video') {
    return { kind, videoModel: DEFAULT_VIDEO_MODEL, videoAspect: '16:9', videoLength: 5 };
  }
  if (kind === 'audio') {
    return {
      kind,
      audioKind: 'speech',
      audioModel: DEFAULT_AUDIO_MODEL.speech,
      audioDuration: 10,
    };
  }
  return { kind: 'other' };
}

export function kindForSkill(skill: SkillSummary): ProjectKind {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  if (skill.mode === 'image' || skill.surface === 'image') return 'image';
  if (skill.mode === 'video' || skill.surface === 'video') return 'video';
  if (skill.mode === 'audio' || skill.surface === 'audio') return 'audio';
  return 'other';
}
