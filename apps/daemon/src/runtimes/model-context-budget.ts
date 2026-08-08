import type { ModelMetadata } from '@open-design/contracts';
import type { RuntimePromptBudgetError } from './types.js';

export type ModelContextBudgetSource =
  | 'model_metadata'
  | 'known_model_family'
  | 'unknown';

export type ModelContextBudgetAction =
  | 'unmeasured'
  | 'within_budget'
  | 'blocked'
  | 'rollover';

export interface ModelContextBudgetDecision {
  action: ModelContextBudgetAction;
  source: ModelContextBudgetSource;
  modelId: string | null;
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
  error?: RuntimePromptBudgetError;
}

export interface TranscriptCompactionResult {
  prompt: string;
  originalTokens: number;
  compactedTokens: number;
  omittedMessageBlocks: number;
}

const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_192;
const MIN_SAFETY_MARGIN_TOKENS = 1_024;
const SAFETY_MARGIN_RATIO = 0.05;
const SESSION_ROLLOVER_RATIO = 0.85;
const CLAUDE_CONTEXT_WINDOW_TOKENS = 204_800;
const CLAUDE_MODEL_ALIASES = new Set(['sonnet', 'opus', 'haiku']);

export function estimatePromptTokens(prompt: string): number {
  // UTF-8 bytes / 3 deliberately overestimates normal English/code (usually
  // closer to 4 bytes per token) while remaining realistic for CJK text.
  // This is a launch guard, not billing telemetry: a small false-positive
  // margin is safer than forwarding a request the provider will reject.
  return Math.ceil(Buffer.byteLength(prompt, 'utf8') / 3);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function knownModelFamilyContextWindow(modelId: string | null): number | null {
  if (!modelId) return null;
  const normalized = modelId.toLowerCase();
  // OpenCode/provider errors in the 0.15.0 incident report a 204,800-token
  // ceiling for Claude-family routes. Keep this fallback narrow; every other
  // model remains observation-only until its live catalog supplies metadata.
  if (
    CLAUDE_MODEL_ALIASES.has(normalized) ||
    /(?:^|[/.])claude[-_]/u.test(normalized)
  ) {
    return CLAUDE_CONTEXT_WINDOW_TOKENS;
  }
  return null;
}

function compactionMarker(omittedMessageBlocks: number): string {
  return [
    `[Open Design compacted ${omittedMessageBlocks} older transcript message block${omittedMessageBlocks === 1 ? '' : 's'} while rolling over the upstream agent session.`,
    'The complete history remains persisted; continue from the retained recent turns.]',
  ].join(' ');
}

export function compactTranscriptForSessionRollover(
  transcript: string,
  maxTokens: number,
): TranscriptCompactionResult {
  const originalTokens = estimatePromptTokens(transcript);
  const safeMaxTokens = Math.max(1, Math.floor(maxTokens));
  if (originalTokens <= safeMaxTokens) {
    return {
      prompt: transcript,
      originalTokens,
      compactedTokens: originalTokens,
      omittedMessageBlocks: 0,
    };
  }

  const starts = [...transcript.matchAll(/^## (?:user|assistant)[ \t]*\r?$/gmu)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  if (starts.length === 0) {
    const marker = compactionMarker(1);
    const maxBytes = Math.max(1, safeMaxTokens * 3 - Buffer.byteLength(`${marker}\n\n`, 'utf8'));
    const tail = Buffer.from(transcript, 'utf8').subarray(-maxBytes).toString('utf8');
    const prompt = `${marker}\n\n${tail}`;
    return {
      prompt,
      originalTokens,
      compactedTokens: estimatePromptTokens(prompt),
      omittedMessageBlocks: 1,
    };
  }

  const blocks = starts.map((start, index) =>
    transcript.slice(start, starts[index + 1] ?? transcript.length).trim(),
  );
  let firstRetained = blocks.length - 1;
  let prompt = `${compactionMarker(firstRetained)}\n\n${blocks[firstRetained]}`;
  for (let index = blocks.length - 2; index >= 0; index -= 1) {
    const candidate = index === 0
      ? blocks.slice(index).join('\n\n')
      : `${compactionMarker(index)}\n\n${blocks.slice(index).join('\n\n')}`;
    if (estimatePromptTokens(candidate) > safeMaxTokens) break;
    firstRetained = index;
    prompt = candidate;
  }
  const omittedMessageBlocks = firstRetained;
  return {
    prompt,
    originalTokens,
    compactedTokens: estimatePromptTokens(prompt),
    omittedMessageBlocks,
  };
}
export function evaluateModelContextBudget({
  prompt,
  modelId,
  metadata,
  priorSessionInputTokens,
}: {
  prompt: string;
  modelId: string | null | undefined;
  metadata?: ModelMetadata | null;
  priorSessionInputTokens?: number | null;
}): ModelContextBudgetDecision {
  const normalizedModel = typeof modelId === 'string' && modelId.trim()
    ? modelId.trim()
    : null;
  const estimatedPromptTokens = estimatePromptTokens(prompt);
  const metadataWindow = positiveInteger(metadata?.contextWindowTokens);
  const familyWindow = knownModelFamilyContextWindow(normalizedModel);
  const contextWindowTokens = metadataWindow ?? familyWindow;
  const source: ModelContextBudgetSource = metadataWindow
    ? 'model_metadata'
    : familyWindow
      ? 'known_model_family'
      : 'unknown';

  if (!contextWindowTokens) {
    return {
      action: 'unmeasured',
      source,
      modelId: normalizedModel,
      estimatedPromptTokens,
    };
  }

  const declaredOutput = positiveInteger(metadata?.maxOutputTokens);
  const reservedOutputTokens = Math.min(
    declaredOutput ?? DEFAULT_OUTPUT_RESERVE_TOKENS,
    Math.floor(contextWindowTokens * 0.25),
  );
  const safetyMarginTokens = Math.max(
    MIN_SAFETY_MARGIN_TOKENS,
    Math.ceil(contextWindowTokens * SAFETY_MARGIN_RATIO),
  );
  const inputBudgetTokens = Math.max(
    1,
    contextWindowTokens - reservedOutputTokens - safetyMarginTokens,
  );
  const budgetRatio = estimatedPromptTokens / inputBudgetTokens;
  const blocked = estimatedPromptTokens > inputBudgetTokens;
  const priorInput = positiveInteger(priorSessionInputTokens);
  const projectedInputTokens = priorInput == null
    ? null
    : priorInput + estimatedPromptTokens;
  const rolloverThresholdTokens = Math.floor(
    inputBudgetTokens * SESSION_ROLLOVER_RATIO,
  );
  const rollover =
    !blocked &&
    projectedInputTokens != null &&
    projectedInputTokens >= rolloverThresholdTokens;

  return {
    action: blocked ? 'blocked' : rollover ? 'rollover' : 'within_budget',
    source,
    modelId: normalizedModel,
    estimatedPromptTokens,
    contextWindowTokens,
    reservedOutputTokens,
    safetyMarginTokens,
    inputBudgetTokens,
    budgetRatio,
    ...(priorInput == null ? {} : { priorSessionInputTokens: priorInput }),
    ...(projectedInputTokens == null ? {} : { projectedInputTokens }),
    ...(priorInput == null ? {} : { rolloverThresholdTokens }),
    ...(blocked
      ? {
          error: {
            code: 'AGENT_PROMPT_TOO_LARGE',
            limit: inputBudgetTokens,
            message:
              `The composed prompt is estimated at ${estimatedPromptTokens} tokens, above the safe input budget of ${inputBudgetTokens} tokens for ${normalizedModel ?? 'the selected model'} ` +
              `(context window ${contextWindowTokens}; ${reservedOutputTokens} reserved for output; ${safetyMarginTokens} safety margin). ` +
              'Shorten the conversation, remove large attachments, or start a new conversation.',
          },
        }
      : {}),
  };
}
