import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import {
  antigravity,
  assert,
  chmodSync,
  claude,
  codex,
  join,
  mkdtempSync,
  opencode,
  pi,
  rmSync,
  tmpdir,
  writeFileSync,
} from './helpers/test-helpers.js';
import { writeAntigravityModelSelection } from '../../src/runtimes/defs/antigravity.js';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';

test('opencode args keep the documented run/json argv and ignore unsupported reasoning options', () => {
  agentCapabilities.delete('opencode');
  const prompt = 'design a dashboard';
  const baseArgs = opencode.buildArgs(prompt, [], [], {});
  assert.equal(opencode.promptViaStdin, true);
  assert.equal(opencode.reasoningOptions, undefined);
  assert.deepEqual(opencode.helpArgs, ['run', '--help']);
  assert.deepEqual(opencode.capabilityFlags?.['--dangerously-skip-permissions'], 'skipPermissions');
  assert.equal(baseArgs.includes('-'), false);
  assert.equal(baseArgs.includes(prompt), false);
  assert.deepEqual(baseArgs, [
    'run',
    '--format',
    'json',
  ]);

  const withModel = opencode.buildArgs(
    prompt,
    [],
    [],
    { model: 'anthropic/claude-sonnet-4-5' },
  );
  assert.deepEqual(withModel, [
    'run',
    '--format',
    'json',
    '-m',
    'anthropic/claude-sonnet-4-5',
  ]);
  const withReasoning = opencode.buildArgs(
    prompt,
    [],
    [],
    {
      model: 'anthropic/claude-sonnet-4-5',
      reasoning: 'high',
    },
  );
  assert.equal(withReasoning.some((arg) => arg.includes('reason')), false);
  assert.equal(withReasoning.includes('--thinking'), false);
  assert.deepEqual(withReasoning, withModel);
  assert.equal(withModel.includes('--dangerously-skip-permissions'), false);
  assert.equal(withModel.includes('--model'), false);
});

test('opencode passes --dangerously-skip-permissions when the help probe finds it', () => {
  agentCapabilities.set('opencode', { skipPermissions: true });
  try {
    const args = opencode.buildArgs('design a dashboard', [], [], {});
    assert.deepEqual(args, [
      'run',
      '--format',
      'json',
      '--dangerously-skip-permissions',
    ]);
  } finally {
    agentCapabilities.delete('opencode');
  }
});

test('pi args use rpc mode without --no-session and append model/thinking options', () => {
  const baseArgs = pi.buildArgs('', [], [], {}, {});

  assert.deepEqual(baseArgs, ['--mode', 'rpc']);
  assert.ok(!baseArgs.includes('--no-session'), 'pi must not pass --no-session');
  assert.equal(pi.promptViaStdin, true);
  assert.equal(pi.streamFormat, 'pi-rpc');
  assert.equal(pi.supportsImagePaths, true);

  const withModel = pi.buildArgs('', [], [], { model: 'anthropic/claude-sonnet-4-5' }, {});
  assert.deepEqual(withModel, [
    '--mode',
    'rpc',
    '--model',
    'anthropic/claude-sonnet-4-5',
  ]);

  const withThinking = pi.buildArgs('', [], [], { reasoning: 'high' }, {});
  assert.deepEqual(withThinking, [
    '--mode',
    'rpc',
    '--thinking',
    'high',
  ]);
});

test('pi fetchModels reads the model table from stdout', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-pi-models-'));
  try {
    const bin = join(dir, process.platform === 'win32' ? 'pi.cmd' : 'pi');
    if (process.platform === 'win32') {
      writeFileSync(
        bin,
        '@echo off\r\nif "%~1"=="--list-models" (\r\n  echo provider model context max-out thinking images\r\n  echo anthropic claude-sonnet-4-5 200K 64K yes yes\r\n  exit /b 0\r\n)\r\nexit /b 1\r\n',
      );
    } else {
      writeFileSync(
        bin,
        '#!/bin/sh\nif [ "$1" = "--list-models" ]; then\n  printf \'%s\\n\' \\\n    \'provider model context max-out thinking images\' \\\n    \'anthropic claude-sonnet-4-5 200K 64K yes yes\'\n  exit 0\nfi\nexit 1\n',
      );
      chmodSync(bin, 0o755);
    }

    assert.ok(pi.fetchModels, 'pi must define fetchModels');
    const models = await pi.fetchModels(bin, {});

    assert.deepEqual(models, [
      { id: 'default', label: 'Default (CLI config)' },
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'anthropic/claude-sonnet-4-5',
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pi args forward extraAllowedDirs as --append-system-prompt flags', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills', '/tmp/design-systems'],
    {},
    {},
  );

  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--append-system-prompt',
    '/tmp/skills',
    '--append-system-prompt',
    '/tmp/design-systems',
  ]);
});

