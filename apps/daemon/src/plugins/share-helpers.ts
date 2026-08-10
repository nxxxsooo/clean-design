import type Database from 'better-sqlite3';

export interface RunLike {
  assistantMessageId?: string | null;
}

export interface RunWaiter {
  wait(run: RunLike): Promise<{ status: string }>;
}

export function renderPluginBriefTemplate(
  template: string | null | undefined,
  inputs: Record<string, string | number | boolean | null | undefined> = {},
): string {
  if (typeof template !== 'string' || template.length === 0) return '';
  return template.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key: string) => {
    if (!Object.hasOwn(inputs, key)) return full;
    const value = inputs[key];
    if (value === undefined || value === null || value === '') return full;
    return String(value);
  });
}

export function reconcileAssistantMessageOnRunEnd(
  db: Database.Database,
  runs: RunWaiter,
  run: RunLike,
): void {
  if (!run.assistantMessageId) return;
  void runs
    .wait(run)
    .then((finalStatus) => {
      db.prepare(
        `UPDATE messages
            SET run_status = ?, ended_at = COALESCE(ended_at, ?)
          WHERE id = ? AND run_status IN ('queued', 'running')`,
      ).run(finalStatus.status, Date.now(), run.assistantMessageId);
    })
    .catch((err: Error) => {
      console.warn('[runs] message reconciliation failed', err);
    });
}
