import type { ProjectFile } from './files';
import type { RunResultPackageResponse, RunWorkspace } from './workspaces.js';
import type {
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewCommentPosition,
  PreviewCommentSelectionKind,
  PreviewAnnotationStyle,
  PreviewVisualMarkKind,
} from './comments';
import type { ResearchOptions } from './research';
import type { RunContextSelection } from './context.js';
import type { MediaExecutionPolicy } from './media.js';
import type { AppliedPluginSnapshot } from '../plugins/apply.js';
import type {
  RunFailureCategory,
  RunFailureDetail,
} from './run-failures.js';

export type { RunFailureCategory, RunFailureDetail } from './run-failures.js';

export type ChatRole = 'user' | 'assistant';
export type ChatSessionMode = 'design' | 'chat' | 'plan';
export type ChatCommentSelectionKind = PreviewCommentSelectionKind | 'visual';
export type ByokChatProtocol =
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'senseaudio'
  | 'aihubmix';

export interface ByokChatProviderConfig {
  protocol: ByokChatProtocol;
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  /** Explicit run-scoped provider policy for presets that do not require bearer credentials. */
  requiresApiKey?: boolean;
  /**
   * Run-scoped chat model id selected in the chat UI. Forwarded to the daemon
   * so BYOK-backed utilities (e.g. memory extraction) can honor the user's
   * model picker instead of falling back to a hardcoded default. Optional
   * because some presets (e.g. Ollama) infer the model from baseUrl/protocol.
   */
  model?: string;
}

export interface ByokMediaDefaults {
  imageModel?: string;
  videoModel?: string;
  speechModel?: string;
  speechVoice?: string;
}

export interface ChatRequest {
  agentId: string;
  message: string;
  /** The latest user turn only, used for runtime intent and resume handling. */
  currentPrompt?: string;
  systemPrompt?: string;
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  // Per-turn skill ids picked via the composer's @-mention popover. The
  // daemon concatenates each skill's body into the system prompt for
  // this run only — they are NOT persisted on the project. Use this to
  // assemble multiple capabilities (e.g. @web-search + @summarize) for
  // a single turn without binding the project to one of them.
  skillIds?: string[];
  designSystemId?: string | null;
  attachments?: string[];
  commentAttachments?: ChatCommentAttachment[];
  model?: string | null;
  reasoning?: string | null;
  /**
   * Run-scoped BYOK provider credentials for the daemon-backed OpenCode
   * adapter. The daemon must not persist this object; it is translated into
   * child env + OPENCODE_CONFIG_CONTENT for the current run only.
   */
  byokProvider?: ByokChatProviderConfig;
  /**
   * Run-scoped BYOK media defaults selected in the chat UI. The daemon uses
   * these to guide OpenCode-backed `od media generate` calls for this run only.
   */
  byokMediaDefaults?: ByokMediaDefaults;
  /** UI locale selected by the client, used by prompt composition for user-visible generated UI. */
  locale?: string;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshotId?: string | null;
  /**
   * Run-scoped media execution policy. Omitted means current Clean Design
   * behavior: media generation is enabled and OD may execute its configured
   * local providers.
   */
  mediaExecution?: MediaExecutionPolicy;
  /**
   * Ask the selected run agent to emit a short title for this first turn.
   * The daemon strips the title marker from visible assistant text and falls
   * back to client-side naming when the marker is absent or malformed.
   */
  titleGeneration?: {
    enabled?: boolean;
  };
  /** Marks the design-system AI refinement pass so successful runs persist its refined state. */
  designSystemEnrichment?: boolean;
}

export type BrowserUseUnavailableReason = 'no-matching-browser-backend';

export type BrowserUseProbeFailureCategory =
  | 'not-probed'
  | 'registry-missing'
  | 'registry-unreadable';

