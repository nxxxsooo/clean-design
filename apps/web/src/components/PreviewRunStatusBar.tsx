import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import {
  latestPreviewRunStatus,
  PREVIEW_RUN_SUCCESS_VISIBLE_MS,
  previewRunStatusCompletedAt,
  previewRunStatusVisibleAt,
  type PreviewRunStatus,
} from '../runtime/preview-run-status';
import type { ChatMessage } from '../types';
import styles from './PreviewRunStatusBar.module.css';

const SUCCESS_EXIT_MS = 140;

interface Props {
  conversationId?: string | null;
  messages: readonly ChatMessage[];
}

function statusLabelKey(status: PreviewRunStatus):
  | 'previewRunStatus.analyzing'
  | 'previewRunStatus.generating'
  | 'previewRunStatus.verifying'
  | 'previewRunStatus.succeeded'
  | 'previewRunStatus.failed' {
  switch (status.phase) {
    case 'generating':
      return status.stage === 'analyzing'
        ? 'previewRunStatus.analyzing'
        : 'previewRunStatus.generating';
    case 'verifying':
      return 'previewRunStatus.verifying';
    case 'succeeded':
      return 'previewRunStatus.succeeded';
    case 'failed':
      return 'previewRunStatus.failed';
  }
}

/** Lightweight run feedback embedded directly in the preview canvas. */
export function PreviewRunStatusBar({
  conversationId,
  messages,
}: Props) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const current = useMemo(
    () => {
      // `now` is only a render tick for active/success timers. Evaluate the
      // message set against the wall clock so switching to an old conversation
      // cannot briefly revive an already-expired success state.
      const evaluatedAt = Date.now();
      const status = latestPreviewRunStatus(messages, evaluatedAt);
      return status && previewRunStatusVisibleAt(status, evaluatedAt) ? status : null;
    },
    [conversationId, messages, now],
  );
  const [lastVisible, setLastVisible] = useState<PreviewRunStatus | null>(current);
  const [leaving, setLeaving] = useState(false);

  const currentKey = current
    ? `${current.message.id}:${current.phase}:${current.message.resultDeliveryState ?? ''}`
    : null;

  useEffect(() => {
    if (!current) {
      if (lastVisible?.phase === 'succeeded') {
        setLeaving(true);
        const clear = window.setTimeout(() => setLastVisible(null), SUCCESS_EXIT_MS);
        return () => window.clearTimeout(clear);
      }
      setLastVisible(null);
      return;
    }
    setLastVisible(current);
    setLeaving(false);
  }, [currentKey, current, lastVisible?.phase]);

  useEffect(() => {
    if (!current) return;
    if (current.phase === 'generating' || current.phase === 'verifying') {
      const interval = window.setInterval(() => setNow(Date.now()), 1_000);
      return () => window.clearInterval(interval);
    }
    if (current.phase !== 'succeeded') return;

    const completedAt = previewRunStatusCompletedAt(current);
    if (completedAt === undefined) return;
    const remaining = Math.max(0, completedAt + PREVIEW_RUN_SUCCESS_VISIBLE_MS - Date.now());
    const fade = window.setTimeout(
      () => setLeaving(true),
      Math.max(0, remaining - SUCCESS_EXIT_MS),
    );
    const expire = window.setTimeout(() => setNow(Date.now()), remaining);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(expire);
    };
  }, [currentKey, current]);

  const displayed = current ?? lastVisible;
  if (!displayed) return null;

  const label = t(statusLabelKey(displayed));

  // Keep the floating preview hint focused on the current stage. Precise run
  // timing already appears in Chat, so repeating it here obscures the preview.
  return (
    <div
      className={`${styles.root}${leaving ? ` ${styles.leaving}` : ''}`}
      data-testid="preview-run-status"
    >
      <div className={`${styles.card}${displayed.phase === 'failed' ? ` ${styles.failed}` : ''}`}>
        <span
          key={`${displayed.message.id}:${displayed.stage}`}
          className={styles.label}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {label}
        </span>
      </div>
    </div>
  );
}
