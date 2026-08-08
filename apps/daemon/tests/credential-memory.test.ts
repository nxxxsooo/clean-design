import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';
import { credentialSyncSigningPayload, type SyncCredentialsInput } from '@open-design/sidecar-proto';

import {
  clearCredentialMemory,
  credentialReferenceMask,
  resolveCredentialReference,
  resolveCredentialReferencesInValue,
  syncCredentialMemory,
} from '../src/credential-memory.js';

const secret = Buffer.alloc(32, 7);

function signedInput(overrides: Partial<SyncCredentialsInput> = {}): SyncCredentialsInput {
  const unsigned = {
    credentials: [{ ref: 'credential://abcdefghijklmnop', mask: '****1234', secret: 'sk-secret-1234' }],
    issuedAt: new Date(1_000_000).toISOString(),
    nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGH',
    ...overrides,
  };
  return {
    ...unsigned,
    signature: createHmac('sha256', secret)
      .update(credentialSyncSigningPayload(unsigned))
      .digest('base64url'),
  };
}

afterEach(clearCredentialMemory);

describe('credential memory registration', () => {
  it('accepts an authenticated replacement set and resolves only in memory', () => {
    expect(syncCredentialMemory(signedInput(), secret, 1_000_000)).toBe(1);
    expect(resolveCredentialReference('credential://abcdefghijklmnop')).toBe('sk-secret-1234');
    expect(credentialReferenceMask('credential://abcdefghijklmnop')).toBe('****1234');
    expect(resolveCredentialReferencesInValue({ apiKey: 'credential://abcdefghijklmnop' })).toEqual({ apiKey: 'sk-secret-1234' });
  });

  it('rejects bad signatures, stale timestamps, replay, and unknown references', () => {
    expect(() => syncCredentialMemory({ ...signedInput(), signature: 'x'.repeat(43) }, secret, 1_000_000)).toThrow(/signature/);
    expect(() => syncCredentialMemory(signedInput(), secret, 2_000_000)).toThrow(/timestamp/);
    const input = signedInput();
    syncCredentialMemory(input, secret, 1_000_000);
    expect(() => syncCredentialMemory(input, secret, 1_000_000)).toThrow(/already used/);
    expect(() => resolveCredentialReferencesInValue('credential://unknownreference123')).toThrow(/unavailable/);
  });
});
