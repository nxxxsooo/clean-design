import type { Express } from 'express';

import { createAnalyticsService } from '../analytics.js';
import type { readAppConfig } from '../app-config.js';
import { readCurrentAppVersionInfo } from '../app-version.js';

export interface DaemonTelemetry {
  analyticsService: ReturnType<typeof createAnalyticsService>;
  getCachedAppVersion: () => any;
  reportFeedback: (_req: {
    runId: string;
    rating: 'positive' | 'negative';
    reasonCodes: string[];
    hasCustomReason: boolean;
    customReason: string;
    scoreMetadata?: Record<string, unknown>;
  }) => Promise<{ status: 'skipped_no_sink' }>;
}

export interface RegisterTelemetryRoutesDeps {
  dataDir: string;
  readAppConfig: typeof readAppConfig;
}

export function registerTelemetryRoutes(
  _app: Express,
  deps: RegisterTelemetryRoutesDeps,
): DaemonTelemetry {
  const analyticsService = createAnalyticsService({ dataDir: deps.dataDir });
  let cachedAppVersion: any = null;
  void readCurrentAppVersionInfo()
    .then((version) => {
      cachedAppVersion = version;
    })
    .catch(() => undefined);

  return {
    analyticsService,
    getCachedAppVersion: () => cachedAppVersion,
    reportFeedback: async () => ({ status: 'skipped_no_sink' }),
  };
}
