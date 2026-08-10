// Clean Design bind + bearer guard.
//
// Upstream Open Design allowed a public bind as long as OD_API_TOKEN was
// set (and allowed OD_DISABLE_API_AUTH to waive that). Clean Design binds
// local services to loopback only, so a non-loopback bind is now refused
// unconditionally — no token and no escape hatch can widen it. These tests
// assert that stronger invariant, then cover the bearer middleware that
// still guards /api/* for non-loopback peers while leaving the
// health/readiness/version probes open for monitoring.

import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isApiAuthDisabled, isApiTokenMiddlewareEnabled } from '../src/api-token-auth.js';
import { startServer } from '../src/server.js';

const PREVIOUS_TOKEN = process.env.OD_API_TOKEN;
const PREVIOUS_HOST  = process.env.OD_BIND_HOST;
const PREVIOUS_DISABLE_API_AUTH = process.env.OD_DISABLE_API_AUTH;

let server: http.Server | undefined;
let baseUrl = '';
let shutdown: (() => Promise<void> | void) | undefined;

afterEach(async () => {
  if (shutdown) await Promise.resolve(shutdown());
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  shutdown = undefined;
  if (PREVIOUS_TOKEN === undefined) delete process.env.OD_API_TOKEN;
  else process.env.OD_API_TOKEN = PREVIOUS_TOKEN;
  if (PREVIOUS_HOST === undefined) delete process.env.OD_BIND_HOST;
  else process.env.OD_BIND_HOST = PREVIOUS_HOST;
  if (PREVIOUS_DISABLE_API_AUTH === undefined) delete process.env.OD_DISABLE_API_AUTH;
  else process.env.OD_DISABLE_API_AUTH = PREVIOUS_DISABLE_API_AUTH;
});

describe('bound-API-token guard', () => {
  it('refuses to start on a non-loopback host even when OD_API_TOKEN is set', async () => {
    process.env.OD_API_TOKEN = 'test-token-abc';
    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true }))
      .rejects.toThrow(/only permits loopback daemon binds/);
  });

  it('refuses to start on a non-loopback host when OD_API_TOKEN is unset', async () => {
    delete process.env.OD_API_TOKEN;
    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true }))
      .rejects.toThrow(/only permits loopback daemon binds/);
  });

  it('starts on loopback when OD_API_TOKEN is set', async () => {
    process.env.OD_API_TOKEN = 'test-token-abc';
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    baseUrl = started.url;
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });

  it('does not let OD_DISABLE_API_AUTH widen the bind beyond loopback', async () => {
    delete process.env.OD_API_TOKEN;
    process.env.OD_DISABLE_API_AUTH = '1';
    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true }))
      .rejects.toThrow(/only permits loopback daemon binds/);
  });
});

describe('bearer middleware', () => {
  beforeEach(async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
  });

  it('accepts loopback callers without a bearer (desktop UI flow)', async () => {
    // The HTTP test client is on the same machine → req.socket.remoteAddress
    // is 127.0.0.1 → middleware short-circuits.
    const resp = await fetch(`${baseUrl}/api/plugins`);
    expect(resp.status).toBe(200);
  });

  it('keeps health / readiness / version probes open without a bearer', async () => {
    for (const path of ['/api/health', '/api/ready', '/api/version']) {
      const resp = await fetch(`${baseUrl}${path}`);
      expect(resp.status).toBe(200);
    }
  });

  it('disables bearer middleware when OD_DISABLE_API_AUTH=1 even if OD_API_TOKEN is set', () => {
    expect(
      isApiTokenMiddlewareEnabled({
        ...process.env,
        OD_API_TOKEN: 'secret-test-token',
        OD_DISABLE_API_AUTH: '1',
      }),
    ).toBe(false);
    expect(
      isApiAuthDisabled({
        ...process.env,
        OD_DISABLE_API_AUTH: '1',
      }),
    ).toBe(true);
  });
});