export interface BrowserUseDiscoveryFacts {
  registryPath: string;
  registryExists: boolean;
  socketCount: number;
  candidateCount: number;
  staleCount: number;
  currentSessionIdPresent: boolean | null;
  probeFailureCategory: BrowserUseProbeFailureCategory;
  newestSocketAgeMs?: number;
  staleThresholdMs: number;
}

export interface BrowserUseRunState {
  requested: boolean;
  available: boolean;
  reason?: BrowserUseUnavailableReason;
  diagnostics: BrowserUseDiscoveryFacts;
}

export interface ChatRunCreateRequest extends ChatRequest {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  clientRequestId: string;
}

/**
 * Minimal POST /api/runs shape accepted from MCP / SDK callers that do not
 * manage conversation state client-side. Only `projectId` is required;
 * `message` and `agentId` are optional — the daemon resolves `agentId` from
 * the saved app-config when it is omitted.
 */
export interface McpRunCreateRequest {
  projectId: string;
  message?: string;
  agentId?: string;
  skillId?: string;
  pluginId?: string;
  model?: string;
  pluginInputs?: Record<string, unknown>;
  mediaExecution?: MediaExecutionPolicy;
}

export const CHAT_RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const;

export type ChatRunStatus = (typeof CHAT_RUN_STATUSES)[number];

/** User-facing result delivery, kept separate from agent-process runStatus. */
export type ResultDeliveryState = 'delivered' | 'no_result' | 'delivery_failed';

export type ChatMessageFeedbackRating = 'positive' | 'negative';

export type ChatMessageFeedbackReasonCode =
  | 'matched_request'
  | 'strong_visual'
  | 'useful_structure'
  | 'easy_to_continue'
  | 'followed_design_system'
  | 'missed_request'
  | 'weak_visual'
  | 'incomplete_output'
  | 'hard_to_use'
  | 'missed_design_system'
  | 'other';

