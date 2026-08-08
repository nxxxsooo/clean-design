import { AsyncLocalStorage } from 'node:async_hooks';
import net from 'node:net';

import type { NextFunction, Request, Response } from 'express';

export type CleanDesignEgressReason = 'provider' | 'resource' | 'cli';

interface EgressPermit {
  reason: CleanDesignEgressReason;
  requestPath?: string;
}

const permits = new AsyncLocalStorage<EgressPermit>();
const GUARDED_FETCH = Symbol.for('clean-design.guarded-fetch');
let guardReferences = 0;
let guardedFetch: typeof fetch | null = null;
let unguardedFetch: typeof fetch | null = null;

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

export function isLoopbackOutboundUrl(value: string | URL): boolean {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return false;
  }
  const hostname = normalizeHostname(url.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  const ip = net.isIP(hostname);
  if (ip === 4) return hostname.startsWith('127.');
  if (ip === 6) return hostname === '::1';
  return false;
}

export function assertCleanDesignEgressAllowed(
  value: string | URL,
  permit: EgressPermit | undefined = permits.getStore(),
): void {
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol === 'data:' || url.protocol === 'blob:' || isLoopbackOutboundUrl(url)) return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Clean Design blocked unsupported outbound protocol: ${url.protocol}`);
  }
  if (!permit) {
    throw new Error(`Clean Design blocked unclassified outbound request to ${url.origin}`);
  }
}

export function withCleanDesignEgress<T>(
  reason: CleanDesignEgressReason,
  operation: () => T,
): T {
  return permits.run({ reason }, operation);
}

function requestEgressReason(pathname: string): CleanDesignEgressReason | null {
  if (
    pathname === '/chat'
    || pathname === '/provider/models'
    || pathname === '/test/connection'
    || pathname.startsWith('/proxy/')
    || pathname.startsWith('/media/')
    || /^\/projects\/[^/]+\/(?:media|finalize)(?:\/|$)/.test(pathname)
    || pathname.startsWith('/tools/media/')
    || pathname.startsWith('/xai/')
  ) return 'provider';

  if (
    pathname.startsWith('/research/')
    || pathname === '/asset-cache'
    || /^\/plugins\/[^/]+\/(?:preview|example|asset)(?:\/|$)/.test(pathname)
    || pathname.startsWith('/design-systems/import/')
    || pathname.startsWith('/brands/')
    || pathname.startsWith('/library/')
    || /^\/live-artifacts\/[^/]+\/(?:refresh|preview)(?:\/|$)/.test(pathname)
  ) return 'resource';
  return null;
}

export function cleanDesignEgressRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const reason = requestEgressReason(req.path);
  if (!reason) return next();
  permits.run({ reason, requestPath: req.path }, next);
}

export function installCleanDesignEgressGuard(): () => void {
  const current = globalThis.fetch;
  if (!(current as any)[GUARDED_FETCH]) {
    unguardedFetch = current;
    const nativeFetch = current.bind(globalThis);
    guardedFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const request = new Request(input, init);
      assertCleanDesignEgressAllowed(request.url);
      return await nativeFetch(request);
    }) as typeof fetch;
    (guardedFetch as any)[GUARDED_FETCH] = true;
    globalThis.fetch = guardedFetch;
  }
  guardReferences += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    guardReferences = Math.max(0, guardReferences - 1);
    if (guardReferences === 0 && guardedFetch && globalThis.fetch === guardedFetch && unguardedFetch) {
      globalThis.fetch = unguardedFetch;
      guardedFetch = null;
      unguardedFetch = null;
    }
  };
}
