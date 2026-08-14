import { describe, expect, it } from 'vitest';

import { resolvePackagedSmokeNamespace } from '@/vitest/suite';

describe('packaged smoke namespace', () => {
  it('[P2] defaults the only supported packaged platform to a Clean Design mac namespace', () => {
    expect(resolvePackagedSmokeNamespace('mac', {})).toBe('clean-design-release-mac');
  });

  it('[P2] honors an explicit isolated namespace', () => {
    expect(resolvePackagedSmokeNamespace('mac', { OD_PACKAGED_E2E_NAMESPACE: 'acceptance-local' }))
      .toBe('acceptance-local');
  });
});
