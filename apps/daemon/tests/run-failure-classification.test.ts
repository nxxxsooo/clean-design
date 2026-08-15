import { describe, expect, it } from 'vitest';

import {
  classifyRunFailure,
  isResumableFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

const PUBLIC_AGENT_IDS = [
  'claude',
  'codex',
  'opencode',
  'pi',
  'antigravity',
] as const;

function errorEvent(
  code: string,
  message: string,
  retryable?: boolean,
): RunEventForFailureClassification {
  return {
    event: 'error',
    data: {
      message,
      error: {
        code,
        message,
        ...(retryable !== undefined ? { retryable } : {}),
      },
    },
  };
}

function runtimeCloseEvent(reason: string): RunEventForFailureClassification {
  return {
    event: 'diagnostic',
    data: { type: 'runtime_close', rpc_close_reason: reason },
  };
}

function classifyForAgent(
  agentId: string,
  code: string | null,
  message = '',
  events: RunEventForFailureClassification[] = code
    ? [errorEvent(code, message)]
    : [],
) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message || null,
      errorCode: code,
      exitCode: 1,
      signal: null,
    },
    ...(code ? { errorCode: code } : {}),
    agentId,
    events,
  });
}

function classify(
  code: string | null,
  message = '',
  events: RunEventForFailureClassification[] = code
    ? [errorEvent(code, message)]
    : [],
) {
  return classifyForAgent('claude', code, message, events);
}

