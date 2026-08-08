import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  defaultScenarioPluginIdForProjectMetadata,
  RUN_RESULT_PACKAGE_SCHEMA,
  type AppliedPluginSnapshot,
  type ArtifactManifest,
  type ByokChatProviderConfig,
  type ChatRunStatus,
  type ChatRunStatusResponse,
  type ProjectMetadata as ContractProjectMetadata,
  type RunResultPackageResponse,
} from '@open-design/contracts';
import {
  deriveConfigureGlobals,
  modelIdForTracking,
  sessionModeToTracking,
  type TrackingDesignSystemSource,
  type TrackingDesignSystemKind,
  type TrackingDesignSystemEditSurface,
} from '@open-design/contracts/analytics';
import type { OdNativeEvent } from '@open-design/agui-adapter';
import { newInsertId, readAnalyticsContext } from '../analytics.js';
import type { AnalyticsContext } from '../analytics.js';
import { spawnEnvForAgent } from '../agents.js';
import { agentCliEnvForAgent, readAppConfig } from '../app-config.js';
import {
  codexSessionIdFromRunEvents,
  readCodexRolloutFirstCall,
} from '../codex-rollout-usage.js';
import type { ConnectorService } from '../connectors/service.js';
import {
  conversationTurnIndexForRun,
  getConversation,
  getProject,
  listConversations,
  normalizeConversationSessionMode,
  updateProject,
  upsertMessage,
} from '../db.js';
import { getDetectedRuntimeVersions } from '../runtimes/detection.js';
import { parseMediaExecutionPolicyInput } from '../media/policy.js';
import { isManagedProjectCwd } from '../mcp-config.js';
import {
  buildConnectorProbe,
  getInstalledPlugin,
  resolvePluginSnapshot,
} from '../plugins/index.js';
import {
  assertSandboxProjectRootAvailable,
  isSafeId,
  listFiles,
  resolveProjectDir,
  SandboxImportedProjectError,
} from '../projects.js';
import {
  agentProviderIdForRunAnalytics,
  hasExplicitRequestedModelForAnalytics,
  runtimeTypeForRunAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
  type RunEventForAnalyticsObservability,
  type RunTelemetryTimestamps,
} from '../run-analytics-observability.js';
import {
  diffRunArtifacts,
  snapshotProjectArtifacts,
  type RunArtifactBaseline,
} from '../run-artifact-fs.js';
import type { RunEventForDiagnostics } from '../run-diagnostics.js';
import { summarizeRunDiagnosticsForAnalytics } from '../run-diagnostics.js';
import type { RunEventForFailureClassification } from '../run-failure-classification.js';
import { classifyRunFailure } from '../run-failure-classification.js';
import { deriveRunErrorCode, runResultFromStatus } from '../run-result.js';
import type { RunStatusForAnalytics } from '../run-result.js';
import {
  parseRunToolBundleForRequest,
  validateRunToolBundleForAgent,
} from '../run-tool-bundle.js';
import type { DetectedAgent, RuntimeAgentDef } from '../runtimes/types.js';
import {
  buildOpenCodeByokProviderConfig,
  BYOK_OPENCODE_AGENT_ID,
  BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
} from '../runtimes/byok-opencode.js';
import {
  deriveActivationMilestones,
  runAskedUserQuestion,
} from '../runtimes/run-artifacts.js';
import {
  runArtifactCountForRun,
  runDesignSystemCreatedForRun,
  runPreviewModuleCountForRun,
} from '../runtimes/run-lifecycle-analytics.js';

type SqliteDb = Database.Database;
type JsonRecord = Record<string, unknown>;
type ApiRequest = Request<Record<string, string>, unknown, JsonRecord>;
type ApiResponse = Response<unknown>;
type ProjectMetadata = (Partial<ContractProjectMetadata> & JsonRecord) | null | undefined;
type AgentCliEnv = Parameters<typeof agentCliEnvForAgent>[0];
type RunDeliveryTarget = 'managed-project' | 'external-project' | 'none';

interface ProjectRecord {
  id: string;
  name: string;
  designSystemId?: string | null;
  metadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
}

interface ConversationRecord {
  id: string;
  createdAt?: number;
}

