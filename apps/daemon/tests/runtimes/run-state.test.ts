import { describe, expect, it } from 'vitest';
import {
  scanRunEventsForRetrySideEffects,
} from '../../src/runtimes/run-state.js';

describe('run retry safety helpers', () => {
  it('detects retry-blocking side effects from run events', () => {
    expect(scanRunEventsForRetrySideEffects([
      { event: 'stderr', data: { chunk: 'HTTP 503' } },
    ])).toEqual({
      userVisibleOutputSeen: false,
      toolCallSeen: false,
      artifactWriteSeen: false,
      liveArtifactSeen: false,
    });

    expect(scanRunEventsForRetrySideEffects([
      { event: 'agent', data: { type: 'text_delta', delta: 'hello' } },
      { event: 'agent', data: { type: 'tool_use', id: 't1', name: 'Read', input: {} } },
      { event: 'agent', data: { type: 'live_artifact' } },
    ])).toMatchObject({
      userVisibleOutputSeen: true,
      toolCallSeen: true,
      liveArtifactSeen: true,
    });
  });

});
