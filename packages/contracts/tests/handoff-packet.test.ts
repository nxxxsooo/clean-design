import { describe, expect, it } from 'vitest';

import {
  HANDOFF_MANIFEST_VERSION,
  isHandoffFailureCode,
} from '../src/handoff-packet.js';

describe('handoff packet contract', () => {
  it('pins manifest schema v1 and stable failure codes', () => {
    expect(HANDOFF_MANIFEST_VERSION).toBe(1);
    for (const code of ['root_required', 'root_unavailable', 'secret_detected', 'render_failed', 'write_failed']) {
      expect(isHandoffFailureCode(code)).toBe(true);
    }
    expect(isHandoffFailureCode('clipboard_failed')).toBe(false);
  });
});