interface RunEventRecord
  extends RunEventForAnalyticsObservability,
    RunEventForDiagnostics,
    RunEventForFailureClassification {
  id: number;
  event: string;
  data: unknown;
  timestamp?: number;
}

interface SseClient {
  send(event: string, data: unknown, id?: number): void;
  end(): void;
  cleanup?(): void;
}

interface ChatRun {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  model?: string | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  projectMetadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  clientType?: 'desktop' | 'web';
  sessionMode?: string | null;
  context?: Record<string, unknown> | null;
  events: RunEventRecord[];
  clients: Set<SseClient>;
  analyticsContext?: AnalyticsContext;
  analyticsTelemetry?: RunTelemetryTimestamps;
  // E-lite root-cause telemetry read at run_finished. `stdinBackpressure`: the
  // prompt write to child stdin was queued (pipe buffer full). `lastAgentActivityAt`:
  // the inactivity-watchdog clock, used to derive `last_progress_age_ms`.
  stdinBackpressure?: boolean;
  lastAgentActivityAt?: number;
  retryAttemptCount?: number;
  retryFinalResult?: string;
  retrySuppressedReason?: string;
  retryOriginalFailure?: {
    failure_category?: string;
    failure_detail?: string;
    failure_stage?: string;
    retryable?: boolean;
    user_action?: string;
  };
  contextBudget?: {
    action: 'unmeasured' | 'within_budget' | 'blocked' | 'rollover';
    source: 'model_metadata' | 'known_model_family' | 'unknown';
    estimatedPromptTokens: number;
    contextWindowTokens?: number;
    reservedOutputTokens?: number;
    safetyMarginTokens?: number;
    inputBudgetTokens?: number;
    budgetRatio?: number;
    priorSessionInputTokens?: number;
    projectedInputTokens?: number;
    rolloverThresholdTokens?: number;
    compactedPromptTokens?: number;
    omittedTranscriptMessageBlocks?: number;
  };
  artifactOutcome?: {
    artifactCount: number;
    artifactsCreated?: number;
    artifactsModified?: number;
    designSystemCreated: boolean;
    previewModuleCount: number;
  };
  designSystemId?: string | null;
  designSystemRequestedId?: string | null;
  designSystemSelectionSource?: string | null;
  designSystemDigest?: string | null;
  promptCache?: {
    stablePromptHash?: string;
    hit?: boolean;
    missReason?: string | null;
  };
}

interface RunCreateMeta extends JsonRecord {
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
  agentId?: string;
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  message?: string;
  currentPrompt?: string;
  projectMetadata?: ProjectMetadata;
}

interface RunListFilters {
  projectId?: unknown;
  conversationId?: unknown;
  status?: unknown;
}

interface ChatRunService {
  create(meta: RunCreateMeta): ChatRun;
  get(id: string): ChatRun | null;
  list(filters: RunListFilters): ChatRun[];
  statusBody(run: ChatRun): ChatRunStatusResponse;
  stream(run: ChatRun, req: Request, res: Response): void;
  start(run: ChatRun, starter: () => Promise<unknown>): ChatRun;
  wait(run: ChatRun): Promise<ChatRunStatusResponse>;
  cancel(run: ChatRun): Promise<ChatRunStatusResponse>;
  isTerminal(status: ChatRunStatus): boolean;
  emit?(run: ChatRun, event: string, data: unknown): RunEventRecord;
  setAnalyticsRecovery?(run: ChatRun, recovery: {
    context: AnalyticsContext;
    properties: Record<string, unknown>;
    insertId: string;
  }): void;
  markAnalyticsCompleted?(run: ChatRun): void;
}