test('pi args filter relative paths from extraAllowedDirs', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills', 'relative/path', '/tmp/design-systems'],
    {},
    {},
  );

  // Relative paths should be filtered out.
  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--append-system-prompt',
    '/tmp/skills',
    '--append-system-prompt',
    '/tmp/design-systems',
  ]);
});

test('pi args combine model, thinking, and extraAllowedDirs', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills'],
    { model: 'openai/gpt-5', reasoning: 'medium' },
    {},
  );

  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--model',
    'openai/gpt-5',
    '--thinking',
    'medium',
    '--append-system-prompt',
    '/tmp/skills',
  ]);
});

// `agy` exposes `-p` (print mode, alias for `--print`) plus `-` as
// the stdin sentinel — confirmed against `agy --help` on v1.0.3, where
// `Available subcommands` is `changelog / help / install / plugin /
// update` (no `chat`). Earlier review iterations pinned `['chat', '-']`
// based on a different agy build the looper reviewer environment uses;
// the installed CLI does not recognise it, exits 0 with no stdout, and
// the daemon would render the resulting empty reply as a "successful"
// agent response — exactly the failure mode the auth/quota guard at
// server.ts ~12090 is meant to catch but for the wrong reason.
test('antigravity pipes prompt via stdin via -p flag (print mode)', () => {
  assert.equal(antigravity.bin, 'agy');
  assert.equal(antigravity.streamFormat, 'plain');
  assert.equal(antigravity.promptViaStdin, true);

  const args = antigravity.buildArgs('write hello world', [], [], {}, {});
  assert.deepEqual(args, ['-p', '-']);

  const argsWithLog = antigravity.buildArgs('write hello world', [], [], {}, {
    agentLogFilePath: '/tmp/od-agy-test.log',
  });
  assert.deepEqual(argsWithLog, ['--log-file', '/tmp/od-agy-test.log', '-p', '-']);

  // No `--model` flag exists upstream, so buildArgs argv must stay the
  // same regardless of which label the user picks.
  // Pass a temp antigravitySettingsPath so buildArgs does not touch the
  // real ~/.gemini/antigravity-cli/settings.json during a unit test run.
  const settingsDir = mkdtempSync(join(tmpdir(), 'od-agy-argv-'));
  try {
    const withModel = antigravity.buildArgs('hi', [], [], {
      model: 'Gemini 3.1 Pro (High)',
    }, {
      agentLogFilePath: '/tmp/od-agy-test.log',
      antigravitySettingsPath: join(settingsDir, 'settings.json'),
    });
    assert.equal(withModel.includes('--model'), false);
    assert.deepEqual(withModel, ['--log-file', '/tmp/od-agy-test.log', '-p', '-']);
  } finally {
    rmSync(settingsDir, { recursive: true, force: true });
  }

  // Argv must NOT carry `-c` even on follow-up turns. We tested resume
  // mode and found agy's `-c` activates an internal agentic loop (tool
  // calls, retries, fallback-to-cached-response) that overrides OD's
  // system-prompt OVERRIDE — producing byte-identical form re-emissions
  // on turn 2. The stateless path + sanitized transcript injection is
  // what actually breaks the discovery loop. Pin both shapes so a
  // future contributor doesn't silently reintroduce `-c` and hit the
  // same regression.
  const followUp = antigravity.buildArgs('next message', [], [], {}, {
    hasPriorAssistantTurn: true,
  });
  assert.deepEqual(followUp, ['-p', '-']);
  assert.equal(followUp.includes('-c'), false);

  const firstTurn = antigravity.buildArgs('first', [], [], {}, {
    hasPriorAssistantTurn: false,
  });
  assert.deepEqual(firstTurn, ['-p', '-']);
  assert.equal(antigravity.resumesSessionViaCli, undefined);

  assert.equal(antigravity.maxPromptArgBytes, undefined);

  // Picker exposes the synthetic Default + the 8 labels agy's TUI
  // Switch-Model surfaces for consumer-tier accounts. The set is small
  // enough to ship statically; revisit when upstream adds an `agy
  // models` subcommand (also tracked under issue #35).
  assert.deepEqual(
    antigravity.fallbackModels.map((m) => m.id),
    [
      'default',
      'Gemini 3.1 Pro (High)',
      'Gemini 3.1 Pro (Low)',
      'Gemini 3.5 Flash (High)',
      'Gemini 3.5 Flash (Medium)',
      'Gemini 3.5 Flash (Low)',
      'Claude Sonnet 4.6 (Thinking)',
      'Claude Opus 4.6 (Thinking)',
      'GPT-OSS 120B (Medium)',
    ],
  );

  // `agy` v1.0.3 has no `--model` flag (upstream #35), no `models`
  // subcommand, and no `/model` slash command — a user-typed model id
  // would be silently ignored at spawn, looking like an OD bug. The
  // settings UI hides the "Custom (fill below)" option when this is
  // `false`. Remove this opt-out once upstream wires #35.
  assert.equal(antigravity.supportsCustomModel, false);
});