export interface ChatMessageFeedback {
  rating: ChatMessageFeedbackRating;
  reasonCodes?: ChatMessageFeedbackReasonCode[];
  customReason?: string;
  reasonsSubmittedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface ChatRunCreateResponse {
  runId: string;
  // Daemon-resolved conversation/message ids — populated for MCP /
  // SDK callers that POST /api/runs with only projectId. The web flow
  // normally sends these in already; daemon falls back to the
  // project's default conversation otherwise.
  conversationId?: string | null;
  assistantMessageId?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
}

export type NativeSessionRecoveryState =
  | 'not_applicable'
  | 'no_recoverable_session'
  | 'captured_not_resumed'
  | 'resume_attempted'
  | 'resumed'
  | 'resume_skipped'
  | 'auto_reseeded';

export type NativeSessionHandleKind =
  | 'opaque-id'
  | 'cli-thread-id'
  | 'session-file-path'
  | 'unknown';

export type NativeSessionAcquisitionMode =
  | 'daemon-specified'
  | 'stream-captured'
  | 'session-file-discovered'
  | 'none'
  | 'unknown';

export type NativeSessionContinuationMode =
  | 'native-resume-by-id'
  | 'session-file-resume'
  | 'none'
  | 'unknown';

export type NativeSessionRecoveryReason =
  | 'model_changed'
  | 'cwd_changed'
  | 'conversation_advanced'
  | 'missing_cursor'
  | 'context_budget'
  | 'resume_failed'
  | 'unsupported'
  | 'none';

export interface NativeSessionRecoveryHandle {
  present: boolean;
  kind: NativeSessionHandleKind;
  /** Always null unless a future per-agent rule declares the handle safe. */
  display: string | null;
  /** Stable correlation value for support without exposing the raw handle. */
  sha256: string | null;
  redacted: boolean;
}

export interface NativeSessionRecoveryMetadata {
  agentId: string | null;
  state: NativeSessionRecoveryState;
  acquisition: NativeSessionAcquisitionMode;
  continuation: NativeSessionContinuationMode;
  handle: NativeSessionRecoveryHandle;
  guardReason: NativeSessionRecoveryReason | null;
  fallbackReason: NativeSessionRecoveryReason | null;
  updatedAt: number;
}

export interface ChatRunStatusResponse {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  /** Design system whose prompt context was actually injected for this run. */
  designSystemId?: string | null;
  /** Selected design system before usability/body checks; useful for diagnostics. */
  designSystemRequestedId?: string | null;
  /** Source that supplied the effective design-system selection. */
  designSystemSelectionSource?: 'request' | 'plugin' | 'project' | 'app-default' | 'none' | null;
  /** sha256 digest of the injected DESIGN.md/tokens/component context. */
  designSystemDigest?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
  childPid?: number | null;
  processGroupId?: number | null;
  childExited?: boolean;
  childExitObservedAt?: number | null;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  /** Coarse failure family the daemon classified this failure into (auth,
   *  rate_limit, model_unavailable, …). Lets the UI refine guidance beyond the
   *  raw `errorCode` — e.g. distinguishing a transient 429 from a hard quota
   *  that share `errorCode: 'RATE_LIMITED'`. Absent on success / older daemons. */
  failureCategory?: RunFailureCategory | null;
  /** Fine-grained failure cause within the category (hard_quota,
   *  cli_not_installed, invalid_api_key, …). Primary key the UI maps to a named
   *  failure type + fix. Absent on success / older daemons. */
  failureDetail?: RunFailureDetail | null;
  /** True when this terminal failure can be recovered by resuming the agent's
   *  existing CLI session (a transient upstream drop / inactivity timeout on a
   *  session-resuming runtime), rather than only restarting from scratch. The
   *  chat uses it to offer a Continue affordance; the next turn in the same
   *  conversation resumes the persisted session. Absent/false on success,
   *  non-resumable failures, and runtimes without CLI session resume. */
  resumable?: boolean;
  /** True when a terminal `succeeded` run ended with its declared work
   *  unfinished — the agent left a TodoWrite task in a non-`completed` state
   *  (pending / in_progress / stopped) or the turn was truncated mid-generation
   *  (max_tokens). Lets every status surface (Pet task center, project pill, CLI
   *  --json) avoid reading an incomplete run as "Completed" (#1247 / #1060).
   *  Absent/false = finished, so older daemons stay "Completed" (backward-compat).
   *  Judged by the canonical `todoSnapshotHasUnfinishedWork` predicate so it can
   *  never diverge from the chat footer's `unfinishedTodosFromEvents`. */
  endedWithUnfinishedWork?: boolean;
  /** Authoritative artifact files created or modified by this run. Mirrors
   *  ChatSseEndPayload.artifactCount and run_finished.artifact_count. */
  artifactCount?: number;
  /** Absolute path to the per-run JSONL event log the daemon mirrors
   *  the SSE stream to (see runs.ts `runsLogDir`). Null when the
   *  daemon was launched without event persistence configured. */
  eventsLogPath?: string | null;
  /** Present on daemon run status responses that know the effective run policy. */
  mediaExecution?: MediaExecutionPolicy;
  /** Prompt cache diagnostics for resume-capable runtime sessions. */
  promptCache?: {
    stablePromptHash: string;
    hit: boolean;
    missReason: 'new-session' | 'missing-stored-hash' | 'stable-prompt-changed' | null;
  };
  /** Sanitized native-session recovery state for resume-capable agents. */
  nativeSessionRecovery?: NativeSessionRecoveryMetadata;
  /** Browser Use availability for runs that requested in-app browser automation. */
  browserUse?: BrowserUseRunState;
  /** Effective storage/provenance for the workspace used by this run. */
  workspace?: RunWorkspace;
}

export type ChatRunResultPackageResponse = RunResultPackageResponse;

export interface ChatRunListResponse {
  runs: ChatRunStatusResponse[];
}

export interface ChatRunCancelResponse {
  ok: true;
  run?: ChatRunStatusResponse;
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
  /**
   * User-visible attachment order for this turn. Older messages may omit it;
   * consumers should fall back to array position.
   */
  order?: number;
}

export interface ChatCommentAttachment {
  id: string;
  order: number;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  comment: string;
  currentText: string;
  pagePosition: PreviewCommentPosition;
  htmlHint: string;
  style?: PreviewAnnotationStyle;
  selectionKind?: ChatCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  // Zero-based slide the marked element lives on, for deck artifacts. Carried
  // so the host can flip the preview to that slide when the send starts.
  slideIndex?: number;
  screenshotPath?: string;
  markKind?: PreviewVisualMarkKind;
  intent?: string;
  imageAttachments?: PreviewCommentAttachment[];
  /** `'query'` means `comment` was promoted to the message text; keep target data as context only. */
  commentContext?: 'context' | 'query';
  source?: 'saved-comment' | 'board-batch';
}

export type PersistedAgentEvent =
  // `code` carries the structured API error code for `label: 'error'`
  // status events (e.g. AGENT_AUTH_REQUIRED, RATE_LIMITED). Clients use it to
  // decide error-specific recovery affordances.
  // `failureCategory` / `failureDetail` carry the daemon's finer classification
  // for the same failure, so the error card can name a specific type + fix even
  // when many causes share one `code` (e.g. hard_quota vs a transient 429).
  | {
      kind: 'status';
      label: string;
      detail?: string;
      code?: string;
      failureCategory?: RunFailureCategory;
      failureDetail?: RunFailureDetail;
    }
  | { kind: 'text'; text: string }
  | { kind: 'conversation_title'; title: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'live_artifact';
      action: 'created' | 'updated' | 'deleted';
      projectId: string;
      artifactId: string;
      title: string;
      refreshStatus?: string;
    }
  | {
      kind: 'live_artifact_refresh';
      phase: 'started' | 'succeeded' | 'failed';
      projectId: string;
      artifactId: string;
      refreshId?: string;
      title?: string;
      refreshedSourceCount?: number;
      error?: string;
    }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | {
      kind: 'diagnostic';
      name: string;
      source?: string;
      elapsedMs?: number;
      reason?: string;
      suppressedChars?: number;
      suppressedChunks?: number;
      openedBlocks?: number;
      closedBlocks?: number;
      fileCount?: number;
      files?: string[];
      pendingCandidateChars?: number;
      suppressing?: boolean;
      shape?: Record<string, unknown>;
    }
  | {
      kind: 'usage';
      inputTokens?: number;
      /** Cache-inclusive provider input used for session rollover decisions. */
      inputTokensEffective?: number;
      outputTokens?: number;
      costUsd?: number;
      durationMs?: number;
      /** Terminal turn stop reason (e.g. `max_tokens`). Persisted so the project
       *  projection can read a truncation as incomplete after reload (#1247). */
      stopReason?: string;
    }
  | { kind: 'raw'; line: string };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  agentId?: string;
  agentName?: string;
  events?: PersistedAgentEvent[];
  createdAt?: number;
  runId?: string;
  runStatus?: ChatRunStatus;
  resultDeliveryState?: ResultDeliveryState;
  /** True when this message's failed run can be recovered by resuming the
   *  agent's CLI session (transient upstream drop / inactivity on a
   *  session-resuming runtime). Drives the chat's Continue affordance; mirrors
   *  ChatRunStatusResponse.resumable. */
  resumable?: boolean;
  lastRunEventId?: string;
  startedAt?: number;
  endedAt?: number;
  sessionMode?: ChatSessionMode;
  runContext?: RunContextSelection;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  producedFiles?: ProjectFile[];
  traceObjectFiles?: ProjectFile[];
  // Diff baseline so reattach can rebuild producedFiles after reload.
  preTurnFileNames?: string[];
  feedback?: ChatMessageFeedback;
}
