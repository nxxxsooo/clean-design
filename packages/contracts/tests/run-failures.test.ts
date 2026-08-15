import { describe, expect, it } from 'vitest';

import {
  RUN_FAILURE_CATEGORIES,
  RUN_FAILURE_DETAILS,
  RUN_FAILURE_USER_ACTIONS,
} from '../src/api/run-failures.js';

describe('neutral run failure contract', () => {
  it('keeps runtime recovery semantics without hosted payment actions', () => {
    expect(RUN_FAILURE_CATEGORIES).toContain('auth');
    expect(RUN_FAILURE_CATEGORIES).toContain('rate_limit');
    expect(RUN_FAILURE_CATEGORIES).toContain('process_exit');
    expect(RUN_FAILURE_CATEGORIES).not.toContain('insufficient_balance');
    expect(RUN_FAILURE_CATEGORIES).not.toContain('entitlement_required');

    expect(RUN_FAILURE_USER_ACTIONS).toContain('retry');
    expect(RUN_FAILURE_USER_ACTIONS).toContain('login');
  });

  it('contains no payment-specific recovery detail', () => {
    expect(RUN_FAILURE_DETAILS).not.toContain('permission_request_not_found');
  });
});
