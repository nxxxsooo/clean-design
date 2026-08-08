import { describe, expect, it } from 'vitest';

import {
  assertCleanDesignEgressAllowed,
  isLoopbackOutboundUrl,
  withCleanDesignEgress,
} from '../src/egress-policy.js';

describe('Clean Design outbound policy', () => {
  it('always permits loopback control traffic', () => {
    for (const url of [
      'http://127.0.0.1:7456/api/health',
      'http://127.18.0.4:7456/api/health',
      'http://[::1]:7456/api/health',
      'http://localhost:7456/api/health',
    ]) {
      expect(isLoopbackOutboundUrl(url)).toBe(true);
      expect(() => assertCleanDesignEgressAllowed(url)).not.toThrow();
    }
  });

  it('denies unclassified background egress', () => {
    expect(() => assertCleanDesignEgressAllowed('https://analytics.example.test/capture'))
      .toThrow(/unclassified outbound request/);
  });

  it.each(['provider', 'resource', 'cli'] as const)('permits explicit %s egress', async (reason) => {
    await expect(withCleanDesignEgress(reason, async () => {
      assertCleanDesignEgressAllowed('https://provider.example.test/v1/generate');
      return true;
    })).resolves.toBe(true);
  });

  it('rejects non-network protocols even inside a permit', () => {
    expect(() => withCleanDesignEgress('resource', () => {
      assertCleanDesignEgressAllowed('ftp://example.test/archive');
    })).toThrow(/unsupported outbound protocol/);
  });
});
