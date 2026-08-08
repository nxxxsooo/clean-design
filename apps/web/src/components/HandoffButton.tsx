import { useEffect, useRef, useState } from 'react';
import type { HandoffPacketResponse, HandoffRootStatusResponse } from '@open-design/contracts';
import { selectHostHandoffRoot } from '@open-design/host';

import { copyToClipboard } from '../lib/copy-to-clipboard';
import { Icon } from './Icon';

interface Props {
  projectId: string;
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'working'; message: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'success';
      packetPath: string;
      prompt: string;
      copied: boolean;
      warnings: string[];
    };

function failureMessage(result: Extract<HandoffPacketResponse, { ok: false }>): string {
  switch (result.code) {
    case 'root_required': return 'Choose a handoff folder before exporting.';
    case 'root_unavailable': return 'The saved handoff folder is unavailable. Choose it again.';
    case 'secret_detected': return 'Export stopped because a secret-like file or value was detected.';
    case 'render_failed': return 'A required preview could not be rendered. No packet was published.';
    case 'write_failed': return 'The handoff packet could not be written.';
  }
}

export function HandoffButton({ projectId }: Props) {
  const [root, setRoot] = useState<HandoffRootStatusResponse>({ configured: false });
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/handoff-root`)
      .then(async (response) => response.ok ? await response.json() as HandoffRootStatusResponse : { configured: false })
      .then((status) => {
        if (!cancelled) setRoot(status);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chooseRoot = async (): Promise<boolean> => {
    const result = await selectHostHandoffRoot(projectId);
    if (!result.ok) {
      if ('canceled' in result) return false;
      setState({ kind: 'error', message: result.reason });
      setOpen(true);
      return false;
    }
    setRoot({ configured: true, displayName: result.displayName });
    return true;
  };

  const exportPacket = async () => {
    if (state.kind === 'working') return;
    if (!root.configured && !(await chooseRoot())) return;
    setState({ kind: 'working', message: 'Exporting handoff...' });
    setOpen(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/handoff-packet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const result = await response.json() as HandoffPacketResponse;
      if (!result.ok) {
        if (result.code === 'root_required' || result.code === 'root_unavailable') {
          setRoot({ configured: false });
        }
        setState({ kind: 'error', message: `${failureMessage(result)} ${result.message}`.trim() });
        return;
      }
      const copied = await copyToClipboard(result.prompt);
      setState({
        kind: 'success',
        packetPath: result.packetPath,
        prompt: result.prompt,
        copied,
        warnings: result.warnings.map((warning) => warning.message),
      });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className={`handoff-wrap${open ? ' open' : ''}`} ref={wrapRef} data-testid="handoff-wrap">
      <div className="handoff-split">
        <button
          type="button"
          className="handoff-trigger"
          data-testid="handoff-trigger"
          disabled={state.kind === 'working'}
          onClick={() => void exportPacket()}
          title="Export immutable handoff packet"
        >
          <Icon name={state.kind === 'working' ? 'spinner' : 'download'} size={16} />
          <span className="handoff-trigger-label">
            {state.kind === 'working' ? 'Exporting...' : 'Export handoff'}
          </span>
        </button>
        <button
          type="button"
          className="handoff-caret"
          aria-label="Choose handoff folder"
          title={root.configured ? `Handoff folder: ${root.displayName ?? 'Selected'}` : 'Choose handoff folder'}
          onClick={() => void chooseRoot()}
        >
          <Icon name="folder" size={15} />
        </button>
      </div>
      {open && state.kind !== 'idle' ? (
        <div className="handoff-menu" role="status">
          {state.kind === 'working' ? <p>{state.message}</p> : null}
          {state.kind === 'error' ? <div className="handoff-menu-error" role="alert">{state.message}</div> : null}
          {state.kind === 'success' ? (
            <div className="handoff-export-result">
              <strong>Handoff exported</strong>
              <code className="handoff-export-path">{state.packetPath}</code>
              {state.warnings.map((warning) => (
                <p key={warning} className="handoff-menu-warning">{warning}</p>
              ))}
              {state.copied ? (
                <p>Prompt copied to clipboard.</p>
              ) : (
                <>
                  <p role="alert">Clipboard copy failed. Select the prompt below.</p>
                  <textarea
                    className="handoff-prompt-fallback"
                    readOnly
                    value={state.prompt}
                    rows={12}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
