import { symlinkSync } from 'node:fs';
import { test, vi } from 'vitest';
import { homedir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as platform from '@open-design/platform';
import {
  assert, chmodSync, detectAgents, inspectAgentExecutableResolution, join, minimalAgentDef, mkdirSync, mkdtempSync, opencode, resolveAgentExecutable, rmSync, spawnEnvForAgent, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';
import { getRememberedLiveModels } from '../../src/runtimes/models.js';

const fsTest = process.platform === 'win32' ? test.skip : test;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Claude Code owns its own auth resolution. Preserve credentials from the
// inherited environment so users who run the local CLI with API-key auth get
// the same behavior through Clean Design.
test('spawnEnvForAgent preserves inherited Anthropic API credentials for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-leak');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-leak');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('spawnEnvForAgent applies configured Claude Code env without stripping inherited auth', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      ANTHROPIC_API_KEY: 'sk-leak',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
      PATH: '/usr/bin',
    },
    {
      CLAUDE_CONFIG_DIR: '/Users/test/.claude-2',
    },
  );

  assert.equal(env.CLAUDE_CONFIG_DIR, '/Users/test/.claude-2');
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-leak');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-leak');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent lets configured Claude Code API credentials override inherited auth', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      ANTHROPIC_API_KEY: 'sk-inherited-stale',
      ANTHROPIC_AUTH_TOKEN: 'sk-inherited-token',
      PATH: '/usr/bin',
    },
    {
      ANTHROPIC_API_KEY: 'sk-configured',
      ANTHROPIC_AUTH_TOKEN: 'sk-configured-token',
    },
  );

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-configured');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-configured-token');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent applies configured Codex env without mutating the base env', () => {
  const base = { PATH: '/usr/bin' };
  const env = spawnEnvForAgent('codex', base, {
    CODEX_HOME: '/Users/test/.codex-alt',
    CODEX_BIN: '/Users/test/bin/codex',
  });

  assert.equal(env.CODEX_HOME, '/Users/test/.codex-alt');
  assert.equal(env.CODEX_BIN, '/Users/test/bin/codex');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal('CODEX_HOME' in base, false);
  assert.equal('CODEX_BIN' in base, false);
});

test('spawnEnvForAgent backfills Windows cache directory env for Codex launches', () => {
  const env = withPlatform('win32', () =>
    spawnEnvForAgent(
      'codex',
      {
        Path: 'C:\\Windows\\System32',
        USERPROFILE: 'C:\\Users\\ai',
      },
      {},
      {},
    ),
  );

  assert.equal(env.USERPROFILE, 'C:\\Users\\ai');
  assert.equal(env.APPDATA, 'C:\\Users\\ai\\AppData\\Roaming');
  assert.equal(env.LOCALAPPDATA, 'C:\\Users\\ai\\AppData\\Local');
  assert.equal(env.TEMP, 'C:\\Users\\ai\\AppData\\Local\\Temp');
  assert.equal(env.TMP, 'C:\\Users\\ai\\AppData\\Local\\Temp');
});

