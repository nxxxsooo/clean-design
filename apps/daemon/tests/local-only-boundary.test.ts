import type http from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeDaemonBindHost } from '../src/daemon-startup.js';
import { startServer } from '../src/server.js';

describe('Clean Design local-only daemon boundary', () => {
  let server: http.Server;
  let shutdown: (() => Promise<void> | void) | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      server: http.Server;
      shutdown?: () => Promise<void> | void;
      url: string;
    };
    server = started.server;
    shutdown = started.shutdown;
    baseUrl = started.url;
  });

  afterAll(async () => {
    await Promise.resolve(shutdown?.());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([
    ['GET', '/api/amr/models'],
    ['GET', '/api/analytics/config'],
    ['POST', '/api/attribution/bridge-url'],
    ['GET', '/api/community/discord'],
    ['GET', '/api/connectors'],
    ['GET', '/api/deploy/config'],
    ['GET', '/api/github/open-design'],
    ['POST', '/api/integrations/vela/login'],
    ['GET', '/api/marketplaces'],
    ['GET', '/api/mcp/servers'],
    ['POST', '/api/observability/event'],
    ['POST', '/api/plugins/install'],
    ['POST', '/api/plugins/plugin-1/uninstall'],
    ['POST', '/api/plugins/plugin-1/upgrade'],
    ['POST', '/api/plugins/plugin-1/trust'],
    ['POST', '/api/plugins/plugin-1/share-project'],
    ['POST', '/api/projects/project-1/deploy'],
    ['POST', '/api/projects/project-1/handoff'],
    ['POST', '/api/projects/project-1/plugins/install-folder'],
    ['POST', '/api/projects/project-1/plugins/publish-github'],
    ['POST', '/api/runs/run-1/feedback'],
    ['POST', '/api/social-share'],
    ['GET', '/api/whats-new'],
  ] as const)('denies %s %s before service handlers execute', async (method, path) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(method === 'POST'
        ? { headers: { 'Content-Type': 'application/json' }, body: '{}' }
        : {}),
    });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'SERVICE_DISABLED',
        message: 'This network service is not available in Clean Design.',
      },
    });
  });

  it('keeps the local health endpoint available', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
  });

  it('rejects non-loopback bind addresses', () => {
    expect(normalizeDaemonBindHost('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeDaemonBindHost('localhost')).toBe('localhost');
    expect(() => normalizeDaemonBindHost('0.0.0.0')).toThrow(/only permits loopback/);
    expect(() => normalizeDaemonBindHost('192.168.1.10')).toThrow(/only permits loopback/);
  });
});
