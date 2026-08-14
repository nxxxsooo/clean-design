export interface RunEventRecord {
  id?: number;
  event: string;
  data: unknown;
  timestamp?: number;
}

export interface RunUsageSummary {
  input_tokens?: number;
  input_tokens_provider?: number;
  input_tokens_effective?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  uncached_input_tokens?: number;
  estimated_context_tokens?: number;
  cache_hit_ratio?: number;
  // The turn's FIRST model call (forward scan), as opposed to the fields above
  // which reflect the LAST usage event (reverse scan). The first call is the
  // session-reuse signal: for per-call-usage agents (claude / opencode / pi)
  // it is the turn's opening request, whose cached input shows
  // whether the resumed session's prior context was reused. The last/aggregate
  // call is saturated by within-turn prefix caching and masks the resume win.
  // (codex emits only a cumulative `turn.completed` usage, so its first-call
  // number is sourced from the rollout separately, not from these stream fields.)
  first_call_input_tokens?: number;
  first_call_cache_read_input_tokens?: number;
  first_call_cache_hit_ratio?: number;
  cache_token_source: 'anthropic' | 'openai' | 'unavailable';
  token_count_source: 'provider_usage' | 'estimated' | 'unknown';
  agent_reported_model: string | null;
}

export function hasExplicitRequestedModel(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const model = value.trim();
  return model.length > 0 && model !== 'default';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readNestedNumber(
  value: Record<string, unknown>,
  path: string[],
): number | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return readNumber(current);
}

