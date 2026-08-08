import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createAnalyticsService,
  readPosthogConfig,
  readPublicConfigResponse,
} from '../src/analytics.js';

describe('Clean Design analytics boundary', () => {
  it('ignores inherited PostHog configuration', () => {
    const env = {
      POSTHOG_KEY: 'phc_test',
      POSTHOG_HOST: 'https://us.i.posthog.com',
      OD_TELEMETRY_ENV: 'production',
    };
    expect(readPosthogConfig(env)).toBeNull();
    expect(readPublicConfigResponse(env)).toEqual({
      enabled: false,
      env: 'local',
      key: null,
      host: null,
    });
  });

  it('never captures analytics or safety events', async () => {
    const analytics = createAnalyticsService({
      dataDir: await mkdtemp(path.join(tmpdir(), 'clean-design-analytics-')),
      env: { POSTHOG_KEY: 'phc_test' },
    });
    const capture = vi.fn();
    await analytics.capture({
      eventName: 'unit_event',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      insertId: 'insert-1',
      properties: { capture },
    });
    await analytics.captureSafety({
      eventName: 'unit_safety_event',
      appVersion: '1.2.3',
      properties: { capture },
    });
    expect(capture).not.toHaveBeenCalled();
    await expect(analytics.shutdown()).resolves.toBeUndefined();
  });
});