// `agy` reads `~/.gemini/antigravity-cli/settings.json` on every CLI
// startup — verified by capturing the `--log-file` line `Propagating
// selected model override to backend: label=…`. Routing OD's model
// picker through that file lets the user choose a model from Settings
// even though agy has no `--model` flag (upstream issue #35).
//
// Two behaviors must hold and are pinned here:
//
//   1. Picking "default" must NOT touch settings.json — respect the
//      label the user previously set inside agy's own TUI.
//   2. Picking a concrete label must write that exact string into the
//      `model` field while preserving every other key (e.g.
//      `trustedWorkspaces` that agy populates on first-run consent).
test('antigravity persists model selection to agy settings.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-antigravity-settings-'));
  try {
    const settingsPath = join(dir, 'settings.json');

    // 1. Pre-seed the file as agy would after onboarding: a model label
    //    plus a trustedWorkspaces array the user has already consented to.
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          model: 'GPT-OSS 120B (Medium)',
          trustedWorkspaces: ['/tmp/od-project'],
        },
        null,
        2,
      ),
    );

    // 2. Write a new label and assert the model swap + trusted list intact.
    writeAntigravityModelSelection('Gemini 3.1 Pro (High)', settingsPath);
    const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(after.model, 'Gemini 3.1 Pro (High)');
    assert.deepEqual(after.trustedWorkspaces, ['/tmp/od-project']);

    // 3. When the file doesn't exist (fresh install before onboarding),
    //    we must create it rather than crash the spawn pipeline.
    const freshPath = join(dir, 'fresh', 'settings.json');
    writeAntigravityModelSelection('Claude Sonnet 4.6 (Thinking)', freshPath);
    assert.ok(existsSync(freshPath));
    assert.equal(
      JSON.parse(readFileSync(freshPath, 'utf8')).model,
      'Claude Sonnet 4.6 (Thinking)',
    );

    // 4. When the existing file is corrupt JSON, we must rewrite it from
    //    scratch instead of leaving agy with an unparseable settings file.
    const corruptPath = join(dir, 'corrupt-settings.json');
    writeFileSync(corruptPath, '{not valid json');
    writeAntigravityModelSelection('Gemini 3.5 Flash (Low)', corruptPath);
    const recovered = JSON.parse(readFileSync(corruptPath, 'utf8'));
    assert.equal(recovered.model, 'Gemini 3.5 Flash (Low)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- reasoning-effort clamp ------------------------------------------------
// Drives clampCodexReasoning through the public buildArgs surface so the
// helper stays non-exported. The wire-level `-c model_reasoning_effort="..."`
// flag is what the codex CLI (and ultimately OpenAI) actually sees.

test('codex buildArgs clamps reasoning effort per model', () => {
  const cases: Array<[string | undefined, string, string]> = [
    // [model, reasoning, expected wire-level effort]
    // gpt-5.5 family (and unknown / 'default' which we treat as 5.5):
    // minimal -> low, others pass through.
    [undefined, 'minimal', 'low'],
    ['default', 'minimal', 'low'],
    ['gpt-5.2', 'minimal', 'low'],
    ['gpt-5.3', 'minimal', 'low'],
    ['gpt-5.4', 'minimal', 'low'],
    ['gpt-5.5', 'minimal', 'low'],
    ['gpt-5.5', 'low', 'low'],
    ['gpt-5.5', 'medium', 'medium'],
    ['gpt-5.5', 'high', 'high'],
    ['vendor/gpt-5.5-foo', 'minimal', 'low'], // path-style id
    // gpt-5.1: xhigh isn't supported, others pass through.
    ['gpt-5.1', 'xhigh', 'high'],
    ['gpt-5.1', 'high', 'high'],
    // gpt-5.1-codex-mini: caps at medium / high only.
    ['gpt-5.1-codex-mini', 'minimal', 'medium'],
    ['gpt-5.1-codex-mini', 'low', 'medium'],
    ['gpt-5.1-codex-mini', 'medium', 'medium'],
    ['gpt-5.1-codex-mini', 'high', 'high'],
    ['gpt-5.1-codex-mini', 'xhigh', 'high'],
    // Unknown / future families: pass through; let the API surface its error
    // as the signal a new rule belongs in clampCodexReasoning.
    ['gpt-6', 'minimal', 'minimal'],
  ];
  for (const [model, reasoning, expected] of cases) {
    const args = codex.buildArgs(
      '',
      [],
      [],
      { ...(model === undefined ? {} : { model }), reasoning },
      { cwd: '/tmp/od-project' },
    );
    assert.ok(
      args.includes(`model_reasoning_effort="${expected}"`),
      `(model=${model ?? '<none>'}, reasoning=${reasoning}) → expected ${expected}; args=${JSON.stringify(args)}`,
    );
  }
});

test('codex buildArgs omits model_reasoning_effort when reasoning is "default"', () => {
  const args = codex.buildArgs(
    '',
    [],
    [],
    { reasoning: 'default' },
    { cwd: '/tmp/od-project' },
  );

  assert.equal(
    args.some(
      (a) => typeof a === 'string' && a.startsWith('model_reasoning_effort='),
    ),
    false,
  );
});

test('claude flags promptViaStdin and never embeds the prompt in argv', () => {
  // Long composed prompts (system prompt + design system + skill body +
  // user message) routinely exceed Linux MAX_ARG_STRLEN (~128 KB) and the
  // Windows CreateProcess command-line cap (~32 KB direct, ~8 KB via .cmd
  // shim). The fix is to deliver the prompt on stdin instead of argv —
  // these assertions guard that contract.
  assert.equal(claude.promptViaStdin, true);

  const longPrompt = 'x'.repeat(200_000);
  const args = claude.buildArgs(
    longPrompt,
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.ok(Array.isArray(args), 'claude.buildArgs must return argv');
  assert.equal(
    args.includes(longPrompt),
    false,
    'prompt must not appear in argv',
  );
  for (const arg of args) {
    assert.ok(
      typeof arg === 'string' && arg.length < 1000,
      `no argv entry should carry the prompt body (saw length ${arg.length})`,
    );
  }
  // `-p` (print mode) must still be present; without it claude drops into
  // an interactive REPL that the daemon has no TTY for.
  assert.ok(args.includes('-p'), 'claude argv must include -p');
});

// ---- Claude Code --add-dir capability (issue #430) -------------------------
// Skill seeds (`skills/<id>/assets/template.html`) and design-system specs
// (`design-systems/<id>/DESIGN.md`) live outside the project cwd. Without
// `--add-dir`, Claude Code's directory access policy blocks reads on any
// path outside the working directory. Bug was that we probed global `claude
// --help` for `--add-dir` but that flag only appears in `claude -p --help`.

test('claude buildArgs passes --add-dir when dirs are supplied (issue #430, probing-failed baseline)', () => {
  // This is the default state before any capability probe runs: agentCapabilities
  // has no entry -> buildArgs gets `caps = {}` -> caps.addDir is undefined ->
  // undefined !== false -> true. This is also the "probing threw" case: timeout,
  // binary not found, non-zero exit code from --help. Dirs are always passed
  // unless capability probing explicitly detected --help and found no --add-dir.
  const args = claude.buildArgs(
    '',
    [],
    ['/repo/skills', '/repo/design-systems'],
    {},
  );

  const addDirIndex = args.indexOf('--add-dir');
  assert.ok(addDirIndex >= 0, '--add-dir must be present by default (safe baseline)');
  assert.equal(args[addDirIndex + 1], '/repo/skills');
  assert.equal(args[addDirIndex + 2], '/repo/design-systems');
  // Check flag ordering: --add-dir comes before --permission-mode
  const permModeIndex = args.indexOf('--permission-mode');
  assert.ok(
    addDirIndex < permModeIndex,
    `--add-dir (index ${addDirIndex}) should appear before --permission-mode (index ${permModeIndex})`,
  );
});

test('claude buildArgs drops empty / null dirs but keeps valid ones (issue #430 edge case)', () => {
  const args = claude.buildArgs('', [], ['', null, '/repo/skills', undefined] as unknown as string[], {});

  const addDirIndex = args.indexOf('--add-dir');
  assert.ok(addDirIndex >= 0, '--add-dir should survive filter');
  // Only the one valid path survives after --add-dir.
  assert.equal(args[addDirIndex + 1], '/repo/skills');
  // Should NOT have multiple --add-dir flags (one flag, N arguments).
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
  // Should NOT have null / undefined / '' sneaking into argv.
  assert.equal(args.includes(''), false);
  assert.equal(args.includes(null as unknown as string), false);
  assert.equal(args.includes(undefined as unknown as string), false);
});

test('claude helpArgs probes the -p subcommand where --add-dir lives (issue #430 root cause)', () => {
  assert.deepEqual(
    claude.helpArgs,
    ['-p', '--help'],
    `claude.helpArgs must be ['-p', '--help'], not just ['--help'], because --add-dir lives under the -p subcommand. Probing global help never finds it! Got: ${JSON.stringify(claude.helpArgs)}`,
  );
});

// server.ts:4615 branches on `def.promptInputFormat` to decide how to write
// the composed prompt to a stdin-fed child: 'stream-json' writes one JSONL
// `user` message and keeps stdin open, anything else writes the raw prompt
// and ends stdin. Because server.ts opens with `// @ts-nocheck`, a typo on
// that property (e.g. an undefined `runtimeAdapter.promptInputFormat()`)
// passes typecheck but throws `ReferenceError` at runtime for every chat
// run that goes through the stdin-write path — i.e. every agent below.
// Pin the field shape so a future regression of that contract fails here
// instead of in production.
test('promptInputFormat is a string property (or undefined) on every promptViaStdin agent', () => {
  const stdinAgents = [
    { name: 'claude', def: claude, expected: 'stream-json' },
    { name: 'codex', def: codex, expected: undefined },
    { name: 'antigravity', def: antigravity, expected: undefined },
    { name: 'opencode', def: opencode, expected: undefined },
    { name: 'pi', def: pi, expected: undefined },
  ];
  for (const { name, def, expected } of stdinAgents) {
    assert.equal(
      def.promptViaStdin,
      true,
      `${name} must keep promptViaStdin: true`,
    );
    assert.equal(
      typeof def.promptInputFormat,
      typeof expected,
      `${name}.promptInputFormat must be a ${typeof expected}, not a function — server.ts reads it as a property, not a method call`,
    );
    assert.equal(
      def.promptInputFormat,
      expected,
      `${name}.promptInputFormat must equal ${JSON.stringify(expected)}`,
    );
  }
});