interface AnalyticsService {
  capture(input: {
    eventName: string;
    context: AnalyticsContext;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): void | Promise<void>;
}

interface RunRoutesDesignService {
  runs: ChatRunService;
  analytics: AnalyticsService;
  getAppVersion(): string;
}

interface ProjectFileEntry {
  name: string;
  artifactKind?: string | null;
  artifactManifest?: ArtifactManifest | JsonRecord | null;
}

interface RunRetryAnalyticsEvent {
  event: string;
  data: Record<string, unknown>;
}

interface RunArtifactBaselines {
  take(runId: string): RunArtifactBaseline | undefined;
}

interface SseResponse {
  send(event: string, data: unknown, id?: number): void;
  end(): void;
  cleanup?(): void;
}

interface RunCreatedFallbackInput {
  analyticsContext: AnalyticsContext | null;
  run: ChatRun;
  status: string;
}

interface RunProjectKindInput {
  hintProjectKind: string | null;
  projectMetadata?: ProjectMetadata;
}

export interface RegisterRunRoutesDeps {
  db: SqliteDb;
  design: RunRoutesDesignService;
  http: {
    createSseResponse: (res: Response) => SseResponse;
    sendApiError: (
      res: Response,
      status: number,
      code: string,
      message: string,
    ) => Response<unknown> | void;
  };
  paths: {
    PROJECTS_DIR: string;
    RUNTIME_DATA_DIR: string;
  };
  agents: {
    detectAgents: (agentCliEnv?: Record<string, unknown>) => Promise<DetectedAgent[]>;
    getAgentDef: (agentId: string) => RuntimeAgentDef | null | undefined;
  };
  chat: {
    startChatRun: (meta: RunCreateMeta, run: ChatRun) => Promise<unknown>;
  };
  lifecycle: {
    isDaemonShuttingDown: () => boolean;
  };
  plugins: {
    connectorService: ConnectorService;
    detectSkillPluginCandidateOnRunSuccess: (
      db: SqliteDb,
      runs: ChatRunService,
      run: ChatRun,
      input: JsonRecord,
      projectRoot: string,
    ) => void;
    firePipelineForRun: (args: {
      run: ChatRun;
      snapshot: AppliedPluginSnapshot;
      runs: ChatRunService;
      db: SqliteDb;
    }) => void;
    loadPluginRegistryView: () => Promise<Parameters<typeof resolvePluginSnapshot>[0]['registry']>;
    renderPluginBriefTemplate: (template: string, inputs?: Record<string, unknown>) => string;
  };
  telemetry: {
    reportRunCompletionTelemetryFallback: (input: RunCreatedFallbackInput) => void;
    resolveRunProjectKindForAnalytics: (input: RunProjectKindInput) => string | null;
    runArtifactBaselines: RunArtifactBaselines;
    runRetryEventsForAnalytics: (events: RunEventRecord[]) => RunRetryAnalyticsEvent[];
  };
  messages: {
    pinAssistantMessageOnRunCreate: (db: SqliteDb, run: ChatRun) => void;
    reconcileAssistantMessageOnRunEnd: (
      db: SqliteDb,
      runs: ChatRunService,
      run: ChatRun,
    ) => void;
  };
}

type TerminalRunStatus = RunStatusForAnalytics & {
  status: string;
  error?: string | null;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
};

const AGUI_NATIVE_EVENT_KINDS: ReadonlySet<OdNativeEvent['kind']> = new Set([
  'message_chunk',
  'tool_call',
  'state_update',
  'end',
  'run_started',
  'pipeline_stage_started',
  'pipeline_stage_completed',
  'genui_surface_request',
  'genui_surface_response',
  'genui_surface_timeout',
  'genui_state_synced',
]);

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function toProjectRecord(value: unknown): ProjectRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as JsonRecord;
  return typeof record.id === 'string'
    ? value as ProjectRecord
    : null;
}

function isProjectEnrichableDesignSystem(project: ProjectRecord): boolean {
  if (typeof project.designSystemId === 'string' && project.designSystemId.length > 0) {
    return true;
  }
  const metadata = project.metadata;
  return metadata?.importedFrom === 'brand-extraction' || metadata?.importedFrom === 'design-system';
}

function toConversationRecords(value: unknown): ConversationRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ConversationRecord =>
        Boolean(item && typeof item === 'object' && typeof (item as JsonRecord).id === 'string'),
      )
    : [];
}

function toProjectFiles(value: unknown): ProjectFileEntry[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProjectFileEntry =>
        Boolean(item && typeof item === 'object' && typeof (item as JsonRecord).name === 'string'),
      )
    : [];
}

// Intents the scenario-plugin fallback resolver is allowed to see. Mirrors the
// `ProjectMetadata['intent']` contract union so an unknown/legacy string in a
// stored project row never gets cast into the union.
const SCENARIO_PROJECT_INTENTS: readonly NonNullable<ContractProjectMetadata['intent']>[] = [
  'live-artifact',
  'web-clone',
  'document',
];

