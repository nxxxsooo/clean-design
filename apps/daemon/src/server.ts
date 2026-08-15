// @ts-nocheck
import type {
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
  DesktopExportPdfInput,
  DesktopExportPdfResult,
  DesktopRenderSlidesInput,
  DesktopRenderSlidesResult,
} from '@open-design/sidecar-proto';
import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import {
  isCleanDesignDisabledApiPath,
  isCleanDesignInternalAgent,
  isCleanDesignPublicAgent,
} from '@open-design/contracts';
import { resolveCredentialReferencesInValue } from './credential-memory.js';
import {
  cleanDesignEgressRequestContext,
  installCleanDesignEgressGuard,
} from './egress-policy.js';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { executionProfileFromStreamFormat } from '@open-design/contracts';
import { isTodoWriteToolName, stopReasonIsTruncation, todoItemsFromTodoWriteInput } from '@open-design/contracts';
import {
  composeSystemPrompt,
  detectDeckIntentSignal,
  detectMediaIntentSignal,
  detectPlatformIntentSignal,
  extractUserAuthoredSignalText,
  resolveExclusiveSurface,
} from './prompts/system.js';
import { resolveProjectRoot } from './project-root.js';
import {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
  resolveProcessResourcesPath,
} from './daemon-paths.js';
export {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
} from './daemon-paths.js';
import {
  isStaticSpaFallbackRequest,
  registerStaticSpaFallback,
  resolveStaticSpaFallbackPath,
} from './static-spa.js';
export {
  isStaticSpaFallbackRequest,
  resolveStaticSpaFallbackPath,
} from './static-spa.js';
import {
  createCompatApiError,
  createCompatApiErrorResponse,
  sendApiError,
} from './http/api-errors.js';
export {
  createCompatApiError,
  createCompatApiErrorResponse,
} from './http/api-errors.js';
import {
  applyBakedPreviews,
  resolvePluginPreviewsDir,
  PLUGIN_PREVIEWS_ROUTE,
} from './plugins/plugin-preview-bakes.js';
import { userFacingAgentLabel } from './user-facing-agent-label.js';
import {
  buildBrowserUseRunState,
  collectBrowserUseDiscoveryFacts,
  isBrowserUseRequested,
  renderBrowserUseUnavailablePrompt,
} from './browser/index.js';
import {
  UPLOAD_DIR,
  composeLiveInstructionPrompt,
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveChatExtraAllowedDirs,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveCodexGeneratedImagesDir,
  resolveEffectiveDesignSystemSelection,
  resolveGrantedCodexImagegenOverride,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  validateCodexGeneratedImagesDir,
} from './runtimes/chat-prompt-inputs.js';
import {
  writePromptAndEndStdin,
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefInactivityTimeoutMs,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunInactivityTimeoutMs,
  resolveChatRunShutdownGraceMs,
} from './runtimes/chat-run-lifecycle.js';
import {
  normalizeRunContextSelection,
  renderRunContextPrompt,
} from './runtimes/chat-run-context.js';
import {
  daemonAgentPayloadToPersistedAgentEvent,
  persistRunEventToAssistantMessage,
  persistRunFailureClassification,
  pinAssistantMessageOnRunCreate,
} from './runtimes/chat-run-messages.js';
import {
  createRunSideEffectLedger,
  foldEventIntoRunSideEffectLedger,
  runArtifactCountForRun,
  runDesignSystemCreatedForRun,
  runPreviewModuleCountForRun,
  runSideEffectsForRun,
  scanRunEventsForRetrySideEffects,
} from './runtimes/run-state.js';
export {
  composeLiveInstructionPrompt,
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveChatExtraAllowedDirs,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveCodexGeneratedImagesDir,
  resolveEffectiveDesignSystemSelection,
  resolveGrantedCodexImagegenOverride,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  validateCodexGeneratedImagesDir,
} from './runtimes/chat-prompt-inputs.js';
export {
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefInactivityTimeoutMs,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunInactivityTimeoutMs,
} from './runtimes/chat-run-lifecycle.js';
export {
  renderRunContextPrompt,
} from './runtimes/chat-run-context.js';
export {
  daemonAgentPayloadToPersistedAgentEvent,
  persistRunEventToAssistantMessage,
  pinAssistantMessageOnRunCreate,
} from './runtimes/chat-run-messages.js';
export { scanRunEventsForRetrySideEffects as __forTestScanRunEventsForRetrySideEffects } from './runtimes/run-state.js';

export { resolveProjectRoot };
import { createCommandInvocation } from '@open-design/platform';
import { SIDECAR_ENV } from '@open-design/sidecar-proto';
import {
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  detectAgents,
  getAgentDef,
  isKnownModel,
  applyAgentLaunchEnv,
  resolveAgentLaunch,
  sanitizeCustomModel,
  spawnEnvForAgent,
} from './agents.js';
import {
  getKnownModelOption,
  resolveModelForAgent,
} from './runtimes/models.js';
import {
  compactTranscriptForSessionRollover,
  evaluateModelContextBudget,
} from './runtimes/model-context-budget.js';
import { loadMmdRouteLaunchEnv } from './runtimes/mmd-routes.js';
import { preparePromptFileForAgent } from './runtimes/prompt-file.js';
import { TerminalControlSequenceStripper } from './runtimes/terminal-control.js';
import {
  buildOpenCodeByokProviderConfig,
  BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
} from './runtimes/byok-opencode.js';
import { buildOpenCodeRuntimeConfigContent } from './runtimes/opencode-runtime-config.js';
import {
  extractPlainStreamArtifacts,
  persistPlainStreamArtifactList,
  plainStdoutFromRunEvents,
} from './runtimes/plain-stream.js';
import { migrateLegacyDataDirSync } from './migration/index.js';
import {
  consumedImportNonces,
  getDesktopAuthSecret,
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  pruneExpiredImportNonces,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  verifyDesktopImportToken,
} from './desktop-auth.js';
import { normalizeDaemonBindHost } from './daemon-startup.js';
export {
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  verifyDesktopImportToken,
} from './desktop-auth.js';
import { readCurrentAppVersionInfo } from './app-version.js';
import {
  findSkillById,
  listSkills,
  resolveSkillId,
  splitDerivedSkillId,
} from './skills.js';
import { validateLinkedDirs } from './linked-dirs.js';
import { installFromTarget, uninstallById, sanitizeRepoName } from './library-install.js';
import {
  buildWindowsFolderDialogCommand,
  parseFolderDialogStdout,
  parseLinuxFolderDialogResult,
} from './native-folder-dialog.js';
import {
  AssetCacheError,
  assetCacheRewriteUrl,
  createPluginAssetCache,
  isCacheableExternalUrl,
} from './plugins/plugin-asset-cache.js';
import { defaultMediaExecutionPolicy, parseMediaExecutionPolicyInput } from './media/policy.js';
import {
  applySandboxRuntimeEnv,
  ensureSandboxRuntimeDirs,
  isSandboxModeEnabled,
  resolveSandboxRuntimeConfig,
} from './sandbox-mode.js';
import {
  buildUserDesignSystemArchive,
  createUserDesignSystem,
  deleteUserDesignSystem,
  digestDesignSystemContext,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  resolveDesignSystemAssets,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from './design-systems/index.js';
import { createDesignSystemGenerationJobStore } from './design-systems/generation-jobs.js';
import { createDesignSystemServerServices } from './design-systems/server-services.js';
import { prepareDesignTokenContractRebuild } from './design-systems/token-contract-rebuild.js';
import { registerBrandRoutes } from './brand-routes.js';
import {
  applyDiffReviewDecisionToCwd,
  applyPlugin,
  defaultBundledRoot,
  FIRST_PARTY_ATOMS,
  getInstalledPlugin,
  getSnapshot,
  isDiffReviewSurfaceId,
  listInstalledPlugins,
  listIterationsForRun,
  MissingInputError,
  pluginPromptBlock,
  pruneExpiredSnapshots,
  registerBuiltInAtomWorkers,
  registerBundledPlugins,
  registryRootsForDataDir,
  restoreProjectSnapshotLink,
  runPipelineForRun,
  runStageWithRegistry,
  startSnapshotGc,
} from './plugins/index.js';
import {
  composeMemoryBody,
  extractFromMessage,
  listActiveRuleEntries,
  readMemoryConfig,
} from './memory.js';
import { runAutoExtractionCleanup } from './memory-cleanup.js';
import { attachPiRpcSession } from './agent-protocol/index.js';
import { createClaudeStreamHandler } from './runtimes/claude-stream.js';
import { createAgentTitleMarkerStripper } from './title-marker.js';
import { createRoleMarkerGuard } from './role-marker-guard.js';
import { createToolLoopGuard, resolveToolLoopMode, type ToolLoopVerdict } from './tool-loop-guard.js';
import { diagnoseClaudeCliFailure } from './claude-diagnostics.js';
import { loadCritiqueConfigFromEnv } from './critique/config.js';
import { reconcileStaleRuns } from './critique/persistence.js';
import { runOrchestrator } from './critique/orchestrator.js';
import { createRunRegistry } from './critique/run-registry.js';
import { handleCritiqueInterrupt } from './critique/interrupt-handler.js';
import { handleCritiqueArtifact } from './critique/artifact-handler.js';
import {
  isCritiqueEnabled,
  parseEnvEnabled,
  parseRolloutPhase,
  type SkillCritiquePolicy,
} from './critique/rollout.js';
import { narrowProjectCritiqueOverride } from './critique/spawn-inputs.js';
import { createJsonEventStreamHandler } from './runtimes/json-event-stream.js';
import {
  antigravityAuthGuidance,
  antigravityQuotaGuidance,
  classifyAgentAuthFailure,
  classifyAgentServiceFailure,
  genericAgentAuthGuidance,
} from './runtimes/auth.js';
import { readOpenCodeServiceFailure } from './runtimes/opencode-log.js';
import { subscribe as subscribeFileEvents } from './project-watchers.js';
import { importFigmaFromBytes } from './figma/figma-import.js';
import { renderDesignSystemPreview } from './design-systems/preview.js';
import { renderDesignSystemShowcase } from './design-systems/showcase.js';
import { createChatRunService } from './runtimes/runs.js';
import { deriveRunErrorCode, runResultFromStatus } from './run-result.js';
import { classifyRunFailure, isResumableFailure } from './run-failure-classification.js';
import { decideSafeRunRetry } from './run-retry-policy.js';
import {
  scanRunEventsForUsage,
} from './run-usage.js';
import {
  createRunArtifactBaselines,
  diffRunArtifacts,
  snapshotProjectArtifacts,
} from './run-artifact-fs.js';
import {
  AiHtmlVersionSnapshotError,
  snapshotAiHtmlVersionsForRun,
} from './run-html-version-snapshots.js';
import { reconcileDurableRunTerminals } from './runtimes/run-terminal-reconciliation.js';
import {
  mergeNoProxyWithLoopbackDefaults,
  redactSecrets,
  testAgentConnection,
  testProviderConnection,
  validateBaseUrl,
  validateBaseUrlResolved,
} from './connectionTest.js';
import { listProviderModels } from './integrations/provider-models.js';
import { importClaudeDesignZip } from './design/index.js';
import {
  defaultBaseUrlForFinalizeProtocol,
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
  isFinalizeProviderProtocol,
} from './design/index.js';
import { buildDocumentPreview } from './document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import { loadCraftSections } from './craft.js';
import { skillCwdAliasSegment, stageActiveSkill } from './cwd-aliases.js';
import { buildDesktopArtifactExportInput, buildDesktopPdfExportInput } from './pdf-export.js';
import { generateMedia } from './media/index.js';
import { listElevenLabsVoiceOptions } from './integrations/elevenlabs-voices.js';
import { searchResearch, ResearchError } from './research/index.js';
import { openBrowser } from './browser/index.js';
import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  MEDIA_PROVIDERS,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
} from './media/models.js';
import { readMaskedConfig, writeConfig } from './media/config.js';
import {
  listMediaTasksByProject,
  listRecentMediaTasks,
  reconcileMediaTasksOnBoot,
} from './media/tasks.js';
import { TASK_TTL_AFTER_DONE_MS, createMediaTaskStore } from './media/task-store.js';
import { agentCliEnvForAgent, readAppConfig, readPluginEnvKnobs, writeAppConfig } from './app-config.js';
import { createDiagnosticsExportHandler } from './diagnostics-export.js';
import { DIAGNOSTICS_EXPORT_PATH } from '@open-design/diagnostics';
import {
  buildProjectArchive,
  buildBatchArchive,
  createProjectFolder,
  decodeMultipartFilename,
  deleteProjectFile,
  assertSandboxProjectRootAvailable,
  deleteProjectFolder,
  detectEntryFile,
  ensureProject,
  ensureProjectSubdir,
  isRunTouchedProjectFile,
  isSafeId,
  listFiles,
  listProjectFolders,
  mimeFor,
  parseByteRange,
  projectDir,
  readProjectFile,
  renameProjectFile,
  removeProjectDir,
  resolveProjectDir,
  SandboxImportedProjectError,
  sanitizeName,
  sanitizePath,
  searchProjectFiles,
  resolveProjectDir,
  resolveProjectFilePath,
  writeProjectFile,
  reconcileHtmlArtifactManifest,
} from './projects.js';
import { validateArtifactManifestInput } from './artifacts/manifest.js';
import { ArtifactPublicationBlockedError } from './artifacts/publication-guard.js';
import {
  appendMessageStatusEvent,
  deleteConversation,
  deletePreviewComment,
  deleteProject as dbDeleteProject,
  deleteTemplate,
  getConversation,
  getProject,
  getTemplate,
  insertConversation,
  insertProject,
  insertTemplate,
  latchConversationIntentSignals,
  findTemplateByNameAndProject,
  updateTemplate,
  listProjectsAwaitingInput,
  listConversations,
  listLatestProjectRunStatuses,
  listMessages,
  listPreviewComments,
  listProjects,
  listTabs,
  listTemplates,
  normalizeConversationSessionMode,
  openDatabase,
  setTabs,
  updateConversation,
  updatePreviewCommentStatus,
  updateProject,
  clearAgentSession,
  upsertAgentSession,
  upsertMessage,
  upsertPreviewComment,
} from './db.js';
import {
  computeIncludeStable,
  hashStableInstructions,
  isAgentResumeFailure,
  persistCapturedAgentSession,
  resolveAgentResumeContext,
} from './agent-session-resume.js';
import {
  initialNativeSessionRecoveryMetadata,
  markNativeSessionAutoReseeded,
  markNativeSessionCaptured,
} from './native-session-recovery.js';
import {
  createLiveArtifact,
  deleteLiveArtifact,
  ensureLiveArtifactPreview,
  getLiveArtifact,
  listLiveArtifacts,
  listLiveArtifactRefreshLogEntries,
  readLiveArtifactCode,
  recoverStaleLiveArtifactRefreshes,
  updateLiveArtifact,
} from './live-artifacts/store.js';
import { refreshLiveArtifact } from './live-artifacts/refresh-service.js';
import {
  sendLiveArtifactRouteError,
  setLiveArtifactCodeHeaders,
  setLiveArtifactPreviewHeaders,
} from './live-artifacts/http-helpers.js';
import { registerDaemonRoutes } from './routes/daemon.js';
import { registerGenuiRoutes } from './routes/genui.js';
import { registerDesignSystemRoutes } from './routes/design-systems.js';
import { registerPluginAssetRoutes } from './routes/plugins/assets.js';
import { registerPluginRoutes } from './routes/plugins/index.js';
import { registerXaiRoutes } from './routes/xai.js';
import { registerLiveArtifactRoutes } from './routes/live-artifact.js';
import { registerDesignSystemToolRoutes } from './routes/design-system-tool.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerProjectRoutes, registerProjectArtifactRoutes, registerProjectFileRoutes, registerProjectUploadRoutes } from './routes/project/index.js';
import { registerFinalizeRoutes, registerImportRoutes, registerProjectExportRoutes } from './import-export-routes.js';
import { registerHandoffRoutes } from './routes/handoff.js';
import { trustedHandoffRootStore } from './handoff/root-runtime.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { createTerminalService } from './terminals.js';
import { registerMemoryRoutes } from './routes/memory.js';
import {
  assembleExample,
  registerAtomRoutes,
  registerStaticResourceRoutes,
  rewriteSkillAssetUrls,
} from './routes/static-resource.js';
export { rewriteSkillAssetUrls } from './routes/static-resource.js';
import { getRouteRegistrationInventory, installRouteRegistrationGuard } from './route-registration-guard.js';
import { assertServerContextSatisfiesRoutes } from './route-context-contract.js';
import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, toolTokenRegistry } from './tool-tokens.js';
import {
  allowedBrowserPorts,
  configuredAllowedOrigins,
  isAllowedBrowserOrigin,
  isLocalSameOrigin,
  isZeroConfigClipperLibraryRequest,
  parseHostHeader,
} from './origin-validation.js';
import { registerLibraryRoutes } from './routes/library.js';
import {
  libraryExtensionAllowedOrigins,
  seedLibraryExtensionOrigins,
} from './library-tokens.js';
import { listLibraryTokenOrigins } from './library-store.js';
import { apiTokenFromEnv, isApiAuthDisabled, isApiTokenMiddlewareEnabled } from './api-token-auth.js';
import {
  reconcileAssistantMessageOnRunEnd,
  renderPluginBriefTemplate,
} from './plugins/share-helpers.js';
import { sanitizeArchiveFilename } from './projects/archive-filename.js';
import {
  isLoopbackHostname,
  isLoopbackPeerAddress,
  requireLocalDaemonRequest,
} from './http/local-daemon-request.js';
import { createToolRequestAuth } from './http/tool-request-auth.js';

/** @typedef {import('@open-design/contracts').ApiErrorCode} ApiErrorCode */
/** @typedef {import('@open-design/contracts').ApiError} ApiError */
/** @typedef {import('@open-design/contracts').ApiErrorResponse} ApiErrorResponse */
/** @typedef {import('@open-design/contracts').ChatRequest} ChatRequest */
/** @typedef {import('@open-design/contracts').ChatSseEvent} ChatSseEvent */
/** @typedef {import('@open-design/contracts').ProxyStreamRequest} ProxyStreamRequest */
/** @typedef {import('@open-design/contracts').ProxySseEvent} ProxySseEvent */
/** @typedef {import('@open-design/contracts').ProjectConversationCreatedSsePayload} ProjectConversationCreatedSsePayload */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = resolveProjectRoot(__dirname);
const RESOURCE_ROOT_ENV = 'OD_RESOURCE_ROOT';

const DAEMON_RESOURCE_ROOT = resolveDaemonResourceRoot({
  safeBases: [
    PROJECT_ROOT,
    resolveProcessResourcesPath(),
  ],
});
// Built web app lives in `out/` — that's where Next.js writes the static
// export configured in next.config.ts. The folder name used to be `dist/`
// when this project shipped with Vite; the daemon serves whatever the
// frontend toolchain emits, no further config needed.
const STATIC_DIR = path.join(PROJECT_ROOT, 'apps', 'web', 'out');
// Baked plugin preview clips (scripts/bake-plugin-previews.mjs). Served at
// PLUGIN_PREVIEWS_ROUTE; their manifest rewrites html plugins' previews to a
// cheap poster + hover-play video in the home gallery.
const PLUGIN_PREVIEWS_DIR = resolveDaemonPluginPreviewsDir({
  resourceRoot: DAEMON_RESOURCE_ROOT,
  projectRoot: PROJECT_ROOT,
});
const OD_BIN = resolveDaemonCliPath();
const OD_NODE_BIN = process.execPath;
const SKILLS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'skills',
  path.join(PROJECT_ROOT, 'skills'),
);
const DESIGN_SYSTEMS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'design-systems',
  path.join(PROJECT_ROOT, 'design-systems'),
);
// Renderable templates pulled out of `skills/` by the skills/design-templates
// split (PR #955) so the EntryView Templates tab gets the large rendering
// catalogue and Settings → Skills only carries functional skills the agent
// invokes mid-task. See specs/current/skills-and-design-templates.md.
const DESIGN_TEMPLATES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'design-templates',
  path.join(PROJECT_ROOT, 'design-templates'),
);
const CRAFT_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'craft',
  path.join(PROJECT_ROOT, 'craft'),
);
// User-installed skills and design systems live under the runtime data dir
// so they respect OD_DATA_DIR overrides (test isolation, packaged runs).
// Defined after RUNTIME_DATA_DIR is resolved below.
const FRAMES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'frames',
  path.join(PROJECT_ROOT, 'assets', 'frames'),
);
// Curated pets baked into the repo via `scripts/bake-community-pets.ts`.
// `listCodexPets` scans this in addition to `~/.codex/pets/` so the
// "Recently hatched" grid is non-empty out-of-the-box and users do not
// need to hit the "Download community pets" button to try a few pets.
const BUNDLED_PETS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'community-pets',
  path.join(PROJECT_ROOT, 'assets', 'community-pets'),
);
const PROMPT_TEMPLATES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'prompt-templates',
  path.join(PROJECT_ROOT, 'prompt-templates'),
);
const BUNDLED_PLUGINS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  path.join('plugins', '_official'),
  defaultBundledRoot(PROJECT_ROOT),
);
const SANDBOX_MODE_ENABLED = isSandboxModeEnabled(process.env);
const RUNTIME_DATA_DIR = resolveDataDir(process.env.OD_DATA_DIR, PROJECT_ROOT, {
  requireExplicit: SANDBOX_MODE_ENABLED,
});
const SANDBOX_RUNTIME = resolveSandboxRuntimeConfig(SANDBOX_MODE_ENABLED, RUNTIME_DATA_DIR);
ensureSandboxRuntimeDirs(SANDBOX_RUNTIME);
// Canonical (realpath-resolved) form of RUNTIME_DATA_DIR for the few callers
// that compare it against a user-supplied realpath() result. On macOS, /var
// is a symlink to /private/var, so an import realpath lands in /private/var
// and would never start-with the raw RUNTIME_DATA_DIR. Keep RUNTIME_DATA_DIR
// itself as the stable, user-shaped path so OD_DATA_DIR resolution stays
// predictable; only this canonical alias is used for symlink-aware checks.
const RUNTIME_DATA_DIR_CANONICAL = (() => {
  try {
    return fs.realpathSync(RUNTIME_DATA_DIR);
  } catch {
    return RUNTIME_DATA_DIR;
  }
})();
// One-shot legacy data migration. When OD_LEGACY_DATA_DIR is set and the
// new data root is fresh (no app.sqlite), copy the 0.3.x .od/ payload
// across before SQLite opens. Synchronous on purpose: openDatabase below
// would race an async copy. See apps/daemon/src/legacy-data-migrator.ts
// and https://github.com/nexu-io/open-design/issues/710.
migrateLegacyDataDirSync({
  legacyDir: process.env.OD_LEGACY_DATA_DIR,
  dataDir: RUNTIME_DATA_DIR,
});
const ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'artifacts');
// Critique Theater artifacts intentionally live outside the static
// `/artifacts` tree. The per-run artifact endpoint is the sanctioned
// read path so project-membership, size, and CSP guards cannot be bypassed.
const CRITIQUE_ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'critique-artifacts');
const PROJECTS_DIR = path.join(RUNTIME_DATA_DIR, 'projects');
const USER_SKILLS_DIR = path.join(RUNTIME_DATA_DIR, 'skills');
const USER_DESIGN_SYSTEMS_DIR = path.join(RUNTIME_DATA_DIR, 'design-systems');
// Brand metadata (brand.json + meta.json per brand) lives here; each brand
// also registers a `user:<id>` design system under USER_DESIGN_SYSTEMS_DIR.
const BRANDS_DIR = path.join(RUNTIME_DATA_DIR, 'brands');
const PLUGIN_REGISTRY_ROOTS = registryRootsForDataDir(RUNTIME_DATA_DIR);
// Disk cache + same-origin proxy for external preview media (cross-border CDN
// images/videos referenced by plugin example.html). See plugin-asset-cache.ts.
const pluginAssetCache = createPluginAssetCache({
  cacheDir: path.join(RUNTIME_DATA_DIR, 'plugin-asset-cache'),
});
// User-imported design templates mirror USER_SKILLS_DIR but are scanned
// against DESIGN_TEMPLATES_DIR rather than SKILLS_DIR so the EntryView
// Templates surface and the Settings → Skills surface stay decoupled.
const USER_DESIGN_TEMPLATES_DIR = path.join(RUNTIME_DATA_DIR, 'design-templates');
// Multi-root tuples used everywhere the daemon resolves a skill / template
// id without knowing which surface it came from. SKILL_ROOTS drives
// Settings → Skills; DESIGN_TEMPLATE_ROOTS drives the EntryView Templates
// gallery; ALL_SKILL_LIKE_ROOTS spans both for chat run system-prompt
// composition and the orbit template resolver, where stored project ids
// can resolve to either root after the split.
const SKILL_ROOTS = [USER_SKILLS_DIR, SKILLS_DIR];
const DESIGN_TEMPLATE_ROOTS = [USER_DESIGN_TEMPLATES_DIR, DESIGN_TEMPLATES_DIR];
const ALL_SKILL_LIKE_ROOTS = [
  USER_SKILLS_DIR,
  USER_DESIGN_TEMPLATES_DIR,
  SKILLS_DIR,
  DESIGN_TEMPLATES_DIR,
];
// Global OD Library data root — owned, content-addressed assets captured by
// the clipper / `od library import`. Derived from RUNTIME_DATA_DIR per the
// daemon data directory contract.
const LIBRARY_DIR = path.join(RUNTIME_DATA_DIR, 'library');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
for (const dir of [USER_SKILLS_DIR, USER_DESIGN_SYSTEMS_DIR, BRANDS_DIR, USER_DESIGN_TEMPLATES_DIR, PLUGIN_REGISTRY_ROOTS.userPluginsRoot, LIBRARY_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.mkdirSync(CRITIQUE_ARTIFACTS_DIR, { recursive: true });
const designSystemGenerationJobs = createDesignSystemGenerationJobStore({
  root: USER_DESIGN_SYSTEMS_DIR,
});

function getPublicBaseUrl(req) {
  const localPort = req.socket?.localPort ?? process.env.OD_PORT ?? '7456';
  return `http://127.0.0.1:${localPort}`;
}

const activeChatAgentEventSinks = new Map();
const activeProjectEventSinks = new Map();
// Per-chat-run handles, keyed by runId. Lets non-stream side effects
// (live-artifact create, project events) reach back into the chat
// run's local state — currently used by the artifact quiet-period
// shortcut (#1451) so a successful artifact registration can shorten
// the inactivity watchdog without the chat path having to poll a
// store.
const activeChatRunHandles = new Map();

function emitChatAgentEvent(runId, payload) {
  const sink = activeChatAgentEventSinks.get(runId);
  if (!sink) return false;
  return sink(payload);
}

// Exported for tests covering the artifact quiet-period plumbing
// (#1451). The chat run path is a deep closure inside startServer, so
// pin the hook contract at the emit/handle boundary instead of
// driving a full fake-agent e2e for every invariant.
export const __forTestChatRunHandles = activeChatRunHandles;

export function __forTestEmitLiveArtifactEvent(
  grant: { runId?: string; projectId?: string },
  action: 'created' | 'updated' | 'deleted',
  artifact: { id: string; projectId?: string; title?: string; refreshStatus?: string },
) {
  return emitLiveArtifactEvent(grant, action, artifact);
}

function emitLiveArtifactEvent(grant, action, artifact) {
  if (!artifact?.id) return false;
  const payload = {
    type: 'live_artifact',
    action,
    projectId: artifact.projectId ?? grant.projectId,
    artifactId: artifact.id,
    title: artifact.title ?? artifact.id,
    refreshStatus: artifact.refreshStatus,
  };
  let emitted = emitProjectEvent(payload.projectId, payload);
  if (grant?.runId) emitted = emitChatAgentEvent(grant.runId, payload) || emitted;
  // After the deliverable exists, switch the chat run into a shorter
  // "quiet period" watchdog: agents sometimes keep their child process
  // alive after a successful artifact write (post-write reasoning, log
  // flushes, claude-code stream-json's idle stdin) and the 10-minute
  // default leaves the UI parked on Working until the watchdog fires
  // an unrelated "stalled" error. See #1451.
  if (action === 'created' && grant?.runId) {
    const handle = activeChatRunHandles.get(grant.runId);
    if (handle?.noteArtifactRegistered) {
      try { handle.noteArtifactRegistered(); } catch {}
    }
  }
  return emitted;
}

function emitLiveArtifactRefreshEvent(grant, payload) {
  if (!payload?.artifactId) return false;
  const event = {
    type: 'live_artifact_refresh',
    projectId: grant.projectId,
    ...payload,
  };
  let emitted = emitProjectEvent(grant.projectId, event);
  if (grant?.runId) emitted = emitChatAgentEvent(grant.runId, event) || emitted;
  return emitted;
}

// Broadcast an event to every SSE subscriber currently watching the given
// project's `/api/projects/:id/events` stream. The payload's `type` field
// becomes the SSE event name (see routes/project/index.ts). Used for live-artifact
// events and `conversation-created` events emitted by routine runs (#1361).
function emitProjectEvent(projectId, payload) {
  const sinks = activeProjectEventSinks.get(projectId);
  if (!sinks || sinks.size === 0) return false;
  for (const sink of Array.from(sinks)) {
    try {
      sink(payload);
    } catch {
      sinks.delete(sink);
    }
  }
  if (sinks.size === 0) activeProjectEventSinks.delete(projectId);
  return true;
}

// Windows ENAMETOOLONG mitigation constants
const CMD_BAT_RE = /\.(cmd|bat)$/i;
const PROMPT_TEMP_FILE = () =>
  '.od-prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.md';
const promptFileBootstrap = (fp) =>
  `Your full instructions are stored in the file: ${fp.replace(/\\/g, '/')}. ` +
  'Open that file first and follow every instruction in it exactly — ' +
  'it contains the system prompt, design system, skill workflow, and user request. ' +
  'Do not begin your response until you have read the entire file.';

// Load Critique Theater config once at startup so a bad OD_CRITIQUE_* value
// surfaces immediately as a boot-time RangeError instead of silently at
// run time. Default: enabled=false (M0 dark launch).
const critiqueCfg = loadCritiqueConfigFromEnv();
// Per-run baselines of the project's artifact files, captured before the agent
// runs and diffed at run-finish to derive `artifact_count` agent-agnostically
// (see `run-artifact-fs.ts`). Keyed by run id because the run-start scope and
// the run-finalization scope are different closures. The registry also
// flags runs that overlapped another run in the same cwd as `contended`; those
// must not trust the whole-tree diff (it would cross-attribute writes) and fall
// back to the per-run tool-stream count.
const runArtifactBaselines = createRunArtifactBaselines();
// Tracks adapter streamFormat values that have already received a one-time
// warning explaining why the Critique Theater orchestrator was bypassed.
// Adapter denylist for orchestrator routing is implicit: anything that is
// not the 'plain' streamFormat falls through to legacy single-pass.
const critiqueWarnedAdapters = new Set<string>();

// In-process registry of in-flight critique runs so the interrupt endpoint
// can cascade an AbortController to the matching orchestrator invocation.
// Created once per process; not persisted across daemon restarts.
const critiqueRunRegistry = createRunRegistry();
export const SSE_KEEPALIVE_INTERVAL_MS = 25_000;

export function createAgentRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
  daemonUrl: string,
  toolTokenGrant: { token?: string } | null = null,
  nodeBin: string = process.execPath,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = applySandboxRuntimeEnv(
    {
      ...baseEnv,
      OD_DATA_DIR: RUNTIME_DATA_DIR,
      OD_DAEMON_URL: daemonUrl,
      OD_NODE_BIN: nodeBin,
    },
    SANDBOX_RUNTIME,
  );
  const sidecarIpcPath = baseEnv[SIDECAR_ENV.IPC_PATH];
  if (typeof sidecarIpcPath === 'string' && sidecarIpcPath.length > 0) {
    env[SIDECAR_ENV.IPC_PATH] = sidecarIpcPath;
  }
  if (SANDBOX_RUNTIME.enabled) {
    const noProxy = mergeNoProxyWithLoopbackDefaults(env.NO_PROXY ?? env.no_proxy);
    if (noProxy) {
      env.NO_PROXY = noProxy;
      if (process.platform !== 'win32') env.no_proxy = noProxy;
    }
  }

  // Ensure the node binary directory is on PATH so agent sub-processes —
  // in particular npm .cmd shims on Windows that run `"node" script.js` —
  // can find the same node binary that runs the daemon even when the daemon
  // was launched with a full path to node and the directory was not on PATH.
  const nodeBinDir = path.dirname(nodeBin);
  if (nodeBinDir) {
    // On Windows, process.env spreads with the search path under 'Path' rather
    // than 'PATH'. Locate the key case-insensitively so we read and write the
    // same entry that child_process.spawn consults. If we blindly write a new
    // 'PATH' key alongside an existing 'Path', Node's case-insensitive env
    // de-duplication on Windows lets the new key win — dropping all inherited
    // directories (git, npm, agent shims, etc.) from the child's search path.
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    const existingPath = typeof env[pathKey] === 'string' ? (env[pathKey] as string) : '';
    const parts = existingPath.split(path.delimiter).filter((p) => p.length > 0);
    const normalize = (p: string) => p.replace(/[/\\]+$/, '');
    const normalizedDir = normalize(nodeBinDir);
    const alreadyIncluded = parts.some((p) => {
      const n = normalize(p);
      return process.platform === 'win32'
        ? n.toLowerCase() === normalizedDir.toLowerCase()
        : n === normalizedDir;
    });
    if (!alreadyIncluded) {
      env[pathKey] = [nodeBinDir, ...parts].join(path.delimiter);
    }
  }

  if (toolTokenGrant?.token) {
    env.OD_TOOL_TOKEN = toolTokenGrant.token;
  } else {
    delete env.OD_TOOL_TOKEN;
  }

  return env;
}

export function createAgentRuntimeToolPrompt(
  daemonUrl: string,
  toolTokenGrant: { token?: string } | null = null,
): string {
  const tokenLine = toolTokenGrant?.token
    ? '- `OD_TOOL_TOKEN` is available in your environment for this run. Use it only through project wrapper commands; do not print, persist, or override it.'
    : '- `OD_TOOL_TOKEN` is not available for this run, so `/api/tools/*` wrapper commands may be unavailable.';

  return [
    '## Runtime tool environment',
    '',
    `- Daemon URL: \`${daemonUrl}\` (also available as \`OD_DAEMON_URL\`).`,
    '- `OD_NODE_BIN` is the absolute path to the Node-compatible runtime that started the daemon; packaged desktop installs provide this even when the user has no system `node` on PATH.',
    '- `OD_BIN` is the absolute path to the Clean Design CLI script. On POSIX shells run wrappers with `"$OD_NODE_BIN" "$OD_BIN" tools ...`; do not call bare `od`, which may resolve to the system octal-dump command on Unix-like systems.',
    '- On PowerShell use `& $env:OD_NODE_BIN $env:OD_BIN tools ...`; on cmd.exe use `"%OD_NODE_BIN%" "%OD_BIN%" tools ...`.',
    tokenLine,
    '- Prefer project wrapper commands through `OD_NODE_BIN` + `OD_BIN` over raw HTTP. The wrappers read these environment values automatically.',
  ].join('\n');
}

export function createOpenDesignToolEnv({
  daemonUrl,
  projectDir,
  projectId,
}: {
  daemonUrl: string;
  projectDir?: string | null;
  projectId?: string | null;
}): NodeJS.ProcessEnv {
  return {
    OD_BIN,
    OD_DATA_DIR: RUNTIME_DATA_DIR,
    OD_NODE_BIN,
    OD_DAEMON_URL: daemonUrl,
    ...(typeof projectId === 'string' && projectId && projectDir
      ? {
          OD_PROJECT_ID: projectId,
          OD_PROJECT_DIR: projectDir,
        }
      : {}),
  };
}

export function createDaemonDataDirConfiguredAgentEnv(
  configuredAgentEnv: Record<string, string> = {},
): Record<string, string> {
  return {
    ...configuredAgentEnv,
    OD_DATA_DIR: RUNTIME_DATA_DIR,
  };
}

export function normalizeProjectDisplayStatus(status) {
  return status === 'starting' || status === 'queued' ? 'running' : status;
}

export function composeProjectDisplayStatus(
  baseStatus,
  awaitingInputProjects,
  projectId,
) {
  if (
    baseStatus.value === 'succeeded' &&
    awaitingInputProjects.has(projectId)
  ) {
    return { ...baseStatus, value: 'awaiting_input' };
  }
  return {
    ...baseStatus,
    value: normalizeProjectDisplayStatus(baseStatus.value),
  };
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

// Fold per-run work-completeness signals off the agent event stream (#1247 /
// #1060). Invoked for EVERY agent event via the single emitAgentEvent choke
// point, so it covers every retained runtime, not just Claude:
//   - the most recent TodoWrite snapshot's `todos` become run.lastTodoSnapshot,
//     so finish() can judge whether declared work was left unfinished;
//   - a turn-terminal event cut off by max_tokens sets run.truncatedMidTurn, so
//     a truncated generation is flagged incomplete regardless of its todos.
// Never keys off a mid-turn `tool_use` pause — only turn_end / usage terminals.
function captureRunWorkCompletenessSignals(run, ev) {
  if (!run || !ev || typeof ev !== 'object') return;
  if (ev.type === 'tool_use' && isTodoWriteToolName(ev.name)) {
    const todos = todoItemsFromTodoWriteInput(ev.input);
    if (Array.isArray(todos)) run.lastTodoSnapshot = todos;
    return;
  }
  if ((ev.type === 'turn_end' || ev.type === 'usage') && stopReasonIsTruncation(ev.stopReason)) {
    run.truncatedMidTurn = true;
  }
}

function fileNameFromToolInputPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? trimmed;
}

function filesystemWriteFileNamesFromRunEvents(events) {
  const names = [];
  const seen = new Set();
  for (const rec of Array.isArray(events) ? events : []) {
    const data = rec?.data;
    if (!data || typeof data !== 'object') continue;
    if (data.type !== 'tool_use' && data.type !== 'artifact') continue;

    const toolName = typeof data.name === 'string' ? data.name : '';
    const isFileTool =
      data.type === 'artifact' ||
      /^(Write|Edit|MultiEdit|write_file|edit_file|replace_file)$/i.test(toolName);
    if (!isFileTool) continue;

    const input = data.input && typeof data.input === 'object' ? data.input : {};
    const candidate =
      fileNameFromToolInputPath(input.file_path) ||
      fileNameFromToolInputPath(input.filePath) ||
      fileNameFromToolInputPath(input.path) ||
      fileNameFromToolInputPath(input.filename) ||
      fileNameFromToolInputPath(data.path) ||
      fileNameFromToolInputPath(data.filePath) ||
      fileNameFromToolInputPath(data.name);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    names.push(candidate);
  }
  return names;
}

export function __forTestFilesystemWriteFileNamesFromRunEvents(events) {
  return filesystemWriteFileNamesFromRunEvents(events);
}

function filesystemEmptyAnswerFallbackText(fileNames) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return 'Wrote project files.';
  }
  const shown = fileNames.slice(0, 3);
  if (fileNames.length === 1) {
    return `Wrote ${shown[0]}.`;
  }
  if (fileNames.length <= 3) {
    const last = shown.at(-1);
    const first = shown.slice(0, -1).join(', ');
    return `Wrote ${first} and ${last}.`;
  }
  return `Wrote ${shown.join(', ')}, and ${fileNames.length} files total.`;
}