describe('classifyRunFailure', () => {
  it('does not classify successful runs as failures', () => {
    expect(
      classifyRunFailure({
        result: 'success',
        status: { status: 'succeeded' },
      }),
    ).toBeUndefined();
  });

  it('classifies cancellation separately and retains the furthest observed phase', () => {
    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: { status: 'canceled' },
      }),
    ).toEqual({
      failure_category: 'user_cancel',
      failure_detail: 'user_cancelled',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });

    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: { status: 'canceled' },
        events: [
          { event: 'agent', data: { type: 'text_delta', delta: 'working' } },
          { event: 'agent', data: { type: 'tool_use', id: 'tool-1', name: 'Read' } },
        ],
      }),
    ).toMatchObject({
      failure_category: 'user_cancel',
      failure_stage: 'tool_execution',
    });
  });

  it.each(PUBLIC_AGENT_IDS)('classifies authentication failures for public runtime %s', (agentId) => {
    expect(
      classifyForAgent(
        agentId,
        'AGENT_EXECUTION_FAILED',
        'Authentication required before starting the local CLI session.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });

  it.each([
    {
      message: 'Invalid API key.',
      detail: 'invalid_api_key',
    },
    {
      message: 'Missing environment variable: `OPENAI_API_KEY`.',
      detail: 'missing_api_key',
    },
    {
      message: 'The CLI is using a stale local profile.',
      detail: 'stale_profile',
    },
    {
      message: 'The access token could not be refreshed because the refresh token was already used.',
      detail: 'refresh_token_reused',
    },
  ] as const)('maps $detail authentication evidence', ({ message, detail }) => {
    expect(classify('AGENT_EXECUTION_FAILED', message)).toMatchObject({
      failure_category: 'auth',
      failure_detail: detail,
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });

  it('prefers model and prompt evidence over generic fallback text', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Model selection timed out while the provider reported that the model is unavailable.',
      ),
    ).toMatchObject({
      failure_category: 'model_unavailable',
      failure_detail: 'model_not_found',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });

    expect(
      classify(
        'AGENT_PROMPT_TOO_LARGE',
        'The agent completed without producing output because the context window was exceeded.',
      ),
    ).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_detail: 'prompt_too_large',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it.each([
    {
      message: 'Payload Too Large: request entity too large',
      category: 'prompt_too_large',
      detail: 'request_too_large',
      action: 'reduce_context',
    },
    {
      message: "source.media_type: Invalid enum value. Expected 'image/png', received 'application/pdf'",
      category: 'upstream_unavailable',
      detail: 'attachment_media_type_unsupported',
      action: 'none',
    },
    {
      message: 'function_declarations[0].name: Invalid function name.',
      category: 'upstream_unavailable',
      detail: 'tool_schema_invalid',
      action: 'none',
    },
    {
      message: 'Failed to tokenize prompt',
      category: 'upstream_unavailable',
      detail: 'prompt_tokenization_failed',
      action: 'none',
    },
  ] as const)(
    'classifies deterministic request failure $detail before transient fallbacks',
    ({ message, category, detail, action }) => {
      expect(classify('AGENT_EXECUTION_FAILED', message)).toMatchObject({
        failure_category: category,
        failure_detail: detail,
        failure_stage: 'prompt_send',
        retryable: false,
        user_action: action,
      });
    },
  );

  it('distinguishes retryable rate limits from non-retryable hard quotas', () => {
    expect(classify('RATE_LIMITED', 'HTTP 429: too many requests')).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'rate_limit_429',
      retryable: true,
      user_action: 'retry',
    });

    expect(
      classify(
        'RATE_LIMITED',
        "You've hit your session limit; resets later.",
        [errorEvent('RATE_LIMITED', "You've hit your session limit; resets later.", true)],
      ),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'hard_quota',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies transient upstream and stream failures', () => {
    expect(
      classify('UPSTREAM_UNAVAILABLE', 'HTTP 503 upstream unavailable'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_5xx',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Stream disconnected before completion: TLS handshake EOF.',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Provider model catalog is temporarily unavailable. Please retry.',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'provider_routing_error',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('classifies structured OpenCode provider client errors as non-retryable', () => {
    expect(
      classifyForAgent(
        'opencode',
        'AGENT_EXIT_130',
        'opencode session error: {"error":{"name":"APIError","data":{"message":"Not Found","statusCode":404,"isRetryable":false}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });

  it('keeps broad bare provider errors scoped to the internal BYOK runtime', () => {
    const byokFailure = classifyForAgent(
      'byok-opencode',
      'AGENT_EXECUTION_FAILED',
      'Not Found',
      [
        errorEvent('AGENT_EXECUTION_FAILED', 'Not Found', true),
        runtimeCloseEvent('stream_error'),
      ],
    );
    expect(byokFailure).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      retryable: false,
    });
    expect(isResumableFailure(byokFailure)).toBe(false);

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Not Found',
        [
          errorEvent('AGENT_EXECUTION_FAILED', 'Not Found', true),
          runtimeCloseEvent('stream_error'),
        ],
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'stream_error',
      retryable: true,
    });
  });

  it('classifies empty output, timeout, and tool failures with event phase evidence', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Agent completed without producing any output.',
        [errorEvent('AGENT_EXECUTION_FAILED', 'Agent completed without producing any output.', true)],
      ),
    ).toMatchObject({
      failure_category: 'empty_output',
      failure_detail: 'empty_output',
      failure_stage: 'first_token_wait',
      retryable: true,
    });

    expect(
      classify('TIMEOUT', 'Agent timed out.', [
        { event: 'agent', data: { type: 'text_delta', delta: 'done' } },
        { event: 'agent', data: { type: 'artifact', path: 'index.html' } },
        errorEvent('TIMEOUT', 'Agent timed out.', true),
      ]),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_stage: 'artifact_write',
      retryable: true,
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Tool error: local connector failed while listing files.',
        [
          errorEvent('AGENT_EXECUTION_FAILED', 'tool bootstrap failed', false),
          errorEvent(
            'AGENT_EXECUTION_FAILED',
            'Tool error: local connector failed while listing files.',
            true,
          ),
        ],
      ),
    ).toMatchObject({
      failure_category: 'tool_error',
      failure_detail: 'tool_error',
      failure_stage: 'tool_execution',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('honors the latest explicit retryability hint', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Agent stalled without emitting new output.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: 'AGENT_SIGNAL_SIGTERM',
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        events: [
          errorEvent('AGENT_EXECUTION_FAILED', 'temporary failure', true),
          errorEvent('AGENT_SIGNAL_SIGTERM', 'Agent stalled without emitting new output.', false),
        ],
      }),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      retryable: false,
      user_action: 'none',
    });
  });

  it.each([
    {
      message: 'Error loading config.toml: unknown variant `priority`, expected `fast`.',
      detail: 'agent_config_invalid',
      stage: 'session_init',
      action: 'fix_config',
    },
    {
      message: "'node' is not recognized as an internal or external command.",
      detail: 'cli_not_installed',
      stage: 'spawn',
      action: 'install_cli',
    },
    {
      message: 'spawn failed: spawn ENOEXEC',
      detail: 'spawn_enoexec',
      stage: 'spawn',
      action: 'install_cli',
    },
    {
      message: 'stdin: write EOF',
      detail: 'stdin_write_eof',
      stage: 'child_close',
      action: 'none',
    },
  ] as const)('classifies local process failure $detail', ({ message, detail, stage, action }) => {
    expect(classify('AGENT_EXECUTION_FAILED', message)).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: detail,
      failure_stage: stage,
      retryable: false,
      user_action: action,
    });
  });

  it('classifies an expired Claude session as a retryable session lifecycle failure', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'No conversation found with session id 1d2c3b4a-0000-0000-0000-000000000000',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'session_resume_expired',
      failure_stage: 'session_init',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps generic JSON-RPC failures to the neutral fatal RPC detail', () => {
    expect(
      classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error'),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'fatal_rpc_error',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });
  });

  it.each([
    { reason: 'stream_error', detail: 'stream_error', retryable: true },
    { reason: 'exit_nonzero', detail: 'exit_nonzero', retryable: false },
    { reason: 'fatal_rpc_error', detail: 'fatal_rpc_error', retryable: true },
  ] as const)('refines an otherwise opaque close as $detail', ({ reason, detail, retryable }) => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        '',
        [errorEvent('AGENT_EXECUTION_FAILED', ''), runtimeCloseEvent(reason)],
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: detail,
      retryable,
    });
  });

  it('does not replace an explicit exit-code classification with a close diagnostic', () => {
    expect(
      classify(
        'AGENT_EXIT_1',
        '',
        [errorEvent('AGENT_EXIT_1', ''), runtimeCloseEvent('stream_error')],
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'exit_code',
      retryable: false,
    });
  });

  it.each([
    { signal: 'SIGKILL', detail: 'signal_killed' },
    { signal: 'SIGSEGV', detail: 'process_crashed' },
    { signal: 'SIGABRT', detail: 'process_crashed' },
    { signal: 'SIGINT', detail: 'interrupted' },
    { signal: 'SIGTERM', detail: 'terminated_unknown' },
  ] as const)('classifies $signal as non-retryable $detail', ({ signal, detail }) => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: signal === 'SIGTERM' ? 'Terminated' : signal,
          signal,
          exitCode: null,
          errorCode: `AGENT_SIGNAL_${signal}`,
        },
        errorCode: `AGENT_SIGNAL_${signal}`,
        agentId: 'claude',
        events: [],
      }),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: detail,
      retryable: false,
      user_action: 'none',
    });
  });

  it('does not misclassify an inactivity-driven SIGTERM as a process termination', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: 'AGENT_SIGNAL_SIGTERM',
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        agentId: 'claude',
        events: [],
      }),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('falls back to unknown when no meaningful signal is available', () => {
    expect(classify('SOMETHING_NEW', '')).toMatchObject({
      failure_category: 'unknown',
      failure_detail: 'unknown',
      failure_stage: 'finalize',
      retryable: false,
      user_action: 'none',
    });
  });
});

describe('isResumableFailure', () => {
  it.each([
    ['stream_disconnected', 'upstream_unavailable'],
    ['upstream_5xx', 'upstream_unavailable'],
    ['network_error', 'upstream_unavailable'],
    ['provider_high_demand', 'upstream_unavailable'],
    ['provider_routing_error', 'upstream_unavailable'],
    ['inactivity_timeout', 'timeout'],
  ] as const)('allows retryable transient detail %s', (failure_detail, failure_category) => {
    expect(isResumableFailure({
      failure_category,
      failure_detail,
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    })).toBe(true);
  });

  it('rejects deterministic, non-retryable, and already-committed failures', () => {
    expect(isResumableFailure({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    })).toBe(false);
    expect(isResumableFailure({
      failure_category: 'process_exit',
      failure_detail: 'process_crashed',
      failure_stage: 'child_close',
      retryable: false,
      user_action: 'none',
    })).toBe(false);
    expect(isResumableFailure(undefined)).toBe(false);
  });
});
