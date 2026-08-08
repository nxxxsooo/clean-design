import { describe, expect, it } from 'vitest';

import {
  CREDENTIAL_REFERENCE_PREFIX,
  isCredentialReference,
  maskCredential,
} from '../src/credentials.js';

describe('credential references', () => {
  it('accepts only stable opaque references', () => {
    expect(isCredentialReference(`${CREDENTIAL_REFERENCE_PREFIX}abcdefghijklmnop`)).toBe(true);
    expect(isCredentialReference('sk-live-secret')).toBe(false);
    expect(isCredentialReference('credential://short')).toBe(false);
  });

  it('masks without returning the complete secret', () => {
    expect(maskCredential('sk-example-123456')).toBe('****3456');
    expect(maskCredential('')).toBe('****');
  });
});
