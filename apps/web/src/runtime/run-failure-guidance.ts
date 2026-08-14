export type RunFailurePrimaryAction =
  | 'retry'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model'
  | 'none';

export type RunFailureMessageKey =
  | 'chat.connectionDropped'
  | 'chat.runError.signInMessage.other'
  | 'chat.runError.cliMissingMessage'
  | 'chat.runError.promptTooLargeMessage'
  | 'chat.runError.modelUnavailableMessage'
  | 'chat.runError.rateLimitedMessage'
  | 'chat.runError.upstreamUnavailableMessage'
  | 'chat.runError.toolLoopMessage'
  | 'chat.runError.outputInvalidMessage'
  | 'chat.runError.runtimeConfigMessage'
  | 'chat.runError.quotaExhaustedMessage'
  | 'chat.runError.timedOutMessage'
  | 'chat.runError.inactivityTimeoutMessage'
  | 'chat.runError.emptyOutputMessage'
  | 'chat.runError.sessionExpiredMessage'
  | 'chat.runError.gitBashMissingMessage'
  | 'chat.runError.cpuUnsupportedMessage'
  | null;

export type RunFailureTitleKey =
  | 'chat.runError.title.connectionDropped'
  | 'chat.runError.title.signInRequired'
  | 'chat.runError.title.rateLimited'
  | 'chat.runError.title.cliMissing'
  | 'chat.runError.title.promptTooLarge'
  | 'chat.runError.title.modelUnavailable'
  | 'chat.runError.title.upstreamUnavailable'
  | 'chat.runError.title.toolLoop'
  | 'chat.runError.title.outputInvalid'
  | 'chat.runError.title.runtimeConfig'
  | 'chat.runError.title.quotaExhausted'
  | 'chat.runError.title.timedOut'
  | 'chat.runError.title.emptyOutput'
  | 'chat.runError.title.sessionExpired'
  | 'chat.runError.title.gitBashMissing'
  | 'chat.runError.title.cpuUnsupported'
  | 'chat.runError.title.generic';

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  titleKey: RunFailureTitleKey;
  messageKey: RunFailureMessageKey;
  secondaryRetry: boolean;
  showSwitchCard: false;
}

function retry(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return { primaryAction: 'retry', titleKey, messageKey, secondaryRetry: false, showSwitchCard: false };
}

const CODE_GUIDANCE: Record<string, RunFailureUi> = {
  AGENT_UNAVAILABLE: retry('chat.runError.title.cliMissing', 'chat.runError.cliMissingMessage'),
  AGENT_PROMPT_TOO_LARGE: retry('chat.runError.title.promptTooLarge', 'chat.runError.promptTooLargeMessage'),
  MODEL_UNAVAILABLE: retry('chat.runError.title.modelUnavailable', 'chat.runError.modelUnavailableMessage'),
  TOOL_LOOP_DETECTED: retry('chat.runError.title.toolLoop', 'chat.runError.toolLoopMessage'),
  ROLE_MARKER_HALLUCINATION: retry('chat.runError.title.outputInvalid', 'chat.runError.outputInvalidMessage'),
  AGENT_RUNTIME_DEF_INVALID: retry('chat.runError.title.runtimeConfig', 'chat.runError.runtimeConfigMessage'),
  AGENT_CONNECTION_DROPPED: retry('chat.runError.title.connectionDropped', 'chat.connectionDropped'),
  AGENT_AUTH_REQUIRED: retry('chat.runError.title.signInRequired', 'chat.runError.signInMessage.other'),
  UNAUTHORIZED: retry('chat.runError.title.signInRequired', 'chat.runError.signInMessage.other'),
  RATE_LIMITED: retry('chat.runError.title.rateLimited', 'chat.runError.rateLimitedMessage'),
  UPSTREAM_UNAVAILABLE: retry('chat.runError.title.upstreamUnavailable', 'chat.runError.upstreamUnavailableMessage'),
};

const DETAIL_GUIDANCE: Record<string, RunFailureUi> = {
  timeout: retry('chat.runError.title.timedOut', 'chat.runError.timedOutMessage'),
  inactivity_timeout: retry('chat.runError.title.timedOut', 'chat.runError.inactivityTimeoutMessage'),
  empty_output: retry('chat.runError.title.emptyOutput', 'chat.runError.emptyOutputMessage'),
  session_resume_expired: retry('chat.runError.title.sessionExpired', 'chat.runError.sessionExpiredMessage'),
  git_bash_missing: retry('chat.runError.title.gitBashMissing', 'chat.runError.gitBashMissingMessage'),
  cli_not_installed: retry('chat.runError.title.cliMissing', 'chat.runError.cliMissingMessage'),
  hard_quota: {
    primaryAction: 'none',
    titleKey: 'chat.runError.title.quotaExhausted',
    messageKey: 'chat.runError.quotaExhaustedMessage',
    secondaryRetry: false,
    showSwitchCard: false,
  },
  cpu_unsupported: {
    primaryAction: 'none',
    titleKey: 'chat.runError.title.cpuUnsupported',
    messageKey: 'chat.runError.cpuUnsupportedMessage',
    secondaryRetry: false,
    showSwitchCard: false,
  },
};

export function resolveRunFailureUi(
  code: string | null | undefined,
  detail: string | null | undefined,
  agentId: string | null | undefined,
): RunFailureUi {
  if (detail && DETAIL_GUIDANCE[detail]) return DETAIL_GUIDANCE[detail];
  if (agentId === 'antigravity' && code === 'AGENT_AUTH_REQUIRED') {
    return {
      primaryAction: 'launch-terminal-auth',
      titleKey: 'chat.runError.title.signInRequired',
      messageKey: null,
      secondaryRetry: true,
      showSwitchCard: false,
    };
  }
  if (agentId === 'antigravity' && code === 'RATE_LIMITED') {
    return {
      primaryAction: 'launch-terminal-switch-model',
      titleKey: 'chat.runError.title.rateLimited',
      messageKey: null,
      secondaryRetry: true,
      showSwitchCard: false,
    };
  }
  if (code && CODE_GUIDANCE[code]) return CODE_GUIDANCE[code];
  return retry('chat.runError.title.generic', null);
}
