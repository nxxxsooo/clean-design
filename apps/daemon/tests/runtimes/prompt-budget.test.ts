import { test } from 'vitest';
import {
  assert,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  claude,
  minimalAgentDef,
} from './helpers/test-helpers.js';

const maxPromptArgBytes = 30_000;
const argvAgent = minimalAgentDef({
  id: 'argv-agent',
  name: 'Argv Agent',
  bin: 'argv-agent',
  maxPromptArgBytes,
  buildArgs: (prompt) => ['run', prompt],
});

test('checkPromptArgvBudget enforces the declared Windows byte limit', () => {
  const oversized = 'x'.repeat(maxPromptArgBytes + 1);
  const flagged = checkPromptArgvBudget(argvAgent, oversized, 'win32');

  assert.ok(flagged);
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.equal(flagged.limit, maxPromptArgBytes);
  assert.equal(flagged.bytes, maxPromptArgBytes + 1);
  assert.match(flagged.message, /Argv Agent/);
  assert.match(flagged.message, /command-line argument/);
  assert.match(flagged.message, /stdin support/);

  assert.equal(
    checkPromptArgvBudget(argvAgent, 'x'.repeat(maxPromptArgBytes), 'win32'),
    null,
  );
  assert.equal(checkPromptArgvBudget(argvAgent, 'hello', 'win32'), null);
});

test('checkPromptArgvBudget measures UTF-8 bytes rather than code points', () => {
  const oversized = '汉'.repeat(Math.ceil(maxPromptArgBytes / 3) + 1);
  const flagged = checkPromptArgvBudget(argvAgent, oversized, 'win32');

  assert.ok(flagged);
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok((flagged.bytes ?? 0) > maxPromptArgBytes);
});

test('checkPromptArgvBudget uses the larger POSIX per-argument allowance', () => {
  const ordinaryLargePrompt = 'x'.repeat(50_000);
  assert.equal(
    checkPromptArgvBudget(argvAgent, ordinaryLargePrompt, 'linux'),
    null,
  );
  assert.equal(
    checkPromptArgvBudget(argvAgent, ordinaryLargePrompt, 'darwin'),
    null,
  );
  assert.ok(
    checkPromptArgvBudget(argvAgent, ordinaryLargePrompt, 'win32'),
  );

  const runawayPrompt = 'x'.repeat(200_000);
  assert.ok(checkPromptArgvBudget(argvAgent, runawayPrompt, 'linux'));
  assert.ok(checkPromptArgvBudget(argvAgent, runawayPrompt, 'darwin'));
});

test('checkPromptArgvBudget is a no-op without a declared argv budget', () => {
  assert.equal(claude.maxPromptArgBytes, undefined);
  assert.equal(checkPromptArgvBudget(claude, 'x'.repeat(200_000)), null);
  assert.equal(checkPromptArgvBudget(null, 'x'.repeat(200_000)), null);
});

test('cmd-shim budget flags quote-heavy argv expansion', () => {
  const prompt = '"'.repeat(maxPromptArgBytes - 100);
  assert.equal(checkPromptArgvBudget(argvAgent, prompt, 'win32'), null);

  const args = argvAgent.buildArgs(prompt, [], [], {});
  const flagged = checkWindowsCmdShimCommandLineBudget(
    argvAgent,
    'C:\\Tools\\Argv Agent\\argv-agent.cmd',
    args,
  );

  assert.ok(flagged);
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok((flagged.commandLineLength ?? 0) > flagged.limit);
  assert.ok(flagged.limit < 32_768);
  assert.match(flagged.message, /Argv Agent/);
  assert.match(flagged.message, /cmd\.exe quote-doubling/);
  assert.match(flagged.message, /stdin support/);
});

test('cmd-shim budget allows ordinary argv and skips non-shim paths', () => {
  const args = argvAgent.buildArgs('write hello world', [], [], {});

  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      argvAgent,
      'C:\\Tools\\Argv Agent\\argv-agent.cmd',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      argvAgent,
      'C:\\Tools\\Argv Agent\\argv-agent.exe',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      argvAgent,
      '/usr/local/bin/argv-agent',
      args,
    ),
    null,
  );
});

test('cmd-shim budget accounts for percent escaping without changing the argv value', () => {
  const prompt = '%LOCAL_TOKEN%'.repeat(200);
  const args = argvAgent.buildArgs(prompt, [], [], {});

  assert.equal(checkPromptArgvBudget(argvAgent, prompt, 'win32'), null);
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      argvAgent,
      'C:\\Tools\\Argv Agent\\argv-agent.cmd',
      args,
    ),
    null,
  );
});

test('cmd-shim budget skips missing paths and stdin adapters', () => {
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(argvAgent, null, []),
    null,
  );
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      claude,
      'C:\\Tools\\claude.cmd',
      [],
    ),
    null,
  );
});

test('direct-executable budget flags quote-heavy argv expansion', () => {
  const prompt = '"'.repeat(maxPromptArgBytes - 100);
  assert.equal(checkPromptArgvBudget(argvAgent, prompt, 'win32'), null);

  const args = argvAgent.buildArgs(prompt, [], [], {});
  const flagged = checkWindowsDirectExeCommandLineBudget(
    argvAgent,
    'C:\\Program Files\\Argv Agent\\argv-agent.exe',
    args,
  );

  assert.ok(flagged);
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok((flagged.commandLineLength ?? 0) > flagged.limit);
  assert.ok(flagged.limit < 32_768);
  assert.match(flagged.message, /Argv Agent/);
  assert.match(flagged.message, /libuv quote-escaping/);
  assert.match(flagged.message, /stdin support/);
});

test('direct-executable budget allows ordinary argv', () => {
  const args = argvAgent.buildArgs('write hello world', [], [], {});

  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      argvAgent,
      'C:\\Program Files\\Argv Agent\\argv-agent.exe',
      args,
    ),
    null,
  );
});

test('direct-executable budget skips shims, POSIX paths, missing paths, and stdin adapters', () => {
  const args = argvAgent.buildArgs(
    '"'.repeat(maxPromptArgBytes - 100),
    [],
    [],
    {},
  );

  for (const path of [
    'C:\\Tools\\argv-agent.cmd',
    'C:\\Tools\\argv-agent.bat',
    '/usr/local/bin/argv-agent',
    '/home/dev/bin/argv-agent',
  ]) {
    assert.equal(
      checkWindowsDirectExeCommandLineBudget(argvAgent, path, args),
      null,
    );
  }
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(argvAgent, null, args),
    null,
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(argvAgent, '', args),
    null,
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      claude,
      'C:\\Tools\\claude.exe',
      [],
    ),
    null,
  );
});

test('cmd-shim and direct-executable guards are mutually exclusive', () => {
  const prompt = '"'.repeat(maxPromptArgBytes - 100);
  const args = argvAgent.buildArgs(prompt, [], [], {});
  const cmdPath = 'C:\\Tools\\argv-agent.cmd';
  const exePath = 'C:\\Program Files\\Argv Agent\\argv-agent.exe';

  assert.ok(checkWindowsCmdShimCommandLineBudget(argvAgent, cmdPath, args));
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(argvAgent, cmdPath, args),
    null,
  );
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(argvAgent, exePath, args),
    null,
  );
  assert.ok(
    checkWindowsDirectExeCommandLineBudget(argvAgent, exePath, args),
  );
});
