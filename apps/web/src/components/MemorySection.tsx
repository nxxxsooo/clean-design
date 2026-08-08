import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';

type Translate = ReturnType<typeof useT>;
import { renderMarkdown } from '../runtime/markdown';
import type {
  MemoryChangeEvent,
  MemoryEntry,
  MemoryEntrySummary,
  MemoryExtractionEvent,
  MemoryExtractionRecord,
  MemoryExtractionSkipReason,
  MemoryExtractionsResponse,
  MemoryListResponse,
  MemoryTreeListResponse,
  MemoryTreeNode,
  MemoryType,
} from '@open-design/contracts';
import { MemoryProfilePanel } from './MemoryProfilePanel';
import { MemoryHooksPanel, type MemoryHookKey } from './MemoryHooksPanel';

// All manually-selectable memory types. `profile` (the structured singleton)
// and `rule` (verified checks the POST loop enforces) join the original four
// so the editor type-picker and the saved-memory filter pills surface them.
const TYPES: MemoryType[] = [
  'profile',
  'user',
  'feedback',
  'project',
  'reference',
  'rule',
];

interface DraftEntry {
  id?: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

const EMPTY_DRAFT: DraftEntry = {
  name: '',
  description: '',
  type: 'user',
  body: '',
};

// Small uppercase caption used above each form field. Centralised so
// every field renders with the same color/letter-spacing/baseline; this
// is what gives the editor a Settings-form rhythm rather than a stack
// of unlabelled inputs.
const FIELD_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--text-muted, #888)',
  marginBottom: 4,
};

// Click-to-prefill examples shown above the editor when creating a new
// memory. Three starters cover the most common reasons a person writes
// a memory by hand: tell the assistant about themselves, lock in a
// repeated UI/output preference, or pin the current project. The
// strings live behind i18n keys so each chip stays localized.
const STARTERS: ReadonlyArray<{
  type: MemoryType;
  nameKey: 'settings.memoryStarterUserName' | 'settings.memoryStarterFeedbackName' | 'settings.memoryStarterProjectName';
  descKey: 'settings.memoryStarterUserDesc' | 'settings.memoryStarterFeedbackDesc' | 'settings.memoryStarterProjectDesc';
  bodyKey: 'settings.memoryStarterUserBody' | 'settings.memoryStarterFeedbackBody' | 'settings.memoryStarterProjectBody';
}> = [
  {
    type: 'user',
    nameKey: 'settings.memoryStarterUserName',
    descKey: 'settings.memoryStarterUserDesc',
    bodyKey: 'settings.memoryStarterUserBody',
  },
  {
    type: 'feedback',
    nameKey: 'settings.memoryStarterFeedbackName',
    descKey: 'settings.memoryStarterFeedbackDesc',
    bodyKey: 'settings.memoryStarterFeedbackBody',
  },
  {
    type: 'project',
    nameKey: 'settings.memoryStarterProjectName',
    descKey: 'settings.memoryStarterProjectDesc',
    bodyKey: 'settings.memoryStarterProjectBody',
  },
];

async function fetchMemoryList(): Promise<MemoryListResponse> {
  const resp = await fetch('/api/memory');
  if (!resp.ok) {
    return {
      enabled: true,
      chatExtractionEnabled: true,
      profileEnabled: true,
      rewriteEnabled: true,
      verifyEnabled: true,
      rootDir: '',
      index: '',
      entries: [],
      extraction: null,
    };
  }
  return (await resp.json()) as MemoryListResponse;
}

async function fetchMemoryTree(): Promise<MemoryTreeNode[]> {
  const resp = await fetch('/api/memory/tree');
  if (!resp.ok) return [];
  const json = (await resp.json()) as MemoryTreeListResponse;
  return json.tree ?? [];
}

