// @vitest-environment node

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite, e2eWorkspaceRoot } from '@/vitest/suite';

const execFileAsync = promisify(execFile);

type DaemonStatusResponse = {
  dataDir?: string;
  installedPlugins?: unknown;
  mediaConfigDir?: string | null;
  namespace?: unknown;
  pid?: number;
  port?: number;
};

describe('namespace isolation spec', () => {
  test('keeps namespace in lifecycle infrastructure while daemon clients use a concrete local URL', async () => {
    const suite = await createSmokeSuite('namespace-isolation');

    await suite.with.toolsDev(async ({ runtime, status, webUrl }) => {
      expect(status.namespace).toBe(suite.namespace);

      const daemonStatus = await requestJson<DaemonStatusResponse>(webUrl, '/api/daemon/status');
      expect(daemonStatus.port).toBe(runtime.daemonPort);
      expect(daemonStatus.dataDir).toBe(suite.dataDir);
      expect(daemonStatus).not.toHaveProperty('namespace');

      const daemonUrl = `http://127.0.0.1:${runtime.daemonPort}`;

      const cliStatus = await runDaemonCliJson<DaemonStatusResponse>(
        ['daemon', 'status', '--json'],
        {
          OD_DATA_DIR: suite.dataDir,
          OD_DAEMON_URL: daemonUrl,
          OD_NAMESPACE: 'wrong-daemon-namespace',
          OD_SIDECAR_IPC_BASE: path.join(suite.scratchDir, 'wrong-ipc-base'),
          OD_SIDECAR_NAMESPACE: 'wrong-sidecar-namespace',
        },
      );
      expect(cliStatus.port).toBe(runtime.daemonPort);
      expect(cliStatus.dataDir).toBe(suite.dataDir);
      expect(cliStatus).not.toHaveProperty('namespace');

      const rejected = await runDaemonCliExpectFailure(
        ['daemon', 'status', '--json', '--namespace', 'should-not-parse'],
        { OD_DAEMON_URL: daemonUrl },
      );
      expect(`${rejected.stdout}\n${rejected.stderr}`).toContain('unknown flag: --namespace');

      await suite.report.json('summary.json', {
        cliStatus,
        daemonStatus,
        daemonUrl,
        runtime,
        toolsDevNamespace: status.namespace,
      });
    });
  }, 180_000);
});

async function runDaemonCliJson<T>(args: string[], env: Record<string, string>): Promise<T> {
  const result = await runDaemonCli(args, env);
  return parseJsonOutput<T>(result.stdout);
}

async function runDaemonCliExpectFailure(
  args: string[],
  env: Record<string, string>,
): Promise<{ stderr: string; stdout: string }> {
  try {
    await runDaemonCli(args, env);
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    return {
      stderr: failure.stderr ?? '',
      stdout: failure.stdout ?? '',
    };
  }
  throw new Error(`expected daemon CLI to fail for args: ${args.join(' ')}`);
}

async function runDaemonCli(
  args: string[],
  env: Record<string, string>,
): Promise<{ stderr: string; stdout: string }> {
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
  };
  delete mergedEnv.OD_PORT;

  const { stderr, stdout } = await execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'apps/daemon/src/cli.ts', ...args],
    {
      cwd: e2eWorkspaceRoot(),
      env: mergedEnv,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return { stderr, stdout };
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T;
  }
  const objectStart = stdout.lastIndexOf('\n{');
  const arrayStart = stdout.lastIndexOf('\n[');
  const jsonStart = Math.max(objectStart, arrayStart);
  if (jsonStart < 0) {
    throw new Error(`Expected JSON output from daemon CLI, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart + 1)) as T;
}
