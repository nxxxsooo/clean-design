import crypto from 'node:crypto';

import type { Request } from 'express';
import {
  anonymizeArtifactId as anonymizeArtifactIdShared,
  type AnalyticsClientType,
  type AnalyticsConfigResponse,
} from '@open-design/contracts/analytics';

export interface AnalyticsContext {
  deviceId: string;
  sessionId: string;
  clientType: AnalyticsClientType;
  locale: string;
  requestId: string | null;
}

export interface PosthogConfig {
  key: string;
  host: string;
  env: string;
}

export interface AnalyticsService {
  capture(args: {
    eventName: string;
    context: AnalyticsContext;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): Promise<void>;
  captureSafety(args: {
    eventName: string;
    distinctId?: string;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId?: string;
  }): Promise<void>;
  mergeAnonymousPerson(args: {
    anonymousDistinctId: string;
    distinctId: string;
    properties?: Record<string, unknown>;
    insertId?: string;
  }): Promise<void>;
  shutdown(): Promise<void>;
}

const NOOP_SERVICE: AnalyticsService = Object.freeze({
  capture: async () => undefined,
  captureSafety: async () => undefined,
  mergeAnonymousPerson: async () => undefined,
  shutdown: async () => undefined,
});

export function readAnalyticsContext(_req: Request): AnalyticsContext | null {
  return null;
}

export function readPosthogConfig(_env: NodeJS.ProcessEnv = process.env): PosthogConfig | null {
  return null;
}

export function readPublicConfigResponse(
  _env: NodeJS.ProcessEnv = process.env,
): AnalyticsConfigResponse {
  return { enabled: false, env: 'local', key: null, host: null };
}

export function createAnalyticsService(_args: {
  env?: NodeJS.ProcessEnv;
  dataDir: string;
}): AnalyticsService {
  return NOOP_SERVICE;
}

export const anonymizeArtifactId = anonymizeArtifactIdShared;

export function newInsertId(): string {
  return crypto.randomUUID();
}
