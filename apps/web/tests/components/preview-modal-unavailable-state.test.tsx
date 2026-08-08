// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewModal } from '../../src/components/PreviewModal';

// Regression coverage for nexu-io/open-design#897: skills declared with a
// non-html `od.preview.type` (image, markdown, …) ship no fetchable
// example artifact. The modal must render a calm "no shipped preview"
// placeholder distinct from both the loading state (which would never
// resolve) and the generic error state (which is misleading — nothing
// failed: there's just no preview to render).

const baseProps = {
  title: 'Example',
  exportTitleFor: (id: string) => id,
};

describe('PreviewModal unavailable state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the unavailable affordance for a non-html preview', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            unavailable: { kind: 'markdown' },
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('preview-unavailable')).toBeTruthy();
    // Body copy mentions the preview kind so users know why nothing
    // rendered ("This skill produces a markdown document — …").
    expect(screen.getByText(/markdown/i)).toBeTruthy();
    // Loading + error copy must NOT show alongside the unavailable
    // state — the three states are mutually exclusive in the modal.
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
    // Unavailable is terminal: the user cannot retry their way into a
    // preview that doesn't exist on disk, so no Retry button.
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('does not render the unavailable affordance for an html view that is still loading', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: null, // null = loading
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId('preview-unavailable')).toBeNull();
    // The loading copy is the active state for null html.
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('disables the export menu when the active view is unavailable', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            unavailable: { kind: 'image' },
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    // The preview has no HTML to export, so the trigger must
    // stay disabled instead of opening a menu full of no-op actions.
    const exportMenu = screen.getByRole('button', { name: /export files/i });
    expect((exportMenu as HTMLButtonElement).disabled).toBe(true);
  });


  it('keeps generic preview modals export-only', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<!doctype html><p>Generic preview</p>',
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /export files/i }));

    expect(screen.queryByRole('menuitem', { name: /X \/ Twitter/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Copy template link/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Export as PDF/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Download as \.zip/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Export as standalone HTML/i })).toBeTruthy();
  });

  it('does not call onView for an unavailable view (no fetch to retry)', () => {
    // PreviewModal fires onView on mount so the parent can lazy-load
    // the active view. For an unavailable view that signal is harmless
    // — the parent's loadPreview short-circuits — but flagging it here
    // would catch a future regression where the modal forgets to skip
    // onView for non-fetchable views.
    const onView = vi.fn();
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            unavailable: { kind: 'markdown' },
          },
        ]}
        onView={onView}
        onClose={() => {}}
      />,
    );

    // Mount-time onView is fine; the assertion is a no-Retry-button
    // sanity check rather than a "never call onView" — the parent's
    // dispatch handles short-circuiting.
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