export function __forTestFilesystemEmptyAnswerFallbackText(fileNames) {
  return filesystemEmptyAnswerFallbackText(fileNames);
}


const FORM_ANSWERS_HEADER_RE = /^\s*\[form answers\s+(?:\u2014|-)\s*([^\]\r\n]+)\]/i;

// Aggressive OVERRIDE for weak / medium-strength plain agents (e.g.
// GPT-OSS-120B Medium, Gemini 3.5 Flash) that otherwise echo RULE 1's
// fenced form example back at the user on follow-up turns even when
// they correctly understand the form is answered. Strong models
// (Claude Sonnet 4.6, Gemini 3.1 Pro) already handle a shorter
// OVERRIDE; enumerating the anti-patterns is a no-op for them and a
// strong suppressor for the weaker ones. RULE 1 itself stays in the
// system prompt so turn 1 can still emit a valid form.
//
// Exported so tests pin both the trigger condition and the literal
// anti-patterns we ask the model to skip \u2014 silently weakening the
// list (e.g. dropping the markdown-fence ban) would reintroduce the
// form-echo regression on GPT-OSS / Gemini Flash.
export const FORM_ANSWERED_SYSTEM_OVERRIDE = `## OVERRIDE \u2014 form already answered (this is turn 2 or later)

The user already submitted their form answers (see # User request below).
RULE 1 documents the turn-1 ask flow; that flow is finished. Treat RULE 1
as read-only documentation for this turn \u2014 do not execute any of it.

Forbidden output for this turn:
- A \`<question-form>\` tag of any id, including \`discovery\` or \`task-type\`.
- A markdown \`\`\`json fenced block echoing the form schema or example.
- Form-asking prose such as "Got it \u2014 tell me the following" or
  "\u8bf7\u544a\u8bc9\u6211\u4ee5\u4e0b\u4fe1\u606f".
- Narrating fake system events such as "subagents stopped" or
  "server restart".

Required output for this turn:
- Open with a brief prose confirmation of what the brief is.
- Then proceed to RULE 2 (branch on the submitted \`brand\` value) and
  RULE 3 (emit the \`<artifact>\` block with the full HTML document).

`;

// Smaller override for non-discovery / non-task-type form ids. These
// forms are not artifact-build transitions, so we only need to suppress
// the form re-ask without directing the model toward RULE 2 / RULE 3.
// Exported so tests can pin the literal content independently.
export const FORM_ANSWERED_GENERIC_OVERRIDE = `## OVERRIDE \u2014 form already answered (this is turn 2 or later)

The user already submitted their form answers (see # User request below).
Do not ask the same form again. Treat the submitted answers as the active
user instruction and respond accordingly.

`;

function formAnswerTransitionForCurrentPrompt(currentPrompt) {
  if (typeof currentPrompt !== 'string') return null;
  const trimmed = currentPrompt.trim();
  if (!trimmed) return null;
  const match = FORM_ANSWERS_HEADER_RE.exec(trimmed);
  if (!match) return null;
  const rawFormId = (match[1] || 'form').trim() || 'form';
  const formId = rawFormId.replace(/[^\w.-]/g, '') || 'form';
  const lines = [
    '## Latest user turn - form answers submitted',
    trimmed,
    '',
    // Keep the wording in lock-step with main — the stronger "do not
    // emit any `<question-form>`" suppression now lives in the
    // system-prompt `FORM_ANSWERED_SYSTEM_OVERRIDE` block, which
    // every plain / stream-json adapter sees. Diverging the
    // user-request transition string here breaks `chat-route.test
    // marks submitted discovery form answers ...` which asserts on
    // the exact main wording.
    `The user has answered the ${formId} form. Do not emit another ${formId} form.`,
  ];
  if (formId.toLowerCase() === 'discovery' || formId.toLowerCase() === 'task-type') {
    lines.push(
      'Continue with RULE 2 / RULE 3 now. For Branch B answers, build now instead of asking another brief.',
    );
  } else {
    lines.push(
      'Treat these form answers as the active user turn instead of replaying the transcript as a fresh request.',
    );
  }
  return lines.join('\n');
}

export function composeChatUserRequestForAgent(
  message,
  currentPrompt,
  options: { skipTranscript?: boolean } = {},
) {
  // When the adapter resumes its own session (today: `agy -c`), the
  // daemon-rendered `## user` / `## assistant` transcript is a duplicate
  // of what the upstream CLI already has in memory — and the embedded
  // copy carries the literal `<question-form>` markup the agent emitted
  // on turn 1, which the model then re-emits on turn 2. Send only the
  // latest user turn (`currentPrompt`) in that case; the upstream
  // session memory provides the rest. See
  // `RuntimeAgentDef.resumesSessionViaCli`.
  const skip = options.skipTranscript === true;
  const bodySource = skip ? currentPrompt : message;
  const body =
    typeof bodySource === 'string' && bodySource.trim()
      ? bodySource
      : '(No extra typed instruction.)';
  const transition = formAnswerTransitionForCurrentPrompt(currentPrompt);
  if (!transition) return body;
  if (skip) {
    return [transition, body].join('\n\n');
  }
  return [
    transition,
    '## Full conversation transcript',
    body,
  ].join('\n\n');
}

const PROJECT_PREVIEW_SCOPE_TTL_MS = 60 * 60 * 1000;
const PROJECT_PREVIEW_ASSET_PATH_RE = /^\/projects\/([^/]+)\/preview\/([^/]+)\/.+$/u;

function createProjectPreviewScopeRegistry() {
  const scopes = new Map();

  function pruneExpired(now = Date.now()) {
    for (const [scope, entry] of scopes) {
      if (entry.expiresAt <= now) scopes.delete(scope);
    }
  }

  return {
    mint(projectId) {
      pruneExpired();
      const scope = randomUUID();
      scopes.set(scope, {
        projectId: String(projectId),
        expiresAt: Date.now() + PROJECT_PREVIEW_SCOPE_TTL_MS,
      });
      return scope;
    },
    validate(projectId, scope) {
      const key = String(scope || '');
      const entry = scopes.get(key);
      if (!entry) return false;
      if (entry.expiresAt <= Date.now()) {
        scopes.delete(key);
        return false;
      }
      return entry.projectId === String(projectId);
    },
  };
}

function parseProjectPreviewAssetPath(pathname) {
  const match = PROJECT_PREVIEW_ASSET_PATH_RE.exec(String(pathname || ''));
  if (!match) return null;
  try {
    return {
      projectId: decodeURIComponent(match[1]),
      scope: match[2],
    };
  } catch {
    return null;
  }
}

function openNativeFolderDialog() {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    if (platform === 'darwin') {
      // `choose folder` is handled specially by the system: it presents a fully
      // interactive standard navigation panel that reliably takes key focus
      // (unlike a JXA-driven NSOpenPanel from background-only osascript, which
      // renders but can't be clicked). That standard panel already includes a
      // "New Folder" button in the bottom-left, so users can create a folder
      // inline without any extra wiring.
      execFile(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Select a code folder to link")'],
        { timeout: 120_000 },
        (err, stdout) => {
          if (err) return resolve(null);
          const p = stdout.trim().replace(/\/$/, '');
          resolve(p || null);
        },
      );
    } else if (platform === 'linux') {
      execFile(
        'zenity',
        ['--file-selection', '--directory', '--title=Select a code folder to link'],
        { timeout: 120_000 },
        (err, stdout, stderr) => {
          try {
            resolve(parseLinuxFolderDialogResult(err, stdout, stderr));
          } catch (folderDialogError) {
            reject(folderDialogError);
          }
        },
      );
    } else if (platform === 'win32') {
      const command = buildWindowsFolderDialogCommand();
      execFile(command.command, command.args, { timeout: 120_000 }, (err, stdout) => {
        resolve(parseFolderDialogStdout(err, stdout));
      });
    } else {
      resolve(null);
    }
  });
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 */
function createSseErrorPayload(code, message, init = {}) {
  return { message, error: createCompatApiError(code, message, init) };
}

function rewriteKnownAgentStreamError(agentId, message, failureText = '') {
  const rawMessage =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Agent stream error';
  const combined = `${rawMessage}\n${failureText}`;
  if (
    /bufio\.scanner:\s*token too long/i.test(combined) &&
    /opencode/i.test(combined) &&
    agentId === 'opencode'
  ) {
    return 'The run failed due to an unknown upstream streaming error. Please retry.';
  }
  return rawMessage;
}


fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      );
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const importUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      );
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Figma `.fig` import — memory storage so the offline decoder gets the raw
// bytes without a temp-file round-trip. The decoder unzips + kiwi-decodes
// in-process and writes the snapshot under the project cwd.
const figmaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },  // community kits run large
});

// Project-scoped multi-file upload. Lands files directly in the project
// folder (flat — same shape FileWorkspace expects), so the composer's
// pasted/dropped/picked images become referenceable filenames the agent
// can Read or @-mention without any cross-folder gymnastics.
// Bridge between the multer upload-storage destination (built at module
// init) and the per-process project DB (instantiated inside startServer).
// startServer() sets this so the upload destination can route attachments
// into the right project root, including folder-imported projects whose
// files live under metadata.baseDir.
let projectMetadataLookup: ((id: string) => Record<string, unknown> | null) | null = null;

const projectUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        // Route uploads into the project's actual root: for folder-imported
        // projects (metadata.baseDir set) attachments need to land alongside
        // the user's files so the agent can read them via the same path
        // it sees. projectMetadataLookup is populated at startServer() boot
        // and keyed by project id; null fallback gives the standard
        // .od/projects/<id>/ behavior for non-imported projects.
        const meta = projectMetadataLookup?.(req.params.id) ?? null;
        // Optional `dir` form field (sent BEFORE the file parts by the web
        // client) routes uploads into a subfolder, so files dropped/picked
        // while viewing a folder land there instead of the project root. The
        // sanitized relative dir is stashed on the request so the route can
        // report each file's true project-relative path.
        const subdir = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const { absDir, relDir } = await ensureProjectSubdir(
          PROJECTS_DIR,
          req.params.id,
          subdir,
          meta,
        );
        (req as any)._uploadRelDir = relDir;
        (req as any)._uploadAbsDir = absDir;
        cb(null, absDir);
      } catch (err) {
        cb(err, '');
      }
    },
    filename: (req, file, cb) => {
      // multer@1 hands us latin1-decoded multipart filenames; restore the
      // original UTF-8 so the response (and the on-disk name) preserves
      // non-ASCII characters instead of mangling them. Then run the shared
      // sanitiser and only add a suffix when that sanitized source name
      // would collide with an existing or same-batch upload.
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      const uploadDir = typeof (req as any)._uploadAbsDir === 'string' ? (req as any)._uploadAbsDir : '';
      const reserved = (req as any)._uploadReservedNames instanceof Set
        ? (req as any)._uploadReservedNames
        : ((req as any)._uploadReservedNames = new Set());
      cb(null, uniqueUploadFileName(uploadDir, safe, reserved));
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },  // 200MB — covers the largest design assets we expect (PPTX/PDF/raw images)
});

function uniqueUploadFileName(uploadDir, safeName, reserved) {
  const parsed = path.parse(safeName);
  const base = parsed.name || parsed.base || 'file';
  const ext = parsed.ext || '';
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = index === 0 ? safeName : `${base}-${index}${ext}`;
    if (reserved.has(candidate)) continue;
    if (uploadDir && fs.existsSync(path.join(uploadDir, candidate))) continue;
    reserved.add(candidate);
    return candidate;
  }
  const fallback = `${base}-${Date.now().toString(36)}${ext}`;
  reserved.add(fallback);
  return fallback;
}

function handleProjectUpload(req, res, next) {
  projectUpload.array('files', 12)(req, res, (err) => {
    if (err) {
      return sendMulterError(res, err);
    }
    next();
  });
}

function sendMulterError(res, err) {
  if (err instanceof multer.MulterError) {
    const code = err.code || 'UPLOAD_ERROR';
    const statusByCode = {
      LIMIT_FILE_SIZE: 413,
      LIMIT_FILE_COUNT: 400,
      LIMIT_UNEXPECTED_FILE: 400,
      LIMIT_PART_COUNT: 400,
      LIMIT_FIELD_KEY: 400,
      LIMIT_FIELD_VALUE: 400,
      LIMIT_FIELD_COUNT: 400,
      MISSING_FIELD_NAME: 400,
    };
    const errorByCode = {
      LIMIT_FILE_SIZE: 'file too large',
      LIMIT_FILE_COUNT: 'too many files',
      LIMIT_UNEXPECTED_FILE: 'unexpected file field',
      LIMIT_PART_COUNT: 'too many form parts',
      LIMIT_FIELD_KEY: 'field name too long',
      LIMIT_FIELD_VALUE: 'field value too long',
      LIMIT_FIELD_COUNT: 'too many form fields',
      MISSING_FIELD_NAME: 'missing field name',
    };
    const status = statusByCode[code] ?? 400;
    const message = errorByCode[code] ?? 'upload failed';
    return sendApiError(
      res,
      status,
      code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message,
      { details: { legacyCode: code } },
    );
  }

  if (err) {
    return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
  }

  return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
}

export function createSseResponse(
  res,
  { keepAliveIntervalMs = SSE_KEEPALIVE_INTERVAL_MS } = {},
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const canWrite = () => !res.destroyed && !res.writableEnded;
  const writeKeepAlive = () => {
    if (canWrite()) {
      res.write(': keepalive\n\n');
      return true;
    }
    return false;
  };

  let heartbeat = null;
  if (keepAliveIntervalMs > 0) {
    heartbeat = setInterval(writeKeepAlive, keepAliveIntervalMs);
    heartbeat.unref?.();
  }

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);

  return {
    /** @param {ChatSseEvent['event'] | ProxySseEvent['event'] | string} event */
    send(event, data, id: string | number | null | undefined = null) {
      if (!canWrite()) return false;
      // Assemble the full SSE event into a single write so id/event/data land
      // in one TCP chunk. Three separate writes would let `event: <type>` flush
      // ahead of the `data:` payload, which produces partial events for
      // consumers that read chunk-by-chunk (e.g. tests using a Response body
      // reader with a substring marker).
      const idLine = id !== null && id !== undefined ? `id: ${id}\n` : '';
      res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    writeKeepAlive,
    cleanup,
    end() {
      cleanup();
      if (canWrite()) {
        res.end();
      }
    },
  };
}

export type DesktopPdfExporter = (input: DesktopExportPdfInput) => Promise<DesktopExportPdfResult>;
export type DesktopSlideRenderer = (input: DesktopRenderSlidesInput) => Promise<DesktopRenderSlidesResult>;
export type DesktopArtifactExporter = (input: DesktopExportArtifactInput) => Promise<DesktopExportArtifactResult>;

// Loosely typed shape — we only access `namespace`, `base`, `mode`, and
// `source` from the runtime context when building the diagnostics export.
// Anything richer would force a dependency from server.ts into the sidecar
// package, which the boundary checks explicitly forbid.
export interface DaemonRuntimeContext {
  namespace: string;
  base: string;
  mode?: string;
  source?: string;
}

export interface StartServerOptions {
  desktopArtifactExporter?: DesktopArtifactExporter | null;
  desktopPdfExporter?: DesktopPdfExporter | null;
  desktopSlideRenderer?: DesktopSlideRenderer | null;
  host?: string;
  port?: number;
  returnServer?: boolean;
  runtime?: DaemonRuntimeContext | null;
}

export interface StartServerResult {
  url: string;
  server: import('node:http').Server;
  shutdown: () => Promise<void> | void;
  routeInventory: import('./route-registration-guard.js').RouteRegistration[];
}