async function fetchMemoryEntry(id: string): Promise<MemoryEntry | null> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`);
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

async function saveMemoryEntry(draft: DraftEntry): Promise<MemoryEntry | null> {
  const url = draft.id
    ? `/api/memory/${encodeURIComponent(draft.id)}`
    : '/api/memory';
  const resp = await fetch(url, {
    method: draft.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

async function deleteMemoryEntry(id: string): Promise<boolean> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return resp.ok;
}

async function saveMemoryIndex(index: string): Promise<boolean> {
  const resp = await fetch('/api/memory/index', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index }),
  });
  return resp.ok;
}

async function setMemoryEnabled(enabled: boolean): Promise<boolean> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return resp.ok;
}

// Patch a single per-hook config flag. The PATCH parser merges any subset of
// { chatExtractionEnabled, profileEnabled, rewriteEnabled, verifyEnabled } so
// the hooks panel can flip one flag without re-sending the others.
async function patchMemoryConfigFlag(
  flag: MemoryHookKey,
  value: boolean,
): Promise<boolean> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [flag]: value }),
  });
  return resp.ok;
}

async function fetchExtractions(): Promise<MemoryExtractionRecord[]> {
  const resp = await fetch('/api/memory/extractions');
  if (!resp.ok) return [];
  const json = (await resp.json()) as MemoryExtractionsResponse;
  return json.extractions ?? [];
}

interface FriendlyExtractionFailure {
  title: string;
  detail: string;
  action?: string;
}

function providerDisplayName(provider: MemoryExtractionRecord['provider'] | undefined): string {
  if (provider?.credentialSource === 'chat-cli') {
    if (provider.kind === 'anthropic') return 'Claude Code';
    return 'Local CLI';
  }
  switch (provider?.kind) {
    case 'anthropic':
      return 'Anthropic';
    case 'azure':
      return 'Azure OpenAI';
    case 'google':
      return 'Google Gemini';
    case 'ollama':
      return 'Ollama';
    case 'senseaudio':
      return 'SenseAudio';
    case 'aihubmix':
      return 'AIHubMix';
    case 'openai':
      return 'OpenAI';
    default:
      return 'Memory model';
  }
}

function parseProviderError(raw: string): { message: string; code: string; status: number | null } {
  const jsonStart = raw.indexOf('{');
  let message = raw.trim();
  let code = '';
  let status: number | null = null;

  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const error = parsed?.error;
      if (typeof error?.message === 'string') message = error.message;
      else if (typeof parsed?.message === 'string') message = parsed.message;
      if (typeof error?.code === 'string') code = error.code;
      else if (typeof parsed?.code === 'string') code = parsed.code;
      if (typeof parsed?.status === 'number') status = parsed.status;
      else if (typeof error?.status === 'number') status = error.status;
    } catch {
      // Fall through to regex parsing below.
    }
  }

  const statusMatch = /\b(4\d\d|5\d\d)\b/.exec(raw);
  if (status === null && statusMatch?.[1]) status = Number(statusMatch[1]);

  return {
    message: message.replace(/\s+/g, ' ').trim(),
    code,
    status,
  };
}

function describeExtractionFailure(record: MemoryExtractionRecord): FriendlyExtractionFailure | null {
  if (record.phase !== 'failed' || !record.error) return null;
  const providerName = providerDisplayName(record.provider);
  const usesChatCli = record.provider?.credentialSource === 'chat-cli';
  const parsed = parseProviderError(record.error);
  const haystack = `${parsed.message} ${parsed.code} ${record.error}`.toLowerCase();
  const source = 'Clean Design could not run memory extraction for this chat.';

  if (
    parsed.status === 401
    || /token[_ -]?expired|authentication token has expired|invalid[_ -]?api[_ -]?key|unauthorized/.test(haystack)
  ) {
    return {
      title: `${providerName} authentication expired`,
      detail: source,
      action: usesChatCli
        ? 'Sign in to the selected Local CLI or choose a different Memory model.'
        : 'Update the Memory extraction model key or sign in again.',
    };
  }

  if (parsed.status === 429 || /rate limit|quota|too many requests|insufficient_quota/.test(haystack)) {
    return {
      title: `${providerName} quota or rate limit hit`,
      detail: source,
      action: 'Try again later or switch the Memory extraction model.',
    };
  }

  if (/network|fetch failed|timeout|timed out|econnreset|enotfound/.test(haystack)) {
    return {
      title: `${providerName} request failed`,
      detail: source,
      action: usesChatCli
        ? 'Check the selected Local CLI and try again.'
        : 'Check the model provider connection and try again.',
    };
  }

  return {
    title: 'Memory extraction failed',
    detail: parsed.message || source,
    action: usesChatCli
      ? 'Try again after checking the selected Local CLI.'
      : 'Try again after checking the Memory extraction model settings.',
  };
}

// Drop one extraction row server-side. Returns true on a 2xx — the
// listing always re-fetches from the SSE stream, so the UI doesn't need
// the new state back here.
async function deleteExtraction(id: string): Promise<boolean> {
  const resp = await fetch(
    `/api/memory/extractions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return resp.ok;
}

async function clearExtractionHistory(): Promise<boolean> {
  const resp = await fetch('/api/memory/extractions', { method: 'DELETE' });
  return resp.ok;
}

// Map a record back to a single human label for the small badge that
// appears next to the row's preview text. Centralised so phase + skip
// reason render consistently across the empty banner and the list.
//
// `tone` only covers the four phases we actually render in the list —
// the `'deleted'` and `'cleared'` pseudo-phases ride the SSE channel
// and never show up in `extractions[]`, so they're filtered out before
// reaching describeRecord. We fall back to 'skipped' defensively in
// case a daemon-side regression sneaks one through.
function describeRecord(
  record: MemoryExtractionRecord,
  t: Translate,
): {
  phaseLabel: string;
  reasonLabel: string | null;
  kindLabel: string;
  tone: 'running' | 'success' | 'skipped' | 'failed';
} {
  const tone: 'running' | 'success' | 'skipped' | 'failed' =
    record.phase === 'running'
    || record.phase === 'success'
    || record.phase === 'failed'
      ? record.phase
      : 'skipped';
  const phaseLabel = (() => {
    switch (record.phase) {
      case 'running':
        return t('settings.memoryExtractionPhaseRunning');
      case 'success':
        return t('settings.memoryExtractionPhaseSuccess');
      case 'skipped':
        return t('settings.memoryExtractionPhaseSkipped');
      case 'failed':
        return t('settings.memoryExtractionPhaseFailed');
      default:
        return record.phase;
    }
  })();
  const reasonLabel = (() => {
    if (record.phase !== 'skipped') return null;
    const reason: MemoryExtractionSkipReason | undefined = record.reason;
    if (reason === 'no-provider') return t('settings.memoryExtractionSkipNoProvider');
    if (reason === 'unsupported-provider') {
      return t('settings.memoryExtractionSkipUnsupportedProvider');
    }
    if (reason === 'memory-disabled') return t('settings.memoryExtractionSkipDisabled');
    if (reason === 'chat-disabled') return 'Chat conversation learning is off.';
    if (reason === 'empty-message') return t('settings.memoryExtractionSkipEmpty');
    if (reason === 'no-match') return t('settings.memoryExtractionSkipNoMatch');
    return null;
  })();
  // Records written before the `kind` field existed default to 'llm' —
  // that was the only writer at the time, so labelling them as such
  // keeps the history list legible after upgrading.
  const kind = record.kind ?? 'llm';
  const kindLabel =
    kind === 'heuristic'
      ? t('settings.memoryExtractionKindHeuristic')
      : kind === 'connector'
        ? 'Connected apps'
      : t('settings.memoryExtractionKindLlm');
  return { phaseLabel, reasonLabel, kindLabel, tone };
}

