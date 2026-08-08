'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AnalyticsConfigureGlobals } from '@open-design/contracts/analytics';

import { randomUUID } from '../utils/uuid';

interface AnalyticsContextValue {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  setConsent: (granted: boolean) => void;
  setIdentity: (installationId: string | null) => void;
  setConfigureGlobals: (next: AnalyticsConfigureGlobals) => void;
  setUserId: (userId: string | null) => void;
  anonymousId: string;
  sessionId: string;
  newRequestId: () => string;
}

const APP_VERSION_PLACEHOLDER = '0.0.0';
const Ctx = createContext<AnalyticsContextValue | null>(null);
let runtimeAppVersion: string | null = null;

async function loadRuntimeAppVersion(): Promise<string | null> {
  if (runtimeAppVersion) return runtimeAppVersion;
  try {
    const response = await fetch('/api/version');
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: { version?: string } };
    runtimeAppVersion = body.version?.version ?? null;
    return runtimeAppVersion;
  } catch {
    return null;
  }
}

export async function resolveAppVersionForCapture(current: string): Promise<string> {
  if (current && current !== APP_VERSION_PLACEHOLDER) return current;
  return (await loadRuntimeAppVersion()) ?? current;
}

export function useAppVersion(): string {
  const [version, setVersion] = useState(APP_VERSION_PLACEHOLDER);
  useEffect(() => {
    let active = true;
    void loadRuntimeAppVersion().then((next) => {
      if (active && next) setVersion(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return version;
}

function localAnalyticsValue(): AnalyticsContextValue {
  return {
    track: () => undefined,
    setConsent: () => undefined,
    setIdentity: () => undefined,
    setConfigureGlobals: () => undefined,
    setUserId: () => undefined,
    anonymousId: 'local',
    sessionId: 'local',
    newRequestId: () => randomUUID(),
  };
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const value = useMemo(localAnalyticsValue, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalytics(): AnalyticsContextValue {
  return useContext(Ctx) ?? localAnalyticsValue();
}
