import type {
  ChatSessionMode,
  ProjectKind,
  ProjectMetadata,
  RunContextSelection,
} from '@open-design/contracts';

export interface PluginLoopSubmit {
  prompt: string;
  pluginId: string | null;
  pluginType?: string | null;
  skillId?: string | null;
  appliedPluginSnapshotId: string | null;
  pluginTitle: string | null;
  taskKind: string | null;
  pluginInputs?: Record<string, unknown> | null;
  contextPlugins?: Array<{ id: string; title: string; description?: string }> | null;
  initialRunContext?: RunContextSelection | null;
  designSystemId?: string | null;
  projectKind?: ProjectKind | null;
  projectMetadata?: ProjectMetadata | null;
  workingDir?: string | null;
  linkedDirs?: string[] | null;
  workingDirToken?: string | null;
  conversationMode?: ChatSessionMode;
  attachments?: File[];
  examplePromptContext?: { title: string; artifactType: string; brief: Record<string, string> };
}
