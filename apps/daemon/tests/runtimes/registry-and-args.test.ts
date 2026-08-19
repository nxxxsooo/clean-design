import { test } from 'vitest';
import {
  AGENT_DEFS, assert, chmodSync, claude, codex, detectAgents, join, mkdtempSync, opencode, pi, rmSync, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';
import {
  codexNeedsDangerFullAccessSandbox,
  parseCodexDebugModels,
} from '../../src/runtimes/defs/codex.js';
import {
  BUILT_IN_AGENT_DEFS,
  readLocalAgentProfileDefs,
} from '../../src/runtimes/registry.js';

test('built-in runtime registry contains only the supported local CLIs and internal BYOK adapter', () => {
  assert.deepEqual(
    BUILT_IN_AGENT_DEFS.map((agent) => agent.id),
    ['claude', 'codex', 'opencode', 'pi', 'antigravity', 'byok-opencode'],
  );
});

test('public runtime discovery excludes the internal BYOK adapter', async () => {
  const agents = await detectAgents();

  assert.deepEqual(
    agents.map((agent) => agent.id),
    ['claude', 'codex', 'opencode', 'pi', 'antigravity'],
  );
});

test('AGENT_DEFS ids are unique', () => {
  const ids = AGENT_DEFS.map((a) => a.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate agent ids: ${JSON.stringify(dupes)}`);
});

test('local agent profiles inherit a base adapter and can pin the default model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [
            {
              id: 'zcode',
              name: 'ZCode',
              baseAgent: 'claude',
              bin: 'zcode',
              args: ['run'],
              defaultModel: 'zyb-claude',
              models: [
                { id: 'zyb-claude', label: 'zyb-claude' },
                { id: 'zyb-gpt', label: 'zyb-gpt' },
              ],
              env: {
                ZCODE_ROUTE: 'design',
                RETRIES: 2,
                'BAD-NAME': 'ignored',
              },
            },
          ],
        }),
      );
      process.env.OD_AGENT_PROFILES_CONFIG = config;

      const profiles = readLocalAgentProfileDefs();
      assert.equal(profiles.length, 1);
      const [profile] = profiles;
      assert.ok(profile);
      assert.equal(profile.id, 'zcode');
      assert.equal(profile.name, 'ZCode');
      assert.equal(profile.source, 'local-profile');
      assert.equal(profile.baseAgentId, 'claude');
      assert.equal(profile.bin, 'zcode');
      assert.equal(profile.promptViaStdin, true);
      assert.equal(profile.streamFormat, 'claude-stream-json');
      assert.deepEqual(profile.fallbackModels.map((model) => model.id), [
        'default',
        'zyb-claude',
        'zyb-gpt',
      ]);
      assert.deepEqual(profile.env, {
        ZCODE_ROUTE: 'design',
        RETRIES: '2',
      });
      assert.equal(profile.authProbe, undefined);

      const defaultArgs = profile.buildArgs('', [], [], {});
      assert.deepEqual(defaultArgs.slice(0, 2), ['run', '-p']);
      assert.ok(defaultArgs.includes('--model'));
      assert.equal(defaultArgs[defaultArgs.indexOf('--model') + 1], 'zyb-claude');

      const explicitArgs = profile.buildArgs('', [], [], { model: 'zyb-gpt' });
      assert.equal(explicitArgs[explicitArgs.indexOf('--model') + 1], 'zyb-gpt');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('local agent profiles skip explicit unknown baseAgent without falling back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-invalid-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [
            { id: 'claude', bin: 'duplicate' },
            { id: 'bad id with spaces', bin: 'bad' },
            { id: 'unknown-base', baseAgent: 'does-not-exist', bin: 'bad' },
            { id: 'ok-wrapper', bin: 'ok-wrapper' },
          ],
        }),
      );
      process.env.OD_AGENT_PROFILES_CONFIG = config;

      const profiles = readLocalAgentProfileDefs();

      assert.deepEqual(profiles.map((profile) => profile.id), ['ok-wrapper']);
      assert.equal(profiles[0]?.bin, 'ok-wrapper');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('local agent profiles cannot reuse built-in ids', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-reserved-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [
            { id: 'byok-opencode', baseAgent: 'opencode', bin: 'internal-collision' },
            { id: 'claude', baseAgent: 'claude', bin: 'public-collision' },
            { id: 'local-claude', baseAgent: 'claude', bin: 'local-claude' },
          ],
        }),
      );
      process.env.OD_AGENT_PROFILES_CONFIG = config;

      const profiles = readLocalAgentProfileDefs();

      assert.deepEqual(profiles.map((profile) => profile.id), ['local-claude']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox mode ignores implicit and host explicit local agent profiles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-local-agent-profiles-sandbox-'));
  try {
    await withEnvSnapshot(['OD_AGENT_PROFILES_CONFIG', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], async () => {
      const config = join(dir, 'agents.local.json');
      writeFileSync(
        config,
        JSON.stringify({
          agents: [{ id: 'explicit-wrapper', bin: 'explicit-wrapper' }],
        }),
      );

      process.env.OD_SANDBOX_MODE = '1';
      delete process.env.OD_DATA_DIR;
      delete process.env.OD_AGENT_PROFILES_CONFIG;
      assert.deepEqual(readLocalAgentProfileDefs(), []);

      process.env.OD_AGENT_PROFILES_CONFIG = config;
      assert.deepEqual(readLocalAgentProfileDefs(), []);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    process.env.OD_CODEX_DISABLE_PLUGINS = '1';
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('darwin', () => {
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

      assert.deepEqual(args.slice(0, 9), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '-c',
        'sandbox_workspace_write.network_access=true',
        '--disable',
        'plugins',
      ]);
    });
  });
});

test('codex args use workspace-write sandbox on macOS and Linux', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

    for (const platform of ['darwin', 'linux'] as const) {
      withPlatform(platform, () => {
        delete process.env.WSL_DISTRO_NAME;
        const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
        assert.equal(args.includes('--full-auto'), false);
        assert.deepEqual(args.slice(0, 5), [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--sandbox',
          'workspace-write',
        ]);
        assert.equal(
          args.includes('-c'),
          true,
        );
        assert.equal(args.some((arg) => arg.includes('default_permissions')), false);
      });
    }
  });
});

test('codex args use danger-full-access sandbox on WSL because workspace-write stays read-only', () => {
  withPlatform('linux', () => {
    withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
      delete process.env.OD_CODEX_DISABLE_PLUGINS;
      delete process.env.OD_CODEX_SANDBOX;
      process.env.WSL_DISTRO_NAME = 'Ubuntu';
      assert.equal(codexNeedsDangerFullAccessSandbox('linux', process.env), true);
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'danger-full-access',
      ]);
      assert.equal(args.some((arg) => arg.includes('default_permissions')), false);
    });
  });
});

test('codex args allow OD_CODEX_SANDBOX danger-full-access override on Linux', () => {
  withPlatform('linux', () => {
    withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
      delete process.env.OD_CODEX_DISABLE_PLUGINS;
      process.env.OD_CODEX_SANDBOX = 'danger-full-access';
      delete process.env.WSL_DISTRO_NAME;

      assert.equal(codexNeedsDangerFullAccessSandbox('linux', process.env), true);
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'danger-full-access',
      ]);
      assert.equal(
        args.includes('sandbox_workspace_write.network_access=true'),
        false,
      );
    });
  });
});

test('codex args ignore unknown OD_CODEX_SANDBOX values', () => {
  withPlatform('linux', () => {
    withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX', 'WSL_DISTRO_NAME'], () => {
      delete process.env.OD_CODEX_DISABLE_PLUGINS;
      process.env.OD_CODEX_SANDBOX = 'workspace-write';
      delete process.env.WSL_DISTRO_NAME;

      assert.equal(codexNeedsDangerFullAccessSandbox('linux', process.env), false);
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
      ]);
    });
  });
});

test('codex args use danger-full-access sandbox on Windows because workspace-write blocks PowerShell', () => {
  // Codex CLI's workspace-write sandbox mode on Windows lacks a working
  // OS-level sandbox and falls back to a policy that rejects shell
  // invocations such as powershell.exe with "blocked by policy".
  // The agent cannot list files or run any shell-backed tool under that
  // policy. danger-full-access is Codex CLI's documented Windows-compatible
  // mode (issue #1721).
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('win32', () => {
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

      assert.deepEqual(args.slice(0, 5), [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'danger-full-access',
      ]);
      // The workspace-write-scoped network override is meaningless under
      // danger-full-access and must not appear on Windows.
      assert.equal(args.includes('workspace-write'), false);
      assert.equal(
        args.includes('sandbox_workspace_write.network_access=true'),
        false,
      );
      assert.equal(args.some((arg) => arg.includes('default_permissions')), false);
    });
  });
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('darwin', () => {
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

      assert.equal(args.includes('--disable'), false);
      assert.equal(args.includes('plugins'), false);
    });
  });
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  withEnvSnapshot(['OD_CODEX_DISABLE_PLUGINS', 'OD_CODEX_SANDBOX'], () => {
    process.env.OD_CODEX_DISABLE_PLUGINS = 'true';
    delete process.env.OD_CODEX_SANDBOX;

    withPlatform('darwin', () => {
      const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

      assert.equal(args.includes('--disable'), false);
      assert.equal(args.includes('plugins'), false);
    });
  });
});

test('codex model picker includes current OpenAI choices in priority order', async () => {
  const expectedModels = [
    'default',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.3-codex-spark',
  ];

  assert.deepEqual(codex.fallbackModels.map((m) => m.id), expectedModels);
  assert.ok(codex.reasoningOptions, 'codex must define reasoningOptions');
  assert.deepEqual(codex.reasoningOptions.map((o) => o.id), [
    'default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]);

  const args = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-5.6-sol', reasoning: 'xhigh' },
    { cwd: '/tmp/od-project' },
  );
  assert.ok(args.includes('--model'));
  assert.ok(args.includes('gpt-5.6-sol'));
  assert.ok(args.includes('model_reasoning_effort="xhigh"'));

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-models-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = join(dir, 'codex');
      writeFileSync(
        codexBin,
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex 1.0.0"; exit 0; fi\nexit 0\n',
      );
      chmodSync(codexBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      delete process.env.CODEX_BIN;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.version, 'codex 1.0.0');
      assert.deepEqual(detected.models.map((m: { id: string }) => m.id), expectedModels);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex live model discovery filters retired and unrelated model ids', () => {
  assert.deepEqual(
    parseCodexDebugModels(
      JSON.stringify({
        models: [
          { slug: 'gpt-5.5', display_name: 'GPT-5.5' },
          { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol' },
          { slug: 'gpt-5.4-mini', display_name: 'GPT-5.4 mini' },
          { slug: 'gpt-5.3-codex-spark', display_name: 'Codex Spark' },
          { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra' },
          { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6 Luna' },
        ],
      }),
    ),
    [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { id: 'gpt-5.3-codex-spark', label: 'Codex Spark' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    ],
  );
});

test('supported local runtimes keep only their approved fallback model choices', () => {
  assert.deepEqual(claude.fallbackModels.map((model) => model.id), [
    'default',
    'fable',
    'opus',
    'sonnet',
    'haiku',
  ]);
  assert.equal(claude.fetchModels, undefined);
  assert.deepEqual(opencode.fallbackModels.map((model) => model.id), ['default']);
  assert.deepEqual(pi.fallbackModels.map((model) => model.id), ['default']);
});

test('claude probes auth status so rescans reflect CLI auth changes', async () => {
  assert.deepEqual(claude.authProbe, {
    args: ['auth', 'status'],
    timeoutMs: 5000,
  });

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-claude-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CLAUDE_BIN'], async () => {
      const claudeBin = join(dir, 'claude');
      writeFileSync(
        claudeBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "2.1.168 (Claude Code)"; exit 0; fi
if [ "$1" = "-p" ] && [ "$2" = "--help" ]; then echo "--include-partial-messages --add-dir"; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo '{"authenticated":true,"source":"claude.ai"}'; exit 0; fi
exit 0
`,
      );
      chmodSync(claudeBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      delete process.env.CLAUDE_BIN;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'claude');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claude API key env satisfies auth probe without requiring local login', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-claude-api-key-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CLAUDE_BIN', 'ANTHROPIC_API_KEY'], async () => {
      const claudeBin = join(dir, 'claude');
      writeFileSync(
        claudeBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "2.1.168 (Claude Code)"; exit 0; fi
if [ "$1" = "-p" ] && [ "$2" = "--help" ]; then echo "--include-partial-messages --add-dir"; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo '{"authenticated":false}'; exit 1; fi
exit 0
`,
      );
      chmodSync(claudeBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.ANTHROPIC_API_KEY = 'sk-anthropic';
      delete process.env.CLAUDE_BIN;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'claude');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex probes login status so rescans reflect CLI auth changes', async () => {
  assert.deepEqual(codex.authProbe, {
    args: ['login', 'status'],
    timeoutMs: 5000,
  });

  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = join(dir, 'codex');
      writeFileSync(
        codexBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in using ChatGPT"; exit 0; fi
exit 0
`,
      );
      chmodSync(codexBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      delete process.env.CODEX_BIN;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex API key env satisfies auth probe without requiring local login', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-api-key-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN', 'CODEX_API_KEY'], async () => {
      const codexBin = join(dir, 'codex');
      writeFileSync(
        codexBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "debug" ] && [ "$2" = "models" ]; then echo '{"models":[]}'; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Not logged in"; exit 1; fi
exit 0
`,
      );
      chmodSync(codexBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      process.env.CODEX_API_KEY = 'sk-codex';
      delete process.env.CODEX_BIN;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.authStatus, 'ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex listModels parser ignores unapproved live model ids', () => {
  assert.ok(codex.listModels, 'codex must define live model discovery');
  const parsed = codex.listModels.parse(JSON.stringify({
    models: [
      {
        slug: 'gpt-5.6-sol',
        display_name: 'GPT-5.6 Sol',
        visibility: 'list',
      },
      {
        slug: 'gpt-5.5',
        display_name: 'GPT-5.5',
        visibility: 'list',
      },
      {
        slug: 'gpt-5.3-codex-spark',
        display_name: 'Codex Spark',
        visibility: 'list',
      },
    ],
  }));

  assert.deepEqual(parsed, [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'gpt-5.3-codex-spark', label: 'Codex Spark' },
  ]);
});

test('codex detection surfaces live debug models separately from fallback models', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-codex-live-models-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'CODEX_BIN'], async () => {
      const codexBin = join(dir, 'codex');
      writeFileSync(
        codexBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "debug" ] && [ "$2" = "models" ]; then
  printf '%s\\n' '{"models":[{"slug":"gpt-5.6-terra","display_name":"GPT-5.6 Terra","visibility":"list"},{"slug":"gpt-5.4-mini","display_name":"GPT-5.4 mini","visibility":"list"}]}'
  exit 0
fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in using ChatGPT"; exit 0; fi
exit 2
`,
      );
      chmodSync(codexBin, 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      delete process.env.CODEX_BIN;

      const agents = await detectAgents();
      const detected = agents.find((agent) => agent.id === 'codex');

      assert.ok(detected);
      assert.equal(detected.available, true);
      assert.equal(detected.modelsSource, 'live');
      assert.deepEqual(detected.models.map((m: { id: string }) => m.id), [
        'default',
        'gpt-5.6-terra',
      ]);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('codex picker excludes retired model families', () => {
  const pickerModels = new Set(codex.fallbackModels.map((model) => model.id));

  assert.equal(pickerModels.has('gpt-5.5'), false);
  assert.equal(pickerModels.has('gpt-5.4'), false);
  assert.equal(pickerModels.has('gpt-5.4-mini'), false);
});

// Recent Codex CLI versions reject a bare `-` argv sentinel; passing it
// alongside the stdin pipe causes `error: unexpected argument '-' found`
// and exit code 2 before any prompt is read. We deliver the prompt via
// stdin pipe alone (gated by `promptViaStdin: true`). Regression of #237.
test('codex args do not include the literal `-` stdin sentinel (regression of #237)', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const baseArgs = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
  assert.equal(baseArgs.includes('-'), false);

  const withModel = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-5-codex' },
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withModel.includes('-'), false);

  const withReasoning = codex.buildArgs(
    '',
    [],
    [],
    { reasoning: 'high' },
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withReasoning.includes('-'), false);

  process.env.OD_CODEX_DISABLE_PLUGINS = '1';
  const withDisablePlugins = codex.buildArgs(
    '',
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withDisablePlugins.includes('-'), false);
});

test('codex args pass valid extraAllowedDirs with repeatable --add-dir flags', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs(
    '',
    [],
    ['/repo/skills', '', null, '/tmp/codex/generated_images', undefined] as unknown as string[],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(
    args.filter((arg, index) => arg === '--add-dir' || args[index - 1] === '--add-dir'),
    ['--add-dir', '/repo/skills', '--add-dir', '/tmp/codex/generated_images'],
  );
});
