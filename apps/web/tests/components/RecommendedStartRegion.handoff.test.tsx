// @vitest-environment jsdom
//
// Recommendation start behavior remains local to the creation flow.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { RecommendedStartRegion } from '../../src/components/RecommendedStartRegion';
import { buildRecommendation } from '../../src/onboarding/recommendation';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

type OnStart = (input: {
  name: string;
  prompt: string;
  metadata: unknown;
  onboardingEntry: unknown;
}) => unknown;

function renderRegion(onStart: OnStart) {
  const recommendation = buildRecommendation({ role: 'designer', useCases: ['prototype'] });
  return render(
    <I18nProvider initial="en">
      <RecommendedStartRegion
        recommendation={recommendation}
        onStart={onStart as never}
        onDismiss={() => undefined}
      />
    </I18nProvider>,
  );
}

describe('RecommendedStartRegion — Start in Studio', () => {
  it('hands the recommended project input to onStart', async () => {
    let received: Parameters<OnStart>[0] | null = null;
    const onStart = vi.fn((input: Parameters<OnStart>[0]) => {
      received = input;
      return Promise.resolve(true);
    });
    renderRegion(onStart);
    fireEvent.click(screen.getByTestId('home-recommendation-start'));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(received).toMatchObject({
      metadata: { kind: 'prototype', nameSource: 'prompt' },
    });
    expect(received).not.toHaveProperty('onboardingEntry');
  });

  it('re-enables the CTA for retry when the start fails', async () => {
    // `onStart` (the Home wrapper) surfaces its own visible error and resolves
    // `false` on failure — it never rejects. The region should drop its pending
    // state so the user can retry.
    const onStart = vi.fn(async () => false);
    renderRegion(onStart);
    const cta = screen.getByTestId('home-recommendation-start') as HTMLButtonElement;
    fireEvent.click(cta);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(cta.disabled).toBe(false));
    // Retry is possible: a second click fires onStart again.
    fireEvent.click(cta);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(2));
  });
});