function toScenarioProjectIntent(value: unknown): ContractProjectMetadata['intent'] | undefined {
  return SCENARIO_PROJECT_INTENTS.find((intent) => intent === value);
}

function toScenarioProjectMetadata(
  metadata: ProjectMetadata,
): Pick<ContractProjectMetadata, 'kind' | 'intent'> | null {
  if (!metadata || typeof metadata.kind !== 'string') return null;
  const intent = toScenarioProjectIntent(metadata.intent);
  return {
    kind: metadata.kind as ContractProjectMetadata['kind'],
    ...(intent ? { intent } : {}),
  };
}

type DesignSystemSelectionSource = 'request' | 'plugin' | 'project' | 'app-default' | 'none';

function normalizedDesignSystemId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveEffectiveDesignSystemSelection({
  requestDesignSystemId,
  pluginDesignSystemId,
  projectDesignSystemId,
  appDefaultDesignSystemId,
  allowAppDefault = true,
}: {
  requestDesignSystemId?: unknown;
  pluginDesignSystemId?: unknown;
  projectDesignSystemId?: unknown;
  appDefaultDesignSystemId?: unknown;
  allowAppDefault?: boolean;
}): { id: string | null; source: DesignSystemSelectionSource } {
  const requestId = normalizedDesignSystemId(requestDesignSystemId);
  if (requestId) return { id: requestId, source: 'request' };

  const pluginId = normalizedDesignSystemId(pluginDesignSystemId);
  if (pluginId) return { id: pluginId, source: 'plugin' };

  const projectId = normalizedDesignSystemId(projectDesignSystemId);
  if (projectId) return { id: projectId, source: 'project' };

  if (allowAppDefault) {
    const appDefaultId = normalizedDesignSystemId(appDefaultDesignSystemId);
    if (appDefaultId) return { id: appDefaultId, source: 'app-default' };
  }

  return { id: null, source: 'none' };
}

function designSystemIdFromPluginSnapshot(snapshot: unknown): string | null {
  const items = (snapshot as { resolvedContext?: { items?: unknown } } | null | undefined)
    ?.resolvedContext?.items;
  if (!Array.isArray(items)) return null;
  const designSystemItems = items.filter(
    (item): item is { kind: string; id?: unknown; primary?: unknown } =>
      item !== null &&
      typeof item === 'object' &&
      (item as { kind?: unknown }).kind === 'design-system',
  );
  const primary = designSystemItems.find((item) => item.primary === true);
  return normalizedDesignSystemId(primary?.id ?? designSystemItems[0]?.id);
}

function routeParamId(req: ApiRequest): string | null {
  return typeof req.params.id === 'string' && req.params.id.length > 0
    ? req.params.id
    : null;
}

function hasCompleteByokOpenCodeConfig(meta: JsonRecord): boolean {
  if (meta.agentId !== BYOK_OPENCODE_AGENT_ID) return true;
  return buildOpenCodeByokProviderConfig(
    meta.byokProvider as ByokChatProviderConfig | null | undefined,
    typeof meta.model === 'string' ? meta.model : null,
  ) !== null;
}

function toOdNativeEvent(record: RunEventRecord): OdNativeEvent | null {
  if (!AGUI_NATIVE_EVENT_KINDS.has(record.event as OdNativeEvent['kind'])) return null;
  return { kind: record.event, ...toJsonRecord(record.data) } as OdNativeEvent;
}