function firstNumber(
  value: Record<string, unknown>,
  keys: string[],
  nested: string[][] = [],
): number | undefined {
  for (const key of keys) {
    const direct = readNumber(value[key]);
    if (direct !== undefined) return direct;
  }
  for (const path of nested) {
    const found = readNestedNumber(value, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

interface UsageCacheFields {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  cacheReadInputTokens: number | undefined;
  cacheCreationInputTokens: number | undefined;
  cacheTokenSource: 'anthropic' | 'openai' | undefined;
}

// Single source of truth for the provider/runtime cache-token alias matrix.
// Both the last-call (reverse) scan and the first-call (forward) scan extract
// usage through this so their effective-input denominators — and therefore
// `cache_hit_ratio` vs `first_call_cache_hit_ratio` — can never drift apart as
// new aliases are added.
function extractUsageCacheFields(usage: Record<string, unknown>): UsageCacheFields {
  const inputTokens = firstNumber(usage, ['input_tokens', 'prompt_tokens']);
  const outputTokens = firstNumber(usage, ['output_tokens', 'completion_tokens']);
  const totalTokens = firstNumber(usage, ['total_tokens', 'totalTokens']);
  const anthropicCacheReadInputTokens = firstNumber(usage, ['cache_read_input_tokens']);
  const normalizedCachedReadInputTokens = firstNumber(usage, [
    'cached_input_tokens',
    'cache_read_tokens',
    'cached_read_tokens',
  ]);
  const openAiCachedInputTokens = readNestedNumber(usage, [
    'prompt_tokens_details',
    'cached_tokens',
  ]);
  const cacheReadInputTokens =
    anthropicCacheReadInputTokens ??
    normalizedCachedReadInputTokens ??
    openAiCachedInputTokens;
  const anthropicCacheCreationInputTokens = firstNumber(
    usage,
    ['cache_creation_input_tokens', 'cache_write_input_tokens', 'cache_creation_tokens'],
    [['cache_creation', 'input_tokens']],
  );
  const normalizedCachedWriteInputTokens = firstNumber(usage, ['cached_write_tokens']);
  const cacheCreationInputTokens =
    anthropicCacheCreationInputTokens ?? normalizedCachedWriteInputTokens;
  let cacheTokenSource: 'anthropic' | 'openai' | undefined;
  if (
    anthropicCacheReadInputTokens !== undefined ||
    anthropicCacheCreationInputTokens !== undefined
  ) {
    cacheTokenSource = 'anthropic';
  } else if (
    normalizedCachedReadInputTokens !== undefined ||
    normalizedCachedWriteInputTokens !== undefined ||
    openAiCachedInputTokens !== undefined
  ) {
    cacheTokenSource = 'openai';
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    cacheTokenSource,
  };
}

interface EffectiveInputTokens {
  // The cache-inclusive prompt size, the denominator a cache-hit ratio divides
  // into. `undefined` when there is no input figure to anchor on.
  effectiveInput: number | undefined;
  // The portion that was NOT served from cache. `undefined` when the provider
  // gave no cache split to compute it from.
  uncachedInput: number | undefined;
}

// `input_tokens` is reported in two incompatible conventions across the
// provider/runtime matrix, and the SAME field name (`cached_input_tokens` etc.)
// appears under both:
//   - INCLUSIVE (OpenAI chat-completions, codex's rollout `last_token_usage`):
//     input_tokens already contains the cache-read subset → effective = input,
//     uncached = input - read.
//   - ADDITIVE (Anthropic, compatible Responses APIs, and pi): input_tokens is
//     the UNCACHED remainder and the
//     cache-read/creation tokens are reported separately on top → effective =
//     input + read + creation, uncached = input.
// Picking the wrong convention is not cosmetic: treating an additive payload as
// inclusive makes the denominator far too small, so `cache_hit_ratio` /
// `first_call_cache_hit_ratio` blow past 1.0 and `uncached_input_tokens`
// collapses to 0.
//
// The discriminator is a hard arithmetic invariant, not a heuristic guess: a
// cache-read subset can never exceed the total it is a subset of, so
// `cacheRead > input` is impossible under inclusive accounting and proves the
// payload is additive. Anthropic is additive by field shape regardless. Every
// `cacheRead <= input` payload therefore stays byte-identical to the prior
// behavior; only the previously-corrupt additive case is repaired.
function resolveEffectiveInputTokens(
  inputTokens: number | undefined,
  cacheReadInputTokens: number | undefined,
  cacheCreationInputTokens: number | undefined,
  cacheTokenSource: 'anthropic' | 'openai' | 'unavailable' | undefined,
): EffectiveInputTokens {
  if (inputTokens === undefined) {
    return { effectiveInput: undefined, uncachedInput: undefined };
  }
  const read = cacheReadInputTokens ?? 0;
  const additive =
    cacheTokenSource === 'anthropic' ||
    (cacheTokenSource === 'openai' &&
      cacheReadInputTokens !== undefined &&
      read > inputTokens);
  if (additive) {
    return {
      effectiveInput: inputTokens + read + (cacheCreationInputTokens ?? 0),
      uncachedInput: inputTokens,
    };
  }
  return {
    effectiveInput: inputTokens,
    uncachedInput:
      cacheTokenSource === 'openai' && cacheReadInputTokens !== undefined
        ? Math.max(0, inputTokens - cacheReadInputTokens)
        : undefined,
  };
}

export function scanRunEventsForUsage(
  events: RunEventRecord[],
  reqBodyModel: unknown,
  userQueryTokens: number,
): RunUsageSummary {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let providerTotalTokens: number | undefined;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let cacheTokenSource: RunUsageSummary['cache_token_source'] = 'unavailable';
  let agentReportedModel: string | null = null;
  const needAgentModel = !hasExplicitRequestedModel(reqBodyModel);
  let haveUsageTokens = false;

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    const data = ev?.data as
      | {
          type?: string;
          usage?: Record<string, unknown> | null;
          modelUsage?: Record<string, unknown> | null;
          label?: string;
          model?: unknown;
          detail?: unknown;
        }
      | null
      | undefined;
    if (ev?.event === 'agent' && data?.type === 'usage' && !haveUsageTokens) {
      const usage = data.usage && typeof data.usage === 'object'
        ? data.usage
        : data.modelUsage && typeof data.modelUsage === 'object'
          ? data.modelUsage
          : null;
      if (usage) {
        const fields = extractUsageCacheFields(usage);
        inputTokens = fields.inputTokens;
        outputTokens = fields.outputTokens;
        providerTotalTokens = fields.totalTokens;
        cacheReadInputTokens = fields.cacheReadInputTokens;
        cacheCreationInputTokens = fields.cacheCreationInputTokens;
        if (fields.cacheTokenSource) cacheTokenSource = fields.cacheTokenSource;
        haveUsageTokens = inputTokens !== undefined || outputTokens !== undefined;
      }
    }

    if (
      !agentReportedModel &&
      ev?.event === 'agent' &&
      data?.type === 'status' &&
      (data.label === 'model' || data.label === 'initializing')
    ) {
      const candidate =
        typeof data.model === 'string'
          ? data.model
          : typeof data.detail === 'string'
            ? data.detail
            : null;
      if (candidate && candidate.trim()) {
        agentReportedModel = candidate.trim();
      }
    }

    if (haveUsageTokens && (!needAgentModel || agentReportedModel)) break;
  }

  // Forward scan for the turn's FIRST model-call usage (the reverse loop above
  // captured the LAST). For per-call-usage agents this isolates the resume
  // signal from within-turn prefix caching; see the type docs.
  let firstCallInputTokens: number | undefined;
  let firstCallCacheReadInputTokens: number | undefined;
  let firstCallCacheCreationInputTokens: number | undefined;
  let firstCallCacheTokenSource: 'anthropic' | 'openai' | undefined;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const data = ev?.data as
      | { type?: string; usage?: Record<string, unknown> | null; modelUsage?: Record<string, unknown> | null }
      | null
      | undefined;
    if (ev?.event !== 'agent' || data?.type !== 'usage') continue;
    const usage = data.usage && typeof data.usage === 'object'
      ? data.usage
      : data.modelUsage && typeof data.modelUsage === 'object'
        ? data.modelUsage
        : null;
    if (!usage) continue;
    // Same extraction as the last-call scan above, so the two denominators
    // stay locked across the full provider alias matrix.
    const fields = extractUsageCacheFields(usage);
    firstCallInputTokens = fields.inputTokens;
    firstCallCacheReadInputTokens = fields.cacheReadInputTokens;
    firstCallCacheCreationInputTokens = fields.cacheCreationInputTokens;
    firstCallCacheTokenSource = fields.cacheTokenSource;
    break;
  }
  // Effective-input / uncached resolution is shared with the last-call scan
  // below (one denominator definition for `first_call_cache_hit_ratio` and
  // `cache_hit_ratio`), and now normalizes additive-vs-inclusive usage so the
  // ratio can never exceed 1. See resolveEffectiveInputTokens.
  const { effectiveInput: firstCallInputEffective } = resolveEffectiveInputTokens(
    firstCallInputTokens,
    firstCallCacheReadInputTokens,
    firstCallCacheCreationInputTokens,
    firstCallCacheTokenSource,
  );
  const firstCallCacheHitRatio =
    firstCallInputEffective !== undefined &&
    firstCallInputEffective > 0 &&
    firstCallCacheReadInputTokens !== undefined
      ? firstCallCacheReadInputTokens / firstCallInputEffective
      : undefined;

  const { effectiveInput: inputTokensEffective, uncachedInput: uncachedInputTokens } =
    resolveEffectiveInputTokens(
      inputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      cacheTokenSource,
    );
  const totalTokens =
    providerTotalTokens ??
    (inputTokensEffective !== undefined && outputTokens !== undefined
      ? inputTokensEffective + outputTokens
      : undefined);
  const estimatedContextTokens =
    inputTokensEffective !== undefined && userQueryTokens > 0
      ? Math.max(0, inputTokensEffective - userQueryTokens)
      : undefined;
  const cacheHitRatio =
    inputTokensEffective !== undefined &&
    inputTokensEffective > 0 &&
    cacheReadInputTokens !== undefined
      ? cacheReadInputTokens / inputTokensEffective
      : undefined;

  return {
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(inputTokens !== undefined ? { input_tokens_provider: inputTokens } : {}),
    ...(inputTokensEffective !== undefined
      ? { input_tokens_effective: inputTokensEffective }
      : {}),
    ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
    ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
    ...(cacheReadInputTokens !== undefined
      ? { cache_read_input_tokens: cacheReadInputTokens }
      : {}),
    ...(cacheCreationInputTokens !== undefined
      ? { cache_creation_input_tokens: cacheCreationInputTokens }
      : {}),
    ...(uncachedInputTokens !== undefined
      ? { uncached_input_tokens: uncachedInputTokens }
      : {}),
    ...(estimatedContextTokens !== undefined
      ? { estimated_context_tokens: estimatedContextTokens }
      : {}),
    ...(cacheHitRatio !== undefined ? { cache_hit_ratio: cacheHitRatio } : {}),
    // The first-call group is only meaningful when we have a real opening-call
    // input total; gate cache_read on that so cache-only alias payloads don't
    // emit a dangling first_call_cache_read with no input to ratio against.
    ...(firstCallInputTokens !== undefined
      ? { first_call_input_tokens: firstCallInputTokens }
      : {}),
    ...(firstCallInputTokens !== undefined && firstCallCacheReadInputTokens !== undefined
      ? { first_call_cache_read_input_tokens: firstCallCacheReadInputTokens }
      : {}),
    ...(firstCallCacheHitRatio !== undefined
      ? { first_call_cache_hit_ratio: firstCallCacheHitRatio }
      : {}),
    cache_token_source: cacheTokenSource,
    token_count_source: haveUsageTokens ? 'provider_usage' : 'unknown',
    agent_reported_model: agentReportedModel,
  };
}
