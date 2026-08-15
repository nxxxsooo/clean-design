import {
  countDesignSystemPreviewModules,
  countNewArtifacts,
  didRunCreateDesignSystemFile,
  extractToolFilePath,
  isArtifactPath,
  isDesignSystemFile,
  isPreviewModulePath,
  readToolResultId,
  readToolResultIsError,
  readToolUseId,
  WRITE_OR_EDIT_TOOL_NAMES,
} from './run-artifacts.js';

export interface RunEventRecordLike {
  event: string;
  data: unknown;
}

export interface RunRetrySideEffects {
  userVisibleOutputSeen: boolean;
  toolCallSeen: boolean;
  artifactWriteSeen: boolean;
  liveArtifactSeen: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function scanRunEventsForRetrySideEffects(events: unknown): RunRetrySideEffects {
  const sideEffects: RunRetrySideEffects = {
    userVisibleOutputSeen: false,
    toolCallSeen: false,
    artifactWriteSeen: false,
    liveArtifactSeen: false,
  };
  const records = Array.isArray(events) ? events : [];
  for (const rec of records) {
    if (!isRecord(rec)) continue;
    if (rec.event === 'stdout') {
      const data = isRecord(rec.data) ? rec.data : {};
      const chunk = data.chunk;
      if (typeof chunk === 'string' ? chunk.length > 0 : chunk !== undefined) {
        sideEffects.userVisibleOutputSeen = true;
      }
    }
    const data = isRecord(rec.data) ? rec.data : null;
    if (!data) continue;
    if (data.type === 'text_delta' || data.type === 'thinking_delta') {
      const delta = typeof data.delta === 'string' ? data.delta : '';
      if (delta.length > 0) sideEffects.userVisibleOutputSeen = true;
    }
    if (data.type === 'tool_use') sideEffects.toolCallSeen = true;
    if (data.type === 'artifact') sideEffects.artifactWriteSeen = true;
    if (data.type === 'live_artifact' || rec.event === 'live_artifact') {
      sideEffects.liveArtifactSeen = true;
    }
  }
  if (
    countNewArtifacts(records) > 0 ||
    didRunCreateDesignSystemFile(records) ||
    countDesignSystemPreviewModules(records) > 0
  ) {
    sideEffects.artifactWriteSeen = true;
  }
  return sideEffects;
}

// Incremental side-effect ledger.
//
// The batch `scanRunEventsForRetrySideEffects` / `countNewArtifacts` above read
// `run.events`, which is a bounded in-memory ring buffer (createChatRunService
// maxEvents). On a long run the earliest events — including an artifact's
// `tool_use` / `tool_result` pair — are spliced out of that buffer, so a
// finalization-time scan of `run.events` no longer sees committed work that the
// run genuinely did (and that the on-disk events.jsonl still records). That
// silently flips the retry safety gate, `artifact_count`, and the close-status
// `artifactProducedThisRun` verdict.
//
// The ledger folds each event into a fixed-size accumulator AT EMIT TIME, before
// truncation can drop it, so the finalization consumers read a verdict that
// survives the whole run. It mirrors the batch semantics exactly: a write/edit
// tool_use paired with a NON-error tool_result counts once per distinct path,
// and `artifactWriteSeen` also flips on a direct `artifact` event.
export interface RunSideEffectLedger {
  userVisibleOutputSeen: boolean;
  toolCallSeen: boolean;
  directArtifactEventSeen: boolean;
  liveArtifactSeen: boolean;
  artifactPaths: Set<string>;
  designSystemFileWritten: boolean;
  previewModulePaths: Set<string>;
  // Only WRITE/EDIT tool_use ids awaiting their tool_result live here, and each
  // is removed the moment its result arrives. A tool_result cannot precede its
  // tool_use within a run, so we never need to buffer results — an ordinary
  // (non-write) tool_result finds nothing pending and is dropped, keeping this
  // map bounded by the small number of outstanding artifact writes rather than
  // by the run's total tool_result count.
  pendingWritePathById: Map<string, string>;
}

export function createRunSideEffectLedger(): RunSideEffectLedger {
  return {
    userVisibleOutputSeen: false,
    toolCallSeen: false,
    directArtifactEventSeen: false,
    liveArtifactSeen: false,
    artifactPaths: new Set(),
    designSystemFileWritten: false,
    previewModulePaths: new Set(),
    pendingWritePathById: new Map(),
  };
}

export function foldEventIntoRunSideEffectLedger(
  ledger: RunSideEffectLedger,
  record: { event?: unknown; data?: unknown },
) {
  const event = record?.event;
  const data = isRecord(record?.data) ? record.data : null;
  if (event === 'stdout') {
    const chunk = data?.chunk;
    if (typeof chunk === 'string' ? chunk.length > 0 : chunk !== undefined) {
      ledger.userVisibleOutputSeen = true;
    }
  }
  if (event === 'live_artifact') ledger.liveArtifactSeen = true;
  if (!data) return;
  if (data.type === 'text_delta' || data.type === 'thinking_delta') {
    if (typeof data.delta === 'string' && data.delta.length > 0) {
      ledger.userVisibleOutputSeen = true;
    }
  }
  if (data.type === 'live_artifact') ledger.liveArtifactSeen = true;
  if (data.type === 'artifact') ledger.directArtifactEventSeen = true;
  if (data.type === 'tool_use') {
    ledger.toolCallSeen = true;
    if (event !== 'agent') return;
    if (typeof data.name !== 'string') return;
    if (!WRITE_OR_EDIT_TOOL_NAMES.has(data.name)) return;
    const path = extractToolFilePath(data.input);
    const id = readToolUseId(data);
    if (!path || !id) return;
    ledger.pendingWritePathById.set(id, path);
  } else if (data.type === 'tool_result' && event === 'agent') {
    const id = readToolResultId(data);
    if (!id) return;
    const path = ledger.pendingWritePathById.get(id);
    // Non-write tool_result (Read/Bash/Grep/…): nothing pending, drop it — this
    // is what keeps the ledger bounded on long tool-heavy runs.
    if (path === undefined) return;
    ledger.pendingWritePathById.delete(id);
    if (readToolResultIsError(data)) return; // a failed write does not count
    if (isArtifactPath(path)) ledger.artifactPaths.add(path);
    if (isDesignSystemFile(path)) ledger.designSystemFileWritten = true;
    if (isPreviewModulePath(path)) ledger.previewModulePaths.add(path);
  }
}

function ledgerArtifactWriteSeen(ledger: RunSideEffectLedger): boolean {
  return (
    ledger.directArtifactEventSeen ||
    ledger.artifactPaths.size > 0 ||
    ledger.designSystemFileWritten ||
    ledger.previewModulePaths.size > 0
  );
}

export function sideEffectsFromLedger(
  ledger: RunSideEffectLedger,
): RunRetrySideEffects {
  return {
    userVisibleOutputSeen: ledger.userVisibleOutputSeen,
    toolCallSeen: ledger.toolCallSeen,
    artifactWriteSeen: ledgerArtifactWriteSeen(ledger),
    liveArtifactSeen: ledger.liveArtifactSeen,
  };
}

// Read a run's committed side effects, preferring the truncation-proof ledger
// and falling back to the batch scan when a run has no ledger (e.g. legacy
// call sites or tests that build a run object directly).
export function runSideEffectsForRun(run: {
  sideEffectLedger?: RunSideEffectLedger;
  events?: unknown;
}): RunRetrySideEffects {
  if (run?.sideEffectLedger) return sideEffectsFromLedger(run.sideEffectLedger);
  return scanRunEventsForRetrySideEffects(run?.events);
}

// Distinct-artifact count that survives event-buffer truncation, with the same
// ledger-preferred / scan-fallback contract as runSideEffectsForRun.
export function runArtifactCountForRun(run: {
  sideEffectLedger?: RunSideEffectLedger;
  events?: unknown;
}): number {
  if (run?.sideEffectLedger) return run.sideEffectLedger.artifactPaths.size;
  return countNewArtifacts(Array.isArray(run?.events) ? run.events : []);
}

// Truncation-proof `design_system_created`, same ledger-preferred contract.
export function runDesignSystemCreatedForRun(run: {
  sideEffectLedger?: RunSideEffectLedger;
  events?: unknown;
}): boolean {
  if (run?.sideEffectLedger) return run.sideEffectLedger.designSystemFileWritten;
  return didRunCreateDesignSystemFile(Array.isArray(run?.events) ? run.events : []);
}

// Truncation-proof `preview_module_count`, same ledger-preferred contract.
export function runPreviewModuleCountForRun(run: {
  sideEffectLedger?: RunSideEffectLedger;
  events?: unknown;
}): number {
  if (run?.sideEffectLedger) return run.sideEffectLedger.previewModulePaths.size;
  return countDesignSystemPreviewModules(Array.isArray(run?.events) ? run.events : []);
}