test('spawnEnvForAgent keeps Windows cache directory env inside sandbox roots', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-win-cache-'));
  try {
    const env = withPlatform('win32', () =>
      spawnEnvForAgent(
        'codex',
        {
          OD_DATA_DIR: dataDir,
          OD_SANDBOX_MODE: '1',
          Path: 'C:\\Windows\\System32',
          USERPROFILE: 'C:\\Users\\ai',
        },
        {},
        {},
      ),
    );

    const agentHome = join(dataDir, 'sandbox', 'agent-home');
    const tempDir = join(dataDir, 'sandbox', 'tmp');
    const normalize = (value: string | undefined): string =>
      (value ?? '').replaceAll('\\', '/');

    assert.equal(env.USERPROFILE, agentHome);
    assert.ok(normalize(env.APPDATA).startsWith(`${normalize(agentHome)}/`));
    assert.ok(normalize(env.LOCALAPPDATA).startsWith(`${normalize(agentHome)}/`));
    assert.equal(env.TEMP, tempDir);
    assert.equal(env.TMP, tempDir);
    assert.ok(!normalize(env.APPDATA).includes('C:/Users/ai'));
    assert.ok(!normalize(env.LOCALAPPDATA).includes('C:/Users/ai'));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent reapplies sandbox state roots after configured env overrides', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-'));
  try {
    const codexEnv = spawnEnvForAgent(
      'codex',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CODEX_HOME: '/Users/test/.codex-host',
      },
    );
    assert.equal(
      codexEnv.CODEX_HOME,
      join(dataDir, 'sandbox', 'agent-home', '.codex'),
    );
    assert.equal(codexEnv.HOME, join(dataDir, 'sandbox', 'agent-home'));

    const claudeEnv = spawnEnvForAgent(
      'claude',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CLAUDE_CONFIG_DIR: '/Users/test/.claude-host',
      },
    );
    assert.equal(
      claudeEnv.CLAUDE_CONFIG_DIR,
      join(dataDir, 'sandbox', 'config', 'claude'),
    );

    const openCodeEnv = spawnEnvForAgent(
      'opencode',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        XDG_DATA_HOME: '/Users/test/.local/share-host',
      },
    );
    assert.equal(
      openCodeEnv.XDG_DATA_HOME,
      join(dataDir, 'sandbox', 'config', 'data'),
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent keeps sandbox roots pinned to the base OD_DATA_DIR', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-base-'));
  try {
    const env = spawnEnvForAgent(
      'codex',
      {
        OD_DATA_DIR: dataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CODEX_HOME: '/Users/test/.codex-host',
        OD_DATA_DIR: '/host/path/.od',
      },
    );

    assert.equal(env.OD_DATA_DIR, dataDir);
    assert.equal(env.CODEX_HOME, join(dataDir, 'sandbox', 'agent-home', '.codex'));
    assert.equal(env.HOME, join(dataDir, 'sandbox', 'agent-home'));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent resolves relative OD_DATA_DIR before applying sandbox roots', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'od-agent-env-sandbox-relative-'));
  try {
    const relativeDataDir = relative(repoRoot, dataDir);
    const env = spawnEnvForAgent(
      'codex',
      {
        OD_DATA_DIR: relativeDataDir,
        OD_SANDBOX_MODE: '1',
        PATH: '/usr/bin',
      },
      {
        CODEX_HOME: '/Users/test/.codex-host',
      },
    );

    assert.equal(
      env.CODEX_HOME,
      join(dataDir, 'sandbox', 'agent-home', '.codex'),
    );
    assert.equal(env.CLAUDE_CONFIG_DIR, join(dataDir, 'sandbox', 'config', 'claude'));
    assert.equal(env.HOME, join(dataDir, 'sandbox', 'agent-home'));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('spawnEnvForAgent applies system proxy env to all agent runtimes before base env overrides', () => {
  const env = spawnEnvForAgent(
    'opencode',
    {
      HTTPS_PROXY: 'http://user-env:9000',
      PATH: '/usr/bin',
    },
    {},
    {
      HTTP_PROXY: 'http://system-http:7890',
      HTTPS_PROXY: 'http://system-https:7891',
      ALL_PROXY: 'socks5://system-socks:1080',
      NO_PROXY: '.local,localhost',
      NODE_USE_ENV_PROXY: '1',
    },
  );

  assert.equal(env.HTTP_PROXY, 'http://system-http:7890');
  assert.equal(env.HTTPS_PROXY, 'http://user-env:9000');
  assert.equal(env.ALL_PROXY, 'socks5://system-socks:1080');
  assert.equal(env.NO_PROXY, '.local,localhost');
  assert.equal(env.NODE_USE_ENV_PROXY, '1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent resolves system proxy env for each default agent launch', () => {
  const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({
    HTTPS_PROXY: 'http://system-https:7891',
    NODE_USE_ENV_PROXY: '1',
  });

  try {
    const env = spawnEnvForAgent('opencode', { PATH: '/usr/bin' });

    assert.deepEqual(proxySpy.mock.calls, [[]]);
    assert.equal(env.HTTPS_PROXY, 'http://system-https:7891');
    assert.equal(env.PATH, '/usr/bin');
  } finally {
    proxySpy.mockRestore();
  }
});

test('spawnEnvForAgent lets explicit lowercase proxy env override system uppercase proxy env', () => {
  const env = spawnEnvForAgent(
    'opencode',
    {
      https_proxy: 'http://user-lowercase:9000',
      PATH: '/usr/bin',
    },
    {},
    {
      HTTPS_PROXY: 'http://system-uppercase:7891',
      NODE_USE_ENV_PROXY: '1',
    },
  );

  assert.equal(env.HTTPS_PROXY, 'http://user-lowercase:9000');
  if (process.platform !== 'win32') {
    assert.equal(env.https_proxy, 'http://user-lowercase:9000');
  }
});

test('spawnEnvForAgent enables Node env proxy support for inherited lowercase proxy env', () => {
  const env = spawnEnvForAgent(
    'opencode',
    {
      http_proxy: 'http://user-lowercase:9000',
      PATH: '/usr/bin',
    },
    {},
    {},
  );

  assert.equal(env.HTTP_PROXY, 'http://user-lowercase:9000');
  assert.equal(env.NODE_USE_ENV_PROXY, '1');
  if (process.platform !== 'win32') {
    assert.equal(env.http_proxy, 'http://user-lowercase:9000');
  }
});

test('spawnEnvForAgent expands configured env home paths', () => {
  const env = spawnEnvForAgent('codex', { PATH: '/usr/bin' }, {
    CODEX_HOME: '~/.codex-alt',
    CODEX_CACHE: '~',
  });

  assert.equal(env.CODEX_HOME, join(homedir(), '.codex-alt'));
  assert.equal(env.CODEX_CACHE, homedir());
  assert.equal(env.PATH, '/usr/bin');
});

test('resolveAgentExecutable prefers a configured CODEX_BIN override over PATH resolution', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'codex-custom');
      writeFileSync(configured, '#!/bin/sh\nexit 0\n');
      chmodSync(configured, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      const resolved = resolveAgentExecutable(
        minimalAgentDef({ id: 'codex', bin: 'codex' }),
        { CODEX_BIN: configured },
      );

      assert.equal(resolved, configured);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectAgentExecutableResolution reports configured and PATH Codex binaries separately', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-inspect-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'codex-custom');
      const fallback = join(dir, 'codex');
      writeFileSync(configured, '#!/bin/sh\nexit 0\n');
      writeFileSync(fallback, '#!/bin/sh\nexit 0\n');
      chmodSync(configured, 0o755);
      chmodSync(fallback, 0o755);
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const resolution = inspectAgentExecutableResolution(
        minimalAgentDef({ id: 'codex', bin: 'codex' }),
        { CODEX_BIN: configured },
      );

      assert.deepEqual(resolution, {
        configuredOverridePath: configured,
        pathResolvedPath: fallback,
        selectedPath: configured,
      });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable supports configured binary overrides for public non-Codex adapters', () => {
  const cases: Array<[string, string, string]> = [
    ['claude', 'claude', 'CLAUDE_BIN'],
    ['opencode', 'opencode', 'OPENCODE_BIN'],
    ['pi', 'pi', 'PI_BIN'],
    ['antigravity', 'agy', 'ANTIGRAVITY_BIN'],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-overrides-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      for (const [id, binName, envKey] of cases) {
        const configured = join(dir, `${binName}-custom`);
        writeFileSync(configured, '#!/bin/sh\nexit 0\n');
        chmodSync(configured, 0o755);

        const resolved = resolveAgentExecutable(
          minimalAgentDef({ id, bin: binName }),
          { [envKey]: configured },
        );

        assert.equal(resolved, configured, `expected ${id} to use ${envKey}`);
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable prefers opencode-cli before desktop opencode fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-opencode-cli-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const cli = join(dir, 'opencode-cli');
      const desktop = join(dir, 'opencode');
      writeFileSync(cli, '#!/bin/sh\nexit 0\n');
      writeFileSync(desktop, '#!/bin/sh\nexit 0\n');
      chmodSync(cli, 0o755);
      chmodSync(desktop, 0o755);
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      assert.equal(resolveAgentExecutable(opencode), cli);

      rmSync(cli, { force: true });
      assert.equal(resolveAgentExecutable(opencode), desktop);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents exposes only the five public CLI runtimes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-install-meta-'));
  try {
    return await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      assert.deepEqual(
        agents.map((agent) => agent.id).sort(),
        ['antigravity', 'claude', 'codex', 'opencode', 'pi'],
      );
      for (const agent of agents) {
        assert.equal(agent.installUrl, undefined);
        assert.equal(agent.docsUrl, undefined);
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

fsTest('detectAgents marks Codex available when nvm exposes a node shim but launch resolution upgrades it to the native binary', async () => {
  const home = mkdtempSync(join(tmpdir(), 'od-detect-codex-nvm-native-'));
  try {
    return await withEnvSnapshot(['HOME', 'PATH', 'OD_AGENT_HOME'], async () => {
      const wrapperBinDir = join(home, '.nvm', 'versions', 'node', '24.14.1', 'bin');
      const wrapperPkgDir = join(home, '.nvm', 'versions', 'node', '24.14.1', 'lib', 'node_modules', '@openai', 'codex');
      const wrapperRealPath = join(wrapperPkgDir, 'bin', 'codex.js');
      const wrapperLinkPath = join(wrapperBinDir, 'codex');
      const pathBin = join(home, 'path-bin');
      const nativePkgDir = join(
        wrapperPkgDir,
        'node_modules',
        '@openai',
        `codex-${process.platform}-${process.arch}`,
      );
      const nativeTargetTriple = codexNativeTargetTriple();
      const nativePathDir = join(nativePkgDir, 'vendor', nativeTargetTriple, 'path');
      const nativeBin = join(nativePkgDir, 'vendor', nativeTargetTriple, 'codex', 'codex');

      mkdirSync(join(wrapperPkgDir, 'bin'), { recursive: true });
      mkdirSync(wrapperBinDir, { recursive: true });
      mkdirSync(pathBin, { recursive: true });
      mkdirSync(join(nativePkgDir, 'vendor', nativeTargetTriple, 'codex'), { recursive: true });
      mkdirSync(nativePathDir, { recursive: true });
      writeFileSync(
        wrapperRealPath,
        '#!/usr/bin/env node\nconsole.log("wrapper should not be probed");\n',
      );
      writeFileSync(nativeBin, '#!/bin/sh\necho "codex 9.9.9"\n');
      chmodSync(wrapperRealPath, 0o755);
      chmodSync(nativeBin, 0o755);
      symlinkSync(wrapperRealPath, wrapperLinkPath);

      process.env.HOME = home;
      process.env.PATH = pathBin;
      process.env.OD_AGENT_HOME = home;

      const agents = await detectAgents();
      const codexAgent = agents.find((agent) => agent.id === 'codex');

      assert.ok(codexAgent);
      assert.equal(codexAgent.available, true);
      assert.equal(codexAgent.path, wrapperLinkPath);
      assert.equal(codexAgent.version, 'codex 9.9.9');
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function codexNativeTargetTriple(): string {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'aarch64-unknown-linux-musl';
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-musl';
  if (process.platform === 'win32' && process.arch === 'arm64') return 'aarch64-pc-windows-msvc';
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  return `${process.platform}-${process.arch}`;
}

test('resolveAgentExecutable ignores relative CODEX_BIN overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-codex-bin-rel-'));
  const oldCwd = process.cwd();
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = 'codex-custom';
      writeFileSync(join(dir, configured), '#!/bin/sh\nexit 0\n');
      chmodSync(join(dir, configured), 0o755);
      process.chdir(dir);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      const resolved = resolveAgentExecutable(
        minimalAgentDef({ id: 'codex', bin: 'codex' }),
        { CODEX_BIN: configured },
      );

      assert.equal(resolved, null);
    });
  } finally {
    process.chdir(oldCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable ignores configured binary overrides that are not executable files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-invalid-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const directoryOverride = join(dir, 'as-directory');
      mkdirSync(directoryOverride);
      const fileOverride = join(dir, 'not-executable');
      writeFileSync(fileOverride, '#!/bin/sh\nexit 0\n');
      if (process.platform !== 'win32') chmodSync(fileOverride, 0o644);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      assert.equal(
        resolveAgentExecutable(minimalAgentDef({ id: 'codex', bin: 'codex' }), { CODEX_BIN: directoryOverride }),
        null,
      );
      if (process.platform !== 'win32') {
        assert.equal(
          resolveAgentExecutable(minimalAgentDef({ id: 'codex', bin: 'codex' }), { CODEX_BIN: fileOverride }),
          null,
        );
      }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable ignores Windows CODEX_BIN overrides without executable PATHEXT extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-win-invalid-'));
  try {
    return withEnvSnapshot(['PATH', 'PATHEXT', 'OD_AGENT_HOME'], () => {
      const invalidOverride = join(dir, 'codex-custom.txt');
      const fallback = join(dir, 'codex.CMD');
      writeFileSync(invalidOverride, '@echo off\r\nexit /b 0\r\n');
      writeFileSync(fallback, '@echo off\r\nexit /b 0\r\n');
      process.env.PATH = dir;
      process.env.PATHEXT = '.EXE;.CMD;.BAT';
      process.env.OD_AGENT_HOME = dir;

      const resolved = withPlatform('win32', () =>
        resolveAgentExecutable(
          minimalAgentDef({ id: 'codex', bin: 'codex' }),
          { CODEX_BIN: invalidOverride },
        ),
      );

      assert.equal(resolved, fallback);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAgentExecutable accepts Windows CODEX_BIN overrides with executable PATHEXT extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-bin-win-valid-'));
  try {
    return withEnvSnapshot(['PATH', 'PATHEXT', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'codex-custom.CMD');
      writeFileSync(configured, '@echo off\r\nexit /b 0\r\n');
      process.env.PATH = '';
      process.env.PATHEXT = '.EXE;.CMD;.BAT';
      process.env.OD_AGENT_HOME = dir;

      const resolved = withPlatform('win32', () =>
        resolveAgentExecutable(
          minimalAgentDef({ id: 'codex', bin: 'codex' }),
          { CODEX_BIN: configured },
        ),
      );

      assert.equal(resolved, configured);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAgents applies configured env while probing the CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agent-env-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = join(dir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
      if (process.platform === 'win32') {
        writeFileSync(
          bin,
          '@echo off\r\nif "%~1"=="--version" (\r\n  echo %CLAUDE_CONFIG_DIR%\r\n  exit /b 0\r\n)\r\nif "%~1"=="-p" (\r\n  echo --add-dir --include-partial-messages\r\n  exit /b 0\r\n)\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bin,
          '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "$CLAUDE_CONFIG_DIR"; exit 0; fi\nif [ "$1" = "-p" ]; then echo "--add-dir --include-partial-messages"; exit 0; fi\nexit 0\n',
        );
        chmodSync(bin, 0o755);
      }
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents({
        claude: { CLAUDE_CONFIG_DIR: '/tmp/claude-config-probe' },
      });

      const detected = agents.find((agent) => agent.id === 'claude');
      assert.equal(detected?.available, true);
      assert.equal(detected?.version, '/tmp/claude-config-probe');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


// agy's print mode (`-p -`) exits with code 0 but emits one of these
// shapes when the keyring entry is missing or expired. Without the
// matcher, the daemon treats this as a successful turn and shows the
// raw OAuth URL as the agent's "reply" — but the user has no way to
// complete OAuth from inside chat (agy `-p` has no input field to
// paste the auth code into). The matcher converts each shape into
// AGENT_AUTH_REQUIRED with actionable guidance.
test('antigravity auth matcher covers agy print-mode + log-file auth signals', async () => {
  const { isAntigravityAuthFailureText, antigravityAuthGuidance, classifyAgentAuthFailure } =
    await import('../../src/runtimes/auth.js');

  // print-mode stdout shape — user-visible
  assert.equal(
    isAntigravityAuthFailureText(
      'Authentication required. Please visit the URL to log in: https://accounts.google.com/o/oauth2/auth?…',
    ),
    true,
  );
  assert.equal(
    isAntigravityAuthFailureText('Waiting for authentication (timeout 30s)...\nError: authentication timed out.'),
    true,
  );

  // `agy --log-file` shape — surfaces in stderr / log-file probes
  assert.equal(
    isAntigravityAuthFailureText(
      'E log.go:398] Failed to poll ListExperiments: error getting token source: You are not logged into Antigravity.',
    ),
    true,
  );

  // Negative: prose mentioning "authentication" must not false-fire
  assert.equal(
    isAntigravityAuthFailureText('I added two-factor authentication to the login flow.'),
    false,
  );
  assert.equal(isAntigravityAuthFailureText(''), false);

  // Classifier wires the agy detector to the user-actionable guidance
  // text so the chat surfaces a re-auth message rather than the raw
  // OAuth URL the user can't act on from inside OD.
  const cls = classifyAgentAuthFailure(
    'antigravity',
    'Authentication required. Please visit the URL to log in: https://example',
  );
  assert.ok(cls);
  assert.equal(cls.status, 'missing');
  assert.equal(cls.message, antigravityAuthGuidance());
  assert.ok(
    antigravityAuthGuidance().includes('open a terminal and run `agy` once'),
    'guidance must tell the user exactly what one-time command to run',
  );
  assert.ok(
    antigravityAuthGuidance().includes('keyring'),
    'guidance must mention the keyring so users understand it persists',
  );

  // Non-matching text → null (don't claim auth failure on unrelated errors)
  assert.equal(
    classifyAgentAuthFailure('antigravity', 'rate limit exceeded'),
    null,
  );
});

test('spawnEnvForAgent preserves configured Anthropic credentials for the claude adapter', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      PATH: '/usr/bin',
    },
    {
      ANTHROPIC_API_KEY: 'sk-configured',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-configured',
    },
  );

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-configured');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-configured');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Anthropic credentials when claude resolves to OpenClaude fallback', () => {
  const env = spawnEnvForAgent(
    'claude',
    {
      ANTHROPIC_API_KEY: 'sk-openclaude',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-openclaude',
      PATH: '/usr/bin',
    },
    {},
    {},
    { resolvedBin: '/tools/openclaude' },
  );

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-openclaude');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-openclaude');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Anthropic credentials for public non-Claude adapters', () => {
  for (const agentId of ['codex', 'opencode', 'pi', 'antigravity']) {
    const env = spawnEnvForAgent(agentId, {
      ANTHROPIC_API_KEY: 'sk-keep',
      ANTHROPIC_AUTH_TOKEN: 'sk-token-keep',
      PATH: '/usr/bin',
    });
    assert.equal(
      env.ANTHROPIC_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve ANTHROPIC_API_KEY`,
    );
    assert.equal(
      env.ANTHROPIC_AUTH_TOKEN,
      'sk-token-keep',
      `expected ${agentId} to preserve ANTHROPIC_AUTH_TOKEN`,
    );
  }
});

// Codex CLI owns its own auth resolution. Preserve credentials from the
// inherited environment so users who run the local CLI with API-key auth get
// the same behavior through Clean Design.
test('spawnEnvForAgent preserves inherited OPENAI_API_KEY for the codex adapter', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-stale-byok',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal(env.OPENAI_API_KEY, 'sk-stale-byok');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('spawnEnvForAgent preserves inherited CODEX_API_KEY for the codex adapter', () => {
  const env = spawnEnvForAgent('codex', {
    CODEX_API_KEY: 'sk-stale-byok',
    PATH: '/usr/bin',
  });

  assert.equal(env.CODEX_API_KEY, 'sk-stale-byok');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves inherited Codex API keys when OPENAI_BASE_URL is empty', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-stale-byok',
    CODEX_API_KEY: 'sk-stale-byok',
    OPENAI_BASE_URL: '',
    PATH: '/usr/bin',
  });

  assert.equal(env.OPENAI_API_KEY, 'sk-stale-byok');
  assert.equal(env.CODEX_API_KEY, 'sk-stale-byok');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves inherited Codex API keys when OPENAI_BASE_URL is whitespace', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-stale-byok',
    OPENAI_BASE_URL: '   ',
    PATH: '/usr/bin',
  });

  assert.equal(env.OPENAI_API_KEY, 'sk-stale-byok');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Codex API keys when OPENAI_BASE_URL is set to a custom proxy', () => {
  const env = spawnEnvForAgent('codex', {
    OPENAI_API_KEY: 'sk-proxy',
    OPENAI_BASE_URL: 'https://proxy.example.com/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.OPENAI_API_KEY, 'sk-proxy');
  assert.equal(env.OPENAI_BASE_URL, 'https://proxy.example.com/v1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves CODEX_API_KEY when OPENAI_BASE_URL is set to a custom proxy', () => {
  const env = spawnEnvForAgent('codex', {
    CODEX_API_KEY: 'sk-proxy',
    OPENAI_BASE_URL: 'https://proxy.example.com/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.CODEX_API_KEY, 'sk-proxy');
  assert.equal(env.OPENAI_BASE_URL, 'https://proxy.example.com/v1');
});

test('spawnEnvForAgent preserves configured Codex API keys', () => {
  const env = spawnEnvForAgent(
    'codex',
    {
      PATH: '/usr/bin',
    },
    {
      OPENAI_API_KEY: 'sk-configured-openai',
      CODEX_API_KEY: 'sk-configured-codex',
    },
  );

  assert.equal(env.OPENAI_API_KEY, 'sk-configured-openai');
  assert.equal(env.CODEX_API_KEY, 'sk-configured-codex');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves Codex API keys for public non-Codex adapters', () => {
  for (const agentId of ['claude', 'opencode', 'pi', 'antigravity']) {
    const env = spawnEnvForAgent(agentId, {
      OPENAI_API_KEY: 'sk-keep',
      CODEX_API_KEY: 'sk-keep',
      PATH: '/usr/bin',
    });
    assert.equal(
      env.OPENAI_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve OPENAI_API_KEY`,
    );
    assert.equal(
      env.CODEX_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve CODEX_API_KEY`,
    );
  }
});

test('spawnEnvForAgent applies configured codex base URL and API key', () => {
  const env = spawnEnvForAgent(
    'codex',
    { PATH: '/usr/bin' },
    {
      OPENAI_BASE_URL: 'https://proxy.example.com/v1',
      OPENAI_API_KEY: 'sk-configured',
    },
  );

  assert.equal(env.OPENAI_BASE_URL, 'https://proxy.example.com/v1');
  assert.equal(env.OPENAI_API_KEY, 'sk-configured');
});

test('spawnEnvForAgent lets configured Codex API credentials override inherited auth', () => {
  const env = spawnEnvForAgent(
    'codex',
    {
      OPENAI_API_KEY: 'sk-inherited-stale',
      CODEX_API_KEY: 'sk-inherited-codex',
      PATH: '/usr/bin',
    },
    {
      OPENAI_API_KEY: 'sk-configured-openai',
      CODEX_API_KEY: 'sk-configured-codex',
    },
  );

  assert.equal(env.OPENAI_API_KEY, 'sk-configured-openai');
  assert.equal(env.CODEX_API_KEY, 'sk-configured-codex');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves inherited Anthropic API credentials when ANTHROPIC_BASE_URL is set', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-proxy',
    ANTHROPIC_AUTH_TOKEN: 'sk-token',
    ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/v1',
    PATH: '/usr/bin',
  });

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-proxy');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token');
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.moonshot.cn/v1');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves inherited Anthropic API credentials when ANTHROPIC_BASE_URL is empty', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
    ANTHROPIC_BASE_URL: '',
    PATH: '/usr/bin',
  });

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-leak');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-leak');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves inherited Anthropic API credentials when ANTHROPIC_BASE_URL is whitespace', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    ANTHROPIC_AUTH_TOKEN: 'sk-token-leak',
    ANTHROPIC_BASE_URL: '   ',
    PATH: '/usr/bin',
  });

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-leak');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-token-leak');
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent does not mutate the input env', () => {
  const original = { ANTHROPIC_API_KEY: 'sk-leak', PATH: '/usr/bin' };
  const env = spawnEnvForAgent('claude', original);

  assert.equal(original.ANTHROPIC_API_KEY, 'sk-leak');
  assert.notEqual(env, original);
});
