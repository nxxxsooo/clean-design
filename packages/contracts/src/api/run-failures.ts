export const RUN_FAILURE_CATEGORIES = [
  'auth',
  'rate_limit',
  'model_unavailable',
  'prompt_too_large',
  'upstream_unavailable',
  'timeout',
  'empty_output',
  'tool_error',
  'process_exit',
  'user_cancel',
  'unknown',
] as const;

export type RunFailureCategory = (typeof RUN_FAILURE_CATEGORIES)[number];

export const RUN_FAILURE_DETAILS = [
  'auth_required',
  'stale_profile',
  'refresh_token_reused',
  'missing_api_key',
  'invalid_api_key',
  'hard_quota',
  'workspace_credits_exhausted',
  'rate_limit_429',
  'model_not_found',
  'model_not_supported',
  'model_disabled',
  'local_model_not_loaded',
  'cli_version_incompatible',
  'prompt_too_large',
  'request_too_large',
  'attachment_media_type_unsupported',
  'tool_schema_invalid',
  'prompt_tokenization_failed',
  'provider_resource_not_found',
  'upstream_5xx',
  'upstream_client_error',
  'stream_disconnected',
  'network_error',
  'provider_high_demand',
  'provider_routing_error',
  'inactivity_timeout',
  'timeout',
  'empty_output',
  'tool_error',
  'cli_not_installed',
  'git_bash_missing',
  'agent_config_invalid',
  'spawn_failed',
  'spawn_enoexec',
  'spawn_ebadf',
  'spawn_eperm',
  'stdin_write_eof',
  'session_resume_expired',
  'fabricated_role_marker',
  'signal_killed',
  'process_crashed',
  'cpu_unsupported',
  'interrupted',
  'exit_code',
  'terminated_unknown',
  'stream_error',
  'exit_nonzero',
  'fatal_rpc_error',
  'execution_failed',
  'user_cancelled',
  'unknown',
] as const;

export type RunFailureDetail = (typeof RUN_FAILURE_DETAILS)[number];

export const RUN_FAILURE_STAGES = [
  'preflight',
  'spawn',
  'session_init',
  'model_select',
  'prompt_send',
  'first_token_wait',
  'tool_execution',
  'artifact_write',
  'child_close',
  'finalize',
] as const;

export type RunFailureStage = (typeof RUN_FAILURE_STAGES)[number];

export const RUN_FAILURE_USER_ACTIONS = [
  'retry',
  'login',
  'switch_model',
  'reduce_context',
  'install_cli',
  'fix_config',
  'none',
] as const;

export type RunFailureUserAction = (typeof RUN_FAILURE_USER_ACTIONS)[number];

export type RunResult = 'success' | 'failed' | 'cancelled';
export type RunRetryStrategy = 'same_run_transient';
export type RunRetrySuppressedReason =
  | 'not_failed'
  | 'not_retryable'
  | 'unsupported_category'
  | 'non_retryable_category'
  | 'unsafe_failure_stage'
  | 'missing_failure_signal'
  | 'hard_quota'
  | 'attempt_limit_reached'
  | 'cancel_requested'
  | 'user_visible_output_seen'
  | 'tool_call_seen'
  | 'artifact_write_seen'
  | 'live_artifact_seen';
