// Phase 7-8 entry slice / spec §11.5.1 — handoff atom helper.

import { describe, expect, it } from 'vitest';
import type { ArtifactManifest } from '@open-design/contracts';
import { recordHandoff } from '../src/plugins/atoms/handoff.js';

const baseManifest = (extra: Partial<ArtifactManifest> = {}): ArtifactManifest => ({
  version:  1,
  kind:     'html',
  title:    'Fixture',
  entry:    'index.html',
  renderer: 'html',
  exports:  [],
  ...extra,
});

describe('recordHandoff — append-only contracts', () => {
  it('appends a new exportTargets entry', () => {
    const out = recordHandoff({
      manifest: baseManifest(),
      exportTarget: { surface: 'cli', target: '/workspace/od/x.html', exportedAt: 1000 },
    });
    expect(out.changed).toContain('exportTargets');
    expect(out.manifest.exportTargets).toEqual([
      { surface: 'cli', target: '/workspace/od/x.html', exportedAt: 1000 },
    ]);
  });

  it('is idempotent on identical (surface, target) pairs', () => {
    const first = recordHandoff({
      manifest: baseManifest(),
      exportTarget: { surface: 'cli', target: '/p/a.html', exportedAt: 1 },
    });
    const second = recordHandoff({
      manifest: first.manifest,
      exportTarget: { surface: 'cli', target: '/p/a.html', exportedAt: 5 },
    });
    expect(second.changed).toEqual([]);
    expect(second.manifest.exportTargets?.length).toBe(1);
  });

});

describe('recordHandoff — handoffKind monotonicity', () => {
  it('records the first handoffKind unconditionally', () => {
    const out = recordHandoff({
      manifest: baseManifest(),
      handoffKind: 'design-only',
    });
    expect(out.manifest.handoffKind).toBe('design-only');
    expect(out.changed).toContain('handoffKind');
  });

  it('promotes handoffKind along the axis design-only → implementation-plan → patch', () => {
    const a = recordHandoff({ manifest: baseManifest({ handoffKind: 'design-only' }), handoffKind: 'patch' });
    expect(a.manifest.handoffKind).toBe('patch');
  });

  it('refuses to downgrade when enforceMonotonicHandoff is on (default)', () => {
    const a = recordHandoff({ manifest: baseManifest({ handoffKind: 'patch' }), handoffKind: 'design-only' });
    expect(a.manifest.handoffKind).toBe('patch');
    expect(a.changed).not.toContain('handoffKind');
  });

  it('allows downgrade when enforceMonotonicHandoff is false (rollback path)', () => {
    const a = recordHandoff({
      manifest: baseManifest({ handoffKind: 'patch' }),
      handoffKind: 'implementation-plan',
      enforceMonotonicHandoff: false,
    });
    expect(a.manifest.handoffKind).toBe('implementation-plan');
  });
});
