import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  credentialSyncSigningPayload,
  type SyncCredentialsInput,
} from '@open-design/sidecar-proto';
import { isCredentialReference } from '@open-design/contracts';

interface CredentialMemoryRecord {
  mask: string;
  secret: string;
}

const credentials = new Map<string, CredentialMemoryRecord>();
const consumedNonces = new Map<string, number>();
const MAX_CLOCK_SKEW_MS = 60_000;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function pruneNonces(now: number): void {
  for (const [nonce, expiresAt] of consumedNonces) {
    if (expiresAt <= now) consumedNonces.delete(nonce);
  }
}

export function syncCredentialMemory(
  input: SyncCredentialsInput,
  desktopSecret: Buffer,
  now = Date.now(),
): number {
  const issuedAt = Date.parse(input.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > MAX_CLOCK_SKEW_MS) {
    throw new Error('credential sync timestamp is outside the permitted window');
  }
  pruneNonces(now);
  if (consumedNonces.has(input.nonce)) throw new Error('credential sync nonce was already used');
  const expected = createHmac('sha256', desktopSecret)
    .update(credentialSyncSigningPayload(input))
    .digest('base64url');
  if (!safeEqual(expected, input.signature)) throw new Error('credential sync signature is invalid');

  const next = new Map<string, CredentialMemoryRecord>();
  for (const entry of input.credentials) {
    if (!isCredentialReference(entry.ref) || !entry.secret) {
      throw new Error('credential sync entry is invalid');
    }
    next.set(entry.ref, { mask: entry.mask, secret: entry.secret });
  }
  credentials.clear();
  for (const [ref, record] of next) credentials.set(ref, record);
  consumedNonces.set(input.nonce, now + MAX_CLOCK_SKEW_MS);
  return credentials.size;
}

export function resolveCredentialReference(value: string): string | null {
  if (!isCredentialReference(value)) return value;
  return credentials.get(value)?.secret ?? null;
}

export function credentialReferenceMask(value: string): string | null {
  if (!isCredentialReference(value)) return null;
  return credentials.get(value)?.mask ?? null;
}

export function clearCredentialMemory(): void {
  credentials.clear();
  consumedNonces.clear();
}

export function resolveCredentialReferencesInValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (!isCredentialReference(value)) return value;
    const resolved = resolveCredentialReference(value);
    if (resolved == null) throw new Error('credential reference is unavailable');
    return resolved;
  }
  if (Array.isArray(value)) return value.map(resolveCredentialReferencesInValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      resolveCredentialReferencesInValue(child),
    ]),
  );
}