function formatRelativeTime(at: number, now: number): string {
  const delta = Math.max(0, now - at);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return `${Math.round(delta / 86_400_000)}d`;
}

// Wall-clock timestamp shown next to the relative age. The user asked
// to "see when each extraction started" — relative ages on their own
// drift after the panel sits open for a few minutes, and "5m" gives no
// hint about whether that 5m was during today's session or a stale row
// from yesterday. We omit the date for same-day rows so the line stays
// short, and tack on the date for older rows.
function formatAbsoluteTime(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${day} ${time}`;
}

function formatDuration(record: MemoryExtractionRecord): string | null {
  if (!record.finishedAt) return null;
  const ms = Math.max(0, record.finishedAt - record.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

function formatRelativeTimeAgo(at: number, now: number): string {
  const relative = formatRelativeTime(at, now);
  return relative === '0s' ? 'just now' : `${relative} ago`;
}

function memoryCountLabel(count: number): string {
  return count === 1 ? 'memory' : 'memories';
}

function extractionCardTitle(record: MemoryExtractionRecord, t: Translate): string {
  const kind = record.kind ?? 'llm';
  if (kind !== 'connector') {
    return record.userMessagePreview || t('settings.memoryExtractions');
  }

  if (record.phase === 'running') return 'Scanning connected apps';
  if (record.phase === 'failed') return 'Connected app scan failed';
  if (record.phase === 'skipped') return 'Connected app scan skipped';

  if (record.phase === 'success') {
    const writtenCount =
      typeof record.writtenCount === 'number' ? record.writtenCount : null;
    if (writtenCount && writtenCount > 0) {
      return `Saved ${writtenCount} ${memoryCountLabel(writtenCount)}`;
    }
    return 'No new memories found';
  }

  return 'Connected app scan';
}

function extractionCardMeta(
  record: MemoryExtractionRecord,
  now: number,
  t: Translate,
): string {
  const kind = record.kind ?? 'llm';
  const age = formatRelativeTimeAgo(record.startedAt, now);
  if (kind === 'connector') {
    if (record.phase === 'running') return 'Checking selected apps';
    if (record.phase === 'failed') return `Needs attention · ${age}`;
    if (record.phase === 'skipped') return `Skipped · ${age}`;
    if (record.phase === 'success') {
      const writtenCount =
        typeof record.writtenCount === 'number' ? record.writtenCount : null;
      const result =
        writtenCount && writtenCount > 0
          ? 'From connected apps'
          : 'Checked selected apps';
      return `${result} · ${age}`;
    }
    return `Connected apps · ${age}`;
  }

  const duration = formatDuration(record);
  const parts = [
    formatAbsoluteTime(record.startedAt, now),
    formatRelativeTime(record.startedAt, now),
  ];
  if (duration) parts.push(`${t('settings.memoryExtractionDuration')} ${duration}`);
  if (record.phase === 'success' && typeof record.writtenCount === 'number') {
    parts.push(`${record.writtenCount} ${t('settings.memoryExtractionWritten')}`);
  }
  return parts.join(' · ');
}

type FlashKind = 'created' | 'saved' | 'deleted' | 'indexSaved' | 'pathCopied';
type MemoryTab = 'profile' | 'manual' | 'chat';

interface MemorySectionProps {}

export function MemorySection(_props: MemorySectionProps = {}) {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  const [chatExtractionEnabled, setChatExtractionEnabled] = useState(true);
  // The three new per-hook flags (default-on). They live alongside the
  // existing chat-extraction flag and are surfaced through MemoryHooksPanel.
  const [profileEnabled, setProfileEnabled] = useState(true);
  const [rewriteEnabled, setRewriteEnabled] = useState(true);
  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const [rootDir, setRootDir] = useState('');
  const [index, setIndex] = useState('');
  const [indexDraft, setIndexDraft] = useState<string | null>(null);
  const [entries, setEntries] = useState<MemoryEntrySummary[]>([]);
  const [memoryTree, setMemoryTree] = useState<MemoryTreeNode[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [editing, setEditing] = useState<DraftEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | MemoryType>('all');
  const [topTab, setTopTab] = useState<'memories' | 'how'>('memories');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MemoryTab>('profile');
  // Brief inline confirmation after a manual save/create/delete. The
  // form vanishes on success and the existing list re-renders, but
  // those signals are subtle — a 1.8s pill makes "your click did
  // something" obvious without the heavyweight global toast.
  const [flash, setFlash] = useState<{ kind: FlashKind; key: number } | null>(
    null,
  );
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorNameRef = useRef<HTMLInputElement | null>(null);
  const recordsRef = useRef<HTMLElement | null>(null);
  const editingTarget = editing?.id ?? (editing ? 'new' : null);
  // Recent LLM-extraction attempts, newest first. Driven by a one-shot
  // fetch on mount + live SSE updates merged by id so phase transitions
  // (running → success) replace the row in place.
  const [extractions, setExtractions] = useState<MemoryExtractionRecord[]>([]);

  const fireFlash = useCallback((kind: FlashKind) => {
    setFlash({ kind, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!editingTarget) return;
    editorRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    editorNameRef.current?.focus({ preventScroll: true });
  }, [editingTarget]);

  const flashLabel = useMemo<Record<FlashKind, string>>(
    () => ({
      created: t('settings.memoryFlashCreated'),
      saved: t('settings.memoryFlashSaved'),
      deleted: t('settings.memoryFlashDeleted'),
      indexSaved: t('settings.memoryFlashIndexSaved'),
      pathCopied: t('settings.memoryFlashPathCopied'),
    }),
    [t],
  );

  const onCopyPath = useCallback(async () => {
    if (!rootDir) return;
    try {
      await navigator.clipboard.writeText(rootDir);
      fireFlash('pathCopied');
    } catch {
      // Some sandboxed contexts block clipboard writes silently. Fall
      // back to a transient input so the user can still grab the path
      // with a manual select-all + copy.
      const input = document.createElement('input');
      input.value = rootDir;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      fireFlash('pathCopied');
    }
  }, [rootDir, fireFlash]);

  const TYPE_LABEL: Record<MemoryType, string> = useMemo(
    () => ({
      profile: t('settings.memoryTypeProfile'),
      user: t('settings.memoryTypeUser'),
      feedback: t('settings.memoryTypeFeedback'),
      project: t('settings.memoryTypeProject'),
      reference: t('settings.memoryTypeReference'),
      rule: t('settings.memoryTypeRule'),
    }),
    [t],
  );

  const reload = useCallback(async () => {
    const [list, tree] = await Promise.all([
      fetchMemoryList(),
      fetchMemoryTree(),
    ]);
    setEnabled(list.enabled);
    setChatExtractionEnabled(list.chatExtractionEnabled !== false);
    setProfileEnabled(list.profileEnabled !== false);
    setRewriteEnabled(list.rewriteEnabled !== false);
    setVerifyEnabled(list.verifyEnabled !== false);
    setRootDir(list.rootDir);
    setIndex(list.index);
    setEntries(list.entries);
    setMemoryTree(tree);
  }, []);

  const reloadExtractions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await fetchExtractions();
      setExtractions(next);
      return next;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadExtractions();
  }, [reload, reloadExtractions]);

  // Live updates: when the daemon emits a memory change event (chat
  // hook, LLM extractor, settings PATCH from a different tab, curl…),
  // re-fetch the list so what the user sees stays in sync. We
  // deliberately ignore events the user just triggered themselves
  // (manual upserts/deletes via this same panel) by listening only to
  // the broader signals — the local code already updated state
  // optimistically, but a re-fetch keeps mtime / index in sync anyway,
  // so we just always reload on any change. EventSource auto-reconnects
  // on temporary daemon hiccups.
  useEffect(() => {
    const es = new EventSource('/api/memory/events');
    es.addEventListener('change', (raw) => {
      try {
        const ev = JSON.parse((raw as MessageEvent).data) as MemoryChangeEvent;
        // Don't reload if the event payload is just a connection ping.
        if (!ev || !ev.kind) return;
        void reload();
      } catch {
        // Malformed — ignore.
      }
    });
    es.addEventListener('extraction', (raw) => {
      try {
        const ev = JSON.parse((raw as MessageEvent).data) as MemoryExtractionEvent;
        if (!ev || !ev.id) return;
        // Pseudo-phases: the daemon emits these synthetically when a
        // row is dropped from the buffer, either by the manual delete
        // button per row or by the "Clear" affordance at the top.
        if (ev.phase === 'cleared') {
          setExtractions([]);
          return;
        }
        if (ev.phase === 'deleted') {
          setExtractions((prev) => prev.filter((r) => r.id !== ev.id));
          return;
        }
        // Merge by id: phase transitions for an in-flight attempt
        // collapse onto a single row instead of stacking N entries
        // for the same attempt. New ids are unshifted so the latest
        // appears at the top.
        setExtractions((prev) => {
          const existing = prev.findIndex((r) => r.id === ev.id);
          if (existing >= 0) {
            const next = prev.slice();
            next[existing] = ev;
            return next;
          }
          return [ev, ...prev].slice(0, 30);
        });
      } catch {
        // Malformed — ignore.
      }
    });
    return () => {
      es.close();
    };
  }, [reload]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  const visibleExtractions = useMemo(
    () => filter === 'all'
      ? extractions.filter((record) => record.kind !== 'connector')
      : [],
    [extractions, filter],
  );
  const unifiedMemoryCount = filtered.length + visibleExtractions.length;

  // The provider banner only shows when the most recent attempt skipped
  // because extraction could not resolve a usable provider. We don't show it
  // for memory-disabled (the user's own toggle) or empty-message (a routine
  // no-op on tool-only turns); those skips just appear in the history list
  // with a muted subtitle.
  const providerConfigBanner = useMemo(() => {
    const latest = extractions[0];
    if (!latest || latest.phase !== 'skipped') return null;
    if (latest.reason === 'no-provider') {
      return {
        title: t('settings.memoryNoProviderBannerTitle'),
        body: t('settings.memoryNoProviderBannerBody'),
      };
    }
    if (latest.reason === 'unsupported-provider') {
      return {
        title: t('settings.memoryNoProviderBannerTitle'),
        body: t('settings.memoryUnsupportedProviderBannerBody'),
      };
    }
    return null;
  }, [extractions, t]);

  // Now-clock for relative timestamps in the extraction list. Refresh
  // every 30s so "12s ago" doesn't get stuck reading "12s ago" five
  // minutes after the user opened the panel. Using state (not a ref)
  // keeps the re-render in the React scheduler.
  const [nowClock, setNowClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const treeFolders = useMemo(
    () => memoryTree.filter((node) => node.kind === 'folder'),
    [memoryTree],
  );

  const treeChildren = useMemo(() => {
    const map = new Map<string, MemoryTreeNode[]>();
    for (const node of memoryTree) {
      if (node.kind !== 'entry' || !node.parentId) continue;
      const list = map.get(node.parentId) ?? [];
      list.push(node);
      map.set(node.parentId, list);
    }
    return map;
  }, [memoryTree]);

  const openPreview = useCallback(
    async (id: string) => {
      if (previewId === id) {
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      setPreviewId(id);
      setPreviewBody(null);
      const entry = await fetchMemoryEntry(id);
      setPreviewBody(entry?.body ?? '');
    },
    [previewId],
  );

  const startEdit = useCallback(async (id: string) => {
    const entry = await fetchMemoryEntry(id);
    if (!entry) return;
    setTopTab('memories');
    setAddModalOpen(true);
    setActiveTab('manual');
    setEditing({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      body: entry.body,
    });
  }, []);

  const startNew = useCallback(() => {
    setTopTab('memories');
    setAddModalOpen(true);
    setActiveTab('manual');
    setEditing({ ...EMPTY_DRAFT });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const onSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    const wasNew = !editing.id;
    setBusy(true);
    try {
      const entry = await saveMemoryEntry(editing);
      if (entry) {
        await reload();
        setEditing(null);
        setAddModalOpen(false);
        fireFlash(wasNew ? 'created' : 'saved');
      }
    } finally {
      setBusy(false);
    }
  }, [editing, reload, fireFlash]);

  const onDelete = useCallback(
    async (id: string) => {
      const ok = await deleteMemoryEntry(id);
      if (ok) {
        await reload();
        fireFlash('deleted');
      }
    },
    [reload, fireFlash],
  );

  const onToggleEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
    await setMemoryEnabled(next);
  }, []);

  // Map each hook key to its setter so a single optimistic-set + rollback path
  // covers all four toggles.
  const HOOK_SETTERS: Record<MemoryHookKey, (fn: (cur: boolean) => boolean) => void> = {
    profileEnabled: setProfileEnabled,
    rewriteEnabled: setRewriteEnabled,
    verifyEnabled: setVerifyEnabled,
    chatExtractionEnabled: setChatExtractionEnabled,
  };

  const onToggleHook = useCallback(
    async (key: MemoryHookKey, next: boolean) => {
      const setter = HOOK_SETTERS[key];
      setter(() => next);
      const ok = await patchMemoryConfigFlag(key, next);
      if (!ok) setter((current) => !current);
    },
    // HOOK_SETTERS references stable useState setters, so the deps are empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const hookFlags = useMemo<Record<MemoryHookKey, boolean>>(
    () => ({
      profileEnabled,
      rewriteEnabled,
      verifyEnabled,
      chatExtractionEnabled,
    }),
    [profileEnabled, rewriteEnabled, verifyEnabled, chatExtractionEnabled],
  );

  const onSaveIndex = useCallback(async () => {
    if (indexDraft === null) return;
    setBusy(true);
    try {
      const ok = await saveMemoryIndex(indexDraft);
      if (ok) {
        setIndex(indexDraft);
        setIndexDraft(null);
        fireFlash('indexSaved');
      }
    } finally {
      setBusy(false);
    }
  }, [indexDraft, fireFlash]);

  const onDeleteExtraction = useCallback(async (id: string) => {
    // Optimistic removal: drop the row immediately so the click feels
    // instant. The SSE 'deleted' event will arrive moments later and is
    // a no-op against an already-removed id; if the request fails we
    // re-fetch to put the row back instead of silently lying.
    setExtractions((prev) => prev.filter((r) => r.id !== id));
    const ok = await deleteExtraction(id);
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions]);

  const onClearExtractions = useCallback(async () => {
    if (!window.confirm(t('settings.memoryExtractionsClearConfirm'))) return;
    setExtractions([]);
    const ok = await clearExtractionHistory();
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions, t]);

	  const memoryTabs: ReadonlyArray<{
	    id: MemoryTab;
	    label: string;
	    caption: string;
	    icon: IconName;
	  }> = [
	    {
	      id: 'profile',
	      label: t('settings.memoryProfileTab'),
	      caption: t('settings.memoryProfileTabCaption'),
	      icon: 'home',
	    },
	    {
	      id: 'manual',
	      label: 'Add manually',
	      caption: 'Write a fact or preference',
	      icon: 'edit',
	    },
	  ];

	  const renderMemoryEntry = (entry: MemoryEntrySummary) => (
	    <div key={entry.id} className="library-card">
	      <div className="library-card-info">
	        <div className="library-card-title-row">
	          <span className="library-card-name">{entry.name}</span>
	        </div>
	        <div className="library-card-desc">
	          {entry.description || '—'}
	        </div>
	      </div>
	      <div className="memory-card-actions">
	        <button
	          type="button"
	          className="library-card-expand"
	          onClick={() => openPreview(entry.id)}
	          title={t('settings.memoryPreview')}
	        >
	          <Icon
	            name={previewId === entry.id ? 'chevron-down' : 'chevron-right'}
	            size={14}
	          />
	        </button>
	        <button
	          type="button"
	          className="ghost library-card-action"
	          onClick={() => startEdit(entry.id)}
	          title={t('settings.memoryEdit')}
	        >
	          <Icon name="edit" size={14} />
	        </button>
	        <button
	          type="button"
	          className="ghost library-card-action"
	          onClick={() => onDelete(entry.id)}
	          title={t('settings.memoryDelete')}
	        >
	          <Icon name="close" size={14} />
	        </button>
	      </div>
	      {previewId === entry.id && (
	        <div className="library-preview" style={{ width: '100%' }}>
	          {previewBody === null ? (
	            <p>{t('common.loading')}</p>
	          ) : previewBody ? (
	            <div className="library-preview-body">
	              {renderMarkdown(previewBody)}
	            </div>
	          ) : (
	            <p className="hint">—</p>
	          )}
	        </div>
	      )}
	    </div>
	  );

	  const renderExtractionCard = (record: MemoryExtractionRecord) => {
    const desc = describeRecord(record, t);
    const title = extractionCardTitle(record, t);
    const meta = extractionCardMeta(record, nowClock, t);
    return (
      <div
        key={record.id}
        className={`library-card memory-extraction-card is-${desc.tone}`}
      >
        <div className="library-card-info">
          <div className="library-card-title-row">
            <span className="library-card-name">
              {title}
            </span>
            <span className={`memory-extraction-pill is-${desc.tone}`}>
              {desc.phaseLabel}
            </span>
            <span className="library-card-badge">
              {desc.kindLabel}
            </span>
          </div>
          <div className="library-card-desc">
            {meta}
          </div>
          {desc.reasonLabel ? (
            <div className="memory-extraction-reason">
              {desc.reasonLabel}
            </div>
          ) : null}
          {record.phase === 'failed' && record.error ? (
            <div className="memory-extraction-failure">
              {(() => {
                const failure = describeExtractionFailure(record);
                if (!failure) return null;
                return (
                  <>
                    <strong>{failure.title}</strong>
                    <span>{failure.detail}</span>
                    {failure.action ? <span>{failure.action}</span> : null}
                  </>
                );
              })()}
            </div>
          ) : null}
          {Array.isArray(record.writtenIds) &&
          record.writtenIds.length > 0 ? (
            <div className="memory-extraction-counts">
              <span>
                {t('settings.memoryExtractionWritten')}
              </span>
              <span className="memory-extraction-ids">
                {record.writtenIds.map((id: string) => (
                  <button
                    key={id}
                    type="button"
                    className="filter-pill"
                    onClick={() => openPreview(id)}
                    title={id}
                  >
                    {id}
                  </button>
                ))}
              </span>
            </div>
          ) : null}
        </div>
        <div className="memory-card-actions">
          <button
            type="button"
            className="ghost library-card-action"
            onClick={() => void onDeleteExtraction(record.id)}
            title={t('settings.memoryExtractionDelete')}
            aria-label={t('settings.memoryExtractionDelete')}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
    );
  };

  const modalHost = typeof document === 'undefined' ? null : document.body;

  return (
    <>
      <section
        className={`settings-section settings-section-card memory-create-section${enabled ? '' : ' is-disabled'}`}
      >
      <div className="section-head memory-control-head">
        <div className="memory-control-copy">
          <h3 className="memory-title-row">
            <span>{t('settings.memory')}</span>
            {/*
              Storage path used to render as a permanently-visible
              <code>/Users/.../.od/memory</code> line in the body. Most
              users only need this once (to peek at the markdown files)
              and then never again, so the line was pure noise after the
              first glance. We tucked it behind an info button next to
              the title: native tooltip on hover reveals the full path,
              and a click copies it to clipboard with a "Path copied"
              flash. Inline English for the aria-label; PR-time
              translation sweep can lift it later.
            */}
            {rootDir ? (
              <span className="memory-info-wrap">
                <button
                  type="button"
                  className="memory-info-btn"
                  onClick={() => void onCopyPath()}
                  title={rootDir}
                  aria-label="Memory storage path — click to copy"
                >
                  <Icon name="info" size={13} />
                </button>
                {flash?.kind === 'pathCopied' ? (
                  <span key={flash.key} className="memory-path-copied-badge">
                    {flashLabel.pathCopied}
                  </span>
                ) : null}
              </span>
            ) : null}
          </h3>
          <p className="hint">{t('settings.memoryDescription')}</p>
        </div>
        <div className="memory-header-actions">
          <div
            className="memory-top-tabs"
            role="tablist"
            aria-label={t('settings.memory')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'memories'}
              className={`memory-top-tab${topTab === 'memories' ? ' active' : ''}`}
              onClick={() => setTopTab('memories')}
            >
              {t('settings.memoryTabMemories')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'how'}
              className={`memory-top-tab${topTab === 'how' ? ' active' : ''}`}
              onClick={() => setTopTab('how')}
            >
              {t('settings.memoryTabHow')}
            </button>
          </div>
          <button
            type="button"
            className="memory-icon-action"
            onClick={() => {
              setTopTab('memories');
              setAddModalOpen(true);
            }}
            title={t('settings.memoryAddDisclosure')}
            aria-label={t('settings.memoryAddDisclosure')}
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            className="memory-icon-action"
            onClick={() => {
              setTopTab('memories');
              setAdvancedModalOpen(true);
            }}
            title="Advanced"
            aria-label="Advanced"
          >
            <Icon name="settings" size={15} />
          </button>
          <label
            className="toggle-switch"
            title={t('settings.memoryEnableLabel')}
            aria-label={t('settings.memoryEnableLabel')}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {!enabled ? (
        <div role="status" className="memory-disabled-banner">
          <strong>{t('settings.memoryDisabled')}</strong> —{' '}
          {t('settings.memoryDisabledBanner')}
        </div>
      ) : null}

      {enabled && providerConfigBanner ? (
        <div role="status" className="memory-noprovider-banner">
          <strong>{providerConfigBanner.title}</strong> —{' '}
          {providerConfigBanner.body}
        </div>
      ) : null}

      {topTab === 'how' ? (
        <div className="memory-how-panel">
          <div className="memory-auto-flow">
            <span>Onboarding</span>
            <Icon name="chevron-right" size={13} />
            <span>Brand context</span>
            <Icon name="chevron-right" size={13} />
            <span>Chat signals</span>
            <Icon name="chevron-right" size={13} />
            <strong>Saved memory</strong>
          </div>
          <p className="memory-how-copy">
            Memory is gathered automatically from profile setup, project and
            brand extraction, connected apps, and useful facts learned during
            chats. The saved list below is the review surface; everything else
            stays quiet unless you open Add or Advanced.
          </p>
          <MemoryHooksPanel
            enabled={enabled}
            flags={hookFlags}
            onToggle={onToggleHook}
          />
        </div>
      ) : null}

      {modalHost && addModalOpen ? createPortal(
      <div
        className="memory-action-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setAddModalOpen(false);
          }
        }}
      >
        <div
          className="memory-action-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memory-add-modal-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="memory-action-modal-head">
            <div>
              <h3 id="memory-add-modal-title">
                {t('settings.memoryAddDisclosure')}
              </h3>
              <p>{t('settings.memoryAddDisclosureHint')}</p>
            </div>
            <button
              type="button"
              className="memory-action-modal-close"
              onClick={() => setAddModalOpen(false)}
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="memory-action-modal-body">

      <div
        className="memory-source-tabs"
        role="tablist"
        aria-label="Memory areas"
      >
        {memoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tab.label}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="memory-source-tab-icon">
              <Icon name={tab.icon} size={14} />
            </span>
            <span className="memory-source-tab-copy">
              <span>{tab.label}</span>
              <small aria-hidden="true">{tab.caption}</small>
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? (
        <div className="memory-tab-panel memory-profile-tab-panel">
          <MemoryProfilePanel enabled={enabled} />
        </div>
      ) : null}

      {activeTab === 'manual' ? (
        <div className="memory-tab-panel memory-manual-panel">
          <div className="memory-source-summary">
            <span className="memory-block-icon">
              <Icon name="edit" size={15} />
            </span>
            <div>
              <h4>Add manually</h4>
              <p className="hint">
                Add facts, preferences, or project context yourself. Fixed assistant
                behavior lives in Instructions / Rules.
              </p>
            </div>
            <button
              type="button"
              className="primary memory-source-action"
              onClick={startNew}
              disabled={editing !== null}
            >
              <Icon name="plus" size={14} />
              <span>{t('settings.memoryNew')}</span>
            </button>
          </div>

          {flash && flash.kind !== 'pathCopied' ? (
            <div
              key={flash.key}
              role="status"
              aria-live="polite"
              className="memory-flash-pill"
            >
              {flashLabel[flash.kind]}
            </div>
          ) : null}

          {editing ? (
            <div
              ref={editorRef}
              className="library-card"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 14,
                padding: 14,
                background: 'var(--surface-subtle, rgba(0,0,0,0.02))',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                borderRadius: 10,
              }}
            >
              {!editing.id ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
                  }}
                >
                  <span
                    style={{
                      ...FIELD_LABEL_STYLE,
                      display: 'inline-block',
                      marginRight: 4,
                      marginBottom: 0,
                    }}
                  >
                    {t('settings.memoryStartersLabel')}
                  </span>
                  {STARTERS.map((starter) => (
                    <button
                      key={starter.nameKey}
                      type="button"
                      className="filter-pill"
                      onClick={() =>
                        setEditing({
                          id: editing.id,
                          type: starter.type,
                          name: t(starter.nameKey),
                          description: t(starter.descKey),
                          body: t(starter.bodyKey),
                        })
                      }
                      title={t(starter.descKey)}
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      {t(starter.nameKey)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={FIELD_LABEL_STYLE}>
                      {t('settings.memoryNameLabel')}
                    </label>
                    <input
                      ref={editorNameRef}
                      type="text"
                      placeholder={t('settings.memoryName')}
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 auto', minWidth: 120 }}>
                    <label style={FIELD_LABEL_STYLE}>
                      {t('settings.memoryTypeLabel')}
                    </label>
                    <select
                      value={editing.type}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          type: e.target.value as MemoryType,
                        })
                      }
                      style={{ width: '100%' }}
                    >
                      {TYPES.map((tt) => (
                        <option key={tt} value={tt}>
                          {TYPE_LABEL[tt]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={FIELD_LABEL_STYLE}>
                    {t('settings.memoryDescLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('settings.memoryDesc')}
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={FIELD_LABEL_STYLE}>
                    {t('settings.memoryBodyLabel')}
                  </label>
                  <textarea
                    placeholder={t('settings.memoryBody')}
                    value={editing.body}
                    onChange={(e) =>
                      setEditing({ ...editing, body: e.target.value })
                    }
                    rows={7}
                    style={{
                      width: '100%',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  />
                  <p className="hint" style={{ fontSize: 11, marginTop: 4 }}>
                    {t('settings.memoryBodyHint')}
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  className="hint"
                  style={{
                    fontSize: 11,
                    margin: 0,
                    color: 'var(--text-muted, #888)',
                  }}
                >
                  {t('settings.memorySaveHint')}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" onClick={cancelEdit}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={onSave}
                    disabled={busy || !editing.name.trim()}
                  >
                    {editing.id ? t('common.save') : t('common.create')}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

        </div>
      ) : null}

          </div>
        </div>
      </div>,
      modalHost,
      ) : null}

      </section>

      {topTab === 'memories' ? (
      <>
      <section ref={recordsRef} className="settings-section settings-section-card memory-records-section">
        <div className="memory-management-panel">
          <div className="memory-subsection-head">
            <div>
              <h4>Saved memory</h4>
              <p className="hint">
                Saved facts, preferences, and project context available to future chats.
              </p>
            </div>
            <div className="memory-management-counts">
              <span className="memory-source-badge">
                {entries.length} saved
              </span>
              {visibleExtractions.length > 0 ? (
                <span className="memory-source-badge">
                  {visibleExtractions.length} extraction{visibleExtractions.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>

          <div className="library-toolbar is-row">
            <div className="library-filters">
              <button
                type="button"
                className={`filter-pill${filter === 'all' ? ' active' : ''}`}
                onClick={() => setFilter('all')}
              >
                {t('settings.memoryAll')}
                <span className="filter-pill-count">
                  {entries.length + visibleExtractions.length}
                </span>
              </button>
              {TYPES.map((type) => {
                const count = entries.filter((e) => e.type === type).length;
                if (count === 0 && filter !== type) return null;
                return (
                  <button
                    key={type}
                    type="button"
                    className={`filter-pill${filter === type ? ' active' : ''}`}
                    onClick={() => setFilter(type)}
                  >
                    {TYPE_LABEL[type]}
                    <span className="filter-pill-count">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="memory-management-actions">
              {visibleExtractions.length > 0 ? (
                <button
                  type="button"
                  className="ghost memory-clear-extractions"
                  onClick={() => void onClearExtractions()}
                  title={t('settings.memoryExtractionsClearTitle')}
                >
                  <Icon name="close" size={12} />
                  <span>{t('settings.memoryExtractionsClear')}</span>
                </button>
              ) : null}
              {visibleExtractions.length > 0 ? (
                <button
                  type="button"
                  className="ghost memory-refresh-extractions"
                  onClick={() => void reloadExtractions()}
                  disabled={isRefreshing}
                  title={t('settings.memoryExtractionsRefresh')}
                >
                  <Icon
                    name="refresh"
                    size={12}
                    className={isRefreshing ? 'icon-spin' : ''}
                  />
                  <span>
                    {isRefreshing
                      ? t('settings.memoryExtractionsRefreshing')
                      : t('settings.memoryExtractionsRefresh')}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="library-content memory-unified-list">
            {unifiedMemoryCount === 0 ? (
              /*
                Empty state — the previous one inlined two side-by-side
                <code> snippets ("记住：用户偏好深色主题 / I prefer dark
                mode") which read like duelling locales and made the user
                wonder if the chips were tap-to-prefill or just decorative.
                We now show one clear "no rows yet" line and a one-sentence
                primer that explains the mechanism (talk in chat, fact gets
                extracted) with a single example. Inline English; PR-time
                translation sweep can lift this into the dictionary.
              */
              <div className="library-empty">
                <p className="library-empty-title">
                  {t('settings.memoryEmpty')}
                </p>
                <p className="library-empty-hint">
                  Tell the assistant a fact in chat — e.g.{' '}
                  <code>I prefer dark mode</code> — and it will be saved
                  here automatically.
                </p>
              </div>
	            ) : (
	              <>
	                {filtered.map(renderMemoryEntry)}
	                {visibleExtractions.map(renderExtractionCard)}
	              </>
	            )}
          </div>
        </div>
      </section>

      {modalHost && advancedModalOpen ? createPortal(
      <div
        className="memory-action-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setAdvancedModalOpen(false);
          }
        }}
      >
        <div
          className="memory-action-modal memory-action-modal--advanced"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memory-advanced-modal-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="memory-action-modal-head">
            <div>
              <h3 id="memory-advanced-modal-title">Advanced</h3>
              <p>Inspect or edit the underlying memory index.</p>
            </div>
            <button
              type="button"
              className="memory-action-modal-close"
              onClick={() => setAdvancedModalOpen(false)}
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="memory-action-modal-body memory-advanced-modal-body">
          <p className="memory-advanced-hint">
            Inspect or edit the underlying memory index.
          </p>
          <div className="memory-advanced-stack">
            <details className="library-group memory-advanced-card">
              <summary className="memory-details-summary">
                <span className="memory-details-title">
                  {t('settings.memoryIndex')}
                </span>
              </summary>
              <textarea
                value={indexDraft ?? index}
                onChange={(e) => setIndexDraft(e.target.value)}
                rows={8}
                style={{
                  width: '100%',
                  marginTop: 8,
                  fontFamily: 'monospace',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  className="hint"
                  style={{
                    fontSize: 11,
                    margin: 0,
                    color:
                      indexDraft !== null
                        ? 'var(--text-warning, #b06a00)'
                        : 'var(--text-muted, #888)',
                    fontWeight: indexDraft !== null ? 600 : 400,
                  }}
                >
                  {indexDraft !== null
                    ? `● ${t('settings.memoryIndexUnsaved')} — ${t('settings.memoryIndexSaveHint')}`
                    : t('settings.memoryIndexSaveHint')}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setIndexDraft(null)}
                    disabled={indexDraft === null}
                  >
                    {t('settings.memoryIndexReset')}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={onSaveIndex}
                    disabled={busy || indexDraft === null}
                  >
                    {t('settings.memoryIndexSave')}
                  </button>
                </div>
              </div>
            </details>
            {treeFolders.length > 0 ? (
              <details className="library-group memory-advanced-card">
                <summary className="memory-details-summary">
                  <span className="memory-details-title">Memory tree</span>
                  <span className="filter-pill-count">{memoryTree.length}</span>
                </summary>
                <p className="memory-advanced-hint">
                  Technical view of the same saved memories. Most users only
                  need the saved-memory list above.
                </p>
                <div className="memory-tree-advanced">
                  {treeFolders.map((folder) => {
                    const children = treeChildren.get(folder.id) ?? [];
                    return (
                      <div
                        key={folder.id}
                        className="library-card"
                        style={{ alignItems: 'stretch' }}
                      >
                        <div className="library-card-info" style={{ width: '100%' }}>
                          <div className="library-card-title-row">
                            <span className="library-card-name">{folder.name}</span>
                            <span className="library-card-badge">{folder.path}</span>
                          </div>
                          <div className="library-card-desc">
                            {children.length} {children.length === 1 ? 'node' : 'nodes'}
                          </div>
                          {children.length > 0 ? (
                            <ul
                              style={{
                                display: 'grid',
                                gap: 6,
                                margin: '8px 0 0',
                                padding: 0,
                                listStyle: 'none',
                              }}
                            >
                              {children.map((child) => (
                                <li
                                  key={child.id}
                                  className="memory-tree-child-row"
                                >
                                  <span style={{ minWidth: 0 }}>
                                    <span className="library-card-name">{child.name}</span>{' '}
                                    <span className="library-card-badge">{child.id}</span>
                                    {child.description ? (
                                      <span
                                        className="library-card-desc"
                                        style={{ display: 'block' }}
                                      >
                                        {child.description}
                                      </span>
                                    ) : null}
                                  </span>
                                  <div className="memory-card-actions">
                                    <button
                                      type="button"
                                      className="ghost library-card-action"
                                      onClick={() => startEdit(child.id)}
                                      title={t('settings.memoryEdit')}
                                    >
                                      <Icon name="edit" size={14} />
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>
          </div>
        </div>
      </div>,
      modalHost,
      ) : null}
      </>
      ) : null}
    </>
  );
}