export async function startServer({
  port = 7456,
  host = normalizeDaemonBindHost(process.env.OD_BIND_HOST),
  returnServer = false,
  desktopPdfExporter = null,
  desktopSlideRenderer = null,
  desktopArtifactExporter = null,
  runtime = null,
}: StartServerOptions = {}) {
  const releaseEgressGuard = installCleanDesignEgressGuard();
  host = normalizeDaemonBindHost(host);
  let resolvedPort = port;
  let daemonShuttingDown = false;
  const extraAllowedOrigins = configuredAllowedOrigins();

  // Plan §3.K1 / spec §15.7 — bound-API-token guard.
  //
  // The daemon refuses to bind to a public interface unless an
  // OD_API_TOKEN is set. This is the spec §16 Phase 5 safety floor:
  // a hosted operator can no longer accidentally publish an unsecured
  // daemon by setting OD_BIND_HOST=0.0.0.0 without a token.
  //
  // Loopback hosts (127.0.0.1 / ::1 / localhost) are always allowed —
  // the desktop / dev flow remains unchanged. Setting OD_API_TOKEN is
  // purely additive: when present, every /api/* request must carry a
  // matching `Authorization: Bearer <token>` header (loopback origins
  // are exempted so the desktop UI keeps working).
  const apiToken = apiTokenFromEnv();
  const apiAuthDisabled = isApiAuthDisabled();
  if (!isLoopbackHostname(host) && apiToken.length === 0 && !apiAuthDisabled) {
    throw new Error(
      `OD_BIND_HOST=${host} requires OD_API_TOKEN to be set. ` +
      `Generate one with \`openssl rand -hex 32\` and re-launch. ` +
      `(Loopback hosts 127.0.0.1 / ::1 / localhost do not need a token.) ` +
      `Set OD_DISABLE_API_AUTH=1 only when a trusted reverse proxy already authenticates every request.`,
    );
  }

  const app = express();
  installRouteRegistrationGuard(app);
  // Clipper page captures are self-contained HTML with inlined images plus a
  // Figma IR, which for an image-heavy site (The Economist, news front pages)
  // runs to tens of MB — far past a normal JSON body. Give the ingest route a
  // dedicated generous limit so a full-page capture doesn't 413; the rest of the
  // API stays at the conservative 4mb. Registered first so this parser claims
  // the ingest body before the global one (express.json is a no-op once a body
  // has already been read).
  app.use('/api/library/ingest', express.json({ limit: '128mb' }));
  // Brand extract-from-html carries the full rendered page DOM (+ collected CSS)
  // the web read out of the in-app browser tab after the user cleared an anti-bot
  // wall — well past 4mb for image/markup-heavy sites. Give it a dedicated limit
  // (registered before the global parser so it claims the body first).
  app.use('/api/brands/:id/extract-from-html', express.json({ limit: '32mb' }));
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', cleanDesignEgressRequestContext);
  app.use('/api', (req, res, next) => {
    if (!isCleanDesignDisabledApiPath(req.path)) return next();
    res.status(410).json({
      error: {
        code: 'SERVICE_DISABLED',
        message: 'This network service is not available in Clean Design.',
      },
    });
  });
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.path === '/app-config' || req.path === '/media/config') return next();
    try {
      req.body = resolveCredentialReferencesInValue(req.body);
      return next();
    } catch {
      return res.status(400).json({
        error: {
          code: 'CREDENTIAL_UNAVAILABLE',
          message: 'The selected credential is unavailable. Reopen Settings and save it again.',
        },
      });
    }
  });
  const projectPreviewScopes = createProjectPreviewScopeRegistry();

  // Plan §3.K1 — bearer-token middleware.
  //
  // Active only when OD_API_TOKEN is set and API auth is not disabled.
  // Loopback origins skip the
  // check (the desktop UI / local CLI never carry a bearer); every
  // other request must present `Authorization: Bearer <token>` with a
  // value matching `OD_API_TOKEN`. Health / readiness / version remain
  // open so monitoring probes don't need the token. Server-minted
  // project preview asset scopes are also accepted for GETs so sandboxed
  // browser iframes can load HTML/CSS/JS without privileged headers.
  // Rich daemon status stays authenticated because it includes local
  // runtime paths.
  if (isApiTokenMiddlewareEnabled()) {
    const openProbePaths = new Set([
      '/health',
      '/api/health',
      '/ready',
      '/api/ready',
      '/version',
      '/api/version',
    ]);
    app.use('/api', (req, res, next) => {
      if (openProbePaths.has(req.path)) return next();
      if (req.method === 'GET') {
        const previewAsset = parseProjectPreviewAssetPath(req.path);
        if (
          previewAsset &&
          projectPreviewScopes.validate(previewAsset.projectId, previewAsset.scope)
        ) {
          return next();
        }
      }
      // Loopback short-circuit. We ignore the proxied X-Forwarded-For
      // header here because a reverse proxy MUST always forward the
      // bearer; the loopback bypass exists for the localhost desktop
      // UI which has no proxy in the path.
      if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();
      const auth = req.get('authorization') ?? '';
      const match = /^Bearer\s+(\S+)\s*$/i.exec(auth);
      if (!match || match[1] !== apiToken) {
        return res.status(401).json({
          error: { code: 'API_TOKEN_REQUIRED', message: 'Authorization: Bearer <OD_API_TOKEN> required' },
        });
      }
      return next();
    });
  }

  const designSystemServices = createDesignSystemServerServices({
    roots: { SKILL_ROOTS, DESIGN_TEMPLATE_ROOTS, ALL_SKILL_LIKE_ROOTS },
    paths: { PROJECTS_DIR, DESIGN_SYSTEMS_DIR, USER_DESIGN_SYSTEMS_DIR },
    skills: { listSkills, findSkillById },
    designSystems: {
      listDesignSystems,
      readDesignSystem,
      readDesignSystemPackageInfo,
      readDesignSystemStaticFile,
      listUserDesignSystemFiles,
      readUserDesignSystemFile,
      linkUserDesignSystemProject,
      LEGACY_DESIGN_SYSTEM_ARTIFACTS,
    },
    projects: {
      getProject,
      insertProject,
      updateProject,
      readProjectFile,
      writeProjectFile,
      listFiles,
      resolveProjectDir,
      isSafeId,
    },
  });
  const {
    ensureUserDesignSystemWorkspaceProject,
    isProjectUsableDesignSystem,
    listAllDesignSystems,
    listAllDesignTemplates,
    listAllSkillLikeEntries,
    listAllSkills,
    readAvailableDesignSystem,
    readAvailableDesignSystemPackageInfo,
    readAvailableDesignSystemStaticFile,
    readDesignSystemWorkspaceTextFile,
    validateProjectDesignSystemId,
    validateProjectSkillId,
  } = designSystemServices;

  // Chrome may strip the port from the Origin header on same-origin GET
  // requests. Only use this as a fallback for safe, idempotent GET requests;
  // mutating routes always require an exact origin/host match.
  function isPortlessLoopbackOrigin(origin) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])$/.test(origin);
  }

  function reportHostForPoweredPreview(): string {
    return host === '0.0.0.0' || host === '::' || host === '[::]' || host === '::1'
      ? '127.0.0.1'
      : host;
  }

  function poweredPreviewHost(): string | null {
    const reportHost = reportHostForPoweredPreview();
    if (reportHost === '127.0.0.1') return 'localhost';
    if (reportHost === 'localhost') return '127.0.0.1';
    return null;
  }

  // Routes that serve content to sandboxed iframes (Origin: null) for
  // read-only purposes.  All other /api routes reject Origin: null.
  const _NULL_ORIGIN_SAFE_GET_RE =
    /^\/projects\/[^/]+\/(?:raw|preview)\/|^\/codex-pets\/[^/]+\/spritesheet$|^\/asset-cache$/;
  const _POWERED_PREVIEW_SAFE_RE = /^\/projects\/[^/]+\/powered\/.+$/u;

  // Reject cross-origin requests to API endpoints.
  // Health/version remain open for monitoring probes.
  // Non-browser clients (no Origin header) are always allowed.
  app.use('/api', (req, res, next) => {
    // Live artifact previews have stricter local-daemon validation and
    // loopback CORS handling on the route itself. Let that middleware produce
    // the structured error shape and preflight headers for preview embeds.
    if (/^\/live-artifacts\/[^/]+\/preview$/.test(req.path)) return next();

    // Zero-config browser extension: the OD Clipper only needs a liveness probe
    // plus POST /api/library/ingest. A web page cannot forge a
    // chrome-extension:// (or moz-extension://) origin, and the daemon is
    // loopback-bound, so these two bootstrap routes are auto-trusted without a
    // pairing handshake. Library read routes still fall through to the normal
    // origin guard.
    // NOTE: `req.path` here is mount-relative (the `/api` prefix is stripped),
    // so the predicate matches `/library/ingest`, not `/api/library/ingest`.
    if (isZeroConfigClipperLibraryRequest(req.method, req.path, req.headers.origin)) {
      return next();
    }

    const poweredHost = poweredPreviewHost();
    if (poweredHost && resolvedPort) {
      const requestHost = parseHostHeader(req.headers.host);
      const fetchMetadataPresent =
        req.headers['sec-fetch-site'] != null ||
        req.headers['sec-fetch-mode'] != null ||
        req.headers['sec-fetch-dest'] != null;
      const poweredReferer = (() => {
        const raw = Array.isArray(req.headers.referer) ? req.headers.referer[0] : req.headers.referer;
        if (typeof raw !== 'string' || raw.length === 0) return false;
        try {
          const parsed = new URL(raw);
          return parsed.hostname === poweredHost &&
            (parsed.port || (parsed.protocol === 'https:' ? '443' : '80')) === String(resolvedPort) &&
            /^\/api\/projects\/[^/]+\/powered\/.+/u.test(parsed.pathname);
        } catch {
          return false;
        }
      })();
      const isPoweredPreviewBrowserRequest =
        requestHost?.hostname === poweredHost &&
        requestHost.port === String(resolvedPort) &&
        (fetchMetadataPresent || poweredReferer);
      if (isPoweredPreviewBrowserRequest && !_POWERED_PREVIEW_SAFE_RE.test(req.path)) {
        return res.status(403).json({
          error: 'Powered preview origin cannot access this API route',
        });
      }
    }

    const origin = req.headers.origin;
    // Non-browser client → allow.
    if (origin == null || origin === '') return next();

    // Origin: null (sandboxed iframes).  Only allowed for safe, read-only
    // routes that set their own CORS headers for canvas drawing.
    if (origin === 'null') {
      const isSafeReadOnly =
        req.method === 'GET' && _NULL_ORIGIN_SAFE_GET_RE.test(req.path);
      if (!isSafeReadOnly) {
        return res.status(403).json({ error: 'Origin: null not allowed for this route' });
      }
      return next();
    }

    // Fail-closed: block all browser origins until port is resolved.
    if (!resolvedPort) {
      return res.status(403).json({ error: 'Server initializing' });
    }

    const ports = allowedBrowserPorts(resolvedPort);
    // Paired browser-extension origins are persisted in library_tokens and
    // seeded into this in-memory allowlist at boot / on pairing.
    const allowedOrigins = [...extraAllowedOrigins, ...libraryExtensionAllowedOrigins()];
    if (!isAllowedBrowserOrigin(origin, req.headers.host, ports, host, allowedOrigins)) {
      if (req.method !== 'GET' || !isPortlessLoopbackOrigin(String(origin))) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
      }
    }
    next();
  });
  const db = openDatabase(PROJECT_ROOT, { dataDir: RUNTIME_DATA_DIR });
  // Restore paired browser-extension origins into the in-memory allowlist the
  // /api origin middleware above consults, so a paired clipper survives daemon
  // restarts without re-pairing.
  try {
    seedLibraryExtensionOrigins(listLibraryTokenOrigins(db));
  } catch {
    // best-effort: a fresh db with no library_tokens is fine
  }
  const mediaTaskStore = createMediaTaskStore(db);
  const {
    authorizeToolRequest,
    optionalToolGrantFromRequest,
    requestProjectOverride,
    requestRunOverride,
  } = createToolRequestAuth(toolTokenRegistry);
  // Wire the upload-destination bridge to this db so multer can route
  // file uploads into baseDir-rooted projects' actual folders.
  projectMetadataLookup = (id) => {
    try { return getProject(db, id)?.metadata ?? null; } catch { return null; }
  };
  // External connector hosts and credential stores are not initialized in
  // the local-only build. The retained local plugin catalog remains usable.

  let daemonUrl = `http://127.0.0.1:${port}`;

  // Boot reconcile: any critique_runs row left in 'running' state by a prior
  // daemon crash gets flipped to 'interrupted' with rounds_json.recoveryReason
  // = 'daemon_restart' so the spec's daemon-restart-mid-run failure mode is
  // honored on every boot. staleAfterMs comes from CritiqueConfig, not a
  // hardcoded constant.
  const reconciledStaleRuns = reconcileStaleRuns(db, { staleAfterMs: critiqueCfg.totalTimeoutMs });
  if (reconciledStaleRuns > 0) {
    console.warn(`[critique] reconcileStaleRuns flipped ${reconciledStaleRuns} stale running row(s) to interrupted`);
  }
  const mediaReconcile = reconcileMediaTasksOnBoot(db, {
    terminalTtlMs: TASK_TTL_AFTER_DONE_MS,
  });
  if (mediaReconcile.interrupted > 0 || mediaReconcile.deleted > 0) {
    console.warn(
      `[media] reconcileMediaTasksOnBoot interrupted ${mediaReconcile.interrupted} task(s), ` +
        `deleted ${mediaReconcile.deleted} expired terminal task(s)`,
    );
  }
  mediaTaskStore.mediaTasks.clear();
  for (const row of listRecentMediaTasks(db, { terminalTtlMs: TASK_TTL_AFTER_DONE_MS })) {
    mediaTaskStore.hydrateMediaTask(row);
  }

  if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
    console.log('[od] Codex plugins disabled via OD_CODEX_DISABLE_PLUGINS=1');
  }

  // Plan §3.I3 / spec §23.3.5 — register every plugin under
  // <resourceRoot>/plugins/_official/** in packaged runs, or
  // <projectRoot>/plugins/_official/** in workspace runs, as bundled plugins. The walker
  // is idempotent (upserts on every boot) so a daemon upgrade rotates
  // the bundled set in lockstep with the code. ENOENT is silent —
  // running the daemon outside the dev tree just skips this step.
  try {
    const result = await registerBundledPlugins({
      db,
      bundledRoot: BUNDLED_PLUGINS_DIR,
    });
    if (result.registered.length > 0) {
      console.log(`[plugins] registered ${result.registered.length} bundled plugin(s)`);
    }
    if (result.warnings.length > 0) {
      for (const w of result.warnings) console.warn(`[plugins] bundled warn: ${w}`);
    }
  } catch (err) {
    console.warn(`[plugins] bundled registration failed: ${(err)?.message ?? err}`);
  }

  // Plan §3.A5 / spec §16 Phase 5 / PB2: periodic snapshot GC. Disabled
  // when OD_SNAPSHOT_GC_INTERVAL_MS is 0; otherwise one-time bootstrap
  // sweep + interval. The function returns a NOOP_HANDLE when disabled
  // so we don't have to branch on the result.
  const snapshotGc = startSnapshotGc({ db });
  // One immediate sweep so a daemon that just gained the ALTER doesn't
  // wait the full interval before reaping pre-existing expired rows.
  try {
    const initialSweep = pruneExpiredSnapshots(db);
    if (initialSweep.removed > 0) {
      console.log(`[plugins] snapshot GC startup sweep removed ${initialSweep.removed} row(s)`);
    }
  } catch (err) {
    console.warn(`[plugins] snapshot GC startup sweep failed: ${(err)?.message ?? err}`);
  }
  void snapshotGc; // keep handle alive for the daemon's lifetime

  // Memory hygiene: one-time removal of entries the retired chat
  // auto-extraction pipelines wrote (regex-pack artifacts + chat-form
  // residue in user_profile). Marker-gated inside, so this is a no-op on
  // every boot after the first. Best-effort — memory cleanup must never
  // block the daemon from serving.
  try {
    const memoryCleanup = await runAutoExtractionCleanup(RUNTIME_DATA_DIR);
    if (memoryCleanup.ran && (memoryCleanup.deletedIds.length > 0 || memoryCleanup.profilePruned)) {
      console.log(
        `[memory] auto-extraction cleanup removed ${memoryCleanup.deletedIds.length} entr(y/ies)`
        + `${memoryCleanup.profilePruned ? ' and pruned user_profile to canonical fields' : ''}`,
      );
    }
  } catch (err) {
    console.warn('[memory] auto-extraction cleanup failed:', err);
  }

  // Warm agent-capability probes (e.g. whether the installed Claude Code
  // build advertises --include-partial-messages) so the first /api/chat
  // hits a populated cache even if /api/agents hasn't been called yet.
  void readAppConfig(RUNTIME_DATA_DIR)
    .then((config) => detectAgents(config.agentCliEnv ?? {}))
    .catch(() => detectAgents().catch(() => {}));

  await recoverStaleLiveArtifactRefreshes({ projectsRoot: PROJECTS_DIR }).catch((error) => {
    console.warn('[od] Failed to recover stale live artifact refreshes:', error);
  });

  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR));
  }

  // ---- Projects (DB-backed) -------------------------------------------------


  registerMemoryRoutes(app, {
    http: { createSseResponse, requireLocalDaemonRequest },
    paths: { RUNTIME_DATA_DIR, PROJECT_ROOT, PROJECTS_DIR },
    appConfig: { readAppConfig },
  });

  // Reconcile follow-up — the inline POST /api/projects body that lived
  // on garnet (with baseDir privilege check, linkedDirs validation,
  // template snapshot seeding, plugin snapshot resolution with default
  // scenario fallback) is intentionally dropped here. main moved project
  // route registration into `./routes/project/index.js` via PR #1043, so the
  // simple project-create surface is wired through `registerProjectRoutes`
  // further down. Plugin-snapshot-resolution / default-scenario-fallback
  // from garnet need to be re-integrated into routes/project/index.ts as a
  // follow-up — see reconcile decision log.
  // (legacy POST /api/projects body deleted — see registerProjectRoutes below.)

  const design = {
    runs: createChatRunService({
      createSseResponse,
      createSseErrorPayload,
      runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
      // Fold committed side effects into a truncation-proof per-run ledger as
      // each event is emitted, so the finalization verdict (retry safety gate,
      // artifact_count, close-status artifactProducedThisRun) does not depend on
      // early tool_use/artifact events surviving the run.events ring buffer.
      onEventEmitted: (run, record) => {
        if (!run.sideEffectLedger) run.sideEffectLedger = createRunSideEffectLedger();
        foldEventIntoRunSideEffectLedger(run.sideEffectLedger, record);
      },
    }),
  };

  // Runs are process-local, but interrupted message state is durable.
  void reconcileDurableRunTerminals({
    db,
    runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
  }).then((reconciled) => {
    if (reconciled.interrupted > 0 || reconciled.messagesReconciled > 0) {
      console.warn('[runs] reconciled interrupted run terminals', reconciled);
    }
  }).catch((error) => {
    console.warn('[runs] terminal reconciliation failed', error);
  });

  // Interactive Terminal sessions (node-pty). In-memory, process-local, and
  // killed on daemon shutdown — see shutdownDaemonRuns below.
  const terminalService = createTerminalService();

  // DNS-aware wrapper. The sync `validateBaseUrl` only inspects the literal
  // hostname string, so a public DNS name pointing at an internal address
  // (`internal.example.com → 10.0.0.5`) still passes. We delegate to
  // `validateBaseUrlResolved` here so every proxy and finalize handler runs
  // the same resolved-IP check before issuing the upstream request.
  const validateExternalApiBaseUrl = (baseUrl) => validateBaseUrlResolved(baseUrl);

  const resolvedPortRef = {
    get current() {
      return resolvedPort;
    },
  };
  const daemonUrlRef = {
    get current() {
      return daemonUrl;
    },
  };
  const httpDeps = {
    sendApiError,
    sendMulterError,
    sendLiveArtifactRouteError,
    createSseResponse,
    getPublicBaseUrl,
    requireLocalDaemonRequest,
    isLocalSameOrigin,
    resolvedPortRef,
  };
  const pathDeps = {
    PROJECT_ROOT,
    PROJECTS_DIR,
    ARTIFACTS_DIR,
    LIBRARY_DIR,
    BRANDS_DIR,
    RUNTIME_DATA_DIR,
    RUNTIME_DATA_DIR_CANONICAL,
    DESIGN_SYSTEMS_DIR,
    USER_DESIGN_SYSTEMS_DIR,
    DESIGN_TEMPLATES_DIR,
    USER_DESIGN_TEMPLATES_DIR,
    CRAFT_DIR,
    SKILLS_DIR,
    USER_SKILLS_DIR,
    PROMPT_TEMPLATES_DIR,
    BUNDLED_PETS_DIR,
    OD_BIN,
  };

  app.get('/api/health', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    res.json({ ok: true, version: versionInfo.version });
  });

  app.get('/api/ready', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    const ready = !daemonShuttingDown;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      ready,
      version: versionInfo.version,
    });
  });

  app.get('/api/version', async (_req, res) => {
    const version = await readCurrentAppVersionInfo();
    res.json({ version });
  });

  // Powered-preview isolation info. Reports the daemon's own directly-reachable
  // http origin so the web host can render WebGL/Worker/WASM/SharedArrayBuffer
  // artifacts in a cross-origin-isolated iframe (see the /powered route and
  // apps/web/src/runtime/powered-preview.ts). The web host always swaps this
  // loopback hostname before loading powered files; the /api origin middleware
  // then treats that swapped browser origin as preview-only.
  app.get('/api/preview/isolation', (_req, res) => {
    const reportHost = reportHostForPoweredPreview();
    const baseOrigin = resolvedPort ? `http://${reportHost}:${resolvedPort}` : null;
    res.setHeader('Cache-Control', 'no-store');
    /** @type {import('@open-design/contracts').ProjectPreviewIsolationResponse} */
    const body = {
      supported: Boolean(baseOrigin),
      baseOrigin,
      pathPrefix: 'powered',
    };
    res.json(body);
  });

  registerDaemonRoutes(app, {
    db,
    paths: { RUNTIME_DATA_DIR },
    http: { requireLocalDaemonRequest, sendApiError },
    host,
    getResolvedPort: () => resolvedPort,
    getDaemonShuttingDown: () => daemonShuttingDown,
    sandboxRuntime: SANDBOX_RUNTIME,
    env: process.env,
  });

  // Gate the diagnostics export behind requireLocalDaemonRequest so it stays
  // unreachable when daemon binds to a non-loopback address (Tailscale,
  // 0.0.0.0, etc.). The bundle contains daemon/web/desktop logs, host
  // metadata, and crash reports — same threat tier as connector / live-
  // artifact endpoints, which all use the same guard.
  app.get(
    DIAGNOSTICS_EXPORT_PATH,
    requireLocalDaemonRequest,
    createDiagnosticsExportHandler({
      runtime,
      projectRoot: PROJECT_ROOT,
      runsDir: path.join(RUNTIME_DATA_DIR, 'runs'),
      dataDir: RUNTIME_DATA_DIR,
    }),
  );

  const nodeDeps = { fs, path };
  const idDeps = { randomId, randomUUID };
  const uploadDeps = { upload, importUpload, handleProjectUpload };
  const projectStoreDeps = {
    getProject,
    insertProject,
    updateProject,
    dbDeleteProject,
    removeProjectDir,
    validateLinkedDirs,
  };
  const projectFileDeps = {
    ensureProject,
    listFiles,
    listProjectFolders,
    createProjectFolder,
    deleteProjectFolder,
    searchProjectFiles,
    readProjectFile,
    resolveProjectDir,
    resolveProjectFilePath,
    parseByteRange,
    renameProjectFile,
    deleteProjectFile,
    writeProjectFile,
    sanitizeName,
    sanitizePath,
    listTabs,
    setTabs,
  };
  const conversationDeps = {
    insertConversation,
    getConversation,
    listConversations,
    updateConversation,
    deleteConversation,
    listMessages,
    upsertMessage,
    listPreviewComments,
    upsertPreviewComment,
    updatePreviewCommentStatus,
    deletePreviewComment,
  };
  const templateDeps = { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate };
  const projectStatusDeps = {
    listLatestProjectRunStatuses,
    listProjectsAwaitingInput,
    normalizeProjectDisplayStatus,
    composeProjectDisplayStatus,
    listProjects,
  };
  const projectEventDeps = { subscribeFileEvents, activeProjectEventSinks };
  const importDeps = { importClaudeDesignZip, projectDir, detectEntryFile };
  const projectExportDeps = {
    buildProjectArchive,
    buildBatchArchive,
    buildDesktopPdfExportInput,
    buildDesktopArtifactExportInput,
    desktopPdfExporter,
    desktopSlideRenderer,
    desktopArtifactExporter,
    daemonUrlRef,
    sanitizeArchiveFilename,
  };
  const artifactDeps = {
    sanitizeSlug,
    lintArtifact,
    renderFindingsForAgent,
    validateArtifactManifestInput,
  };
  const mediaDeps = {
    MEDIA_PROVIDERS,
    IMAGE_MODELS,
    VIDEO_MODELS,
    AUDIO_MODELS_BY_KIND,
    MEDIA_ASPECTS,
    VIDEO_LENGTHS_SEC,
    AUDIO_DURATIONS_SEC,
    readMaskedConfig,
    writeConfig,
    generateMedia,
    mediaTasks: mediaTaskStore.mediaTasks,
    createMediaTask: mediaTaskStore.createMediaTask,
    persistMediaTask: mediaTaskStore.persistMediaTask,
    appendTaskProgress: mediaTaskStore.appendTaskProgress,
    notifyTaskWaiters: mediaTaskStore.notifyTaskWaiters,
    getLiveMediaTask: mediaTaskStore.getLiveMediaTask,
    mediaTaskSnapshot: mediaTaskStore.mediaTaskSnapshot,
    listMediaTasksByProject,
    listElevenLabsVoiceOptions,
  };
  const appConfigDeps = {
    readAppConfig,
    writeAppConfig,
    onAppConfigWritten: () => undefined,
  };
  const nativeDialogDeps = { openBrowser, openNativeFolderDialog };
  const researchDeps = { searchResearch, ResearchError };
  const liveArtifactDeps = {
    createLiveArtifact,
    listLiveArtifacts,
    updateLiveArtifact,
    refreshLiveArtifact,
    emitLiveArtifactEvent,
    emitLiveArtifactRefreshEvent,
    readLiveArtifactCode,
    setLiveArtifactCodeHeaders,
    ensureLiveArtifactPreview,
    setLiveArtifactPreviewHeaders,
    getLiveArtifact,
    listLiveArtifactRefreshLogEntries,
    deleteLiveArtifact,
  };
  const authDeps = {
    authorizeToolRequest,
    consumedImportNonces,
    desktopAuthSecret: getDesktopAuthSecret,
    isDesktopAuthGateActive,
    pruneExpiredImportNonces,
    optionalToolGrantFromRequest,
    requestProjectOverride,
    requestRunOverride,
    verifyDesktopImportToken,
  };
  const finalizeDeps = {
    defaultBaseUrlForFinalizeProtocol,
    finalizeDesignPackage,
    FinalizePackageLockedError,
    FinalizeUpstreamError,
    isFinalizeProviderProtocol,
    redactSecrets,
  };
  const handoffDeps = {
    daemonUrlRef,
    desktopArtifactExporter,
    desktopSlideRenderer,
    trustedRootStore: trustedHandoffRootStore,
  };
  const validationDeps = { isSafeId, validateExternalApiBaseUrl, validateBaseUrl, validateProjectDesignSystemId, validateProjectSkillId };
  const agentDeps = {
    listProviderModels,
    testProviderConnection,
    testAgentConnection,
    getAgentDef,
    isKnownModel,
    sanitizeCustomModel,
  };
  const critiqueDeps = {
    handleCritiqueArtifact,
    handleCritiqueInterrupt,
    critiqueArtifactsRoot: CRITIQUE_ARTIFACTS_DIR,
    critiqueResponseCapBytes: critiqueCfg.parserMaxBlockBytes,
    critiqueRunRegistry,
  };

  registerXaiRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
  });
  // OD Library — global asset registry (clipper ingest, grid, pairing, apply).
  registerLibraryRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    auth: authDeps,
  });
  app.post('/api/projects/:id/figma/import', (req, res) => {
    figmaUpload.single('file')(req, res, async (err) => {
      if (err) return sendMulterError(res, err);
      try {
        const project = getProject(db, req.params.id);
        if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const figmaUrl = typeof body.figmaUrl === 'string' ? body.figmaUrl.trim() : '';
        if (!req.file) {
          if (figmaUrl) {
            return sendApiError(
              res,
              409,
              'FIGMA_URL_NEEDS_MIGRATION',
              'Figma URL imports must run through the Figma migration flow.',
              { details: { figmaUrl } },
            );
          }
          return sendApiError(res, 400, 'BAD_REQUEST', 'file is required');
        }

        const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata);
        const notes = typeof body.notes === 'string' ? body.notes : undefined;
        const result = await importFigmaFromBytes(req.file.buffer, {
          cwd: projectRoot,
          label: decodeMultipartFilename(req.file.originalname || 'figma-import.fig'),
          notes,
        });
        return res.json(result);
      } catch (caught) {
        return sendApiError(
          res,
          400,
          'FIGMA_IMPORT_FAILED',
          caught instanceof Error ? caught.message : String(caught),
        );
      }
    });
  });
  registerProjectRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    templates: templateDeps,
    status: projectStatusDeps,
    events: projectEventDeps,
    ids: idDeps,
    appConfig: appConfigDeps,
    agents: agentDeps,
    validation: validationDeps,
  });
  registerTerminalRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    terminals: terminalService,
  });
  registerImportRoutes(app, {
    db,
    http: httpDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    ids: idDeps,
    paths: pathDeps,
    imports: importDeps,
    auth: authDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    projectFiles: projectFileDeps,
    validation: validationDeps,
  });

  // Resource catalog
  registerStaticResourceRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      mimeFor,
    },
    tokenContractRebuild: {
      maybeStartForImportedDesignSystem: async (designSystemId) => {
        const preparation = await prepareDesignTokenContractRebuild(
          USER_DESIGN_SYSTEMS_DIR,
          designSystemId,
        );
        if (!preparation.revision) return { decision: preparation.decision };
        const job = designSystemGenerationJobs.rebuildTokenContract({
          designSystemId,
          decision: preparation.decision,
          ...preparation.revision,
        });
        return { decision: preparation.decision, job };
      },
    },
  });
  registerDesignSystemRoutes(app, {
    db,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    designSystems: {
      buildUserDesignSystemArchive,
      createUserDesignSystem,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject,
      listAllDesignSystems,
      listUserDesignSystemFiles,
      listUserDesignSystemRevisions,
      prepareDesignTokenContractRebuild,
      readAvailableDesignSystem,
      readAvailableDesignSystemPackageInfo,
      readAvailableDesignSystemStaticFile,
      readDesignSystemWorkspaceTextFile,
      readUserDesignSystemFile,
      renderDesignSystemPreview,
      renderDesignSystemShowcase,
      updateUserDesignSystem,
      updateUserDesignSystemRevisionStatus,
    },
    generationJobs: designSystemGenerationJobs,
  });
  registerBrandRoutes(app, {
    brandsRoot: BRANDS_DIR,
    userDesignSystemsRoot: USER_DESIGN_SYSTEMS_DIR,
    projectsRoot: PROJECTS_DIR,
    skillsRoot: SKILLS_DIR,
    dataDir: RUNTIME_DATA_DIR,
    db,
    runs: design.runs,
    randomId,
    resolveTranscriptAgent: async () => {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      let agentId = typeof config.agentId === 'string' && config.agentId
        ? config.agentId
        : null;
      let detectedAgentName: string | null = null;
      if (!agentId) {
        const agents = await detectAgents(config.agentCliEnv ?? {}).catch(() => []);
        const available = agents.find((agent) => agent.available);
        agentId = available?.id ?? null;
        detectedAgentName = available?.name ?? null;
      }
      if (!agentId) return null;
      return {
        agentId,
        agentName: getAgentDef(agentId)?.name ?? detectedAgentName ?? agentId,
      };
    },
  });
  registerProjectArtifactRoutes(app, {
    http: httpDeps,
    uploads: uploadDeps,
    paths: pathDeps,
    node: nodeDeps,
    artifacts: artifactDeps,
  });
  registerLiveArtifactRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    auth: authDeps,
    liveArtifacts: liveArtifactDeps,
    projectStore: projectStoreDeps,
  });
  registerDesignSystemToolRoutes(app, {
    auth: authDeps,
    http: httpDeps,
    paths: pathDeps,
    projects: { getProject: (id: string) => getProject(db, id) },
  });
  app.use('/artifacts', express.static(ARTIFACTS_DIR));
  app.use(
    PLUGIN_PREVIEWS_ROUTE,
    express.static(PLUGIN_PREVIEWS_DIR, { maxAge: '1d', immutable: false }),
  );
  registerFinalizeRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    validation: validationDeps,
    finalize: finalizeDeps,
  });
  registerHandoffRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    validation: validationDeps,
    handoff: handoffDeps,
  });
  app.use('/frames', express.static(FRAMES_DIR));
  registerProjectExportRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    node: nodeDeps,
    ids: idDeps,
    projectStore: projectStoreDeps,
    exports: projectExportDeps,
    projectFiles: projectFileDeps,
    validation: validationDeps,
  });
  registerProjectFileRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    documents: { buildDocumentPreview },
    artifacts: artifactDeps,
    projectPreviewScopes,
  });

  registerMediaRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    auth: authDeps,
    media: mediaDeps,
    appConfig: appConfigDeps,
    nativeDialogs: nativeDialogDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    research: researchDeps,
  });

  const pluginRouteHelpers = {
    PLUGIN_PREVIEWS_DIR,
    applyBakedPreviews,
    assembleExample,
    loadPluginRegistryView,
    requireLocalDaemonRequest,
  };

  // Plan §3.A1: shared helper used by every endpoint that has to resolve
  // plugin context against the live registry. Skills + design systems are
  // walked from disk; craft is empty in v1; atoms come from the
  // first-party catalog. Project-scoped overrides arrive in Phase 4.
  async function loadPluginRegistryView() {
    const [skills, designSystems] = await Promise.all([
      listAllSkills(),
      listAllDesignSystems(),
    ]);
    // Spec §23.3.3: surface the bundled scenario plugins so apply()
    // can fall back to the matching scenario's pipeline when the
    // consumer plugin omits od.pipeline. Each scenario carries a
    // `taskKind` that picks the match.
    const scenarios = collectBundledScenarios();
    return {
      skills: skills.map((s) => ({ id: s.id, title: s.name, description: s.description })),
      designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
      craft: [],
      atoms: FIRST_PARTY_ATOMS.map((a) => ({ id: a.id, label: a.label })),
      scenarios,
    };
  }

  // Pure read off `installed_plugins`: rows whose source_kind='bundled'
  // AND od.kind='scenario' AND od.pipeline is non-empty become entries
  // the apply path can fall back to. Scenario plugins from third-party
  // sources are intentionally NOT trusted as defaults — the bundled
  // boot walker (apps/daemon/src/plugins/bundled.ts) is the only writer
  // of source_kind='bundled', so this function never grants the
  // privilege to user-installed scenarios.
  //
  // Plan §3.O1 / §C-stage of plugin-driven-flow-plan: more than one
  // bundled scenario may share a `taskKind` (e.g. `od-media-generation`
  // also claims `new-generation` so the kind → scenario map can route
  // image / video / audio projects to it). The pipeline-fallback
  // resolver expects ONE scenario per taskKind, so this function
  // dedupes and prefers the canonical id `od-<taskKind>` as the
  // pipeline-fallback winner. Non-canonical scenarios still install
  // and run through their explicit pluginId path; they just don't get
  // to hijack a consumer plugin that omitted `od.pipeline`.
  function collectBundledScenarios() {
    type ScenarioEntry = {
      id: string;
      taskKind: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
      pipeline: NonNullable<NonNullable<import('@open-design/contracts').PluginManifest['od']>['pipeline']>;
    };
    const byTaskKind = new Map<ScenarioEntry['taskKind'], ScenarioEntry>();
    try {
      const all = listInstalledPlugins(db);
      for (const row of all) {
        if (row.sourceKind !== 'bundled') continue;
        const od = row.manifest.od;
        if (!od || od.kind !== 'scenario') continue;
        if (!od.pipeline || !Array.isArray(od.pipeline.stages) || od.pipeline.stages.length === 0) continue;
        const taskKind = (od.taskKind ?? 'new-generation') as ScenarioEntry['taskKind'];
        if (taskKind !== 'new-generation' && taskKind !== 'figma-migration' &&
            taskKind !== 'code-migration' && taskKind !== 'tune-collab') continue;
        const entry: ScenarioEntry = { id: row.id, taskKind, pipeline: od.pipeline };
        const existing = byTaskKind.get(taskKind);
        if (!existing || entry.id === `od-${taskKind}`) {
          byTaskKind.set(taskKind, entry);
        }
      }
    } catch {
      // On a fresh install the table may not exist yet; surface no
      // scenarios rather than crash the apply path.
      return [];
    }
    return Array.from(byTaskKind.values());
  }

  registerPluginRoutes(app, {
    db,
    paths: { PROJECTS_DIR },
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    plugins: {
      listInstalledPlugins,
      getInstalledPlugin,
      applyPlugin,
      getSnapshot,
      pruneExpiredSnapshots,
      MissingInputError,
      pluginPromptBlock,
    },
    helpers: pluginRouteHelpers,
  });
  registerAtomRoutes(app, {
    db,
    resources: { FIRST_PARTY_ATOMS },
  });
  registerPluginAssetRoutes(app, {
    db,
    pluginAssetCache,
    AssetCacheError,
    assetCacheRewriteUrl,
    isCacheableExternalUrl,
    assembleExample,
  });

  registerGenuiRoutes(app, {
    db,
    design,
    paths: { PROJECTS_DIR },
  });

  registerProjectUploadRoutes(app, {
    db,
    http: httpDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    paths: { PROJECTS_DIR },
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
  });

  const composeDaemonSystemPrompt = async ({
    agentId,
    projectId,
    skillId,
    skillIds,
    designSystemId,
    streamFormat,
    locale,
    sessionMode,
    appliedPluginSnapshotId,
    mediaExecution,
    byokMediaDefaults,
    freeformDeckSignal,
    mediaHintSignal,
    platformHintSignal,
  }) => {
    const project =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    let appConfigForPrompt = null;
    try {
      appConfigForPrompt = await readAppConfig(RUNTIME_DATA_DIR);
    } catch (err) {
      console.warn('[app-config] readAppConfig failed', err);
    }
    let pluginDesignSystemId = null;
    if (
      typeof appliedPluginSnapshotId === 'string' &&
      appliedPluginSnapshotId.length > 0
    ) {
      try {
        pluginDesignSystemId = designSystemIdFromPluginSnapshot(
          getSnapshot(db, appliedPluginSnapshotId),
        );
      } catch (err) {
        console.warn(
          `[plugins] designSystem selection failed: ${err?.message ?? err}`,
        );
      }
    }
    const effectiveSkillId =
      typeof skillId === 'string' && skillId ? skillId : project?.skillId;
    const metadata = project?.metadata;
    // Website Clone runs reproduce someone else's site: the fidelity target
    // is the original page. Treating a project/app design system as
    // authoritative would overwrite the cloned site's palette/typography
    // with the user's brand, and universal craft rules would "improve"
    // visual decisions the clone must preserve verbatim — so both prompt
    // blocks are skipped for these runs. Step 6 of the skill (replace with
    // the user's own content) is where brand application belongs.
    const isWebCloneRun = metadata?.intent === 'web-clone';
    const designSystemSelection = isWebCloneRun
      ? { id: null, source: 'none' }
      : resolveEffectiveDesignSystemSelection({
          requestDesignSystemId: designSystemId,
          pluginDesignSystemId,
          projectDesignSystemId: project?.designSystemId,
          appDefaultDesignSystemId: appConfigForPrompt?.designSystemId,
          // A project row with designSystemId=null can mean the user picked
          // "No design system"; do not reapply the global default behind their back.
          allowAppDefault: project === null,
        });
    const effectiveDesignSystemId = designSystemSelection.id;
    let allSkillsPromise: ReturnType<typeof listAllSkillLikeEntries> | null = null;
    const loadAllSkills = async () => {
      allSkillsPromise ??= listAllSkillLikeEntries();
      return await allSkillsPromise;
    };

    // Per-turn skills picked via the composer's @-mention popover. They
    // never persist on the project — we just append their bodies after the
    // primary skill so the agent sees one combined block this turn.
    const effectiveCanonicalSkillId =
      typeof effectiveSkillId === 'string' && effectiveSkillId
        ? resolveSkillId(effectiveSkillId)
        : null;
    const adHocSkillIds = Array.isArray(skillIds)
      ? skillIds
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean)
          .filter((id) => resolveSkillId(id) !== effectiveCanonicalSkillId)
      : [];

    let skillBody;
    let skillName;
    let skillMode;
    const skillModes = new Set<NonNullable<Parameters<typeof composeSystemPrompt>[0]['skillMode']>>();
    let skillCraftRequires = [];
    let activeSkillDir = null;
    const activeSkillDirs: string[] = [];
    // Per-skill Critique Theater override sourced from
    // `od.critique.policy` in the resolved skill's SKILL.md frontmatter.
    // `null` means the skill has no opinion and the lower-priority tiers
    // (project override, env override, rollout phase default) decide.
    let skillCritiquePolicy: SkillCritiquePolicy = null;
    let critiqueSkillId = effectiveCanonicalSkillId;
    const registerSkillMode = (
      mode: NonNullable<Parameters<typeof composeSystemPrompt>[0]['skillMode']> | null | undefined,
    ) => {
      if (!mode) return;
      skillModes.add(mode);
    };
    const registerPrimarySkillMode = (
      mode: NonNullable<Parameters<typeof composeSystemPrompt>[0]['skillMode']> | null | undefined,
    ) => {
      if (!mode) return;
      skillMode ??= mode;
      registerSkillMode(mode);
    };
    const registerSkillDir = (dir: string | null | undefined) => {
      if (typeof dir !== 'string' || dir.length === 0) return;
      if (!activeSkillDir) activeSkillDir = dir;
      if (!activeSkillDirs.includes(dir)) activeSkillDirs.push(dir);
    };
    const mergeSkillCritiquePolicy = (
      current: SkillCritiquePolicy,
      next: SkillCritiquePolicy,
    ): SkillCritiquePolicy => {
      if (next === 'opt-out') return 'opt-out';
      if (next === 'required') return current === 'opt-out' ? current : 'required';
      if (next === 'opt-in') {
        return current === 'required' || current === 'opt-out' ? current : 'opt-in';
      }
      return current;
    };
    if (effectiveSkillId) {
      // Span both functional skills and design templates so a project
      // saved against either surface keeps its system prompt after the
      // skills/design-templates split. See specs/current/skills-and-design-templates.md.
      const allSkills = await loadAllSkills();
      const skill = findSkillById(allSkills, effectiveSkillId);
      if (skill) {
        skillBody = skill.body;
        skillName = skill.name;
        registerPrimarySkillMode(skill.mode);
        registerSkillDir(skill.dir);
        skillCritiquePolicy = mergeSkillCritiquePolicy(
          skillCritiquePolicy,
          skill.critiquePolicy,
        );
        if (Array.isArray(skill.craftRequires))
          skillCraftRequires = skill.craftRequires;
      }
    }
    let composedSkillBlocks = '';
    if (adHocSkillIds.length > 0) {
      const allSkills = await loadAllSkills();
      const seen = new Set(
        effectiveCanonicalSkillId ? [String(effectiveCanonicalSkillId)] : [],
      );
      const blocks = [];
      const baseBody = skillBody && skillBody.trim().length > 0 ? skillBody : '';
      for (const id of adHocSkillIds) {
        const canonicalId = resolveSkillId(id);
        if (typeof canonicalId !== 'string' || canonicalId.length === 0) continue;
        if (seen.has(canonicalId)) continue;
        seen.add(canonicalId);
        const extra = findSkillById(allSkills, id);
        if (!extra) continue;
        registerSkillDir(extra.dir);
        registerSkillMode(extra.mode);
        if (!effectiveCanonicalSkillId && adHocSkillIds.length === 1) {
          registerPrimarySkillMode(extra.mode);
        }
        if (!critiqueSkillId || extra.critiquePolicy !== null) critiqueSkillId = canonicalId;
        skillCritiquePolicy = mergeSkillCritiquePolicy(
          skillCritiquePolicy,
          extra.critiquePolicy,
        );
        if (Array.isArray(extra.craftRequires)) {
          for (const craft of extra.craftRequires) {
            if (!skillCraftRequires.includes(craft)) skillCraftRequires.push(craft);
          }
        }
        blocks.push(
          `\n\n---\n\n## Composed skill — ${extra.name || id}\n\n${(extra.body || '').trim()}`,
        );
      }
      if (blocks.length > 0) {
        composedSkillBlocks = blocks.join('');
        skillBody = baseBody + composedSkillBlocks;
        if (!skillName) {
          skillName = adHocSkillIds.length === 1
            ? findSkillById(allSkills, adHocSkillIds[0])?.name ?? null
            : 'composed';
        }
      }
    }

    // Stage A of plugin-driven-flow-plan: when the run is bound to a
    // plugin snapshot, prefer the plugin's local SKILL.md (declared via
    // `od.context.skills[{ path: './SKILL.md' }]`) over the global
    // skill. Without this override the agent loses the plugin's
    // template / token / layout rules and falls back to generic prompt
    // behaviour even though the user explicitly applied the plugin.
    if (
      typeof appliedPluginSnapshotId === 'string'
      && appliedPluginSnapshotId.length > 0
    ) {
      try {
        const snap = getSnapshot(db, appliedPluginSnapshotId);
        if (snap?.pluginId) {
          const { getSnapshotContextCraft } = await import('./plugins/context-craft.js');
          for (const craft of getSnapshotContextCraft(snap)) {
            if (!skillCraftRequires.includes(craft)) skillCraftRequires.push(craft);
          }
          const plugin = getInstalledPlugin(db, snap.pluginId);
          if (plugin) {
            const { loadPluginLocalSkill } = await import('./plugins/local-skill.js');
            const local = await loadPluginLocalSkill(plugin);
            if (local) {
              skillBody = local.body + composedSkillBlocks;
              skillName = local.name;
              activeSkillDir = local.dir;
              registerSkillDir(local.dir);
            } else {
              // The plugin references a shared global skill by id
              // (`od.context.skills[{ ref: '<skill-id>' }]`) instead of
              // shipping its own SKILL.md — resolve it from the global
              // registry so the pinned plugin still gets the skill body AND
              // its companion dir staged into the project cwd (scripts, etc).
              // Lets many example plugins share one skill without each
              // duplicating the SKILL.md and its scripts.
              const skillRef = plugin.manifest?.od?.context?.skills?.find(
                (ref): ref is { ref: string } =>
                  typeof (ref as { ref?: unknown })?.ref === 'string'
                  && (ref as { ref: string }).ref.trim().length > 0,
              )?.ref?.trim();
              if (skillRef) {
                const allSkills = await loadAllSkills();
                const refSkill = findSkillById(allSkills, skillRef);
                if (refSkill) {
                  skillBody = refSkill.body + composedSkillBlocks;
                  skillName = refSkill.name;
                  activeSkillDir = refSkill.dir;
                  registerPrimarySkillMode(refSkill.mode);
                  registerSkillDir(refSkill.dir);
                  skillCritiquePolicy = mergeSkillCritiquePolicy(
                    skillCritiquePolicy,
                    refSkill.critiquePolicy,
                  );
                  if (Array.isArray(refSkill.craftRequires)) {
                    for (const craft of refSkill.craftRequires) {
                      if (!skillCraftRequires.includes(craft)) skillCraftRequires.push(craft);
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(
          `[plugins] pluginSkillBody load failed: ${err?.message ?? err}`,
        );
      }
    }

    let craftBody;
    let craftSections;

    // Personal-memory body is always recomputed at compose time so a
    // memory the user just edited in settings shows up on the very next
    // run. composeMemoryBody returns '' when memory is disabled or
    // empty; the composer drops the block on a falsy value.
    let memoryBody = '';
    try {
      memoryBody = await composeMemoryBody(RUNTIME_DATA_DIR);
    } catch (err) {
      console.warn('[memory] composeMemoryBody failed', err);
    }

    // Per-hook switches for the two-loop memory feature. Read alongside the
    // memory body so the composer can gate the PRE intent-gateway brief and
    // the POST self-verify scorecard on the same config the settings panel
    // writes. Read failure falls through to undefined hooks, which the
    // composer treats as on-by-default — matching the config's default-on
    // semantics.
    let memoryHooks: { profile?: boolean; rewrite?: boolean; verify?: boolean } | undefined;
    try {
      const memCfg = await readMemoryConfig(RUNTIME_DATA_DIR);
      memoryHooks = {
        profile: memCfg.profileEnabled,
        rewrite: memCfg.rewriteEnabled,
        verify: memCfg.verifyEnabled,
      };
    } catch (err) {
      console.warn('[memory] readMemoryConfig failed', err);
    }

    // User-level custom instructions from app-config.json.
    let userInstructions = '';
    if (appConfigForPrompt?.customInstructions) {
      userInstructions = appConfigForPrompt.customInstructions;
    }

    let designSystemBody;
    let designSystemTitle;
    // Compiled (tokens.css + components manifest / components.html)
    // form of the active brand.
    // Default-on as of PR-D — every chat that picks a brand with
    // `tokens.css` + `components.html` siblings (today: `default` and
    // `kami`; every other brand falls through silently because the
    // files are absent) gets the structured token contract appended to
    // the system prompt automatically.
    //
    // `OD_DESIGN_TOKEN_CHANNEL=0` is the kill switch: it forces the
    // daemon back to the pre-PR-C DESIGN.md-only path for every brand,
    // including the structured ones. Any other value (unset, `1`,
    // `true`, etc.) keeps the new default. Drift on prose-only brands
    // is pinned by `scripts/check-design-system-flag-parity.ts`.
    let designSystemUsageMd;
    let designSystemTokensCss;
    let designSystemComponentsManifest;
    let designSystemFixtureHtml;
    let designSystemPullIndex;
    let designSystemImportMode;
    let designSystemCraftApplies = [];
    let designSystemCraftExemptions = [];
    let activeDesignSystemId = null;
    let designSystemDigest = null;
    if (effectiveDesignSystemId) {
      let systems = await listAllDesignSystems();
      let summary = systems.find((s) => s.id === effectiveDesignSystemId);
      if (summary?.source === 'user') {
        await ensureUserDesignSystemWorkspaceProject(db, effectiveDesignSystemId);
        systems = await listAllDesignSystems();
        summary = systems.find((s) => s.id === effectiveDesignSystemId);
      }
      const editingOwnDraftDesignSystem =
        project?.metadata?.importedFrom === 'design-system'
        && project.designSystemId === effectiveDesignSystemId;
      designSystemTitle = summary?.title;
      if (summary && (isProjectUsableDesignSystem(summary) || editingOwnDraftDesignSystem)) {
        const workspaceBody = await readDesignSystemWorkspaceTextFile(db, summary, 'DESIGN.md');
        const registryBody = await readAvailableDesignSystem(effectiveDesignSystemId);
        designSystemBody = (workspaceBody ?? registryBody) ?? undefined;
        // Single seam: env gate + built-in→user-installed fallback chain
        // live together inside `resolveDesignSystemAssets` so the whole
        // server-side asset-resolution path can be tested end-to-end
        // from real disk fixtures (see `tests/design-system-assets.test.ts`).
        const assets = await resolveDesignSystemAssets(
          effectiveDesignSystemId,
          DESIGN_SYSTEMS_DIR,
          USER_DESIGN_SYSTEMS_DIR,
        );
        designSystemUsageMd = assets.usageMd;
        designSystemTokensCss = assets.tokensCss;
        designSystemComponentsManifest = assets.componentsManifest;
        designSystemFixtureHtml = assets.fixtureHtml;
        designSystemPullIndex = assets.pullIndex;
        designSystemImportMode = assets.importMode;
        designSystemCraftApplies = Array.isArray(assets.craftApplies) ? assets.craftApplies : [];
        designSystemCraftExemptions = Array.isArray(assets.craftExemptions) ? assets.craftExemptions : [];
        if (typeof designSystemBody === 'string' && designSystemBody.length > 0) {
          activeDesignSystemId = effectiveDesignSystemId;
          designSystemDigest = digestDesignSystemContext({
            id: effectiveDesignSystemId,
            title: designSystemTitle,
            body: designSystemBody,
            usageMd: designSystemUsageMd,
            tokensCss: designSystemTokensCss,
            componentsManifest: designSystemComponentsManifest,
            fixtureHtml: designSystemFixtureHtml,
            pullIndex: designSystemPullIndex,
            importMode: designSystemImportMode,
          });
        }
      }
    }

    const excludedCraft = new Set(designSystemCraftExemptions);
    // Web-clone fidelity exemption — see `isWebCloneRun` above.
    const requestedCraft = isWebCloneRun
      ? []
      : Array.from(
          new Set([...skillCraftRequires, ...designSystemCraftApplies]),
        ).filter((slug) => !excludedCraft.has(slug));
    if (requestedCraft.length > 0) {
      const loaded = await loadCraftSections(CRAFT_DIR, requestedCraft);
      if (loaded.body) {
        craftBody = loaded.body;
        craftSections = loaded.sections;
      }
    }

    const template =
      metadata?.kind === 'template' && typeof metadata.templateId === 'string'
        ? (getTemplate(db, metadata.templateId) ?? undefined)
        : undefined;
    let audioVoiceOptions = [];
    let audioVoiceOptionsError;
    if (
      metadata?.kind === 'audio' &&
      metadata?.audioKind === 'speech' &&
      metadata?.audioModel === 'elevenlabs-v3' &&
      !metadata?.voice
    ) {
      try {
        audioVoiceOptions = await listElevenLabsVoiceOptions(PROJECT_ROOT, { limit: 100 });
      } catch (err) {
        audioVoiceOptionsError = err && err.message ? err.message : String(err);
        console.warn('[elevenlabs] voice option lookup failed:', audioVoiceOptionsError);
      }
    }

    // Thread the critique config plus the active design-system / skill data
    // into the composer when critique is enabled. Without this the spawned
    // child receives the legacy single-pass prompt and the parser waits for
    // <CRITIQUE_RUN> tags the model was never told to emit. The composer
    // itself ignores these fields when the top-line gate is false, so the
    // legacy path stays untouched.
    //
    // Top-line gate (post-Phase-15 wireup): the daemon now routes every
    // candidate run through the rollout resolver instead of reading the
    // env-var flag directly. The resolver carries the full priority
    // matrix: skill `od.critique.policy` veto > project override > env
    // override > rollout phase default. On a fresh install with M0
    // dark-launch defaults the resolver returns `false`, so prod traffic
    // is unchanged until an operator flips the env var or a project
    // opts in. The skill-policy input is sourced from
    // `od.critique.policy` in the active skill's SKILL.md frontmatter
    // (parsed in `skills.ts:normalizeCritiquePolicy`). The project
    // override input is sourced from the `critiqueTheaterEnabled`
    // field on the project's metadata blob, which is what the M1
    // Settings toggle writes through the existing settings endpoint.
    // Both inputs collapse to `null` when the skill / project has
    // not expressed an opinion, which is the resolver's "fall through
    // to env / phase default" signal.
    // Per-project override: the M1 Settings toggle writes
    // `critiqueTheaterEnabled` onto the project's metadata blob via
    // the existing settings round-trip. A boolean wins outright; any
    // other type (missing key, malformed value) collapses to `null`
    // so the resolver falls through to the env / phase tiers exactly
    // the way it did when the toggle had never been touched.
    const projectCritiqueOverride = narrowProjectCritiqueOverride(metadata);
    const critiqueEnabledForRun = isCritiqueEnabled({
      phase: parseRolloutPhase(process.env.OD_CRITIQUE_ROLLOUT_PHASE),
      skillPolicy: skillCritiquePolicy,
      projectOverride: projectCritiqueOverride,
      envOverride: parseEnvEnabled(process.env.OD_CRITIQUE_ENABLED),
    });
    const critiqueBrand = critiqueEnabledForRun
      && typeof designSystemTitle === 'string'
      && typeof designSystemBody === 'string'
      ? { name: designSystemTitle, design_md: designSystemBody }
      : undefined;
    const critiqueSkill = critiqueEnabledForRun && typeof critiqueSkillId === 'string'
      ? { id: critiqueSkillId }
      : undefined;
    // Single-source-of-truth eligibility check. The composer downstream
    // appends <CRITIQUE_RUN> instructions only when this check passes, and
    // the spawn path routes runs through runOrchestrator(...) only when the
    // SAME flag is true, so prompt and orchestrator stay in lockstep.
    //
    // Non-plain adapters (claude-stream-json, json-event-stream, pi-rpc)
    // emit their own wrapper
    // protocol; the v1 critique parser only understands plain stdout. The
    // spawn path falls through to legacy generation for those, so the
    // panel addendum has to be suppressed here too: otherwise the model
    // is instructed to emit Critique Theater tags that no orchestrator
    // consumes.
    const resolvedExclusiveSurface = resolveExclusiveSurface({
      metadata,
      skillMode,
      skillModes: skillModes.size > 0 ? Array.from(skillModes) : undefined,
    });
    const isMediaSurface =
      resolvedExclusiveSurface === 'image'
      || resolvedExclusiveSurface === 'video'
      || resolvedExclusiveSurface === 'audio';
    const isPlainAdapter = (streamFormat ?? 'plain') === 'plain';
    const critiqueShouldRun = critiqueEnabledForRun
      && critiqueBrand !== undefined
      && critiqueSkill !== undefined
      && !isMediaSurface
      && isPlainAdapter;
    // Only thread the critique fields when the run is actually eligible;
    // otherwise the composer's own internal eligibility check (cfg.enabled
    // && brand && skill && !isMediaSurface) might still fire on
    // non-plain adapters and we'd emit the panel for a run the orchestrator
    // skips. Gating the threading itself keeps composer + orchestrator in
    // exact lockstep regardless of which side enforces eligibility.
    let pluginBlock;
    if (
      typeof appliedPluginSnapshotId === 'string'
      && appliedPluginSnapshotId.length > 0
    ) {
      try {
        const snap = getSnapshot(db, appliedPluginSnapshotId);
        if (snap) pluginBlock = pluginPromptBlock(snap);
      } catch (err) {
        console.warn(
          `[plugins] pluginBlock build failed: ${err?.message ?? err}`,
        );
      }
    }

    // Plan §3.M2 / §3.V1 / spec §23.4 — render each stage's atoms[]
    // into `## Active stage` blocks via the contracts helper when
    // the run carries a snapshot with a pipeline. Default is now ON
    // (flipped in §3.V1 once the bundled SKILL.md fragments covered
    // every Phase 6/7/8 atom); set OD_BUNDLED_ATOM_PROMPTS=0 to opt
    // out (the runs that need pre-§3.V1 byte-equal prompts: snapshot
    // replay against an older daemon, regression-bisects).
    let activeStageBlocks;
    const bundledAtomPromptsEnabled = process.env.OD_BUNDLED_ATOM_PROMPTS !== '0';
    if (
      bundledAtomPromptsEnabled
      && typeof appliedPluginSnapshotId === 'string'
      && appliedPluginSnapshotId.length > 0
    ) {
      try {
        const snap = getSnapshot(db, appliedPluginSnapshotId);
        const stages = snap?.pipeline?.stages ?? [];
        if (stages.length > 0) {
          const { loadAtomBodies } = await import('./plugins/atom-bodies.js');
          const { renderActiveStageBlock } = await import('@open-design/contracts');
          const blocks = [];
          for (const stage of stages) {
            const bodies = await loadAtomBodies(db, stage.atoms ?? []);
            const block = renderActiveStageBlock({ stageId: stage.id, bodies });
            if (block.trim().length > 0) blocks.push(block);
          }
          if (blocks.length > 0) activeStageBlocks = blocks;
        }
      } catch (err) {
        console.warn(`[plugins] activeStageBlocks build failed: ${(err)?.message ?? err}`);
      }
    }

    const prompt = composeSystemPrompt({
      agentId,
      includeCodexImagegenOverride: false,
      skillBody,
      skillName,
      skillMode,
      skillModes: skillModes.size > 0 ? Array.from(skillModes) : undefined,
      designSystemBody,
      designSystemTitle,
      designSystemUsageMd,
      designSystemTokensCss,
      designSystemComponentsManifest,
      designSystemFixtureHtml,
      designSystemPullIndex,
      designSystemImportMode,
      craftBody,
      craftSections,
      memoryBody,
      memoryHooks,
      metadata,
      template,
      audioVoiceOptions,
      audioVoiceOptionsError,
      // critiqueCfg.enabled is loaded from OD_CRITIQUE_ENABLED only, so a
      // run that the resolver enabled via phase / project / skill (env
      // unset) would have critiqueShouldRun = true while critiqueCfg.enabled
      // remains false. Without this override the composer's own gate
      // (cfg.enabled) drops the panel addendum, the orchestrator still
      // launches, and the parser waits for <CRITIQUE_RUN> tags the model
      // was never told to emit (codex P2 on PR #1338). Build a derived
      // config that pins enabled to the resolver decision so the composer
      // and the orchestrator agree on every eligibility input.
      critique: critiqueShouldRun ? { ...critiqueCfg, enabled: true } : undefined,
      critiqueBrand: critiqueShouldRun ? critiqueBrand : undefined,
      critiqueSkill: critiqueShouldRun ? critiqueSkill : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      sessionMode: normalizeConversationSessionMode(sessionMode),
      mediaExecution,
      byokMediaDefaults,
      streamFormat,
      executionProfile: executionProfileFromStreamFormat(streamFormat),
      ...(pluginBlock ? { pluginBlock } : {}),
      ...(activeStageBlocks ? { activeStageBlocks } : {}),
      userInstructions,
      freeformDeckSignal,
      mediaHintSignal,
      platformHintSignal,
      // VALIDATION DEFAULT — feat/system-prompt integration branch only.
      // Slim is the default here so packaged beta builds exercise the
      // rewritten charter without env plumbing (the packaged sidecar env
      // allowlist does not forward OD_PROMPT_CORE); OD_PROMPT_CORE=classic
      // restores the classic stack. main keeps classic as the default —
      // do NOT carry this flip into a PR against main.
      promptCoreVariant: process.env.OD_PROMPT_CORE === 'classic' ? undefined : 'slim',
    });
    // The chat handler also needs to know where the active skill lives
    // on disk so it can stage a per-project copy of its side files
    // before spawning the agent. Returning that here avoids a second
    // `listSkills()` scan in `startChatRun`. critiqueShouldRun threads
    // the same panel-eligibility decision down to the spawn-path
    // orchestrator gate so prompt and orchestrator stay in lockstep.
    return {
      prompt,
      activeSkillDir,
      activeSkillDirs,
      critiqueShouldRun,
      designSystemSelection: {
        id: activeDesignSystemId,
        requestedId: effectiveDesignSystemId,
        source: activeDesignSystemId ? designSystemSelection.source : 'none',
        digest: designSystemDigest,
      },
    };
  };

  // Plan §3.I1 / §3.D / spec §10.1: fire the pipeline schedule on a
  // run's SSE stream. Synchronous first emit (the first
  // pipeline_stage_started event lands before the agent process
  // starts) + async tail. Stage D wires the atom-worker registry as
  // the default stage runner; set OD_PIPELINE_RUNNER=stub to fall
  // back to the canned v1 stub for diagnostic bisection or replay
  // of pre-Stage-D runs. Errors are swallowed (logged) so a bad
  // pipeline never blocks the agent run.
  const firePipelineForRun = (args) => {
    const { run, snapshot, runs, db: dbHandle } = args;
    if (!snapshot?.pipeline?.stages?.length) return;
    const env = { maxIterations: readPluginEnvKnobs().maxDevloopIterations };
    const emitPipeline = (evt) => {
      try { runs.emit(run, evt.kind, evt); } catch {/* ignore */}
    };
    const emitGenui = (evt) => {
      try { runs.emit(run, evt.kind, evt); } catch {/* ignore */}
    };
    const projectIdForRun = run.projectId
      ?? snapshot.resolvedContext?.items?.[0]?.id
      ?? 'project-unknown';
    const runnerMode = process.env.OD_PIPELINE_RUNNER === 'stub'
      ? 'stub'
      : 'registry';
    let runStage;
    if (runnerMode === 'stub') {
      runStage = ({ iteration }) => ({
        signals: {
          'critique.score':  iteration >= 0 ? 4 : 0,
          'preview.ok':      true,
          'user.confirmed':  true,
        },
      });
    } else {
      registerBuiltInAtomWorkers();
      runStage = async ({ stage, iteration, snapshot: stageSnapshot }) => {
        const outcome = await runStageWithRegistry({
          db:             dbHandle,
          runId:          run.id,
          projectId:      projectIdForRun,
          conversationId: run.conversationId ?? null,
          stage,
          iteration,
          snapshot:       stageSnapshot,
          runEvents:      run.events,
        });
        return {
          signals:         outcome.signals,
          critiqueSummary: outcome.critiqueSummary,
          tokensUsed:      outcome.tokensUsed,
        };
      };
    }
    const pipelineDone = runPipelineForRun({
      db: dbHandle,
      runId:           run.id,
      projectId:       projectIdForRun,
      conversationId:  run.conversationId ?? null,
      snapshot,
      pipeline:        snapshot.pipeline,
      env,
      runStage,
      emitPipeline,
      emitGenui,
    }).catch((err) => {
      try {
        runs.emit(run, 'pipeline_stage_failed', {
          runId:      run.id,
          snapshotId: snapshot.snapshotId,
          message:    String(err?.message ?? err),
        });
      } catch { /* ignore */ }
    });
    void Promise.all([runs.wait(run), pipelineDone])
      .then(() => {
        const tokensUsed = scanRunEventsForUsage(run.events, null, 0).total_tokens ?? null;
        if (tokensUsed === null) return;
        dbHandle.prepare(
          'UPDATE run_devloop_iterations SET tokens_used = ? WHERE run_id = ?',
        ).run(tokensUsed, run.id);
      })
      .catch((err) => {
        console.warn('[plugins] devloop tokens_used reconciliation failed', err);
      });
  };

  const startChatRun = async (chatBody, run) => {
    /** @type {Partial<ChatRequest> & { imagePaths?: string[] }} */
    chatBody = chatBody || {};
    const {
      agentId,
      message,
      currentPrompt,
      systemPrompt,
      imagePaths = [],
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId,
      skillId,
      skillIds,
      designSystemId,
      sessionMode,
      attachments = [],
      commentAttachments = [],
      model,
      reasoning,
      locale,
      research,
      context,
      titleGeneration,
      byokProvider,
      byokMediaDefaults,
    } = chatBody;
    if (typeof projectId === 'string' && projectId) run.projectId = projectId;
    if (typeof conversationId === 'string' && conversationId)
      run.conversationId = conversationId;
    if (typeof assistantMessageId === 'string' && assistantMessageId)
      run.assistantMessageId = assistantMessageId;
    if (typeof clientRequestId === 'string' && clientRequestId)
      run.clientRequestId = clientRequestId;
    if (typeof agentId === 'string' && agentId) run.agentId = agentId;
    if (typeof model === 'string' && model) run.model = model;
    if (typeof reasoning === 'string' && reasoning) run.reasoning = reasoning;
    if (typeof skillId === 'string' && skillId) run.skillId = skillId;
    if (typeof designSystemId === 'string' && designSystemId)
      run.designSystemId = designSystemId;
    const conversationSession =
      typeof conversationId === 'string' && conversationId
        ? getConversation(db, conversationId)
        : null;
    const runSessionMode =
      sessionMode === 'chat' || sessionMode === 'design' || sessionMode === 'plan'
        ? normalizeConversationSessionMode(sessionMode)
        : normalizeConversationSessionMode(conversationSession?.sessionMode);
    const def = getAgentDef(agentId);
    if (!def)
      return design.runs.fail(
        run,
        'AGENT_UNAVAILABLE',
        `unknown agent: ${agentId}`,
      );
    const isInternalByokRequest =
      isCleanDesignInternalAgent(def.id) && def.id === 'byok-opencode';
    if (!isCleanDesignPublicAgent(def) && !isInternalByokRequest) {
      return design.runs.fail(run, 'AGENT_UNAVAILABLE', `agent unavailable: ${agentId}`);
    }
    if (!def.bin)
      return design.runs.fail(run, 'AGENT_UNAVAILABLE', 'agent has no binary');
    const byokOpenCodeProvider = def.id === 'byok-opencode'
      ? buildOpenCodeByokProviderConfig(
          byokProvider,
          typeof model === 'string' ? model : null,
        )
      : null;
    if (def.id === 'byok-opencode' && !byokOpenCodeProvider) {
      return design.runs.fail(
        run,
        'BYOK_PROVIDER_REQUIRED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    // Validate the checked-in `inactivityTimeoutMs` hint immediately
    // after the runtime def is selected and before any side-effectful
    // setup (auto-memory extract, `.mcp.json` write/unlink,
    // composeSystemPrompt, prompt persistence). A bad def value would
    // otherwise abort the run only at watchdog-arm time, after that
    // setup has already mutated local state, leaving confusing partial
    // residue behind (issue #2467 review on PR #2579).
    //
    // Catch is intentionally narrowed to `RangeError`, the only kind
    // `assertValidRuntimeDefInactivityTimeoutMs` is allowed to throw
    // for invalid checked-in values. Anything else (a regression that
    // makes the helper throw on a valid value, an unrelated bug
    // introduced while touching this path) should bubble up to the
    // outer chat-run starter — which surfaces it as
    // `AGENT_EXECUTION_FAILED` — rather than being misreported as
    // "the runtime def is bad" and burying the real failure.
    try {
      assertValidRuntimeDefInactivityTimeoutMs(def.inactivityTimeoutMs);
    } catch (err) {
      if (err instanceof RangeError) {
        return design.runs.fail(run, 'AGENT_RUNTIME_DEF_INVALID', err.message);
      }
      throw err;
    }
    const safeCommentAttachments =
      normalizeCommentAttachments(commentAttachments);
    if (
      (typeof message !== 'string' || !message.trim()) &&
      safeCommentAttachments.length === 0
    ) {
      return design.runs.fail(run, 'BAD_REQUEST', 'message required');
    }
    const browserUseRunState = buildBrowserUseRunState({
      requested: isBrowserUseRequested(message, currentPrompt, systemPrompt),
      agentId: def.id,
    });
    if (browserUseRunState) {
      run.browserUse = browserUseRunState;
      design.runs.emit(run, 'diagnostic', {
        type: 'browser_use_unavailable',
        ...browserUseRunState,
      });
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
    const runId = run.id;

    // Auto-memory hook. Pulls explicit "remember:" / "我是 X" / "I prefer Y"
    // markers out of the just-arrived user message and writes them as MD
    // files under <dataDir>/memory/. We await so the very next
    // composeSystemPrompt() call (a few lines below) re-reads memory from
    // disk and a marker inside this turn's message is reflected in this
    // turn's prompt. Failures are swallowed — memory is best-effort and
    // must never block the agent run.
    if (
      (run.retryAttemptCount ?? 0) === 0 &&
      typeof message === 'string' &&
      message.trim().length > 0
    ) {
      try {
        await extractFromMessage(RUNTIME_DATA_DIR, message);
      } catch (err) {
        console.warn('[memory] extractFromMessage failed', err);
      }
    }

    // Resolve the project working directory (creating the folder if it
    // doesn't exist yet). Without one we don't pass cwd to spawn — the
    // agent then runs in whatever inherited dir, which still lets API
    // mode work but loses file-tool addressability.
    // Project directory resolution lives in projects.ts so sandbox mode can
    // consistently reject imported-folder metadata that has no managed copy.
    let cwd = null;
    let existingProjectFiles = [];
    let existingProjectFolders = [];
    if (typeof projectId === 'string' && projectId) {
      try {
        const chatProject = getProject(db, projectId);
        const chatMeta = chatProject?.metadata;
        // ensureProject/resolveProjectDir now resolve external baseDir folders
        // internally (and assertSandboxProjectRootAvailable rejects imported
        // folders with no managed copy in sandbox mode), so we pass chatMeta
        // through instead of branching on baseDir here.
        assertSandboxProjectRootAvailable(chatMeta);
        cwd = await ensureProject(PROJECTS_DIR, projectId, chatMeta);
        existingProjectFiles = await listFiles(PROJECTS_DIR, projectId, { metadata: chatMeta });
        existingProjectFolders = await listProjectFolders(PROJECTS_DIR, projectId, { metadata: chatMeta });
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return design.runs.fail(run, 'BAD_REQUEST', err.message);
        }
        cwd = null;
        existingProjectFiles = [];
        existingProjectFolders = [];
      }
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;

    // Sanitise supplied image paths: must live under UPLOAD_DIR and stay
    // below the prompt-image safety cap.
    const { safeImages, oversizedImages, failedImages } =
      resolveSafePromptImagePaths(imagePaths);
    if (oversizedImages.length > 0) {
      return design.runs.fail(
        run,
        'BAD_REQUEST',
        'Image attachments must be 1 MB or smaller.',
      );
    }
    if (failedImages.length > 0) {
      return design.runs.fail(
        run,
        'INTERNAL_ERROR',
        'Failed to read one or more image attachments.',
      );
    }
    const agentImagePaths = safeImages;

    // Project-scoped attachments: project-relative paths inside cwd. Each
    // is run through the same path-traversal guard the file CRUD endpoints
    // use, then existence-checked. Whatever survives shows up as an
    // explicit list at the bottom of the user message so the agent knows
    // to Read it.
    const safeAttachments = cwd
      ? resolveSafeProjectAttachments(cwd, attachments)
      : [];
    run.projectAttachmentPaths = safeAttachments;

    // Local code agents don't accept a separate "system" channel the way the
    // Messages API does — we fold the skill + design-system prompt into the
    // user message. The <artifact> wrapping instruction comes from
    // systemPrompt. We also stitch in the cwd hint so the agent knows
    // where its file tools should write, and the attachment list so it
    // doesn't have to guess what the user just dropped in.
    const projectRecord =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    const runContextPrompt = renderRunContextPrompt(context, projectRecord?.metadata);
    const linkedDirs = (() => {
      if (!Array.isArray(projectRecord?.metadata?.linkedDirs)) return [];
      const v = validateLinkedDirs(projectRecord.metadata.linkedDirs);
      return v.dirs ?? [];
    })();
    const cwdHint = cwd
      ? formatDesignFilesWorkspaceHint(cwd, existingProjectFiles, existingProjectFolders)
      : '';
    const linkedDirsHint = linkedDirs.length > 0
      ? `\n\nLinked code folders (read-only reference code the user wants you to see):\n${
          linkedDirs.map((d) => `- \`${d}\``).join('\n')
        }`
      : '';
    const attachmentHint = formatProjectAttachmentHint(safeAttachments);
    // Plan §3.A3 / spec §9: thread plugin context onto every tool token
    // so the connector execute route can re-validate the §5.3
    // capability gate without re-reading the SQLite snapshot row.
    let pluginGrantContext = null;
    if (cwd && typeof projectId === 'string' && projectId && run?.appliedPluginSnapshotId) {
      const snap = getSnapshot(db, run.appliedPluginSnapshotId);
      if (snap) {
        const installed = getInstalledPlugin(db, snap.pluginId);
        pluginGrantContext = {
          pluginSnapshotId: snap.snapshotId,
          pluginTrust: installed?.trust ?? 'restricted',
          pluginCapabilitiesGranted: snap.capabilitiesGranted ?? [],
        };
      }
    }
    const toolTokenGrant = cwd && typeof projectId === 'string' && projectId
      ? toolTokenRegistry.mint({
          runId,
          projectId,
          allowedEndpoints: CHAT_TOOL_ENDPOINTS,
          allowedOperations: CHAT_TOOL_OPERATIONS,
          ...(pluginGrantContext ?? {}),
        })
      : null;
    let toolTokenRevoked = false;
    const revokeToolToken = (reason) => {
      if (toolTokenRevoked || !toolTokenGrant) return;
      toolTokenRevoked = true;
      toolTokenRegistry.revokeToken(toolTokenGrant.token, reason);
    };
    // The async startup phase below (compose prompt, prepare prompt file,
    // probe models, …) has many awaits and no blanket try/finally; an
    // exception there finalizes the run via runs.fail() without running the
    // per-attempt cleanup wired to the child lifecycle. Register the grant +
    // sink release on the run's terminal chokepoint so any exit path — startup
    // throw included — revokes the capability token instead of leaking it for
    // the token TTL. Idempotent with the explicit pre-spawn/child-close cleanup.
    if (toolTokenGrant) {
      run.onFinalize = () => {
        revokeToolToken('run_finalized');
        const sinkRunId = toolTokenGrant.runId ?? runId;
        activeChatAgentEventSinks.delete(sinkRunId);
        activeChatRunHandles.delete(sinkRunId);
      };
    }
    const runtimeToolPrompt = createAgentRuntimeToolPrompt(daemonUrl, toolTokenGrant);
    const commentHint = renderCommentAttachmentHint(safeCommentAttachments);


    // Intent signals gate stable-region prompt blocks, so every flip changes
    // stableInstructionFingerprint and re-sends the whole stable block on
    // resume. Two rules keep flips down to genuine activations only:
    //   1. Scan user-authored text only — for transcript-resending agents
    //      `message` embeds prior ASSISTANT turns, whose copy (the turn-1
    //      discovery form's own options, delivery summaries) must never flip
    //      a signal the user did not express.
    //   2. Latch detections onto the conversation (monotonic ON), so a
    //      history trim on agent switch or a non-transcript client cannot
    //      flip a previously seen signal back OFF.
    // OD_INTENT_SIGNAL_MODE=legacy restores the pre-hotfix whole-text,
    // unlatched scan.
    const legacyIntentSignalScan = process.env.OD_INTENT_SIGNAL_MODE === 'legacy';
    const intentSignalTexts = legacyIntentSignalScan
      ? [message, currentPrompt]
      : [
          extractUserAuthoredSignalText(message),
          extractUserAuthoredSignalText(currentPrompt),
        ];
    const freshIntentSignals = {
      deck: detectDeckIntentSignal(...intentSignalTexts),
      media: detectMediaIntentSignal(...intentSignalTexts),
      platform: detectPlatformIntentSignal(...intentSignalTexts),
    };
    const intentSignals =
      !legacyIntentSignalScan && typeof run.conversationId === 'string' && run.conversationId
        ? latchConversationIntentSignals(db, run.conversationId, freshIntentSignals)
        : freshIntentSignals;

    const {
      prompt: daemonSystemPrompt,
      activeSkillDirs,
      critiqueShouldRun,
      designSystemSelection,
    } =
      await composeDaemonSystemPrompt({
        agentId,
        projectId,
        skillId,
        skillIds,
        designSystemId,
        streamFormat: def?.streamFormat ?? 'plain',
        locale,
        sessionMode: runSessionMode,
        mediaExecution: run?.mediaExecution,
        byokMediaDefaults,
        // Plan §3.M2 / §3.V1 — forward the run's snapshot id so the
        // prompt composer can splice in `## Active stage` blocks.
        // Default ON; set OD_BUNDLED_ATOM_PROMPTS=0 to opt out.
        appliedPluginSnapshotId: run?.appliedPluginSnapshotId ?? null,
        // User-authored-only, conversation-latched detections (see the
        // intentSignals block above): a deck mention in the user's own words
        // anywhere in the conversation keeps the freeform maybe-deck
        // framework injected for the conversation's whole life.
        freeformDeckSignal: intentSignals.deck,
        mediaHintSignal: intentSignals.media,
        platformHintSignal: intentSignals.platform,
      });

    run.designSystemId = designSystemSelection?.id ?? null;
    run.designSystemRequestedId = designSystemSelection?.requestedId ?? null;
    run.designSystemSelectionSource = designSystemSelection?.source ?? 'none';
    run.designSystemDigest = designSystemSelection?.digest ?? null;

    // Make skill side files reachable through three layers, in order of
    // preference. The skill preamble emitted by `withSkillRootPreamble()`
    // advertises both the cwd-relative path (1) and the absolute path
    // (2/3) so the agent can pick whichever works.
    //
    //   1. CWD-relative copy. Stage every active/composed skill into
    //      `<cwd>/.od-skills/<folder>/` so any agent CLI — not just the
    //      ones that honour `--add-dir` — can reach those files via a
    //      path inside its working directory. We copy (not symlink) so
    //      each staged directory is a true write barrier — agents cannot
    //      mutate the shipped repo resource through their cwd.
    //   2. `--add-dir` allowlist. For non-Codex agents, pass `SKILLS_DIR`
    //      and `DESIGN_SYSTEMS_DIR` so the absolute fallback path in the
    //      preamble is reachable when staging fails (e.g. the project has
    //      no on-disk cwd, or fs.cp errored). Codex treats `--add-dir`
    //      entries as writable, so Codex receives only the narrow
    //      `${CODEX_HOME:-$HOME/.codex}/generated_images` output folder
    //      for allowlisted gpt-image image projects.
    //   3. PROJECT_ROOT cwd. When `cwd` is null, the agent runs with
    //      `cwd: PROJECT_ROOT` — there the absolute path is already an
    //      in-cwd path, so neither (1) nor (2) is required for it to
    //      resolve.
    //
    // Design systems are *not* staged here. Their bodies are read by the
    // daemon and folded into the system prompt directly (see
    // `readDesignSystem`), so an agent never has to open them via the
    // filesystem.
    if (cwd && activeSkillDirs.length > 0) {
      for (const skillDir of activeSkillDirs) {
        const result = await stageActiveSkill(
          cwd,
          skillCwdAliasSegment(skillDir),
          skillDir,
          (msg) => console.warn(msg),
        );
        if (!result.staged) {
          console.warn(
            `[od] skill-stage skipped: ${result.reason ?? 'unknown reason'}; falling back to absolute paths`,
          );
        }
      }
    }
    // Resolve the agent's effective working directory once and use it
    // everywhere the agent could read it (buildArgs runtimeContext and spawn
    // cwd). Falling back to PROJECT_ROOT — rather than
    // letting `spawn` inherit the daemon process cwd — is what makes the
    // absolute-path fallback in the skill preamble actually in-cwd for
    // no-project runs (packaged daemons / service launches do not start
    // their working directory from the workspace root).
    const effectiveCwd = cwd ?? PROJECT_ROOT;
    // Baseline the project's artifact files before the agent runs, so the
    // run-finished handler can diff against them and report `artifact_count`
    // for ANY agent (not just claude_code). Only for real project runs: a
    // null `cwd` means a no-project run rooted at PROJECT_ROOT, whose churn is
    // not the user's artifacts — those fall back to the tool-stream count.
    if (run?.id && cwd) {
      try {
        runArtifactBaselines.remember(run.id, cwd, snapshotProjectArtifacts(cwd));
      } catch {
        // Snapshotting is best-effort; finish falls back to the tool-stream count.
      }
    }
    const latestRunPromptForHtmlVersionSnapshot = () => {
      if (run.conversationId) {
        try {
          const row = db.prepare(
            `SELECT content
               FROM messages
              WHERE conversation_id = ?
                AND role = 'user'
                AND LENGTH(TRIM(content)) > 0
              ORDER BY COALESCE(ended_at, started_at, created_at, 0) DESC,
                       position DESC
              LIMIT 1`,
          ).get(run.conversationId);
          if (typeof row?.content === 'string' && row.content.trim()) {
            return { prompt: row.content.trim(), promptSource: 'message' as const };
          }
        } catch {
          // Version prompt provenance is best-effort.
        }
      }
      const requestPrompt =
        typeof currentPrompt === 'string' && currentPrompt.trim()
          ? currentPrompt.trim()
          : typeof message === 'string' && message.trim()
            ? message.trim()
            : null;
      return requestPrompt ? { prompt: requestPrompt, promptSource: 'message' as const } : { prompt: null };
    };
    const resolveRunArtifactOutcomeBeforeFinish = () => {
      if (!run?.id) return null;
      if (run.artifactOutcome) return run.artifactOutcome;

      const artifactBaseline = runArtifactBaselines.take(run.id);
      const fallbackOutcome = () => ({
        artifactCount: runArtifactCountForRun(run),
        designSystemCreated: runDesignSystemCreatedForRun(run),
        previewModuleCount: runPreviewModuleCountForRun(run),
      });
      let outcome;
      if (!artifactBaseline || artifactBaseline.contended) {
        outcome = fallbackOutcome();
      } else {
        try {
          const diff = diffRunArtifacts(
            artifactBaseline.before,
            snapshotProjectArtifacts(artifactBaseline.cwd),
          );
          outcome = {
            artifactCount: diff.touched,
            artifactsCreated: diff.created,
            artifactsModified: diff.modified,
            designSystemCreated: diff.designSystemCreated,
            previewModuleCount: diff.previewModuleCount,
            projectRoot: artifactBaseline.cwd,
            diff,
          };
        } catch {
          outcome = fallbackOutcome();
        }
      }
      run.artifactCount = outcome.artifactCount;
      run.artifactOutcome = outcome;
      return outcome;
    };
    const snapshotAiHtmlVersionsBeforeSuccess = async () => {
      const outcome = resolveRunArtifactOutcomeBeforeFinish();
      if (!outcome?.diff || !outcome.projectRoot || !run.projectId) return;
      const promptInfo = latestRunPromptForHtmlVersionSnapshot();
      await snapshotAiHtmlVersionsForRun({
        projectsRoot: PROJECTS_DIR,
        projectId: run.projectId,
        projectRoot: outcome.projectRoot,
        diff: outcome.diff,
        prompt: promptInfo.prompt,
        ...(promptInfo.promptSource ? { promptSource: promptInfo.promptSource } : {}),
        metadata: projectRecord?.metadata,
      });
    };
    // Chain onto the run service's terminal chokepoint so startup rejection,
    // direct cancellation, shutdown, and every explicit finish path all consume
    // their filesystem baseline before the terminal SSE frame is published.
    const previousOnFinalize = run.onFinalize;
    run.onFinalize = () => {
      try {
        previousOnFinalize?.();
      } finally {
        resolveRunArtifactOutcomeBeforeFinish();
      }
    };
    let codexGeneratedImagesDir = resolveCodexGeneratedImagesDir(
      agentId,
      projectRecord?.metadata,
      process.env,
      os.homedir(),
      run?.mediaExecution,
    );
    if (codexGeneratedImagesDir) {
      codexGeneratedImagesDir = validateCodexGeneratedImagesDir(
        codexGeneratedImagesDir,
        {
          protectedDirs: [SKILLS_DIR, DESIGN_SYSTEMS_DIR, ...linkedDirs],
        },
      );
    }
    const extraAllowedDirs = resolveChatExtraAllowedDirs({
      agentId,
      skillsDir: SKILLS_DIR,
      designSystemsDir: DESIGN_SYSTEMS_DIR,
      linkedDirs,
      codexGeneratedImagesDir,
    });
    const codexImagegenOverride = resolveGrantedCodexImagegenOverride({
      agentId,
      metadata: projectRecord?.metadata,
      codexGeneratedImagesDir,
      extraAllowedDirs,
      mediaExecution: run?.mediaExecution,
    });
    const researchCommandContract = resolveResearchCommandContract(
      research,
      message,
    );
    // Resume-capable adapters continue their own upstream session so they
    // keep working memory across turns. Decide once per run; reuse for the
    // prompt-composition skipTranscript choice, the buildArgs flags, and the
    // create-turn persistence below.
    const agentSupportsSessionResume =
      def.resumesSessionViaCli === true || def.streamFormat === 'pi-rpc';
    // Capture-style adapters (codex) mint their OWN session id and report it on
    // the stream; the daemon captures it here and persists THAT as the resume
    // handle instead of `agentResumeCtx.newSessionId` (which such CLIs ignore).
    // Set from the `status` event's `sessionId` in `sendAgentEvent` below.
    const agentCapturesSessionId = def.capturesSessionIdFromStream === true;
    let capturedSessionId: string | null = null;
    // --- Model resolution hoisted above the resume-identity guard ---
    // The guard (and the persisted `agent_sessions.model`) must key off the
    // model identity actually requested for this turn. Explicit `default` is
    // kept as a real identity so the selected CLI can use its configured
    // default; omitted models may still resolve to an available fallback below.
    let configuredAgentEnv = {};
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      configuredAgentEnv = agentCliEnvForAgent(appConfig.agentCliEnv, def.id);
    } catch {
      configuredAgentEnv = {};
    }
    const requestedLiveModelScope = null;
    let safeModel = resolveModelForAgent(
      def,
      typeof model === 'string'
        ? isKnownModel(def, model, requestedLiveModelScope)
          ? model
          : sanitizeCustomModel(model)
        : null,
      process.env,
      requestedLiveModelScope,
    );
    const safeReasoning =
      typeof reasoning === 'string' && Array.isArray(def.reasoningOptions)
        ? (def.reasoningOptions.find((r) => r.id === reasoning)?.id ?? null)
        : null;
    const agentOptions = { model: safeModel, reasoning: safeReasoning };
    const agentLaunch = resolveAgentLaunch(def, configuredAgentEnv);
    const resolvedBin = agentLaunch.selectedPath;

    let agentResumeCtx =
      agentSupportsSessionResume && run.conversationId
        ? resolveAgentResumeContext(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            currentModel: safeModel ?? null,
            currentCwd: effectiveCwd,
            currentAssistantMessageId: run.assistantMessageId ?? null,
          })
        : { storedSessionId: null as string | null, resumeSessionId: null as string | null, newSessionId: undefined as string | undefined, isResuming: false, storedStablePromptHash: null as string | null, storedInputTokens: null as number | null, invalidationReason: null };
    const sessionContextBudget = agentResumeCtx.isResuming
      ? evaluateModelContextBudget({
          prompt: typeof currentPrompt === 'string' ? currentPrompt : String(message ?? ''),
          modelId: safeModel,
          metadata: getKnownModelOption(
            def,
            safeModel,
            requestedLiveModelScope,
          )?.metadata,
          priorSessionInputTokens: agentResumeCtx.storedInputTokens,
        })
      : null;
    if (sessionContextBudget?.action === 'rollover') {
      agentResumeCtx = {
        ...agentResumeCtx,
        resumeSessionId: null,
        isResuming: false,
        storedStablePromptHash: null,
        invalidationReason: 'context_budget',
      };
    }
    const publishNativeSessionRecoveryMetadata = () => {
      if (!run.nativeSessionRecovery) return;
      design.runs.emit(run, 'diagnostic', {
        type: 'native_session_recovery',
        nativeSessionRecovery: run.nativeSessionRecovery,
      });
    };
    run.nativeSessionRecovery = initialNativeSessionRecoveryMetadata({
      agent: def,
      supportsSessionResume: agentSupportsSessionResume,
      isResuming: agentResumeCtx.isResuming,
      resumeSessionId: agentResumeCtx.resumeSessionId,
      storedSessionId: agentResumeCtx.storedSessionId,
      invalidationReason: agentResumeCtx.invalidationReason,
    });
    publishNativeSessionRecoveryMetadata();
    const rolloverCompaction =
      sessionContextBudget?.action === 'rollover' &&
      sessionContextBudget.inputBudgetTokens
        ? compactTranscriptForSessionRollover(
            typeof message === 'string' ? message : String(message ?? ''),
            Math.max(4_096, Math.floor(sessionContextBudget.inputBudgetTokens * 0.6)),
          )
        : null;
    const userRequestPrompt = composeChatUserRequestForAgent(
      rolloverCompaction?.prompt ?? message,
      currentPrompt,
      // Only trim to the latest turn when we are actually resuming an
      // existing session. A create turn still sends the full transcript so
      // a brand-new session (incl. first turn after another agent)
      // is seeded with prior context.
      { skipTranscript: agentResumeCtx.isResuming },
    );
    // The stable instruction slice (daemon prompt + tool contract + system
    // prompt = design system / skills / memory) is identical across turns of
    // a conversation in the common case. A resumed Claude session already
    // holds it, so on resume turns we skip it unless it changed since the
    // session was seeded — keyed by a hash stored on agent_sessions. Create
    // turns and changed-hash turns send the full block (byte-identical to the
    // previous behavior); non-resume agents have isResuming === false and so
    // always send the full block.
    const stableInstructionFingerprint = [daemonSystemPrompt, runtimeToolPrompt, systemPrompt]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .join('\n\n---\n\n');
    const currentStableHash = hashStableInstructions(stableInstructionFingerprint);
    // `runtimeToolPrompt` is part of the fingerprint and varies only when the
    // tool-token grant's presence flips between turns (rare cwd/projectId edge
    // cases); any such change correctly forces a full re-send that turn.
    const includeStableInstructions = computeIncludeStable(
      agentResumeCtx.isResuming,
      agentResumeCtx.storedStablePromptHash,
      currentStableHash,
    );
    run.promptCache = describeStablePromptCache({
      isResuming: agentResumeCtx.isResuming,
      storedStablePromptHash: agentResumeCtx.storedStablePromptHash,
      currentStableHash,
    });
    const browserUsePromptGuard = renderBrowserUseUnavailablePrompt(run.browserUse ?? null);
    const titleGenerationRequested =
      titleGeneration &&
      typeof titleGeneration === 'object' &&
      titleGeneration.enabled === true &&
      !agentResumeCtx.isResuming;
    const titleGenerationPrompt = titleGenerationRequested
      ? [
          'Internal title task:',
          'Before answering the user request, emit exactly one short title marker:',
          '<od-title>Title Here</od-title>',
          'Rules: 2-6 words, preserve the user request language, no quotes, no markdown, no punctuation unless necessary.',
          'Do not mention this title task to the user. Continue with the normal answer after the title marker.',
        ].join('\n')
      : '';
    // The connected-external-MCP directive reflects live OAuth token state,
    // which flips mid-conversation as Bearers expire/refresh. Keeping it out of
    // the cached stable prefix (daemonSystemPrompt) and re-sending it here in
    // the per-turn slice keeps the upstream prompt-cache prefix byte-stable
    // across resumes (protecting the conversation-history cache) while still
    const clientInstructionParts = includeStableInstructions
      ? [researchCommandContract, runContextPrompt, browserUsePromptGuard, titleGenerationPrompt, systemPrompt]
      : [researchCommandContract, runContextPrompt, browserUsePromptGuard, titleGenerationPrompt];
    const clientInstructionPrompt = clientInstructionParts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join('\n\n---\n\n');
    const instructionPrompt = composeLiveInstructionPrompt({
      daemonSystemPrompt: includeStableInstructions ? daemonSystemPrompt : '',
      runtimeToolPrompt: includeStableInstructions ? runtimeToolPrompt : '',
      clientSystemPrompt: clientInstructionPrompt,
      finalPromptOverride: codexImagegenOverride,
    });
    // Some models (notably claude-opus-4-7 with --include-partial-messages)
    // start their reply by echoing the top of the user message verbatim,
    // so the rendered chat shows a "# Instructions ..." block ahead of the
    // real answer. Closing every Instructions block with an explicit
    // "do not echo" line cuts the regression in practice without changing
    // the turn-shape every agent CLI expects (user message carrying both
    // instructions and request) — see server.ts:9920 composer notes.
    const ECHO_GUARD =
      '\n\n(Do not quote, restate, or echo the # Instructions block above in your reply. Begin your response with the answer to the # User request below.)';
    const formAnswerMatch = FORM_ANSWERS_HEADER_RE.exec(
      typeof currentPrompt === 'string' ? currentPrompt : '',
    );
    const formIdForOverride = formAnswerMatch
      ? ((formAnswerMatch[1] || 'form').trim().replace(/[^\w.-]/g, '') || 'form').toLowerCase()
      : null;
    const formOverride =
      formIdForOverride === 'discovery' || formIdForOverride === 'task-type'
        ? FORM_ANSWERED_SYSTEM_OVERRIDE
        : formIdForOverride !== null
          ? FORM_ANSWERED_GENERIC_OVERRIDE
          : '';
    const promptImagePaths = selectPromptImagePaths(
      def.id,
      safeImages,
      agentImagePaths,
    );
    const composed = [
      instructionPrompt
        ? `# Instructions (read first)\n\n${formOverride}${instructionPrompt}${cwdHint}${linkedDirsHint}${ECHO_GUARD}\n\n---\n`
        : cwdHint
          ? `# Instructions\n\n${formOverride}${cwdHint}${linkedDirsHint}${ECHO_GUARD}\n\n---\n`
          : linkedDirsHint
            ? `# Instructions\n\n${formOverride}${linkedDirsHint}${ECHO_GUARD}\n\n---\n`
            : formOverride
              ? `# Instructions\n\n${formOverride}${ECHO_GUARD}\n\n---\n`
              : '',
      `# User request\n\n${userRequestPrompt}${attachmentHint}${commentHint}`,
      promptImagePaths.length
        ? `\n\n${promptImagePaths.map((p) => `@${p}`).join(' ')}`
        : '',
    ].join('');
    // (model resolution is hoisted above the resume guard)
    const executionProfile = executionProfileFromStreamFormat(def.streamFormat);
    let visibleAssistantText = '';
    // Reply text handed to the background memory extractor at child-close.
    // Captures the GUARDED, visible reply from BOTH channels a run can emit on:
    // structured agents' `agent` `text_delta` and the plain/Antigravity
    // family's `stdout` chunks. So
    // every agent family contributes its actual reply, and none leak raw
    // transport frames (system:init, stream_event, hooks). Kept separate from
    // `visibleAssistantText` so the filesystem empty-output guard that reads
    // that variable keeps its text_delta-only semantics. Bounded — the
    // extractor only needs the head of the reply.
    const MEMORY_REPLY_CAP = 32 * 1024;
    let memoryReplyText = '';
    // Upper bound for the truncation-proof plain-stream stdout accumulator used
    // by the artifact finalizer (see the emit handler below). 8 MiB comfortably
    // covers realistic artifact-bearing runs while bounding per-run memory.
    const PLAIN_ARTIFACT_STDOUT_CAP = 8 * 1024 * 1024;
    const send = (event, data) => {
      if (
        event === 'agent' &&
        data &&
        data.type === 'text_delta' &&
        typeof data.delta === 'string'
      ) {
        visibleAssistantText += data.delta;
      }
      // Accumulate the visible reply for the memory extractor from whichever
      // channel this agent family uses: `agent` text_delta (structured streams)
      // or `stdout` chunks (plain/BYOK/antigravity). Both carry already-guarded,
      // user-visible text, so this never captures thinking, tool traffic, or raw
      // transport frames.
      if (memoryReplyText.length < MEMORY_REPLY_CAP) {
        const replyPiece =
          event === 'agent' && data && data.type === 'text_delta' && typeof data.delta === 'string'
            ? data.delta
            : event === 'stdout' && data && typeof data.chunk === 'string'
              ? data.chunk
              : '';
        if (replyPiece) {
          memoryReplyText = (memoryReplyText + replyPiece).slice(0, MEMORY_REPLY_CAP);
        }
      }
      // Keep enough of the plain-stream stdout on the run itself that the
      // finalizer's artifact extraction does not depend on the <artifact> tag
      // surviving the 2000-event run.events ring buffer. A long run that streams
      // a complete <artifact> early and then floods >2000 later stdout events
      // would evict the opening tag, making a scan of run.events miss it and
      // silently drop the delivered file (#5351 fixed the same truncation class
      // for the verdict consumers). We keep the HEAD (first CAP bytes, bounded)
      // and separately track the TOTAL byte count; the finalizer stitches the
      // head to the tail-biased run.events at their exact stream offset, so no
      // artifact is lost and none is double-counted regardless of where in the
      // stream it appears.
      if (event === 'stdout' && data && typeof data.chunk === 'string') {
        run.plainStdoutTotalBytes = (run.plainStdoutTotalBytes ?? 0) + data.chunk.length;
        if ((run.plainArtifactStdout?.length ?? 0) < PLAIN_ARTIFACT_STDOUT_CAP) {
          run.plainArtifactStdout =
            ((run.plainArtifactStdout ?? '') + data.chunk).slice(0, PLAIN_ARTIFACT_STDOUT_CAP);
        }
      }
      persistRunEventToAssistantMessage(db, run, event, data);
      design.runs.emit(run, event, data);
    };
    const destroyChildStdio = (child) => {
      // Best-effort cleanup of stdio streams on a child process we're about
      // to drop. The daemon-sidecar (apps/daemon) keeps listeners attached
      // to child.stdout / child.stderr / child.stdin across the run
      // lifecycle (line ~12890..~13500+ in this file). Those listeners hold
      // the Stream objects alive, and the Stream objects own the read side
      // of the OS pipes — so dropping the child reference via
      // `run.child = null` without destroying the streams leaks the pipe
      // file descriptors. After a few hundred retries the daemon
      // accumulates 10k+ FDs and posix_spawn returns EBADF.
      //
      // See: https://github.com/nexu-io/open-design/issues/4100
      if (!child) return;
      const destroyStream = (stream) => {
        if (!stream || stream.destroyed) return;
        try { stream.removeAllListeners(); } catch {}
        try { stream.destroy(); } catch {}
      };
      destroyStream(child.stdout);
      destroyStream(child.stderr);
      destroyStream(child.stdin);
    };
    // Synchronously detach the failed attempt: kill the old child and move the
    // run back to `queued` *now*, even when the re-spawn is delayed by backoff.
    // This must not be deferred — leaving the old child alive during the backoff
    // window lets a follow-on signal (e.g. the inactivity watchdog's SIGTERM)
    // drive a second close-handler pass that finalizes the run as failed before
    // the retry ever spawns.
    const tearDownAttemptForRetry = () => {
      // Snapshot the failing attempt's child + process group BEFORE we detach
      // them, so the reap targets THIS attempt's group and never the next one.
      const priorChild = run.child;
      const priorProcessGroupId = run.processGroupId;
      // Release the previous child's stdio streams before letting the
      // reference drop — see destroyChildStdio for rationale.
      destroyChildStdio(priorChild);
      // Disband the WHOLE process group of the failed attempt, not just the
      // direct child. A same-run retry that only SIGTERMs run.child leaves the
      // CLI's spawned descendants (MCP servers, tool subprocesses) orphaned
      // (re-parented to PID 1), accumulating one leaked group per retry. Reap by
      // the CAPTURED pgid — the SIGKILL escalation is bound to it, so it can
      // never hit the next attempt's group (the cross-generation kill fixed in
      // #5202). On win32 / no pgid, fall back to signalling the direct child.
      const reaped = design.runs.reapProcessGroup(priorProcessGroupId);
      if (
        !reaped &&
        priorChild &&
        typeof priorChild.kill === 'function' &&
        priorChild.exitCode === null &&
        !priorChild.killed
      ) {
        try { priorChild.kill('SIGTERM'); } catch {}
      }
      run.status = 'queued';
      run.updatedAt = Date.now();
      run.child = null;
      run.processGroupId = null;
      run.rpcSession = null;
      run.exitCode = null;
      run.signal = null;
      run.error = null;
      run.errorCode = null;
      run.stdinOpen = false;
      // Any run-scoped state that a single attempt writes and that later feeds
      // terminal classification must be cleared before the next attempt spawns,
      // or the prior attempt's verdict leaks forward. turnCompletedCleanly is
      // set by a clean `turn_end` (applyClaudeStreamJsonRunBookkeeping); without
      // this reset, a clean-but-empty attempt 1 would vouch for a crashed
      // attempt 2, classifying the run 'succeeded' off a stale flag.
      run.turnCompletedCleanly = false;
    };
    const spawnRetryAttempt = () => {
      void startChatRun(chatBody, run).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        design.runs.emit(
          run,
          'error',
          createSseErrorPayload('AGENT_EXECUTION_FAILED', message),
        );
        // Route the retried-start failure through the same finalizer as child
        // close/error. retryAttemptCount is already 1 here, so the retry policy
        // suppresses another restart loop with attempt_limit_reached.
        finishWithRetryDecision('failed', 1, null);
      });
    };
    // Tear the failed attempt down now (moving the run to `queued`), then wait
    // out the policy's backoff before re-spawning. Stays cancel-aware: a cancel
    // or shutdown during the backoff window clears the timer (runtimes/runs.ts)
    // and finalizes the queued run, and the callback re-checks cancel/terminal
    // state in case it fires first.
    const scheduleRetryRestart = (delayMs) => {
      tearDownAttemptForRetry();
      const wait = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
      if (wait <= 0) {
        spawnRetryAttempt();
        return;
      }
      run.retryRestartTimer = setTimeout(() => {
        run.retryRestartTimer = null;
        if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
        spawnRetryAttempt();
      }, wait);
    };
    let pendingRpcCloseReason = null;
    const markRpcCloseReason = (reason) => {
      pendingRpcCloseReason = reason;
    };
    const deriveRpcCloseReason = (status, code, signal) => {
      if (pendingRpcCloseReason) return pendingRpcCloseReason;
      if (run.cancelRequested || status === 'canceled') return 'cancel_requested';
      if (signal) return 'signal';
      if (typeof code === 'number') return code === 0 ? 'exit_0' : 'exit_nonzero';
      return 'unknown';
    };
    const finishWithRetryDecision = (status, code = null, signal = null) => {
      // Persist the transport-level close mechanism before classifying this
      // attempt. Runtime fatal/stream signals are only known in the close
      // handler, and the retry classifier reads this diagnostic to distinguish
      // them from a generic process exit. Clear the pending value immediately
      // so a scheduled retry cannot inherit the previous attempt's reason.
      const rpcCloseReason = deriveRpcCloseReason(status, code, signal);
      design.runs.emit(run, 'diagnostic', {
        type: 'runtime_close',
        rpc_close_reason: rpcCloseReason,
        status,
        ...(typeof code === 'number' ? { exit_code: code } : {}),
        ...(signal ? { signal } : {}),
      });
      pendingRpcCloseReason = null;
      const result = runResultFromStatus(status);
      const errorCode = deriveRunErrorCode({
        status,
        error: run.error,
        errorCode: run.errorCode,
        exitCode: code,
        signal,
      });
      const failure = classifyRunFailure({
        result,
        status: {
          status,
          error: run.error,
          errorCode: run.errorCode,
          exitCode: code,
          signal,
        },
        ...(errorCode ? { errorCode } : {}),
        agentId: run.agentId,
        events: run.events,
      });
      const sideEffects = {
        ...runSideEffectsForRun(run),
        cancelRequested: !!run.cancelRequested,
      };
      const decision = decideSafeRunRetry({
        result,
        failure,
        attemptCount: run.retryAttemptCount ?? 0,
        sideEffects,
      });
      if (decision.shouldRetry && !design.runs.isTerminal(run.status)) {
        run.retryAttemptCount = decision.retryAttemptIndex;
        scheduleRetryRestart(decision.retryDelayMs);
        return true;
      }
      // Resume-on-failure: a terminal *resumable* failure (transient mid-stream
      // drop / inactivity) on a session-resuming runtime is not a dead end.
      // Persist the live CLI session so the next turn in this conversation
      // continues it (`--resume <id>`) instead of opening a fresh session, and
      // flag the run so the chat can surface a Continue affordance. The session
      // id is the one we actually drove this attempt with: the resumed id when
      // continuing, otherwise the freshly minted id we passed via --session-id.
      //
      // Gate on a real *committed* boundary this attempt, not merely on bytes
      // having reached the UI. A completed tool_use / artifact / live-artifact
      // corresponds to a block the agent has committed to its session (Claude
      // commits a tool_use block before running the tool), so `--resume` has
      // something concrete to pick up. We deliberately EXCLUDE
      // `userVisibleOutputSeen`: it flips true on the first streamed text
      // delta, but a single-turn drop can stream a few tokens with
      // `output_tokens == 0` and never commit a text block — resuming that
      // continues from the prior user turn (nothing to pick up), which is
      // exactly the "resume something with nothing to continue" case this
      // feature is meant to avoid. A text-only turn that is cut therefore stays
      // a from-scratch restart (auto-retry above or a manual Retry).
      // NOTE: `userVisibleOutputSeen` cannot by itself distinguish "half a text
      // block, zero commit" from "a committed text block then more streaming";
      // until the stream exposes a committed-text signal, tool/artifact blocks
      // are the only reliable resume boundary.
      const committedWorkSeen = !!(
        sideEffects.toolCallSeen ||
        sideEffects.artifactWriteSeen ||
        sideEffects.liveArtifactSeen
      );
      const liveSessionId = agentResumeCtx.isResuming
        ? agentResumeCtx.resumeSessionId
        : agentCapturesSessionId
          ? capturedSessionId
          : agentResumeCtx.newSessionId;
      const resumableFailure =
        result === 'failed' &&
        def.resumesSessionViaCli === true &&
        !!run.conversationId &&
        !!liveSessionId &&
        committedWorkSeen &&
        isResumableFailure(failure);
      run.resumable = resumableFailure;
      // Surface the daemon's failure classification (already computed for
      // retry policy and status bookkeeping) on the run so statusBody / the SSE `end` frame
      // carry it to the chat, which maps failureDetail -> a specific named
      // failure type + fix. Only meaningful on a failed result.
      run.failureCategory = result === 'failed' ? failure?.failure_category ?? null : null;
      run.failureDetail = result === 'failed' ? failure?.failure_detail ?? null : null;
      // Stamp the classification onto the persisted assistant message too, so a
      // reload (or any daemon-side persistence without the live web error
      // handler) keeps the specific failure guidance instead of the coarse
      // errorCode UI. Mirrors what statusBody / the SSE `end` frame carry live.
      if (result === 'failed') persistRunFailureClassification(db, run);
      if (resumableFailure) {
        upsertAgentSession(db, {
          conversationId: run.conversationId,
          agentId: def.id,
          sessionId: liveSessionId,
          stablePromptHash: currentStableHash,
          model: safeModel ?? null,
          cwd: effectiveCwd,
          lastMessageId: run.assistantMessageId ?? null,
        });
        run.nativeSessionRecovery = markNativeSessionCaptured({
          previous: run.nativeSessionRecovery,
          agentId: def.id,
          sessionId: liveSessionId,
          resumed: agentResumeCtx.isResuming,
        });
        publishNativeSessionRecoveryMetadata();
      }
      if (executionProfile === 'filesystem' && result === 'success' && visibleAssistantText.trim().length === 0) {
        const fileNames = filesystemWriteFileNamesFromRunEvents(run.events);
        if (fileNames.length > 0) {
          send('agent', {
            type: 'diagnostic',
            name: 'filesystem_empty_answer_autofilled',
            source: 'daemon-run-finalize',
            fileCount: fileNames.length,
            files: fileNames.slice(0, 8),
          });
          send('agent', {
            type: 'text_delta',
            delta: filesystemEmptyAnswerFallbackText(fileNames),
          });
        }
      }
      design.runs.finish(run, status, code, signal);
      return false;
    };
    const runtimeConfigEnvKey = def.id === 'opencode' || def.id === 'byok-opencode'
        ? 'OPENCODE_CONFIG_CONTENT'
        : null;
    const opencodeConfigContent = runtimeConfigEnvKey
      ? buildOpenCodeRuntimeConfigContent(
          byokOpenCodeProvider?.config ?? {},
          [effectiveCwd, ...extraAllowedDirs],
        )
      : null;

    // Pre-flight the composed prompt against any argv-byte budget the
    // adapter declared. Doing this before bin resolution means the test harness pins the guard
    // independently of whether the adapter binary happens to be on PATH
    // in the CI environment, and the user gets the actionable
    // adapter-named error even if /api/agents hadn't refreshed yet.
    const promptBudgetError = checkPromptArgvBudget(def, composed);
    if (promptBudgetError) {
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          promptBudgetError.code,
          promptBudgetError.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    let mmdRouteLaunchEnv = null;
    if (def.id === 'claude' && safeModel) {
      mmdRouteLaunchEnv = await loadMmdRouteLaunchEnv(
        {
          ...process.env,
          ...(def.env || {}),
          ...configuredAgentEnv,
        },
        safeModel,
      ).catch(() => null);
    }


    const launchContextBudget = evaluateModelContextBudget({
      prompt: composed,
      modelId: safeModel,
      metadata: getKnownModelOption(
        def,
        safeModel,
        requestedLiveModelScope,
      )?.metadata,
    });
    const contextBudget =
      !launchContextBudget.error && sessionContextBudget?.action === 'rollover'
        ? {
            ...launchContextBudget,
            action: 'rollover' as const,
            priorSessionInputTokens: sessionContextBudget.priorSessionInputTokens,
            projectedInputTokens: sessionContextBudget.projectedInputTokens,
            rolloverThresholdTokens: sessionContextBudget.rolloverThresholdTokens,
            ...(rolloverCompaction
              ? {
                  compactedPromptTokens: rolloverCompaction.compactedTokens,
                  omittedTranscriptMessageBlocks: rolloverCompaction.omittedMessageBlocks,
                }
              : {}),
          }
        : launchContextBudget;
    run.contextBudget = contextBudget;
    design.runs.emit(run, 'diagnostic', {
      type: 'model_context_budget',
      action: contextBudget.action,
      source: contextBudget.source,
      model_id: contextBudget.modelId,
      estimated_prompt_tokens: contextBudget.estimatedPromptTokens,
      context_window_tokens: contextBudget.contextWindowTokens,
      reserved_output_tokens: contextBudget.reservedOutputTokens,
      safety_margin_tokens: contextBudget.safetyMarginTokens,
      input_budget_tokens: contextBudget.inputBudgetTokens,
      context_budget_ratio: contextBudget.budgetRatio,
      prior_session_input_tokens: contextBudget.priorSessionInputTokens,
      projected_session_input_tokens: contextBudget.projectedInputTokens,
      rollover_threshold_tokens: contextBudget.rolloverThresholdTokens,
      compacted_prompt_tokens: contextBudget.compactedPromptTokens,
      omitted_transcript_message_blocks: contextBudget.omittedTranscriptMessageBlocks,
    });
    if (contextBudget.error) {
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          contextBudget.error.code,
          contextBudget.error.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    // Plain-streaming adapters that own a "continue most recent
    // conversation" CLI flag (today: only `agy -c`) read this signal
    // to resume upstream session state on follow-up turns. The query
    // matches any persisted assistant message in the same conversation
    // EXCEPT the placeholder row this run just inserted (it's still
    // `pending` and has no body — counting it as prior would always
    // force `-c` on the very first turn). Adapters that don't consume
    // this field ignore it.
    const hasPriorAssistantTurn = run.conversationId
      ? Boolean(
          db
            .prepare(
              `SELECT 1 FROM messages
               WHERE conversation_id = ?
                 AND role = 'assistant'
                 AND COALESCE(content, '') <> ''
                 AND id <> COALESCE(?, '')
               LIMIT 1`,
            )
            .get(run.conversationId, run.assistantMessageId ?? ''),
        )
      : false;

    // Antigravity's `agy` is silent on stdout/stderr in print mode for
    // both auth-missing and quota-exhausted failures — the actual
    // RESOURCE_EXHAUSTED / "not logged in" payload only surfaces in
    // its `--log-file`. We allocate a per-run temp path, pipe agy's
    // log to it via buildArgs, then read it in the empty-output guard
    // to disambiguate the silent-failure cause. Other adapters ignore
    // this field.
    const agentLogFilePath =
      def.id === 'antigravity'
        ? path.join(os.tmpdir(), `od-agy-${run.id}.log`)
        : undefined;
    const promptFile = await preparePromptFileForAgent(def, composed, run.id);
    const cleanupPromptFile = () => {
      if (promptFile) promptFile.cleanup().catch(() => {});
    };

    // Codex CLI parses config.toml before processing any -c overrides. An
    // invalid `service_tier` value (the Codex app has written "priority",
    // "default", and other values the CLI rejects) causes an immediate parse
    // error and exit-1 before any work starts. Normalize it in-place — any
    // value outside {fast,flex} has its line removed so the CLI uses its
    // built-in default — so the launch succeeds. Errors are silently swallowed
    // — a missing or read-only config.toml is fine, and the Codex CLI still
    // surfaces the original error if the write fails. See issue #4276 / #3408.
    if (def.id === 'codex') {
      const { normalizeCodexConfigFile } = await import('./codex-config-normalize.js');
      // Route through spawnEnvForAgent so resolveCodexConfigPath sees the same
      // fully-expanded CODEX_HOME the Codex child process will see. In
      // particular, spawnEnvForAgent calls expandConfiguredEnv which expands
      // `~/` / `~\` prefixes — a user-configured CODEX_HOME="~/.codex-alt"
      // would otherwise resolve to the literal path "~/.codex-alt/config.toml"
      // in the normalizer while the child resolves it to the absolute path,
      // leaving the real config untouched. Mirrors the diagnostics-export.ts
      // `envFor('codex')` pattern. See issue #4276.
      await normalizeCodexConfigFile(
        spawnEnvForAgent('codex', process.env, configuredAgentEnv),
      );
    }

    // Serialize antigravity spawns whose buildArgs writes a concrete
    // model into settings.json. Two concurrent runs with different
    // models would otherwise race the file: A writes model A, B writes
    // model B, then A's agy reads model B. The lock is acquired BEFORE
    // buildArgs (which performs the write) and released asynchronously
    // AFTER agy's --log-file confirms the model was propagated. See
    // `antigravity.ts` for the chain implementation.
    let antigravityModelLockRelease: (() => void) | null = null;
    const antigravityConcreteModel =
      def.id === 'antigravity'
      && typeof agentOptions.model === 'string'
      && agentOptions.model.length > 0
      && agentOptions.model !== 'default'
        ? agentOptions.model
        : null;
    if (antigravityConcreteModel) {
      const { acquireAntigravityModelLock } = await import(
        './runtimes/defs/antigravity.js'
      );
      antigravityModelLockRelease = await acquireAntigravityModelLock();
    }

    let args;
    try {
      args = def.buildArgs(
        composed,
        safeImages,
        extraAllowedDirs,
        agentOptions,
        {
          cwd: effectiveCwd,
          hasPriorAssistantTurn,
          agentLogFilePath,
          promptFilePath: promptFile?.path,
          resumeSessionId: agentResumeCtx.resumeSessionId,
          newSessionId: agentResumeCtx.newSessionId,
        },
      );
    } catch (err) {
      cleanupPromptFile();
      throw err;
    }
    // Second-pass budget check that knows about the Windows `.cmd` shim
    // wrap. The pre-buildArgs `checkPromptArgvBudget` only looks at the
    // raw composed prompt; on Windows an npm-installed adapter resolves
    // to an npm-installed `.cmd` shim, the spawn path goes through `cmd.exe /d /s
    // /c "<inner>"`, and `quoteForWindowsCmdShim` doubles every embedded
    // `"` plus wraps any whitespace/special-char arg in outer quotes —
    // so a quote-heavy prompt that fit under `maxPromptArgBytes` can
    // still expand past CreateProcess's 32_767-char cap. Fail fast with
    // the same `AGENT_PROMPT_TOO_LARGE` shape so the SSE error path
    // doesn't have to special-case it.
    const cmdShimBudgetError = checkWindowsCmdShimCommandLineBudget(
      def,
      agentLaunch.launchPath ?? resolvedBin,
      args,
    );
    if (cmdShimBudgetError) {
      cleanupPromptFile();
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          cmdShimBudgetError.code,
          cmdShimBudgetError.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    // Companion guard for non-shim Windows installs (e.g. a cargo-built
    // a direct `.exe` rather than an npm `.cmd` shim). Direct `.exe`
    // spawns skip the cmd.exe wrap above, but Node/libuv still composes
    // a CreateProcess `lpCommandLine` by walking each argv element
    // through `quote_cmd_arg`, which escapes every embedded `"` as `\"`
    // and doubles backslashes adjacent to quotes. A quote-heavy prompt
    // under `maxPromptArgBytes` can expand past the 32_767-char kernel
    // cap there too, so the cmd-shim early-return alone would let those
    // users hit a generic `spawn ENAMETOOLONG`.
    const directExeBudgetError = checkWindowsDirectExeCommandLineBudget(
      def,
      agentLaunch.launchPath ?? resolvedBin,
      args,
    );
    if (directExeBudgetError) {
      cleanupPromptFile();
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          directExeBudgetError.code,
          directExeBudgetError.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    let persistDeliveredAgentSessionState = () => {};
    if (def.resumesSessionViaCli === true && run.conversationId) {
      let persisted = false;
      persistDeliveredAgentSessionState = () => {
        if (persisted) return;
        persisted = true;
        if (!getConversation(db, run.conversationId)) {
          console.warn(
            '[sessions] skipped delivered session persistence because the conversation is not persisted',
          );
          return;
        }
        // The id to persist for a create turn: capture-style adapters store the
        // session id the CLI minted and reported on the stream; specify-style
        // adapters store the daemon-minted id they passed to the CLI. A
        // capture-style run that never reported an id (CLI died before
        // `thread.started`) leaves nothing to resume — correct, the next turn
        // starts fresh and re-seeds the transcript.
        const createTurnSessionId = agentCapturesSessionId
          ? capturedSessionId
          : agentResumeCtx.newSessionId;
        if (!agentResumeCtx.isResuming && createTurnSessionId) {
          upsertAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: createTurnSessionId,
            stablePromptHash: currentStableHash,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          if (!agentCapturesSessionId) {
            run.nativeSessionRecovery = markNativeSessionCaptured({
              previous: run.nativeSessionRecovery,
              agentId: def.id,
              sessionId: createTurnSessionId,
              resumed: false,
            });
            publishNativeSessionRecoveryMetadata();
          }
          return;
        }
        if (agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId) {
          // Advance the resume identity guard after a successful resume turn:
          // the conversation grew by this turn, so the cursor must move to the
          // new max position (otherwise the next turn sees `cursor + 4` and
          // falsely reseeds). model/cwd are unchanged (they matched on resume);
          // refresh the stable hash to what the session now holds.
          upsertAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: agentResumeCtx.resumeSessionId,
            stablePromptHash: currentStableHash,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          if (!agentCapturesSessionId) {
            run.nativeSessionRecovery = markNativeSessionCaptured({
              previous: run.nativeSessionRecovery,
              agentId: def.id,
              sessionId: agentResumeCtx.resumeSessionId,
              resumed: true,
            });
            publishNativeSessionRecoveryMetadata();
          }
        }
      };
    }

    // `runStartTimeMs` is consumed by the run-end artifact-manifest
    // reconciler (#2893 / #3110) to skip artifacts whose mtime predates
    // this run. The original main-side hunk also re-declared `const send`
    // here; `send` is already available to the launch path
    // earlier, so we keep only the new `runStartTimeMs` declaration.
    const runStartTimeMs = Date.now();
    const inactivityTimeoutMs = resolveChatRunInactivityTimeoutMs(def.inactivityTimeoutMs);
    const artifactQuietPeriodMs = resolveChatRunArtifactQuietPeriodMs();
    // Grace before the inactivity watchdog escalates a stalled child from
    // SIGTERM to SIGKILL. Env-tunable like its OD_CHAT_RUN_* cancel-grace
    // siblings so the escalation path can be exercised deterministically.
    const inactivityKillGraceMs = (() => {
      const raw = Number(process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS);
      return Number.isFinite(raw) && raw > 0 ? raw : 3_000;
    })();
    let inactivityTimer = null;
    let childStdoutSeen = false;
    let lastAgentEventPhase = 'spawn pending';
    let lastToolResultChars = 0;
    // Becomes true once any live-artifact create has been registered for
    // this run. Subsequent watchdog scheduling uses the shorter quiet
    // period, and a watchdog trip after this point is treated as
    // "agent finished the deliverable and went idle" rather than
    // "agent stalled with nothing to show" (issue #1451).
    let artifactRegistered = false;
    // Only daemon-initiated quiet-period termination should be treated
    // as `succeeded` in the close handler. A later unrelated SIGTERM /
    // SIGKILL (external `kill`, OOM, container shutdown) must keep its
    // existing `failed` classification even when `artifactRegistered`
    // is true — those signals don't mean the agent finished cleanly,
    // they just terminated the process. Set strictly inside
    // `failForInactivity`'s quiet-period branch.
    let artifactQuietShutdownRequested = false;
    // Set when the no-output inactivity watchdog routed this attempt through
    // the same-run retry finalizer AND that finalizer restarted the run on a
    // fresh child. The stalled child is then SIGTERM'd, so its later `close`
    // must NOT finalize the run a second time or unregister the new attempt's
    // event sink / run handle (both keyed by the shared runId). The close
    // handler bails early when this is true, revoking only this attempt's own
    // tool token.
    let watchdogRetryRestarted = false;
    const summarizeAgentEventForInactivity = (payload) => {
      const type = payload?.type ? String(payload.type) : 'unknown';
      if (type === 'tool_result') {
        const content = typeof payload.content === 'string' ? payload.content : '';
        lastToolResultChars = Math.max(lastToolResultChars, content.length);
        return `tool_result:${content.length} chars`;
      }
      if (type === 'tool_use') {
        const name = payload?.name ? String(payload.name) : 'unknown';
        return `tool_use:${name}`;
      }
      if (type === 'text_delta' || type === 'thinking_delta') {
        const text = typeof payload.delta === 'string'
          ? payload.delta
          : typeof payload.text === 'string'
            ? payload.text
            : '';
        return `${type}:${text.length} chars`;
      }
      if (type === 'status') {
        const label = payload?.label ? String(payload.label) : 'unknown';
        return `status:${label}`;
      }
      return type;
    };
    const clearInactivityWatchdog = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };
    let forcedChildShutdownTimers = [];
    const clearForcedChildShutdown = () => {
      for (const timer of forcedChildShutdownTimers) clearTimeout(timer);
      forcedChildShutdownTimers = [];
    };
    const scheduleForcedChildShutdown = () => {
      if (!child) return;
      clearForcedChildShutdown();
      // Capture THIS attempt's child and its process group. A same-run retry
      // can swap `run.child` to a fresh child within the grace window; these
      // timers must escalate the stalled child they were scheduled for, never
      // whatever now occupies `run.child` — otherwise the healthy retry gets
      // killed and this stalled child is left unreaped. See runs.ts
      // `signalChildProcess`.
      const targetChild = child;
      const targetProcessGroupId = run.processGroupId;
      forcedChildShutdownTimers = [
        setTimeout(() => {
          design.runs.signalChildProcess(targetChild, targetProcessGroupId, 'SIGTERM');
        }, inactivityKillGraceMs),
        setTimeout(() => {
          design.runs.signalChildProcess(targetChild, targetProcessGroupId, 'SIGKILL');
        }, inactivityKillGraceMs * 2),
      ];
    };
    const failForInactivity = () => {
      if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
      clearInactivityWatchdog();
      if (artifactRegistered) {
        // The deliverable already exists. The agent process is either
        // genuinely idle (claude-code's stream-json child sitting on an
        // open stdin) or wedged in post-write reasoning that never
        // emits stdout. Either way, finishing the run via the normal
        // child-exit path (status decision in child.on('close') below)
        // is safer than tearing it down with a failure banner — the
        // tool token, cancel state, and exit-code classification stay
        // owned by the existing lifecycle. SIGTERM the child and let
        // the close handler classify the run as succeeded (via the
        // artifactQuietShutdown branch). Mark this termination as
        // daemon-initiated so an unrelated later signal (external
        // kill, OOM) is NOT silently reclassified to `succeeded` —
        // only signals from this watchdog branch should be.
        artifactQuietShutdownRequested = true;
        if (rpcSession?.abort) {
          rpcSession.abort();
        }
        if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
        scheduleForcedChildShutdown();
        return;
      }
      // OpenCode retries a 429 usage-limit silently and emits nothing on
      // stdout/stderr, so the watchdog is the first signal we get. The real
      // reason is recorded only in OpenCode's own session log — recover it
      // and surface it HERE, before finish() tears down the live SSE
      // clients, so a viewer sees "usage limit reached" instead of the
      // generic stall message. Bound to this run via `since` so a stale or
      // concurrent session's error can't be misattributed. See issue #982.
      let stallPayload = null;
      if (agentId === 'opencode') {
        const logFailure = readOpenCodeServiceFailure(spawnedAgentEnv, {
          since: run.createdAt,
        });
        if (logFailure) {
          stallPayload = createSseErrorPayload(
            logFailure.code,
            logFailure.message,
            { retryable: logFailure.retryable },
          );
        }
      }
      if (!stallPayload) {
        const message =
          `Agent stalled without emitting any new output for ${Math.round(inactivityTimeoutMs / 1000)}s. ` +
          'The model or CLI likely hung while generating. ' +
          `Phase details: spawned agent ${userFacingAgentLabel(agentId, resolvedBin)}; stdout arrived: ${childStdoutSeen ? 'yes' : 'no'}; ` +
          `last agent event: ${lastAgentEventPhase}; largest tool result observed: ${lastToolResultChars} chars. ` +
          'Retry the turn, pick a different model, or start a new conversation if the prior context is very large.';
        stallPayload = createSseErrorPayload('AGENT_EXECUTION_FAILED', message, { retryable: true });
      }
      send('error', stallPayload);
      // A silent first-token hang is one of the safe transient failure shapes
      // this run is allowed to recover: classifyRunFailure maps the stall text
      // to a retryable `timeout` at `first_token_wait`, and decideSafeRunRetry
      // permits the same-run retry when no output/tools/artifacts were seen.
      // Route through the shared finalizer after surfacing stallPayload so the
      // watchdog uses the same retry decision as child close/error.
      const retried = finishWithRetryDecision('failed', 1, null);
      if (retried) {
        watchdogRetryRestarted = true;
      }
      if (rpcSession?.abort) {
        rpcSession.abort();
      }
      if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
      scheduleForcedChildShutdown();
    };
    const activeInactivityTimeoutMs = () =>
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs,
        artifactQuietPeriodMs,
        artifactRegistered,
      });
    const noteAgentActivity = () => {
      // E-lite: stamp the last-activity clock BEFORE the disabled-watchdog bail
      // so `last_progress_age_ms` is recorded even when the watchdog is off.
      run.lastAgentActivityAt = Date.now();
      const delay = activeInactivityTimeoutMs();
      if (delay <= 0) return;
      clearInactivityWatchdog();
      inactivityTimer = setTimeout(failForInactivity, delay);
      inactivityTimer.unref?.();
    };
    const noteArtifactRegistered = () => {
      if (artifactRegistered) return;
      artifactRegistered = true;
      // Switch the watchdog to the shorter quiet-period window
      // immediately so we don't have to wait for the next agent event
      // before the new ceiling takes effect. Call unconditionally:
      // an earlier `if (inactivityTimer)` gate left the run in limbo
      // when `OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS=0` but
      // `OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS>0` — noteAgentActivity()
      // had returned early at run start (pre-artifact delay = 0,
      // no timer set), so the guard then skipped the re-arm and the
      // newly-positive quiet-period delay never armed a timer at all.
      // `noteAgentActivity` itself is the one that decides whether to
      // schedule (it bails when the active delay is 0), so leaving the
      // decision there keeps the behavior coherent across all four
      // combinations of pre / quiet timeouts.
      noteAgentActivity();
    };
    const unregisterChatAgentEventSink = () => {
      const sinkRunId = toolTokenGrant?.runId ?? runId;
      activeChatAgentEventSinks.delete(sinkRunId);
      activeChatRunHandles.delete(sinkRunId);
    };
    if (toolTokenGrant?.runId) {
      activeChatAgentEventSinks.set(toolTokenGrant.runId, (payload) => {
        lastAgentEventPhase = summarizeAgentEventForInactivity(payload);
        noteAgentActivity();
        send('agent', payload);
      });
      activeChatRunHandles.set(toolTokenGrant.runId, { noteArtifactRegistered });
    }
    // If detection can't find the binary, surface a friendly SSE error
    // pointing at /api/agents instead of silently falling back to
    // spawn(def.bin) — that fallback re-introduces the exact ENOENT symptom
    // from issue #10.
    if (!resolvedBin || !agentLaunch.launchPath) {
      cleanupPromptFile();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload(
        'AGENT_UNAVAILABLE',
        `Agent "${def.name}" (\`${def.bin}\`) is not installed or not on PATH. ` +
          'Install it and refresh the agent list (GET /api/agents) before retrying.',
        { retryable: true },
      ));
      return design.runs.finish(run, 'failed', 1, null);
    }
    const browserUseRuntimeEnv = run.browserUse
      ? {
          OD_BROWSER_USE_REQUESTED: run.browserUse.requested ? '1' : '0',
          OD_BROWSER_USE_AVAILABLE: run.browserUse.available ? '1' : '0',
          ...(run.browserUse.reason ? { OD_BROWSER_USE_UNAVAILABLE_REASON: run.browserUse.reason } : {}),
          OD_BROWSER_USE_REGISTRY_PATH: run.browserUse.diagnostics?.registryPath ?? '',
        }
      : {};
    const configuredAgentSpawnEnv = createDaemonDataDirConfiguredAgentEnv(configuredAgentEnv);
    const agentSpawnEnv = spawnEnvForAgent(
      def.id,
      {
        ...createAgentRuntimeEnv(process.env, daemonUrl, toolTokenGrant),
        ...(def.env || {}),
        ...browserUseRuntimeEnv,
      },
      configuredAgentSpawnEnv,
      undefined,
      { resolvedBin: agentLaunch.selectedPath },
    );

    const odMediaEnv = createOpenDesignToolEnv({
      daemonUrl,
      projectDir: cwd,
      projectId: typeof projectId === 'string' ? projectId : null,
    });
    if (run.cancelRequested || design.runs.isTerminal(run.status)) {
      cleanupPromptFile();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      return;
    }

    run.status = 'running';
    run.updatedAt = Date.now();
    send('start', {
      runId,
      agentId,
      bin: userFacingAgentLabel(agentId, resolvedBin),
      streamFormat: def.streamFormat ?? 'plain',
      projectId: typeof projectId === 'string' ? projectId : null,
      cwd,
      model: safeModel,
      reasoning: safeReasoning,
      toolTokenExpiresAt: toolTokenGrant?.expiresAt ?? null,
    });
    noteAgentActivity();

    let child;
    let rpcSession = null;
    let writePromptToChildStdin = false;
    let spawnedAgentEnv = null;
    let agentStdoutTail = '';
    let agentStderrTail = '';
    const emitVisibleAgentStderr = (chunk: unknown) => {
      const visibleChunk = chunk == null ? '' : String(chunk);
      if (!visibleChunk) return;
      agentStderrTail = `${agentStderrTail}${visibleChunk}`.slice(-2000);
      send('stderr', { chunk: visibleChunk });
    };
    const flushVisibleAgentStderr = () => undefined;
    try {
      // Prompt delivery via stdin is now the universal default. This bypasses
      // both the cmd.exe 8KB limit and the CreateProcess 32KB limit.
      const stdinMode = def.promptViaStdin ? 'pipe' : 'ignore';
      const env = applyAgentLaunchEnv({
        ...agentSpawnEnv,
        ...(mmdRouteLaunchEnv || {}),
        ...odMediaEnv,
        ...(byokOpenCodeProvider ? byokOpenCodeProvider.env : {}),
        // Inject only the per-run BYOK provider and linked-directory
        // allowlist. User-managed global OpenCode config remains untouched.
        ...(opencodeConfigContent && runtimeConfigEnvKey
          ? { [runtimeConfigEnvKey]: opencodeConfigContent }
          : {}),
      }, agentLaunch);
      spawnedAgentEnv = env;
      const invocation = createCommandInvocation({
        command: agentLaunch.launchPath,
        args,
        env,
      });
      child = spawn(invocation.command, invocation.args, {
        env,
        stdio: [stdinMode, 'pipe', 'pipe'],
        cwd: effectiveCwd,
        shell: false,
        detached: process.platform !== 'win32',
        // Required when invocation wraps a Windows .cmd/.bat shim through
        // cmd.exe; without this, Node re-escapes the inner command line and
        // breaks paths containing spaces (issue #315).
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      });
      run.child = child;
      run.childPid = typeof child.pid === 'number' ? child.pid : null;
      run.processGroupId =
        process.platform !== 'win32' && typeof child.pid === 'number'
          ? child.pid
          : null;
      // Schedule release of the antigravity model lock once agy's
      // --log-file confirms the chosen model was propagated to the
      // backend (the upstream signal that settings.json was read).
      // The watcher's `false` return (timeout) deliberately does NOT
      // release — looper review at 263fd2fe7 flagged that releasing
      // on timeout reopens the slow-cold-start race: a >15s agy
      // startup that hadn't yet read settings.json would let run B
      // rewrite the file and run A would then read run B's model.
      // The exit handler is the canonical fallback that releases the
      // lock no matter what (crashed agy, fast exit, etc.) so the
      // queue can never starve permanently.
      if (
        antigravityModelLockRelease
        && antigravityConcreteModel
        && agentLogFilePath
      ) {
        const releaseOnce = (() => {
          let fired = false;
          return () => {
            if (fired) return;
            fired = true;
            antigravityModelLockRelease?.();
          };
        })();
        const watcherAbort = new AbortController();
        const { waitForAgyToReadModel } = await import(
          './runtimes/defs/antigravity.js'
        );
        void waitForAgyToReadModel(
          agentLogFilePath,
          antigravityConcreteModel,
          { abortSignal: watcherAbort.signal },
        )
          .then((found) => {
            // Only release on TRUE confirmation; a `false` return means
            // the watcher ran out of its polling window without seeing
            // the propagation line. We hold the lock until child exit
            // so a slow-cold-start agy can't be pre-empted by a
            // concurrent settings.json rewrite from run B.
            if (found) releaseOnce();
          })
          .catch(() => undefined);
        child.once('exit', () => {
          // Stop the watcher so its pending readFile / setTimeout
          // chain does not outlive the run and leak into subsequent
          // antigravity spawns (or test cases).
          watcherAbort.abort();
          releaseOnce();
        });
      }
      if (def.promptViaStdin && child.stdin && def.streamFormat !== 'pi-rpc') {
        // EPIPE from a fast-exiting CLI (bad auth, missing model, exit on
        // launch) would otherwise surface as an unhandled stream error and
        // crash the daemon. Swallow it — the regular exit/close handlers
        // below already route the underlying failure to SSE via stderr.
        child.stdin.on('error', (err) => {
          // EPIPE = Unix broken-pipe when child closes its stdin read end
          // early. 'write EOF' (err.code 'EOF') = Windows equivalent of
          // the same condition via UV_EOF. Both mean the child exited before
          // reading stdin — the process exit/close handlers already route
          // the underlying failure to SSE via stderr, so swallow these here.
          if (err.code !== 'EPIPE' && err.code !== 'EOF' && err.message !== 'write EOF') {
            send(
              'error',
              createSseErrorPayload(
                'AGENT_EXECUTION_FAILED',
                `stdin: ${err.message}`,
              ),
            );
          }
        });
        writePromptToChildStdin = true;
      }
    } catch (err) {
      cleanupPromptFile();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', `spawn failed: ${err.message}`));
      design.runs.finish(run, 'failed', 1, null);
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    // Reset the inactivity watchdog on every raw stdout byte so that
    // structured adapters that buffer partial lines (Codex item.completed and
    // pi-rpc session/prompt) and models that spend a
    // long time in non-streamed reasoning still keep the run alive.
    child.stdout.on('data', (chunk) => {
      childStdoutSeen = true;
      noteAgentActivity();
      agentStdoutTail = `${agentStdoutTail}${chunk}`.slice(-2000);
    });

    // ---- Memory: assistant-reply capture for LLM extraction --------------
    // Hand the extractor the guarded, rendered reply (`memoryReplyText`, fed
    // through `send()` from either the `agent` text_delta or the `stdout`
    // channel), NOT the child's raw stdout. For stream-json agents (Claude Code)
    // raw stdout is JSONL transport — system:init, stream_event thinking deltas,
    // hook_started/hook_response frames — none of which is the reply; mining it
    // produced empty extractions that, near-identical across a build's re-fires,
    // caused the same turn to be re-analyzed dozens of times.
    child.on('close', () => {
      const userMsg = typeof message === 'string' ? message : '';
      // Forward the chat agent id so memory-llm.pickProvider can
      // constrain its auto-pick to the chat protocol's family — keeps
      // a Claude Code (anthropic) chat from triggering OpenAI/gpt-4o-
      // mini extraction in the background just because the user has
      // an OpenAI key parked in media-config.
      //
      // Also normalize the BYOK provider shape: web side sends
      // `{ protocol, ... }` via the chat body as `byokProvider`,
      // but memory-llm.pickProvider expects `{ provider, ... }`
      // with `provider` being a PROVIDER_DEFAULTS key. We apply the
      // same mapping the web pre-turn path does (ProjectView.tsx
      // constructs `{ provider: byokOpenCodeProvider.protocol, ... }`).
      const memoryChatProvider: {
        provider?: string;
        apiKey?: string;
        baseUrl?: string;
        apiVersion?: string;
        model?: string;
        requiresApiKey?: boolean;
      } | null = byokProvider
        ? {
            provider: (byokProvider as { protocol?: string }).protocol ?? undefined,
            apiKey: (byokProvider as { apiKey?: string }).apiKey,
            baseUrl: (byokProvider as { baseUrl?: string }).baseUrl,
            apiVersion: (byokProvider as { apiVersion?: string }).apiVersion,
            model: (byokProvider as { model?: string }).model,
            requiresApiKey: (byokProvider as { requiresApiKey?: boolean }).requiresApiKey,
          }
        : null;
      const memoryOptions = {
        projectRoot: PROJECT_ROOT,
        chatAgentId: typeof agentId === 'string' ? agentId : null,
        chatModel: typeof safeModel === 'string' ? safeModel : null,
        // Forward the per-call BYOK provider snapshot so pickProvider()
        // can run "Same as chat" extraction against the user's actual
        // provider/endpoint/model instead of falling back to defaults.
        chatProvider: memoryChatProvider,
        // Scope the extractor's duplicate-turn de-dup to this conversation, so a
        // re-fired turn collapses but an identical (message, reply) in another
        // conversation is still examined.
        conversationId: run.conversationId ?? null,
      };
      void import('./memory-llm.js')
        .then(({ extractWithLLM, distillAnnotationsToMemory }) => {
          // Read the reply HERE, in the post-import microtask, not in the
          // synchronous close handler: the Claude stream flush is a later
          // 'close' listener, so deferring the read lets flush() emit the reply's
          // final buffered frame first and a reply that ends without a trailing
          // newline isn't truncated.
          const captured = memoryReplyText;
          const generalPass = extractWithLLM(
            RUNTIME_DATA_DIR,
            {
              userMessage: userMsg,
              assistantMessage: captured,
            },
            memoryOptions,
          );
          // Auto-distill any inline preview feedback (comments / highlights /
          // drawn marks) from this turn into durable feedback + rule memory.
          // This closes the "interaction → memory" loop automatically: the
          // agent no longer has to propose a rule and the user no longer has
          // to click Keep — a review turn that carried annotations mines
          // itself in the background and writes straight to the store.
          const annotationPass =
            safeCommentAttachments.length > 0
              ? distillAnnotationsToMemory(
                  RUNTIME_DATA_DIR,
                  {
                    annotations: safeCommentAttachments,
                    userMessage: userMsg,
                    assistantMessage: captured,
                  },
                  memoryOptions,
                )
              : Promise.resolve([]);
          return Promise.allSettled([generalPass, annotationPass]);
        })
        .catch((err) => console.warn('[memory-llm] background failed', err));
    });

    // Critique Theater branch (M0 dark launch, default disabled).
    // Only plain-stream adapters are routed through runOrchestrator in v1.
    // Adapters that emit structured wrappers (claude-stream-json,
    // json-event-stream, pi-rpc) fall
    // through to the legacy single-pass code path below with a one-time
    // stderr warning so the parser never sees wrapper bytes. Per-format
    // decoding into the orchestrator is a v2 concern.
    //
    // Use critiqueShouldRun (computed in the prompt builder) instead of
    // just the env var or the rollout resolver so the orchestrator gate
    // is in lockstep with the panel addendum. Media surfaces and runs
    // missing brand/skill context never get the panel prompt, so they
    // must also skip the orchestrator and fall through to legacy
    // generation; otherwise the parser waits for <CRITIQUE_RUN> tags
    // the model was never told to emit.
    if (critiqueShouldRun) {
      const adapterStreamFormat: string = def.streamFormat ?? 'plain';
      if (adapterStreamFormat !== 'plain') {
        if (!critiqueWarnedAdapters.has(adapterStreamFormat)) {
          critiqueWarnedAdapters.add(adapterStreamFormat);
          console.warn(`[critique] adapter format=${adapterStreamFormat} is not plain-stream; skipping orchestrator and falling through to legacy generation`);
        }
      } else {
        const critiqueRunId = run.id;
        // Per-run artifact directory keeps concurrent or sequential runs in the
        // same project from overwriting each other's transcript or final HTML.
        // Spec: artifacts/<projectId>/<runId>/transcript.ndjson(.gz).
        const critiqueProjectKey = typeof projectId === 'string' && projectId ? projectId : critiqueRunId;
        const critiqueArtifactDir = path.join(ARTIFACTS_DIR, critiqueProjectKey, critiqueRunId);
        const stdoutIterable = (async function* () {
          for await (const chunk of child.stdout) yield String(chunk);
        })();
        // Forward each CritiqueSseEvent on its own contract-defined channel
        // (critique.run_started, critique.ship, critique.failed, ...) rather
        // than wrapping the frame inside the legacy 'agent' channel. Clients
        // that subscribe to the new event names see them directly with the
        // contract payload as event.data.
        //
        // Critique events go to TWO sinks (codex P1 on PR #1338):
        //
        //   1. `design.runs.emit(...)` via `send(...)`, which fans out on
        //      `/api/runs/:runId/events`. Existing transport, unchanged.
        //   2. The per-project event-sinks map, which fans out on
        //      `/api/projects/:projectId/events`. This is the transport the
        //      web `CritiqueTheaterMount` actually subscribes to (the mount
        //      is project-scoped, not run-scoped, because it lives at the
        //      project workspace level and follows the user across runs).
        //      Without this second sink the mount sees no frames in
        //      production and only the e2e tests' stubbed routes deliver
        //      anything to the reducer.
        //
        // The project-events route emits via `sse.send(payload.type,
        // payload)`, so we pack the SSE channel name onto `payload.type`
        // and let the sink push the right channel name. The web's
        // `sseToPanelEvent` overwrites `type` from the channel name on the
        // way back into a PanelEvent, so this round-trip stays correct.
        const critiqueProjectIdForBus =
          typeof projectId === 'string' && projectId ? projectId : null;
        const critiqueBus = {
          emit: (e) => {
            // Two transports for every critique event: the run-scoped
            // SSE send back to the originating chat run, plus the
            // project-scoped fan-out so the Theater mount (subscribed
            // to /api/projects/:id/events) sees it too. Route the
            // project fan-out through emitProjectEvent so empty-sink
            // cleanup and any future broadcast policy (rate limiting,
            // schema validation and run bookkeeping) apply uniformly across
            // every project emitter (PerishCode P3 on PR #1338).
            send(e.event, e.data);
            if (critiqueProjectIdForBus) {
              emitProjectEvent(critiqueProjectIdForBus, { ...e.data, type: e.event });
            }
          },
        };

        // Register this run with the in-process registry so the interrupt
        // endpoint can cascade an AbortController to the orchestrator. The
        // register call must run BEFORE runOrchestrator is invoked, so a
        // request that arrives between spawn and orchestrator-start cannot
        // miss a runId that already has a live child process.
        const critiqueAbort = new AbortController();
        critiqueRunRegistry.register({
          runId: critiqueRunId,
          projectId: critiqueProjectKey,
          abort: critiqueAbort,
          startedAt: Date.now(),
        });

        // Stderr forwarding and child.on('error') must be wired BEFORE the
        // orchestrator awaits stdout. Otherwise a CLI that floods stderr can
        // fill the OS pipe and deadlock the run until the total timeout, and
        // an early child error fired before the orchestrator returns has no
        // listener. Both registrations are idempotent and the run lifecycle
        // is owned solely by the orchestrator's awaited result below.
        child.stderr.on('data', (chunk) => {
          noteAgentActivity();
          emitVisibleAgentStderr(chunk);
        });
        child.on('error', (err) => {
          flushVisibleAgentStderr();
          send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
        });

        // Wrap the child's close event so the orchestrator can race child
        // exit against parser completion, abort, and timeouts in one awaited
        // flow. Without this the orchestrator can't tell a non-zero exit
        // apart from a clean ship and may misclassify failures.
        const childExitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
          child.once('close', (code, signal) => {
            flushVisibleAgentStderr();
            resolve({ code, signal });
          });
        });
        try {
          const orchestratorResult = await runOrchestrator({
            runId: critiqueRunId,
            projectId: typeof projectId === 'string' ? projectId : '',
            conversationId: typeof conversationId === 'string' ? conversationId : null,
            artifactId: critiqueRunId,
            artifactDir: critiqueArtifactDir,
            adapter: typeof agentId === 'string' ? agentId : 'unknown',
            // Codex P2 on PR #1485: thread the resolved skill id into the
            // orchestrator so the Phase 12 metrics carry the real label
            // instead of falling through to 'unknown' for every live run.
            // `effectiveSkillId` was already computed above (line ~2951) as
            // the request skillId with a project-row fallback; pass it
            // through verbatim, and leave the orchestrator's own default
            // of 'unknown' for runs that genuinely have no skill assigned.
            skill: typeof effectiveSkillId === 'string' && effectiveSkillId
              ? effectiveSkillId
              : undefined,
            cfg: critiqueCfg,
            db,
            bus: critiqueBus,
            stdout: stdoutIterable,
            child,
            childExitPromise,
            signal: critiqueAbort.signal,
          });
          // Map the critique terminal status to the chat run lifecycle.
          // 'shipped' and 'below_threshold' both ran to a ship decision and
          // finalize as 'succeeded'; every other status (timed_out,
          // interrupted, degraded, failed, legacy) is a failure path so the
          // run reflects the real outcome instead of a misleading success.
          const succeeded = orchestratorResult.status === 'shipped'
            || orchestratorResult.status === 'below_threshold';
          if (run.cancelRequested) {
            design.runs.finish(run, 'canceled', 1, null);
          } else if (succeeded) {
            design.runs.finish(run, 'succeeded', 0, null);
          } else {
            design.runs.finish(run, 'failed', 1, null);
          }
        } catch (err) {
          flushVisibleAgentStderr();
          send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err)));
          design.runs.finish(run, 'failed', 1, null);
        } finally {
          critiqueRunRegistry.unregister(critiqueProjectKey, critiqueRunId);
        }
        return;
      }
    }

    // Structured streams (Claude Code) go through a line-delimited JSON
    // parser that turns stream_event objects into UI-friendly events. For
    // plain streams (most other CLIs) we forward raw chunks unchanged so
    // the browser can append them to the assistant's text buffer.
    let agentStreamError = null;
    // Preserve whether a latched error predates a later cancel request. The
    // close handler runs after cancel() has already flipped cancelRequested,
    // so consulting only the current flag loses the ordering of those events.
    let agentStreamErrorObservedBeforeCancellation = false;
    let rpcFatalErrorObservedBeforeCancellation = false;
    run.runtimeFailureObservedBeforeCancellation = false;
    // Holds buffered plain-text stdout chunks for agents (currently
    // antigravity) where we need to inspect the full output at close
    // time before deciding whether to forward it. The auth-prompt guard
    // in the close handler suppresses the buffer when the output is an
    // OAuth prompt; otherwise the flush below sends the chunks in order.
    const plaintextStdoutBuffer: Array<{ text: string }> = [];
    // Tracks whether any stream the run is using actually emitted user-
    // visible content or a deliverable. Only the streams routed through
    // `sendAgentEvent` contribute to this flag; plain stdout streams are
    // covered by their own success/failure paths and the
    // empty-output guard below skips them via `trackingSubstantiveOutput`.
    let agentProducedOutput = false;
    let trackingSubstantiveOutput = false;
    // Event types that count as "the agent actually produced a response or a
    // deliverable." Lifecycle markers (`status`), meter readings (`usage`),
    // reasoning deltas, and tool activity deliberately do NOT count: a run can
    // think/read/call tools and still terminate before returning text/artifacts
    // to the user. Treat that as empty output instead of a silent success
    // (issues #691, #4814).
    const SUBSTANTIVE_AGENT_EVENT_TYPES = new Set([
      'text_delta',
      'artifact',
    ]);

    // Per-run role-marker guard for non-Claude structured streams (#3247).
    // Claude has its own per-message guards in claude-stream.ts.
    const runGuard = createRoleMarkerGuard('run');
    let runWarned = false;
    const visibleStdoutControlStripper = new TerminalControlSequenceStripper();
    const titleMarkerStripper = createAgentTitleMarkerStripper({
      enabled: Boolean(titleGenerationRequested),
      emitTitle: (title) => send('agent', { type: 'conversation_title', title }),
    });

    function flushAgentTitleMarkerBuffer() {
      const visible = titleMarkerStripper.flush();
      if (visible) emitGuardedTextDelta(visible);
    }

    function guardTextDelta(delta) {
      return runGuard.feedText(delta);
    }

    // Shared helper for emitting guarded text deltas across agent stream
    // handlers.
    function emitGuardedTextDelta(delta: string) {
      const safe = guardTextDelta(delta);
      if (safe.length > 0) {
        send('agent', { type: 'text_delta', delta: safe });
      }
      if (runGuard.contaminated && !runWarned) {
        runWarned = true;
        const warn = runGuard.warningEvent();
        if (warn) {
          send('agent', warn);
          abortForRoleMarker(warn.marker);
        }
      }
    }

    function emitTitleFilteredGuardedTextDelta(delta: string) {
      const visibleDelta = titleMarkerStripper.strip(delta);
      if (!visibleDelta) return false;
      emitGuardedTextDelta(visibleDelta);
      return true;
    }

    // Detection-only is necessary but not sufficient: by the time we see
    // the role marker the model has already burned tokens, and the
    // subprocess will keep generating downstream tokens (including
    // `tool_use` blocks built on the fabricated context) until it exits
    // on its own. We terminate the child immediately so:
    //   1. Token accounting stops at the detection point, not at the
    //      model's natural completion of the contaminated response.
    //   2. `tool_use` content blocks emitted AFTER the marker cannot
    //      reach the daemon's tool-call dispatcher. Blocks emitted
    //      BEFORE the marker have already been dispatched; this guard
    //      can't help with those — they're a separate hardening.
    //   3. The UI distinguishes "completed" from "killed by safety
    //      guard" through a structured SSE error rather than seeing a
    //      `fabricated_role_marker` warning followed by an eventual
    //      normal turn-end.
    // Idempotent — multiple guard paths (per-message Claude, run-scoped
    // non-Claude, plain stdout) can all call it.
    let roleMarkerAbortFired = false;
    function abortForRoleMarker(marker: string) {
      if (roleMarkerAbortFired) return;
      roleMarkerAbortFired = true;
      send(
        'error',
        createSseErrorPayload(
          'ROLE_MARKER_HALLUCINATION',
          `Run terminated: model emitted fabricated role marker (\`${marker}\`). ` +
            'No further tokens or tool calls accepted from this turn. ' +
            'See https://github.com/nexu-io/open-design/issues/3247.',
          { retryable: true },
        ),
      );
      if (rpcSession?.abort) {
        try {
          rpcSession.abort();
        } catch {
          // ignore — best-effort
        }
      }
      if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
      scheduleForcedChildShutdown();
    }

    // Per-run tool-loop guard. Agents sometimes fixate on a failing tool call
    // and grind through dozens of identical attempts (e.g. re-running an Edit
    // whose `old_string` never matches, or a shell assertion against an element
    // that does not exist). Unlike the BYOK proxy path — bounded by
    // MAX_BYOK_TOOL_LOOPS — the autonomous chat agents had no such bound. This
    // guard observes the normalized tool_use/tool_result events every retained
    // agent path emits. It emits a one-shot `tool_loop` warning, then terminates
    // the run at a hard ceiling. Mode via OD_TOOL_LOOP_GUARD (halt|warn|off).
    const toolLoopGuard = createToolLoopGuard({ mode: resolveToolLoopMode() });
    let toolLoopAbortFired = false;

    // Idempotent — both agent-event paths (sendAgentEvent, the Claude
    // stream-json callback) can route a halt verdict here.
    function abortForToolLoop(verdict: ToolLoopVerdict) {
      if (toolLoopAbortFired) return;
      toolLoopAbortFired = true;
      send(
        'error',
        createSseErrorPayload(
          'TOOL_LOOP_DETECTED',
          `Run terminated: the agent repeated a failing ${verdict.toolName} call ` +
            `${verdict.count}× without progress (\`${verdict.signature}\`). Re-check the ` +
            'actual target — the file, the element, the command — before retrying ' +
            'instead of resubmitting the same turn.',
          { retryable: true },
        ),
      );
      if (rpcSession?.abort) {
        try {
          rpcSession.abort();
        } catch {
          // ignore — best-effort
        }
      }
      // Route through signalChild (not a bare child.kill) so the halt escalates
      // to the whole process group when one exists, matching abortForRoleMarker,
      // cancel, and the inactivity watchdog. A bare child.kill leaves Bash/build
      // grandchildren alive to keep mutating the workspace until the forced
      // shutdown fires — exactly the loop class this guard is meant to stop.
      if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
      scheduleForcedChildShutdown();
    }

    // Feed a normalized agent event into the loop guard and act on a verdict.
    // Safe to call for every event; non-tool events are ignored. Emit the
    // `tool_loop` warning to the UI/CLI, and on a halt verdict tear the run
    // down so it cannot keep grinding.
    function observeToolEventForLoop(ev: any) {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'tool_use' && typeof ev.id === 'string') {
        toolLoopGuard.observeToolUse(ev.id, typeof ev.name === 'string' ? ev.name : 'tool', ev.input);
        return;
      }
      if (ev.type === 'tool_result' && typeof ev.toolUseId === 'string') {
        const verdict = toolLoopGuard.observeToolResult(
          ev.toolUseId,
          Boolean(ev.isError),
          typeof ev.content === 'string' ? ev.content : '',
        );
        if (verdict) {
          send('agent', verdict);
          if (verdict.action === 'halt') abortForToolLoop(verdict);
        }
      }
    }

    // Single choke point for emitting an agent event to the client. Every
    // retained stream handler
    // emits through here, never via a bare send('agent', …), so the tool-loop
    // guard sees every runtime's tool activity and no handler can drift out of
    // coverage. observe runs AFTER the send so a `tool_loop` warning/halt
    // follows the result that triggered it in the stream.
    function emitAgentEvent(ev: any) {
      // Fold work-completeness signals (TodoWrite snapshot / truncation) off the
      // stream BEFORE the send, so run.lastTodoSnapshot / run.truncatedMidTurn are
      // set by the time finish() derives run.endedWithUnfinishedWork (#1247/#1060).
      captureRunWorkCompletenessSignals(run, ev);
      send('agent', ev);
      observeToolEventForLoop(ev);
    }

    const sendAgentEvent = (ev) => {
      if (ev?.type === 'error') {
        // Cancellation is the terminal user intent. Some CLIs flush a final
        // error record while reacting to SIGTERM; treating that late frame as
        // a run failure races the cancel route and can make it return failed.
        if (run.cancelRequested) return;
        if (agentStreamError) return;
        flushVisibleAgentStderr();
        const failureText = [
          String(ev.message || 'Agent stream error'),
          typeof ev.raw === 'string' ? ev.raw : '',
          agentStdoutTail,
          agentStderrTail,
        ].join('\n');
        agentStreamError = rewriteKnownAgentStreamError(
          agentId,
          String(ev.message || 'Agent stream error'),
          failureText,
        );
        agentStreamErrorObservedBeforeCancellation = true;
        run.runtimeFailureObservedBeforeCancellation = true;
        clearInactivityWatchdog();
        const authFailure = classifyAgentAuthFailure(agentId, failureText);
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            authFailure.message ?? genericAgentAuthGuidance(def.name),
            { retryable: true },
          ));
          return;
        }
        // Recover the specific model-service failure class (auth / quota /
        // upstream) for agents without a tailored probe (Claude Code, codex,
        // …), so the chat shows an accurate reason instead of the generic
        // execution-failed bucket.
        const serviceCode = classifyAgentServiceFailure(failureText);
        if (serviceCode) {
          send('error', createSseErrorPayload(serviceCode, agentStreamError, {
            details: ev.raw ? { raw: ev.raw } : undefined,
            retryable: true,
          }));
          return;
        }
        send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', agentStreamError, {
          details: ev.raw ? { raw: ev.raw } : undefined,
        }));
        return;
      }
      // First well-formed decoded stream event = CLI ready for the
      // json-event-stream / pi-rpc families (#3408 §4 marker).
      // Capture-style resume: codex reports its own thread id on the
      // `thread.started` status event. Persist the most recent non-empty id we
      // see so the create-turn store (and the resumable-failure store) use the
      // CLI's real session handle, not the unused daemon-minted `newSessionId`.
      if (
        agentCapturesSessionId &&
        ev?.type === 'status' &&
        typeof ev.sessionId === 'string' &&
        ev.sessionId.length > 0
      ) {
        capturedSessionId = ev.sessionId;
        run.nativeSessionRecovery = markNativeSessionCaptured({
          previous: run.nativeSessionRecovery,
          agentId: def.id,
          sessionId: capturedSessionId,
          resumed: agentResumeCtx.isResuming,
        });
        publishNativeSessionRecoveryMetadata();
      }
      lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
      noteAgentActivity();
      // Role-marker guard for json-event-stream / pi-rpc (#3247).
      if (ev?.type === 'text_delta' && typeof ev.delta === 'string') {
        if (emitTitleFilteredGuardedTextDelta(ev.delta)) {
          agentProducedOutput = true;
        }
        return;
      }
      if (ev?.type && SUBSTANTIVE_AGENT_EVENT_TYPES.has(ev.type)) {
        agentProducedOutput = true;
      }
      emitAgentEvent(ev);
    };
    const parseBufferedAntigravityGeminiJsonEventStream = () => {
      if (
        def.id !== 'antigravity' ||
        plaintextStdoutBuffer.length === 0
      ) {
        return false;
      }
      const bufferedStdout = plaintextStdoutBuffer.map((chunk) => chunk.text).join('');
      if (!looksLikeGeminiJsonEventStream(bufferedStdout)) return false;
      trackingSubstantiveOutput = true;
      const handler = createJsonEventStreamHandler('gemini', sendAgentEvent);
      handler.feed(bufferedStdout);
      handler.flush();
      plaintextStdoutBuffer.length = 0;
      return true;
    };

    if (def.streamFormat === 'claude-stream-json') {
      const claude = createClaudeStreamHandler((ev) => {
        // First parsed claude-stream-json event = CLI ready (#3408 §4); the
        // init/system line arrives well before the model's first token.
        if (ev?.type === 'error') {
          // Claude commonly reports its SIGTERM shutdown as an assistant or
          // result error frame. Once cancellation has been requested, that
          // frame is shutdown noise rather than a new user-visible failure.
          if (run.cancelRequested) return;
          if (agentStreamError) return;
          // Hold back a resume-failure error so the close handler's transparent
          // reseed stays invisible. An is_error result frame on a dead --resume
          // now surfaces here as a stream error; the resume-target-missing
          // block in the close handler clears the stale handle and re-runs the
          // turn fresh, so forwarding this error would flash an execution
          // failure a beat before the invisible recovery. The close handler
          // stays the sole authority on how a resume failure ends.
          if (
            def.resumesSessionViaCli === true &&
            agentResumeCtx.isResuming &&
            !run.resumeAutoReseeded &&
            isAgentResumeFailure(def.id, agentStderrTail, agentStdoutTail)
          ) {
            design.runs.emit(run, 'diagnostic', {
              type: 'agent_resume_failed_suppressed',
              agent_id: def.id,
              reason: 'resume_failed',
              previous_session_id: agentResumeCtx.resumeSessionId ?? null,
            });
            return;
          }
          flushVisibleAgentStderr();
          const message = String((ev as any).message || 'Claude Code stream error');
          const failureText = [
            message,
            typeof (ev as any).code === 'string' ? (ev as any).code : '',
            agentStdoutTail,
            agentStderrTail,
          ].join('\n');
          clearInactivityWatchdog();
          // Claude surfaces a connection drop / reset as an in-stream `error`
          // frame (assistant `error:"unknown"` + the raw SDK string), which
          // would otherwise reach the UI verbatim as a non-retryable
          // AGENT_EXECUTION_FAILED. Run the same per-agent diagnostic used at
          // child-exit so this path emits the specific class
          // (AGENT_CONNECTION_DROPPED) — retryable, with copy the web can
          // localize and triage can count by code.
          const diagnostic = diagnoseClaudeCliFailure({
            agentId: def.id,
            exitCode: 1,
            stderrTail: agentStderrTail,
            stdoutTail: failureText,
            env: spawnedAgentEnv,
            resolvedBin: agentLaunch.selectedPath,
          });
          const serviceCode = classifyAgentServiceFailure(failureText);
          agentStreamError = diagnostic?.message
            ?? rewriteKnownAgentStreamError(agentId, message, failureText);
          agentStreamErrorObservedBeforeCancellation = true;
          run.runtimeFailureObservedBeforeCancellation = true;
          send('error', createSseErrorPayload(
            diagnostic?.code ?? serviceCode ?? 'AGENT_EXECUTION_FAILED',
            agentStreamError,
            {
              retryable: diagnostic?.retryable
                ?? (serviceCode === 'AGENT_AUTH_REQUIRED' || serviceCode === 'RATE_LIMITED'),
              ...(diagnostic ? { details: { detail: diagnostic.detail } } : {}),
            },
          ));
          return;
        }
        lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
        noteAgentActivity();
        if (ev?.type === 'text_delta' && typeof ev.delta === 'string') {
          const visibleDelta = titleMarkerStripper.strip(ev.delta);
          if (visibleDelta) {
            emitAgentEvent({ ...ev, delta: visibleDelta });
          }
          return;
        }
        emitAgentEvent(ev);
        // Claude uses per-message guards (claude-stream.ts) rather than the
        // run-scoped guard above, so its `fabricated_role_marker` events
        // surface here directly from the stream handler, not via
        // emitGuardedTextDelta. Same abort semantics apply.
        if (ev && (ev as any).type === 'fabricated_role_marker') {
          const m = (ev as any).marker;
          abortForRoleMarker(typeof m === 'string' ? m : 'role marker');
        }
        // Stream-json input mode keeps the child's stdin open across the
        // turn so the daemon can stream further user messages mid-turn. The
        // child has no other way to know the turn is over, though — without
        // an EOF it sits idle until the inactivity watchdog kills it.
        // Bookkeeping here closes stdin on a clean terminal turn:
        //   - turn_end (per-turn synthesized from `stop_reason`): fire on
        //     `end_turn` etc. but NOT on `tool_use` — that stop reason
        //     means the model paused mid-tool, not "turn complete".
        //   - usage (session result at EOF in single-shot mode).
        try {
          applyClaudeStreamJsonRunBookkeeping(run, ev);
        } catch {}
      }, { suppressHtmlArtifactsAfterFileWrite: def.id === 'claude' });
      child.stdout.on('data', (chunk) => claude.feed(chunk));
      child.on('close', () => claude.flush());
    } else if (def.streamFormat === 'pi-rpc') {
      // Route through sendAgentEvent so that pi-rpc's error events
      // (extension_error, auto_retry_end with success=false, and the
      // message_update error delta) set agentStreamError and flip the
      // run to `failed` on close — the same path as json-event-stream.
      // Also enables the
      // substantive-output guard (agentProducedOutput) so a pi run
      // that exits 0 without producing visible content is caught.
      //
      // attachPiRpcSession invokes its send callback with the two-arg
      // channel/payload shape: send('agent', payload) for normal events
      // and send('error', {message}) from fail(). sendAgentEvent
      // expects a single event object, so we adapt at the call site:
      //   - 'agent' channel → relay payload through sendAgentEvent
      //   - 'error' channel → route through the daemon's error path
      //     (createSseErrorPayload + send SSE + set agentStreamError)
      trackingSubstantiveOutput = true;
      rpcSession = attachPiRpcSession({
        child,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        parentSession: agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId
          ? agentResumeCtx.resumeSessionId
          : undefined,
        send: (channel, payload) => {
          if (channel === 'agent') {
            sendAgentEvent(payload);
          } else if (channel === 'error') {
            if (run.cancelRequested) return;
            if (agentStreamError) return;
            flushVisibleAgentStderr();
            agentStreamError = String(payload?.message || 'Pi session error');
            agentStreamErrorObservedBeforeCancellation = true;
            rpcFatalErrorObservedBeforeCancellation = true;
            run.runtimeFailureObservedBeforeCancellation = true;
            const piErrorCode = typeof payload?.code === 'string' ? payload.code : null;
            if (piErrorCode) {
              run.errorCode = piErrorCode;
            }
            if (piErrorCode === 'PI_PARENT_SESSION_FAILED' && run.conversationId) {
              clearAgentSession(db, run.conversationId, def.id);
            }
            clearInactivityWatchdog();
            send('error', createSseErrorPayload(
              'AGENT_EXECUTION_FAILED',
              agentStreamError,
              { retryable: false },
            ));
          } else {
            noteAgentActivity();
            send(channel, payload);
          }
        },
        imagePaths: def.supportsImagePaths ? agentImagePaths : [],
        uploadRoot: UPLOAD_DIR,
      });
    } else if (def.streamFormat === 'json-event-stream') {
      // Pipe through sendAgentEvent so the OpenCode `type:'error'` frame
      // (now emitted as a real error event by json-event-stream.ts after
      // #691) actually triggers `agentStreamError` instead of being
      // forwarded as a no-op `agent` SSE event. This also wires the
      // substantive-output tracking the close handler reads below.
      trackingSubstantiveOutput = true;
      const handler = createJsonEventStreamHandler(
        def.eventParser || def.id,
        sendAgentEvent,
      );
      child.stdout.on('data', (chunk) => handler.feed(chunk));
      child.on('close', () => handler.flush());
    } else if (def.id === 'antigravity') {
      // Buffer stdout until close so the auth-prompt guard can suppress
      // the OAuth URL before forwarding it to the client as assistant
      // text. agy exits 0 after printing the auth URL on stdout, so the
      // chunks would otherwise arrive before the close-time classifier
      // detects them as an auth prompt. First-token timing is deliberately
      // NOT stamped here — only the first chunk's arrival time is recorded,
      // and `firstTokenAt` is stamped from it at flush time so the
      // suppressed OAuth-prompt path never reports a TTFT (PR #3412).
      child.stdout.on('data', (chunk) => {
        noteAgentActivity();
        plaintextStdoutBuffer.push({ text: String(chunk) });
      });
    } else {
      // Plain / BYOK mode: guard raw stdout chunks (#3247).
      child.stdout.on('data', (chunk) => {
        noteAgentActivity();
        const text = typeof chunk === 'string' ? chunk : String(chunk);
        // First non-empty stdout chunk = CLI ready for the plain family
        // (#3408 §4 marker). A plain adapter has no structured preamble, so
        // this typically coincides with its first model output.
        const strippedText = visibleStdoutControlStripper.write(text);
        const visibleText = titleMarkerStripper.strip(strippedText);
        const safe = guardTextDelta(visibleText);
        if (safe.length > 0) {
          send('stdout', { chunk: safe });
        }
        if (runGuard.contaminated && !runWarned) {
          runWarned = true;
          const warn = runGuard.warningEvent();
          if (warn) {
            send('agent', warn);
            abortForRoleMarker(warn.marker);
          }
        }
      });
    }
    // Wire Pi's RPC session onto the run so cancel() can request a graceful
    // abort before falling back to process signals.
    run.rpcSession = rpcSession;
    child.stderr.on('data', (chunk) => {
      noteAgentActivity();
      emitVisibleAgentStderr(chunk);
    });

    const finishCanceledIfRequested = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): boolean => {
      if (!run.cancelRequested) return false;
      if (!design.runs.isTerminal(run.status)) {
        markRpcCloseReason('cancel_requested');
        finishWithRetryDecision('canceled', code, signal);
      }
      return true;
    };

    child.on('error', (err) => {
      clearInactivityWatchdog();
      cleanupPromptFile();
      flushVisibleAgentStderr();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      if (finishCanceledIfRequested(1, null)) return;
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
      finishWithRetryDecision('failed', 1, null);
    });
    child.on('close', async (code, signal) => {
      try {
      clearInactivityWatchdog();
      clearForcedChildShutdown();
      flushVisibleAgentStderr();
      if (watchdogRetryRestarted) {
        // The inactivity watchdog already failed this attempt and the same-run
        // retry restarted on a fresh child. Finalization and event-sink / run-
        // handle ownership (keyed by the shared runId) now belong to the new
        // attempt, so this stalled child's close must not re-run them — doing
        // so would re-finalize the run and delete the new attempt's sink.
        // Revoke only THIS attempt's tool token (idempotent, keyed by its own
        // token string) and bail; the `finally` block still cleans up logs.
        revokeToolToken('child_exit');
        return;
      }
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      // Resume-target-missing recovery runs before generic stream-error
      // handling. Otherwise the dead session id would stay stored and every
      // later turn would retry the same broken resume.
      if (
        !run.cancelRequested &&
        def.resumesSessionViaCli === true &&
        agentResumeCtx.isResuming &&
        run.conversationId &&
        isAgentResumeFailure(def.id, agentStderrTail, agentStdoutTail)
      ) {
        // The resumed upstream session is gone (expired / pruned). Clear the dead
        // handle and TRANSPARENTLY re-run this same turn with a fresh session +
        // the full transcript rebuilt from the DB — exactly the pre-session-reuse
        // path. The user sees one (slightly slower) turn, never an error or a
        // "resend" prompt. Re-spawn reuses the same-run retry machinery; because
        // the session row is now cleared, the re-spawn resolves isResuming=false
        // (fresh session, full transcript), so it CANNOT resume-fail again — the
        // `resumeAutoReseeded` guard is belt-and-suspenders against any loop.
        clearAgentSession(db, run.conversationId, def.id);
        if (!run.resumeAutoReseeded) {
          run.resumeAutoReseeded = true;
          run.resumeAutoReseededFrom = agentResumeCtx.resumeSessionId ?? null;
          run.nativeSessionRecovery = markNativeSessionAutoReseeded({
            previous: run.nativeSessionRecovery,
            agentId: def.id,
            previousSessionId: agentResumeCtx.resumeSessionId,
          });
          publishNativeSessionRecoveryMetadata();
          // Persisted to the per-run events.jsonl that the help → diagnostics
          // export bundles, so the whole resume → fail → auto-reseed chain is
          // visible in a support bundle without any user-facing signal.
          design.runs.emit(run, 'diagnostic', {
            type: 'agent_resume_auto_reseed',
            agent_id: def.id,
            reason: 'resume_failed',
            previous_session_id: agentResumeCtx.resumeSessionId ?? null,
            stale_session_cleared: true,
            nativeSessionRecovery: run.nativeSessionRecovery,
          });
          scheduleRetryRestart(0);
          return;
        }
        // Unreachable in practice (the reseed runs fresh); if a second resume
        // failure ever surfaces in one run, fall back to the explicit affordance.
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'The previous session could not be resumed (it may have expired). Resend your message to continue with a fresh session.',
          { retryable: true },
        ));
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      if (rpcFatalErrorObservedBeforeCancellation && rpcSession?.hasFatalError()) {
        markRpcCloseReason('fatal_rpc_error');
        return finishWithRetryDecision('failed', code ?? 1, signal ?? null);
      }
      parseBufferedAntigravityGeminiJsonEventStream();
      flushAgentTitleMarkerBuffer();
      if (agentStreamErrorObservedBeforeCancellation && agentStreamError) {
        markRpcCloseReason('stream_error');
        return finishWithRetryDecision('failed', code === 0 ? 1 : (code ?? 1), signal ?? null);
      }
      if (
        code !== 0 &&
        !run.cancelRequested
      ) {
        const authFailure = classifyAgentAuthFailure(
          agentId,
          `${agentStderrTail}\n${agentStdoutTail}`,
        );
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            authFailure.message ?? genericAgentAuthGuidance(def.name),
            { retryable: true },
          ));
          return finishWithRetryDecision('failed', code ?? 1, signal ?? null);
        }
      }
      // Empty-output guard: a clean `code === 0` exit with no visible
      // output means the run silently finished without producing anything.
      // Surface an explicit failure so the chat shows a clear reason.
      if (
        code === 0 &&
        !run.cancelRequested &&
        trackingSubstantiveOutput &&
        !agentProducedOutput
      ) {
        markRpcCloseReason('empty_output');
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'Agent completed without producing any output. The model or provider may have returned an empty response. Check the agent logs for upstream errors, then try re-authenticating the agent, checking quota, or switching models.',
          { retryable: true },
        ));
        return finishWithRetryDecision('failed', code, signal);
      }
      // Plain-stream auth-failure guard: plain adapters (today
      // antigravity) may exit cleanly with
      // visible stdout that's actually an auth prompt — agy prints
      // "Authentication required. Please visit the URL to log in:
      // <URL>" + "Error: authentication timed out." rather than
      // failing with a non-zero exit. Without this guard the chat
      // shows that raw prompt as the agent's "reply", and the user
      // has no way to actually complete OAuth from inside the chat.
      // Override the apparent success with a proper
      // AGENT_AUTH_REQUIRED error carrying actionable guidance.
      if (
        code === 0 &&
        !run.cancelRequested &&
        !trackingSubstantiveOutput &&
        childStdoutSeen
      ) {
        const authFailure = classifyAgentAuthFailure(
          agentId,
          `${agentStderrTail}\n${agentStdoutTail}`,
        );
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            authFailure.message ?? `${def.name} authentication required. Please re-authenticate and retry.`,
            { retryable: true },
          ));
          return finishWithRetryDecision('failed', 0, signal);
        }
      }
      // Plain-stream empty-output guard: plain agents send raw stdout
      // chunks without structured event tracking. Detect auth failures
      // and quota / upstream errors when exit 0 but no stdout was
      // seen. agy in print mode is silent on stdout/stderr for both
      // missing-auth AND quota-exhausted failures; the daemon piped
      // agy's `--log-file` to `agentLogFilePath` precisely so this
      // guard can grep the upstream error code (RESOURCE_EXHAUSTED 429
      // for quota, "not logged into Antigravity" for auth) and route
      // to the right user-facing guidance.
      if (
        code === 0 &&
        !run.cancelRequested &&
        !trackingSubstantiveOutput &&
        !childStdoutSeen
      ) {
        markRpcCloseReason('empty_output');
        let combinedDetail = `${agentStderrTail}\n${agentStdoutTail}`;
        if (def.id === 'antigravity' && agentLogFilePath) {
          try {
            const logContent = await fs.promises.readFile(agentLogFilePath, 'utf8');
            // Keep the last 8 KB — quota / auth lines all land near the
            // tail (after the spawn / model-config preamble).
            combinedDetail = `${combinedDetail}\n${logContent.slice(-8192)}`;
          } catch {
            // Missing log file (agy didn't write it, mounted tmpfs is
            // read-only, etc.) is fine — fall through to the generic
            // empty-output message.
          }
        }
        const authFailure = classifyAgentAuthFailure(agentId, combinedDetail);
        const serviceFailure = !authFailure
          ? classifyAgentServiceFailure(combinedDetail)
          : null;
        const isAntigravityQuota =
          def.id === 'antigravity' && serviceFailure === 'RATE_LIMITED';
        // Antigravity-only fallback: if neither classifier matched but
        // the run was silent, lean on the empirical observation that
        // an empty agy print-mode exit almost always means
        // missing-OAuth (the only other silent path is quota, which
        // the log-file check above already caught).
        const useAntigravityAuthFallback =
          !authFailure && !serviceFailure && def.id === 'antigravity';
        const errorCode =
          authFailure || useAntigravityAuthFallback
            ? 'AGENT_AUTH_REQUIRED'
            : isAntigravityQuota
              ? 'RATE_LIMITED'
              : 'AGENT_EXECUTION_FAILED';
        const msg = authFailure
          ? authFailure.message ?? `${def.name} authentication expired. Please re-authenticate and retry.`
          : isAntigravityQuota
            ? antigravityQuotaGuidance()
            : useAntigravityAuthFallback
              ? antigravityAuthGuidance()
              : `${def.name} returned an empty response. This may indicate an expired session — try re-authenticating the agent.`;
        send('error', createSseErrorPayload(
          errorCode,
          msg,
          { retryable: true },
        ));
        return finishWithRetryDecision('failed', 0, signal);
      }
      const runArtifactSideEffects = runSideEffectsForRun(run);
      const status = classifyChatRunCloseStatus({
        cancelRequested: !!run.cancelRequested,
        code,
        signal,
        artifactQuietShutdownRequested,
        turnCompletedCleanly: !!run.turnCompletedCleanly,
        artifactProducedThisRun:
          runArtifactSideEffects.artifactWriteSeen ||
          runArtifactSideEffects.liveArtifactSeen,
      });
      // Skip the close-handler failure emit when the run is already
      // terminal: the inactivity watchdog (failForInactivity) finishes the
      // run — sending its error and clearing run.clients/eventsLogStream —
      // before SIGTERM, so re-emitting here would double-send the error and
      // reopen the closed events-log stream. The run is finalized below
      // regardless (finish() no-ops once terminal).
      if (status === 'failed' && !design.runs.isTerminal(run.status)) {
        const diagnostic = diagnoseClaudeCliFailure({
          agentId: def.id,
          exitCode: code,
          signal,
          stderrTail: agentStderrTail,
          stdoutTail: agentStdoutTail,
          env: spawnedAgentEnv,
          resolvedBin: agentLaunch.selectedPath,
        });
        // A non-zero exit whose output reads as an auth / quota / upstream
        // problem (typical of Claude Code, codex, …) gets the specific code
        // rather than the generic execution-failed bucket; the human-readable
        // message still prefers the richer CLI diagnostic when we have one.
        const serviceCode = classifyAgentServiceFailure(
          `${agentStderrTail}\n${agentStdoutTail}`,
        );
        if (diagnostic) {
          send('error', createSseErrorPayload(
            // A diagnostic that named its own failure class (e.g.
            // AGENT_CONNECTION_DROPPED) wins over the generic service-failure
            // sniff so the UI can localize by code and triage can count it.
            diagnostic.code ?? serviceCode ?? 'AGENT_EXECUTION_FAILED',
            diagnostic.message,
            { retryable: diagnostic.retryable, details: { detail: diagnostic.detail } },
          ));
        } else if (serviceCode) {
          const detail = (agentStderrTail || agentStdoutTail || '').trim();
          send('error', createSseErrorPayload(
            serviceCode,
            detail || 'The model service returned an error.',
            { retryable: true },
          ));
        } else {
          // OpenCode swallows provider failures in headless mode: a 429
          // usage-limit is marked retryable and retried silently with
          // nothing on stdout/stderr, so the run only dies via the
          // inactivity watchdog and the checks above find no signal. The
          // real reason is recorded only in OpenCode's own session log,
          // so recover it before falling back to the generic rewrite.
          // See issue #982.
          const openCodeFailure =
            def.id === 'opencode'
              ? readOpenCodeServiceFailure(spawnedAgentEnv, { since: run.createdAt })
              : null;
          if (openCodeFailure) {
            send('error', createSseErrorPayload(
              openCodeFailure.code,
              openCodeFailure.message,
              { retryable: openCodeFailure.retryable },
            ));
          } else {
            const rewritten = rewriteKnownAgentStreamError(
              def.id,
              (agentStderrTail || agentStdoutTail || '').trim(),
              `${agentStderrTail}\n${agentStdoutTail}`,
            );
            if (rewritten !== 'Agent stream error') {
              send('error', createSseErrorPayload(
                'AGENT_EXECUTION_FAILED',
                rewritten,
                { retryable: true },
              ));
            }
          }
        }
      }
      // Reconcile any HTML artifacts that were written during this run
      // without a manifest sidecar (e.g. agent used write_file instead of
      // create_artifact, or the run terminated between HTML write and
      // sidecar write). Only files modified after the run started are
      // touched — pre-existing HTML in imported-folder projects must not
      // receive spurious manifests. Best-effort; must not block finalisation.
      // See issue #2893.
      if (run.projectId) {
        (async () => {
          try {
            const project = getProject(db, run.projectId);
            const files = await listFiles(PROJECTS_DIR, run.projectId, {
              metadata: project?.metadata,
            });
            const dir = resolveProjectDir(PROJECTS_DIR, run.projectId, project?.metadata);
            for (const f of files) {
              const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
              if (ext !== '.html' && ext !== '.htm') continue;
              try {
                const filePath = path.join(dir, f.name);
                const st = await fs.promises.stat(filePath);
                if (!isRunTouchedProjectFile(st.mtimeMs, runStartTimeMs)) continue;
                await reconcileHtmlArtifactManifest(
                  PROJECTS_DIR,
                  run.projectId,
                  f.name,
                  project?.metadata,
                );
              } catch { /* per-file best-effort */ }
            }
          } catch { /* project-level best-effort */ }
        })();
      }
      // Flush buffered plain-text stdout (antigravity) that was not
      // suppressed by the auth-prompt guard above. Send each chunk in
      // order before finishing so the assistant text arrives before the
      // run's `finished` event. Stamp first-token timing here — and only
      // here — using the first chunk's arrival time, so the OAuth-prompt
      // path (which returns before this flush) never records a TTFT for
      // output the user never saw (PR #3412).
      for (const chunk of plaintextStdoutBuffer) {
        const strippedText = visibleStdoutControlStripper.write(chunk.text);
        const visibleText = titleMarkerStripper.strip(strippedText);
        if (visibleText) send('stdout', { chunk: visibleText });
      }
      const flushedControlText = visibleStdoutControlStripper.flush();
      const flushedTitleMarkerText =
        titleMarkerStripper.strip(flushedControlText) + titleMarkerStripper.flush();
      if (flushedTitleMarkerText) send('stdout', { chunk: flushedTitleMarkerText });
      if (
        status === 'succeeded' &&
        (def.streamFormat ?? 'plain') === 'plain' &&
        run.projectId
      ) {
        // Reconstruct the agent's stdout for artifact extraction from two
        // truncation-complementary windows over the SAME underlying stream:
        //   - head: `run.plainArtifactStdout`, the FIRST CAP bytes (bounded), and
        //   - tail: run.events, the LAST 2000 events.
        // Using stream offsets (total byte count) we stitch them into a single
        // continuous string at their exact seam, then extract ONCE. This is
        // correct by construction:
        //   - not truncated  -> head == whole stream (or tail == whole stream);
        //   - overlapping    -> seam removes the double-covered span, so the
        //                        same artifact is never counted twice AND two
        //                        distinct artifacts that share a body are both
        //                        kept (no value-level dedup);
        //   - a true gap (a run with both >CAP early bytes AND >2000 later
        //     events whose tail does not reach back to CAP) -> extract each
        //     window separately and concatenate the artifact lists. The windows
        //     do not overlap there, so there are no duplicate occurrences; only
        //     an artifact buried entirely in the un-covered middle is lost, which
        //     was already unrecoverable before this change (the old code only
        //     ever had the tail).
        const head = run.plainArtifactStdout ?? '';
        const tail = plainStdoutFromRunEvents(run.events);
        const totalBytes = run.plainStdoutTotalBytes ?? head.length;
        const tailStart = Math.max(0, totalBytes - tail.length);
        let plainArtifacts: ReturnType<typeof extractPlainStreamArtifacts>;
        if (head.length === 0) {
          plainArtifacts = extractPlainStreamArtifacts(tail);
        } else if (tailStart <= head.length) {
          // Overlap or contiguous: splice tail on at the seam and extract once.
          const stitched = head + tail.slice(head.length - tailStart);
          plainArtifacts = extractPlainStreamArtifacts(stitched);
        } else {
          // Gap: no overlap, so extracting each window and concatenating cannot
          // produce a duplicate occurrence or a false cross-gap artifact.
          plainArtifacts = [
            ...extractPlainStreamArtifacts(head),
            ...extractPlainStreamArtifacts(tail),
          ];
        }
        if (plainArtifacts.length > 0) {
          try {
            const project = getProject(db, run.projectId);
            const persistedPlainArtifacts = await persistPlainStreamArtifactList({
              projectsRoot: PROJECTS_DIR,
              projectId: run.projectId,
              artifacts: plainArtifacts,
              metadata: project?.metadata,
              writeProjectFile,
            });
            if (persistedPlainArtifacts.length > 0) {
              for (const artifact of persistedPlainArtifacts) {
                send('agent', {
                  type: 'artifact',
                  source: 'plain-stream',
                  name: artifact.name,
                  path: artifact.name,
                  identifier: artifact.identifier,
                  artifactType: artifact.artifactType,
                });
              }
              send('agent', {
                type: 'diagnostic',
                name: 'plain_stream_artifacts_persisted',
                source: 'daemon-run-finalize',
                fileCount: persistedPlainArtifacts.length,
                files: persistedPlainArtifacts.map((artifact) => artifact.name),
              });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const failureMessage = `Failed to persist plain-stream artifact(s): ${message}`;
            console.warn(`[plain-stream] failed to persist stdout artifact(s): ${message}`);
            send('agent', {
              type: 'diagnostic',
              name: 'plain_stream_artifacts_persist_failed',
              source: 'daemon-run-finalize',
              message,
            });
            send('error', createSseErrorPayload(
              'AGENT_EXECUTION_FAILED',
              failureMessage,
            ));
            return finishWithRetryDecision('failed', 1, null);
          }
        }
      }
      // Capture the pi session file path for conversational continuity.
      // The session path is discovered by attachPiRpcSession when it
      // processes agent_end; persist it under (conversationId, agentId) so
      // another conversation in the same cwd cannot inherit this history.
      if (rpcSession && typeof rpcSession.getLastSessionPath === 'function') {
        const sessionPath = rpcSession.getLastSessionPath();
        if (status === 'succeeded' && def.streamFormat === 'pi-rpc') {
          persistCapturedAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: sessionPath,
            stablePromptHash: currentStableHash,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          run.nativeSessionRecovery = markNativeSessionCaptured({
            previous: run.nativeSessionRecovery,
            agentId: def.id,
            sessionId: sessionPath,
            resumed: agentResumeCtx.isResuming,
          });
          publishNativeSessionRecoveryMetadata();
        }
      }
      if (status === 'succeeded') {
        try {
          await snapshotAiHtmlVersionsBeforeSuccess();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const details = err instanceof AiHtmlVersionSnapshotError
            ? { failures: err.failures }
            : undefined;
          send('error', createSseErrorPayload(
            'HTML_VERSION_SNAPSHOT_FAILED',
            message,
            {
              retryable: false,
              ...(details ? { details } : {}),
            },
          ));
          design.runs.finish(run, 'failed', 1, signal);
          return;
        }
        try {
          persistDeliveredAgentSessionState();
        } catch (err) {
          console.warn('[sessions] delivered session persistence failed', err);
        }
      }
      finishWithRetryDecision(status, code, signal);
      } finally {
        // Best-effort cleanup of the per-run agy log file on every close
        // path — successful, failed, cancelled, or non-zero exit — so
        // /tmp doesn't accumulate one file per Antigravity run. The log
        // is read inside the empty-output guard above before this finally
        // runs, so the read always happens before the unlink.
        if (agentLogFilePath) {
          fs.promises.unlink(agentLogFilePath).catch(() => {});
        }
        cleanupPromptFile();
      }
    });
    if (writePromptToChildStdin && child.stdin) {
      const promptInputFormat = def.promptInputFormat ?? 'text';
      const markStdinWriteEnd = (err?: Error | null) => {
        if (err) return;
      };
      if (promptInputFormat === 'stream-json') {
        // Wrap the prompt as an Anthropic user message and write it as one
        // JSONL line. Do NOT close stdin: claude-code keeps reading further
        // messages until EOF, which is what lets the daemon stream more user
        // messages into the same turn. The stdin is closed on a clean terminal
        // turn (see applyClaudeStreamJsonRunBookkeeping) or when the child
        // exits (run terminates, user cancels).
        const userMessage = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: composed }],
          },
        });
        try {
          // E-lite: `write` returns false when the chunk was buffered because the
          // OS pipe is full (the child isn't draining stdin) — the corroborating
          // signal for a `stdin_write`-phase inactivity stall.
          const accepted = child.stdin.write(`${userMessage}\n`, 'utf8', markStdinWriteEnd);
          run.stdinBackpressure = accepted === false;
        } catch (err) {
          // Swallow EPIPE here for the same reason as the listener above —
          // a fast-exiting child has already routed its failure through
          // stderr / exit handlers.
          if (err && err.code !== 'EPIPE') throw err;
        }
        run.stdinOpen = true;
      } else {
        // Split write + close so the boolean backpressure signal survives —
        // see writePromptAndEndStdin for why `end(chunk)` cannot report it.
        run.stdinBackpressure = writePromptAndEndStdin(child.stdin, composed, markStdinWriteEnd);
      }
    }
  };


  registerRunRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: { PROJECTS_DIR, RUNTIME_DATA_DIR },
    agents: { detectAgents, getAgentDef },
    chat: { startChatRun },
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
    plugins: {
      firePipelineForRun,
      loadPluginRegistryView,
      renderPluginBriefTemplate,
    },
    messages: {
      pinAssistantMessageOnRunCreate,
      reconcileAssistantMessageOnRunEnd,
    },
  });


  assertServerContextSatisfiesRoutes({
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    templates: templateDeps,
    status: projectStatusDeps,
    events: projectEventDeps,
    imports: importDeps,
    exports: projectExportDeps,
    artifacts: artifactDeps,
    documents: { buildDocumentPreview },
    auth: authDeps,
    liveArtifacts: liveArtifactDeps,
    media: mediaDeps,
    appConfig: appConfigDeps,
    nativeDialogs: nativeDialogDeps,
    research: researchDeps,
    plugins: {
      firePipelineForRun,
      loadPluginRegistryView,
      renderPluginBriefTemplate,
    },
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      mimeFor,
    },
    projectPreviewScopes,
    validation: validationDeps,
    finalize: finalizeDeps,
    handoff: handoffDeps,
    chat: { startChatRun },
    messages: {
      pinAssistantMessageOnRunCreate,
      reconcileAssistantMessageOnRunEnd,
    },
    agents: agentDeps,
    critique: critiqueDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
  });

  // proxy routes (anthropic / openai / azure / google / ollama) live
  // in chat-routes.ts now — garnet had a partial duplicate here that
  // referenced helpers (rejectPluginInProxyBody, extractGeminiText, …)
  // dropped during the reconcile merge. Deleted to fix the BYOK crash.
  // Restore the plugin-runs-must-go-through-daemon gate by adding it
  // to chat-routes.ts if needed.


  registerChatRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    chat: { startChatRun },
    agents: agentDeps,
    critique: critiqueDeps,
    validation: validationDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
  });

  registerStaticSpaFallback(app, STATIC_DIR);

  // Wait for `listen` to bind so callers always see the resolved URL —
  // critical when port=0 (ephemeral port) and when the embedding sidecar
  // needs to advertise the port to a parent process before any request
  // can flow. Three callers depend on this contract:
  //   - `apps/daemon/src/cli.ts`            → expects `{ url, server, shutdown }`
  //   - `apps/daemon/sidecar/server.ts`     → expects `{ url, server }`
  //   - `apps/daemon/tests/version-route.test.ts` → expects `{ url, server }`
  return await new Promise((resolve, reject) => {
    let daemonShutdownStarted = false;
    const cleanupDaemonBackgroundWork = () => {
      // Local-only services own no cloud refresh loops or schedulers.
    };
    const shutdownDaemonRuns = async () => {
      if (daemonShutdownStarted) return;
      daemonShutdownStarted = true;
      daemonShuttingDown = true;
      await design.runs.shutdownActive({ graceMs: resolveChatRunShutdownGraceMs() });
      await terminalService.shutdownActive();
    };
    let server;
    try {
      server = app.listen(port, host);
      server.once('close', releaseEgressGuard);
      server.once('listening', () => {
        // Widen the between-request idle window so kept-alive sockets
        // belonging to chat/SSE clients survive the gaps between bursts.
        //
        // Node's `keepAliveTimeout` (default 5s) only arms *after* a
        // response finishes writing, bounding the idle gap before the next
        // request on the same socket — it does not fire while an SSE
        // response is still streaming. A streaming `/api/runs/:id/events`
        // response stays open until the agent finishes, so middlebox idle
        // timers (nginx, socat/docker bridges, EC2 SG NAT) are typically
        // the proximate cause when an SSE stream drops; this listener-
        // side change cannot extend a connection past those middleboxes.
        //
        // What it *does* fix: chat clients that pipeline multiple requests
        // on the same TCP socket (status polls, run-status fetches, the
        // initial GET before the SSE upgrade). With the default 5s window
        // a sluggish client can lose the connection between two normal
        // calls and reconnect-storm. 120s aligns with the in-band
        // SSE_KEEPALIVE_INTERVAL_MS (25s) so kept-alive sockets used
        // around an SSE stream stay warm across reasonable client pauses.
        //
        // `headersTimeout` must exceed `keepAliveTimeout` per the Node
        // docs; otherwise a slow-loris client can stall request parsing.
        server.keepAliveTimeout = 120_000;
        server.headersTimeout = 125_000;
        const address = server.address();
        // `address()` can in theory return `string | AddressInfo | null`. For
        // a TCP listener it's always `AddressInfo` with a `.port` — the guard
        // is belt-and-braces so an unexpected null never silently produces a
        // `http://127.0.0.1:0` URL that callers would then try to fetch.
        const boundPort =
          address && typeof address === 'object' ? address.port : null;
        if (!boundPort) {
          reject(
            new Error(
              `[od] daemon failed to resolve listening port (address=${JSON.stringify(address)})`,
            ),
          );
          return;
        }
        resolvedPort = boundPort;
        // When binding to all interfaces report localhost for local callers;
        // when binding to a specific address (e.g. a Tailscale IP) report that
        // address so remote callers and the sidecar use the correct URL.
        const reportHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
        const url = `http://${reportHost}:${resolvedPort}`;
        if (!returnServer) {
          console.log(`[od] daemon listening on ${url}`);
        }
        daemonUrl = url;
        resolve(returnServer ? {
          url,
          server,
          shutdown: shutdownDaemonRuns,
          routeInventory: getRouteRegistrationInventory(app),
        } : url);
      });
    } catch (error) {
      cleanupDaemonBackgroundWork();
      reject(error);
      return;
    }
    server.once('close', () => {
      void shutdownDaemonRuns().finally(cleanupDaemonBackgroundWork);
    });
    // `app.listen` throws synchronously when the port is already in use on
    // some Node versions, but emits an `error` event on others (and for
    // EACCES / EADDRNOTAVAIL even on the same Node). Wire the event so the
    // returned Promise always settles instead of hanging forever.
    server.on('error', (error) => {
      cleanupDaemonBackgroundWork();
      reject(error);
    });
  });
}

function randomId() {
  return randomUUID();
}

function sanitizeSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
