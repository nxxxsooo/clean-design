import type { ChatRequest, ChatRunStatusResponse } from './api/chat';
import type { MemoryTreeNode } from './api/memory';
import {
  PROJECT_EXPORT_MANIFEST_SCHEMA,
  buildProjectRawFileUrl,
  type ProjectExportManifestResponse,
  type ProjectFile,
} from './api/files';
import type { LiveArtifact, LiveArtifactCreateInput, LiveArtifactUpdateInput } from './api/live-artifacts';
import { DEFAULT_MEDIA_EXECUTION_POLICY } from './api/media';
import type { HealthResponse } from './api/registry';
import type { ApiErrorResponse, ApiValidationErrorDetails } from './errors';
import type { ChatSseEvent } from './sse/chat';
import type { ProxySseEvent } from './sse/proxy';

export const exampleChatRequest: ChatRequest = {
  agentId: 'claude',
  message: '## user\nCreate a design',
  currentPrompt: 'Create a design',
  systemPrompt: 'Design carefully.',
  projectId: 'project_1',
  attachments: ['brief.pdf'],
  model: 'default',
  reasoning: null,
};

export const exampleProjectFile: ProjectFile = {
  name: 'index.html',
  path: 'index.html',
  type: 'file',
  size: 1024,
  mtime: 1_713_000_000,
  kind: 'html',
  mime: 'text/html',
};

export const exampleChatSseEvents: ChatSseEvent[] = [
  { event: 'start', data: { bin: 'claude', cwd: '/legacy/internal/path' } },
  { event: 'agent', data: { type: 'text_delta', delta: 'Hello' } },
  { event: 'stdout', data: { chunk: 'plain output' } },
  { event: 'end', data: { code: 0 } },
];

export const exampleProxySseEvents: ProxySseEvent[] = [
  { event: 'start', data: { model: 'gpt-4o-mini' } },
  { event: 'delta', data: { delta: 'Hello' } },
  { event: 'end', data: { code: 0 } },
];

export const exampleApiErrorResponse: ApiErrorResponse = {
  error: {
    code: 'BAD_REQUEST',
    message: 'Missing message',
    retryable: false,
  },
};

export const exampleMediaExecutionDisabledErrorResponse: ApiErrorResponse = {
  error: {
    code: 'MEDIA_EXECUTION_DISABLED',
    message: 'media generation is disabled for this run',
    retryable: false,
  },
};

export const exampleChatRunStatusResponse: ChatRunStatusResponse = {
  id: 'run_1',
  projectId: 'project_1',
  conversationId: 'conversation_1',
  assistantMessageId: 'assistant_1',
  agentId: 'codex',
  designSystemId: 'default',
  designSystemRequestedId: 'default',
  designSystemSelectionSource: 'project',
  designSystemDigest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  status: 'succeeded',
  createdAt: 1_717_200_000_000,
  updatedAt: 1_717_200_030_000,
  exitCode: 0,
  signal: null,
  error: null,
  errorCode: null,
  eventsLogPath: null,
  mediaExecution: DEFAULT_MEDIA_EXECUTION_POLICY,
  promptCache: {
    stablePromptHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    hit: false,
    missReason: 'new-session',
  },
};

export const exampleProjectExportManifestResponse: ProjectExportManifestResponse = {
  schema: PROJECT_EXPORT_MANIFEST_SCHEMA,
  projectId: 'project_1',
  projectName: 'Launch prototype',
  generatedAt: '2026-06-01T00:00:00.000Z',
  entryFile: 'index.html',
  files: [
    {
      ...exampleProjectFile,
      included: true,
      role: 'entry',
      reasons: ['project-entry-file'],
    },
  ],
  artifacts: [],
};

export const exampleProjectRawPreviewUrl = buildProjectRawFileUrl(
  'http://127.0.0.1:17456',
  'project_1',
  'screens/main page.html',
) ?? '';

const exampleLiveArtifactValidationDetails: ApiValidationErrorDetails = {
  kind: 'validation',
  issues: [
    {
      path: 'document.templatePath',
      message: 'Live artifact templates must be stored at template.html.',
      code: 'INVALID_TEMPLATE_PATH',
    },
  ],
};

export const exampleLiveArtifactValidationErrorResponse: ApiErrorResponse = {
  error: {
    code: 'LIVE_ARTIFACT_INVALID',
    message: 'Live artifact validation failed',
    details: exampleLiveArtifactValidationDetails,
    retryable: false,
  },
};

export const exampleHealthResponse: HealthResponse = { ok: true, service: 'daemon' };

export const exampleMemoryTreeNode: MemoryTreeNode = {
  id: 'memory_node_acme_design',
  parentId: 'memory_node_design_systems',
  path: 'design-systems/acme/README.md',
  name: 'Acme design source notes',
  description: 'Source-backed brand and component rules extracted from Acme materials.',
  kind: 'entry',
  type: 'project',
  scope: 'design-system',
  createdAt: '2026-05-18T02:01:00.000Z',
  updatedAt: '2026-05-18T02:01:00.000Z',
};

export const exampleLiveArtifact: LiveArtifact = {
  schemaVersion: 1,
  id: 'live_artifact_1',
  projectId: 'project_1',
  createdByRunId: 'run_1',
  title: 'Launch Metrics',
  slug: 'launch-metrics',
  status: 'active',
  pinned: false,
  preview: { type: 'html', entry: 'index.html' },
  refreshStatus: 'idle',
  createdAt: '2026-04-29T12:00:00.000Z',
  updatedAt: '2026-04-29T12:00:00.000Z',
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Launch Metrics',
      metrics: [{ label: 'Signups', value: 1280, delta: '+12%' }],
    },
  },
};

export const exampleLiveArtifactCreateInput: LiveArtifactCreateInput = {
  title: 'Launch Metrics',
  slug: 'launch-metrics',
  pinned: false,
  status: 'active',
  preview: { type: 'html', entry: 'index.html' },
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Launch Metrics',
      metrics: [{ label: 'Signups', value: 1280, delta: '+12%' }],
    },
  },
};

export const exampleLiveArtifactUpdateInput: LiveArtifactUpdateInput = {
  title: 'Launch Metrics Dashboard',
  pinned: true,
  preview: { type: 'html', entry: 'index.html' },
};
