import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../../src/run-failure-classification.js';
import { deriveRunErrorCode, runResultFromStatus } from '../../src/run-result.js';
import { startServer } from '../../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  agentId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
};

type RunEvent = {
  event: string;
  data: unknown;
};

describe('run failure smoke', () => {
  const originalInactivityTimeout = process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    if (originalInactivityTimeout === undefined) {
      delete process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
    } else {
      process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = originalInactivityTimeout;
    }
  });

  it('classifies representative failed local runs through the daemon API', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'clean-design-run-failure-bin-'));
    await writeFakeClaude(binDir, 'claude-auth', [
      'HTTP 401 Unauthorized: invalid API key.',
      'Please run /login.',
    ].join(' '));
    await writeFakeClaude(binDir, 'claude-rate-limit', [
      'HTTP 429 Too Many Requests: rate limit exceeded by upstream provider.',
      'Retry after 30 seconds.',
    ].join(' '));
    await writeFakeClaude(binDir, 'claude-upstream', [
      'HTTP 503 Service Unavailable: upstream provider unavailable.',
      'Gateway timeout while waiting for first token.',
    ].join(' '));
    await writeFakeClaude(binDir, 'claude-hang', null);

    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '400';
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;

    const cases = [
      {
        id: 'auth_401',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-auth') } } },
        expectedCode: 'AGENT_AUTH_REQUIRED',
        expectedCodes: ['AGENT_AUTH_REQUIRED', 'AGENT_EXECUTION_FAILED'],
        expectedCategory: 'auth',
        expectedDetail: 'invalid_api_key',
      },
      {
        id: 'rate_limit_429',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-rate-limit') } } },
        expectedCode: 'RATE_LIMITED',
        expectedCategory: 'rate_limit',
        expectedDetail: 'rate_limit_429',
      },
      {
        id: 'upstream_503',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-upstream') } } },
        expectedCode: 'UPSTREAM_UNAVAILABLE',
        expectedCategory: 'upstream_unavailable',
        expectedDetail: 'upstream_5xx',
      },
      {
        id: 'model_context_budget',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-auth') } } },
        model: 'claude-sonnet-4-5',
        expectedCode: 'AGENT_PROMPT_TOO_LARGE',
        expectedCategory: 'prompt_too_large',
        expectedDetail: 'prompt_too_large',
        expectedContextBudgetAction: 'blocked',
        message: `clean-design-failure-model-context ${'x'.repeat(650_000)}`,
      },
      {
        id: 'hang_timeout',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-hang') } } },
        expectedCode: 'AGENT_EXECUTION_FAILED',
        expectedCategory: 'timeout',
        expectedDetail: 'inactivity_timeout',
      },
    ] as const;

    for (const item of cases) {
      await putConfig(started.url, { agentId: item.agentId, ...item.config });
      const run = await createAndWaitForRun(started.url, {
        caseId: item.id,
        agentId: item.agentId,
        message: 'message' in item ? item.message : `clean-design-failure-${item.id}`,
        ...('model' in item ? { model: item.model } : {}),
      });
      const events = await readRunEvents(run.eventsLogPath);
      const errorCode = deriveRunErrorCode(run);
      const failure = classifyRunFailure({
        result: runResultFromStatus(run.status),
        status: run,
        ...(errorCode ? { errorCode } : {}),
        agentId: run.agentId,
        events,
      });

      expect(run.status, item.id).toBe('failed');
      expect('expectedCodes' in item ? item.expectedCodes : [item.expectedCode])
        .toContain(errorCode);
      expect(failure?.failure_category).toBe(item.expectedCategory);
      expect(failure?.failure_detail).toBe(item.expectedDetail);
      if ('expectedContextBudgetAction' in item) {
        expect(events).toContainEqual(expect.objectContaining({
          event: 'diagnostic',
          data: expect.objectContaining({
            type: 'model_context_budget',
            action: item.expectedContextBudgetAction,
          }),
        }));
      }
    }
  });

  it('reclassifies retained provider, environment, and resume failures from real run events', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'clean-design-run-reclassify-bin-'));
    await writeFakeClaude(
      binDir,
      'env-node-path',
      "'node' is not recognized as an internal or external command, operable program or batch file.",
    );
    await writeFakeClaude(
      binDir,
      'env-spawn-enoent',
      'Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/codex ENOENT',
    );
    await writeFakeClaude(
      binDir,
      'prefill',
      'MLX prefill memory guard rejected this prompt: Prefill context too large for available memory',
    );
    await writeFakeClaude(
      binDir,
      'auth',
      "login fail: Please carry the API secret key in the 'Authorization' field of the request header (1004)",
    );
    await writeFakeClaude(
      binDir,
      'lmstudio',
      "No models loaded. Please load a model in the developer page or use the 'lms load' command.",
    );
    await writeFakeClaude(
      binDir,
      'resume-expired',
      'no conversation found with session id 1d2c3b4a-0000-0000-0000-000000000000',
    );

    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '5000';
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;

    const cases = [
      { bin: 'env-node-path', category: 'process_exit', detail: 'cli_not_installed' },
      { bin: 'env-spawn-enoent', category: 'process_exit', detail: 'cli_not_installed' },
      { bin: 'prefill', category: 'prompt_too_large', detail: 'prompt_too_large' },
      { bin: 'auth', category: 'auth', detail: 'auth_required' },
      { bin: 'lmstudio', category: 'model_unavailable', detail: 'local_model_not_loaded' },
      { bin: 'resume-expired', category: 'process_exit', detail: 'session_resume_expired' },
    ] as const;

    for (const item of cases) {
      await putConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, item.bin) } },
      });
      const run = await createAndWaitForRun(started.url, {
        caseId: item.bin,
        agentId: 'claude',
        message: `clean-design-reclassify-${item.bin}`,
      });
      const events = await readRunEvents(run.eventsLogPath);
      const errorCode = deriveRunErrorCode(run);
      const failure = classifyRunFailure({
        result: runResultFromStatus(run.status),
        status: run,
        ...(errorCode ? { errorCode } : {}),
        agentId: run.agentId,
        events,
      });

      expect(run.status, item.bin).toBe('failed');
      expect(failure?.failure_detail, item.bin).not.toBe('execution_failed');
      expect(failure?.failure_category, item.bin).toBe(item.category);
      expect(failure?.failure_detail, item.bin).toBe(item.detail);
    }
  });
});

async function writeFakeClaude(dir: string, name: string, stderr: string | null): Promise<void> {
  const bin = path.join(dir, name);
  const body = stderr === null
    ? 'setInterval(() => {}, 1000);\n'
    : `process.stderr.write(${JSON.stringify(`${stderr}\n`)});\nsetTimeout(() => process.exit(1), 100);\n`;
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
${body}`, 'utf8');
  await chmod(bin, 0o755);
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForRun(url: string, input: {
  caseId: string;
  agentId: string;
  message: string;
  model?: string;
}): Promise<RunStatus> {
  const projectId = `failure_smoke_${input.caseId}_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `Failure smoke ${input.caseId}`,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const assistantMessageId = `assistant_${input.caseId}_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId,
      clientRequestId: `client_${input.caseId}_${randomUUID()}`,
      agentId: input.agentId,
      ...(input.model ? { model: input.model } : {}),
      message: input.message,
      currentPrompt: input.message,
    }),
  });
  expect(runResponse.status).toBe(202);
  const runBody = await runResponse.json() as { runId: string };
  return await waitForRun(url, runBody.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function readRunEvents(file: string): Promise<RunEvent[]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