export function registerRunRoutes(app: Express, ctx: RegisterRunRoutesDeps) {
  const { db, design } = ctx;
  const { createSseResponse, sendApiError } = ctx.http;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR } = ctx.paths;
  const { detectAgents, getAgentDef } = ctx.agents;
  const { startChatRun } = ctx.chat;
  const {
    connectorService,
    detectSkillPluginCandidateOnRunSuccess,
    firePipelineForRun,
    loadPluginRegistryView,
    renderPluginBriefTemplate,
  } = ctx.plugins;
  const {
    reportRunCompletionTelemetryFallback,
    resolveRunProjectKindForAnalytics,
    runArtifactBaselines,
    runRetryEventsForAnalytics,
  } = ctx.telemetry;
  const {
    pinAssistantMessageOnRunCreate,
    reconcileAssistantMessageOnRunEnd,
  } = ctx.messages;

  function runToolBundleDeliveryTargetForProject(
    projectId: unknown,
    metadata: ProjectMetadata,
  ): RunDeliveryTarget {
    if (typeof projectId !== 'string' || !projectId || !isSafeId(projectId)) {
      return 'none';
    }
    try {
      const cwd = resolveProjectDir(PROJECTS_DIR, projectId, metadata, {
        allowUnavailableSandboxImportedProject: true,
      });
      return isManagedProjectCwd(cwd, PROJECTS_DIR) ? 'managed-project' : 'external-project';
    } catch {
      return 'none';
    }
  }

  app.post('/api/runs', async (req: ApiRequest, res: ApiResponse) => {
    if (ctx.lifecycle.isDaemonShuttingDown()) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const requestBody = toJsonRecord(req.body);
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    if (!hasCompleteByokOpenCodeConfig(requestBody)) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    let resolvedSnapshot = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      let registryView: Parameters<typeof resolvePluginSnapshot>[0]['registry'];
      try {
        registryView = await loadPluginRegistryView();
      } catch (err) {
        return res.status(500).json({ error: String(err) });
      }
      const explicitPlugin =
        requestBody.pluginId || requestBody.appliedPluginSnapshotId;
      let runResolveBody: JsonRecord = requestBody;
      if (!explicitPlugin) {
        const projectRow = toProjectRecord(getProject(db, requestBody.projectId));
        const hasPin =
          typeof projectRow?.appliedPluginSnapshotId === 'string'
          && projectRow.appliedPluginSnapshotId.length > 0;
        if (!hasPin) {
          const fallbackPluginId = defaultScenarioPluginIdForProjectMetadata(
            toScenarioProjectMetadata(projectRow?.metadata),
          );
          if (fallbackPluginId && getInstalledPlugin(db, fallbackPluginId)) {
            runResolveBody = { ...requestBody, pluginId: fallbackPluginId };
          }
        }
      }
      const resolved = resolvePluginSnapshot({
        db,
        body: runResolveBody,
        projectId: requestBody.projectId,
        conversationId: typeof requestBody.conversationId === 'string'
          ? requestBody.conversationId
          : null,
        registry: registryView,
        connectorProbe: buildConnectorProbe(connectorService),
      });
      if (resolved && !resolved.ok) {
        if (!explicitPlugin) {
          console.warn(
            `[plugins] default-scenario fallback skipped for run on project ${requestBody.projectId}: ${resolved.body?.error?.code ?? 'unknown'}`,
          );
        } else {
          return res.status(resolved.status).json(resolved.body);
        }
      } else {
        resolvedSnapshot = resolved;
      }
    }
    const meta: RunCreateMeta = {
      ...requestBody,
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
    };
    if (resolvedSnapshot?.ok) {
      meta.appliedPluginSnapshotId = resolvedSnapshot.snapshotId;
      if (!meta.pluginId) meta.pluginId = resolvedSnapshot.snapshot.pluginId;
      if (typeof meta.message !== 'string' || meta.message.trim().length === 0) {
        const renderedQuery = renderPluginBriefTemplate(
          resolvedSnapshot.snapshot.query ?? '',
          resolvedSnapshot.snapshot.inputs,
        ).trim();
        if (renderedQuery.length > 0) meta.message = renderedQuery;
      }
    }
    let runProject: ProjectRecord | null = null;
    if (typeof meta.projectId === 'string' && meta.projectId) {
      try {
        runProject = toProjectRecord(getProject(db, meta.projectId));
        assertSandboxProjectRootAvailable(runProject?.metadata);
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        throw err;
      }
    }
    if (typeof meta.agentId !== 'string' || !meta.agentId) {
      try {
        const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
        const cfgAgent = typeof appCfg.agentId === 'string' && appCfg.agentId
          ? appCfg.agentId
          : null;
        const agents = await detectAgents(
          toJsonRecord(appCfg.agentCliEnv),
        ).catch((): DetectedAgent[] => []);
        const cfgAgentAvailable = cfgAgent
          ? agents.some((agent) => agent.id === cfgAgent && agent.available)
          : false;
        if (cfgAgent && cfgAgentAvailable) {
          meta.agentId = cfgAgent;
        } else {
          const firstAvailable = agents.find((agent) => agent.available)?.id ?? null;
          if (firstAvailable) meta.agentId = firstAvailable;
        }
      } catch (err) {
        console.warn('[runs] agent id fallback failed', err);
      }
    }
    if (!hasCompleteByokOpenCodeConfig(meta)) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    const toolBundleSupport = validateRunToolBundleForAgent(
      toolBundle.bundle,
      typeof meta.agentId === 'string' ? getAgentDef(meta.agentId) : null,
      {
        deliveryTarget: runToolBundleDeliveryTargetForProject(
          meta.projectId,
          runProject?.metadata,
        ),
      },
    );
    if (!toolBundleSupport.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundleSupport.message);
    }
    if (runProject?.metadata) {
      meta.projectMetadata = runProject.metadata;
    }
    if (
      typeof meta.projectId === 'string' &&
      meta.projectId &&
      (typeof meta.conversationId !== 'string' || !meta.conversationId)
    ) {
      try {
        const convs = toConversationRecords(listConversations(db, meta.projectId));
        const defaultConv = convs.length > 0
          ? [...convs].sort((a, b) => {
              const aCreated = Number(a?.createdAt);
              const bCreated = Number(b?.createdAt);
              if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
                return aCreated - bCreated;
              }
              return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
            })[0]
          : null;
        if (defaultConv && typeof defaultConv.id === 'string' && defaultConv.id) {
          meta.conversationId = defaultConv.id;
          if (typeof meta.assistantMessageId !== 'string' || !meta.assistantMessageId) {
            meta.assistantMessageId = randomUUID();
          }
          const promptForUserMessage =
            typeof meta.message === 'string' && meta.message.trim().length > 0
              ? meta.message
              : null;
          if (promptForUserMessage) {
            upsertMessage(db, defaultConv.id, {
              id: randomUUID(),
              role: 'user',
              content: promptForUserMessage,
              startedAt: Date.now(),
              endedAt: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn('[runs] mcp conversation fallback failed', err);
      }
    }
    const conversationSession =
      typeof meta.conversationId === 'string' && meta.conversationId
        ? getConversation(db, meta.conversationId)
        : null;
    // A run may only attach to a conversation owned by its own project. Without
    // this guard a request pairing projectId=A with a conversationId owned by
    // project B runs in A's cwd but pins its messages and native session under
    // B — corrupting B's chat history and resume identity. Mirror the ownership
    // check the sibling routes already enforce (handoff.ts, terminal.ts).
    if (
      conversationSession &&
      typeof meta.projectId === 'string' &&
      meta.projectId &&
      conversationSession.projectId !== meta.projectId
    ) {
      return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
    }
    meta.sessionMode =
      meta.sessionMode === 'chat' || meta.sessionMode === 'design' || meta.sessionMode === 'plan'
        ? normalizeConversationSessionMode(meta.sessionMode)
        : normalizeConversationSessionMode(conversationSession?.sessionMode);
    const run = design.runs.create(meta);
    try {
      pinAssistantMessageOnRunCreate(db, run);
    } catch (err) {
      console.warn('[runs] message create pin failed', err);
    }
    const declaredClient = String(req.get('x-od-client') ?? '').toLowerCase();
    if (declaredClient === 'desktop' || declaredClient === 'web') {
      run.clientType = declaredClient;
    } else {
      const ua = String(req.get('user-agent') ?? '');
      run.clientType = ua.includes('Electron/') ? 'desktop' : 'web';
    }
    if (resolvedSnapshot?.ok) {
      try {
        const { linkSnapshotToRun } = await import('../plugins/snapshots.js');
        linkSnapshotToRun(db, resolvedSnapshot.snapshotId, run.id);
      } catch {
        // Linking is best-effort here; in-memory run still carries the id.
      }
    }
    const body = {
      runId: run.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      ...(resolvedSnapshot?.ok
        ? {
            appliedPluginSnapshotId: resolvedSnapshot.snapshotId,
            pluginId: resolvedSnapshot.snapshot.pluginId,
          }
        : {}),
    };
    res.status(202).json(body);
    if (resolvedSnapshot?.ok && resolvedSnapshot.snapshot.pipeline) {
      firePipelineForRun({
        run,
        snapshot: resolvedSnapshot.snapshot,
        runs: design.runs,
        db,
      });
    }
    reconcileAssistantMessageOnRunEnd(db, design.runs, run);
    if (run.projectId && run.conversationId) {
      try {
        const project = toProjectRecord(getProject(db, run.projectId));
        const projectRoot = resolveProjectDir(PROJECTS_DIR, run.projectId, project?.metadata);
        detectSkillPluginCandidateOnRunSuccess(db, design.runs, run, requestBody, projectRoot);
      } catch (err) {
        console.warn('[plugins] skill candidate hook setup failed', err);
      }
    }
    design.runs.start(run, () => startChatRun(meta, run));

    const reqBody = requestBody;
    const analyticsHints =
      (reqBody as { analyticsHints?: Record<string, unknown> | null }).analyticsHints
        && typeof (reqBody as { analyticsHints?: unknown }).analyticsHints === 'object'
        ? ((reqBody as { analyticsHints?: Record<string, unknown> }).analyticsHints ?? {})
        : {};
    // Marks the AI-optimize (deep enrichment) run so completion can flag the DS
    // ai_refined even when analytics is unavailable or disabled.
    const hintDsEnrichment = analyticsHints.dsEnrichment === true;
    const requestProjectId = typeof reqBody.projectId === 'string' ? reqBody.projectId : null;
    if (hintDsEnrichment && requestProjectId) {
      design.runs.wait(run).then((status: TerminalRunStatus) => {
        if (runResultFromStatus(status.status) !== 'success') return;
        try {
          const enrichedProject = toProjectRecord(getProject(db, requestProjectId));
          if (enrichedProject && isProjectEnrichableDesignSystem(enrichedProject)) {
            updateProject(db, requestProjectId, {
              metadata: {
                ...(enrichedProject.metadata ?? {}),
                enrichmentStatus: 'ai_refined',
                enrichmentCompletedAt: Date.now(),
              },
            });
          }
        } catch {
          // Best-effort flag; do not fail run completion if metadata refresh fails.
        }
      }).catch(() => {});
    }

  });

  app.get('/api/runs', (req: ApiRequest, res: ApiResponse) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    const body = { runs: runs.map(design.runs.statusBody) };
    res.json(body);
  });

  app.get('/api/runs/:id/result-package', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    const status = design.runs.statusBody(run);
    const project = run.projectId ? toProjectRecord(getProject(db, run.projectId)) : null;
    let files: ProjectFileEntry[] = [];
    if (project) {
      const packageMetadata = run.projectMetadata ?? null;
      try {
        if (status.workspace?.storage?.kind === 'folder-backed') {
          const projectRoot = resolveProjectDir(PROJECTS_DIR, project.id, packageMetadata);
          const projectRootStat = await fs.promises.stat(projectRoot);
          if (!projectRootStat.isDirectory()) {
            throw new Error('workspace root is not a directory');
          }
        }
        files = toProjectFiles(await listFiles(PROJECTS_DIR, project.id, { metadata: packageMetadata }));
      } catch (err) {
        return sendApiError(
          res,
          500,
          'WORKSPACE_ENUMERATION_FAILED',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    const artifacts = files
      .filter((file): file is ProjectFileEntry & { artifactManifest: ArtifactManifest } =>
        Boolean(file.artifactManifest && typeof file.artifactManifest === 'object'),
      )
      .map((file) => ({
        file: file.name,
        kind: typeof file.artifactManifest.kind === 'string'
          ? file.artifactManifest.kind
          : file.artifactKind ?? null,
        renderer: typeof file.artifactManifest.renderer === 'string'
          ? file.artifactManifest.renderer
          : null,
        title: typeof file.artifactManifest.title === 'string'
          ? file.artifactManifest.title
          : file.name,
        status: typeof file.artifactManifest.status === 'string'
          ? file.artifactManifest.status
          : null,
        manifest: file.artifactManifest,
      }));
    const body: RunResultPackageResponse = {
      schema: RUN_RESULT_PACKAGE_SCHEMA,
      run: {
        id: status.id,
        status: status.status,
        projectId: status.projectId,
        conversationId: status.conversationId,
        assistantMessageId: status.assistantMessageId,
        agentId: status.agentId,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        ...(status.cancelRequested !== undefined
          ? { cancelRequested: status.cancelRequested }
          : {}),
        ...(status.exitCode !== undefined ? { exitCode: status.exitCode } : {}),
        ...(status.signal !== undefined ? { signal: status.signal } : {}),
        ...(status.error !== undefined ? { error: status.error } : {}),
        ...(status.errorCode !== undefined ? { errorCode: status.errorCode } : {}),
      },
      workspace: status.workspace ?? {
        storage: { kind: 'od-owned', baseDir: null },
        provenance: null,
      },
      events: {
        logPath: status.eventsLogPath ?? null,
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            fileCount: files.length,
          }
        : null,
      artifacts,
    };
    res.json(body);
  });

  app.get('/api/runs/:id', (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    res.json(design.runs.statusBody(run));
  });

  app.get('/api/runs/:id/events', (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.stream(run, req, res);
  });

  app.get('/api/runs/:id/agui', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    const { encodeOdEventForAgui } = await import('@open-design/agui-adapter');
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    const emitMapped = (record: RunEventRecord) => {
      const nativeEvent = toOdNativeEvent(record);
      if (!nativeEvent) return;
      const mapped = encodeOdEventForAgui(
        nativeEvent,
        { runId: run.id, seq: record.id, now: Date.now() },
      );
      if (mapped) sse.send(mapped.kind, mapped, record.id);
    };
    for (const record of run.events) {
      if (!Number.isFinite(lastEventId) || record.id > lastEventId) emitMapped(record);
    }
    if (design.runs.isTerminal(run.status)) {
      sse.end();
      return;
    }
    const adapterClient = {
      send: (event: string, data: unknown, id?: number) => {
        const nativeEvent = toOdNativeEvent({
          id: id ?? 0,
          event,
          data,
          timestamp: Date.now(),
        });
        if (!nativeEvent) return;
        const ctx = id === undefined
          ? { runId: run.id, now: Date.now() }
          : { runId: run.id, seq: id, now: Date.now() };
        const mapped = encodeOdEventForAgui(nativeEvent, ctx);
        if (mapped) sse.send(mapped.kind, mapped, id);
      },
      end:     () => sse.end(),
      cleanup: () => sse.cleanup?.(),
    };
    run.clients.add(adapterClient);
    res.on('close', () => {
      run.clients.delete(adapterClient);
      sse.cleanup?.();
    });
  });

  app.post('/api/runs/:id/cancel', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    const status = await design.runs.cancel(run);
    const body = { ok: true, run: status };
    res.json(body);
  });

  app.post('/api/chat', (req: ApiRequest, res: ApiResponse) => {
    if (ctx.lifecycle.isDaemonShuttingDown()) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const requestBody = toJsonRecord(req.body);
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    let chatProject: ProjectRecord | null = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      try {
        chatProject = toProjectRecord(getProject(db, requestBody.projectId));
        assertSandboxProjectRootAvailable(chatProject?.metadata);
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        throw err;
      }
    }
    const toolBundleSupport = validateRunToolBundleForAgent(
      toolBundle.bundle,
      typeof requestBody.agentId === 'string' ? getAgentDef(requestBody.agentId) : null,
      {
        deliveryTarget: runToolBundleDeliveryTargetForProject(
          requestBody.projectId,
          chatProject?.metadata,
        ),
      },
    );
    if (!toolBundleSupport.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundleSupport.message);
    }
    // A chat run may only attach to a conversation owned by its own project.
    // Without this guard, pairing projectId=A with a conversationId owned by
    // project B runs in A's cwd but pins messages and the native session under
    // B — corrupting B's history and resume identity. Mirror the ownership
    // check the sibling routes already enforce (handoff.ts, terminal.ts).
    if (typeof requestBody.projectId === 'string' && requestBody.projectId &&
        typeof requestBody.conversationId === 'string' && requestBody.conversationId) {
      const chatConversation = getConversation(db, requestBody.conversationId);
      if (chatConversation && chatConversation.projectId !== requestBody.projectId) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
    }
    const meta = {
      ...requestBody,
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
      ...(chatProject?.metadata ? { projectMetadata: chatProject.metadata } : {}),
    };
    if (!hasCompleteByokOpenCodeConfig(meta)) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    const run = design.runs.create(meta);
    design.runs.stream(run, req, res);
    reconcileAssistantMessageOnRunEnd(db, design.runs, run);
    design.runs.start(run, () => startChatRun(meta, run));
  });
}
