import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

export function parseAntigravityModels(stdout: string): RuntimeModelOption[] | null {
  const models: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);

  for (const rawLine of String(stdout || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line === 'Fetching available models...') continue;
    const [rawId, ...rawLabelParts] = line.split('\t');
    const id = rawId?.trim() ?? '';
    const label = rawLabelParts.join('\t').trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label });
  }

  return models.length > 1 ? models : null;
}

const ANTIGRAVITY_FALLBACK_MODELS: RuntimeModelOption[] = [
  DEFAULT_MODEL_OPTION,
  { id: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash (High)' },
  { id: 'gemini-3.7-flash-medium', label: 'Gemini 3.7 Flash (Medium)' },
  { id: 'gemini-3.7-flash-low', label: 'Gemini 3.7 Flash (Low)' },
  { id: 'gemini-3.6-flash-high', label: 'Gemini 3.6 Flash (High)' },
  { id: 'gemini-3.6-flash-medium', label: 'Gemini 3.6 Flash (Medium)' },
  { id: 'gemini-3.6-flash-low', label: 'Gemini 3.6 Flash (Low)' },
  { id: 'gemini-3.5-flash-high', label: 'Gemini 3.5 Flash (High)' },
  { id: 'gemini-3.5-flash-medium', label: 'Gemini 3.5 Flash (Medium)' },
  { id: 'gemini-3.5-flash-low', label: 'Gemini 3.5 Flash (Low)' },
  { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
  { id: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro (Low)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
];

export const antigravityAgentDef = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  versionArgs: ['--version'],
  listModels: {
    args: ['models'],
    parse: parseAntigravityModels,
    timeoutMs: 15_000,
  },
  fallbackModels: ANTIGRAVITY_FALLBACK_MODELS,
  supportsCustomModel: false,
  buildArgs: (
    _prompt,
    _imagePaths,
    _extra = [],
    options = {},
    runtimeContext = {},
  ) => {
    const args: string[] = [];
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    args.push('-p', '-');
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'plain',
} satisfies RuntimeAgentDef;
