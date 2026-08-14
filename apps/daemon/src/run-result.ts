// Daemon-side helpers that normalize a run status and derive a stable error
// code for failure classification, retry decisions, and persisted run state.

export type RunResult = 'success' | 'failed' | 'cancelled';

export interface RunStatusSummary {
  status: string;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
}

export function runResultFromStatus(status: string | undefined): RunResult {
  if (status === 'succeeded') return 'success';
  if (status === 'canceled') return 'cancelled';
  return 'failed';
}

export function deriveRunErrorCode(
  status: RunStatusSummary,
): string | undefined {
  const result = runResultFromStatus(status.status);
  if (result === 'success') return undefined;
  // Cancellation usually carries no error; only forward an explicit one
  // when the daemon stamped it (e.g. cancel during error recovery).
  if (result === 'cancelled') return status.errorCode ?? undefined;
  // Failure path: prefer the structured code stamped on the run via
  // `extractErrorDetails`. When the run reached `failed` without going
  // through `emit('error', ...)`, derive the best signal we have.
  const explicit = status.errorCode;
  if (explicit) return explicit;
  if (status.signal) return `AGENT_SIGNAL_${status.signal}`;
  if (typeof status.exitCode === 'number' && status.exitCode !== 0) {
    return `AGENT_EXIT_${status.exitCode}`;
  }
  return 'AGENT_TERMINATED_UNKNOWN';
}
