// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HandoffButton surface', () => {
  it('uses one visible export command and a compact native-folder control', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ configured: false }))));
    render(<HandoffButton projectId="project-1" />);

    const trigger = screen.getByTestId('handoff-trigger');
    expect(trigger.textContent).toContain('Export handoff');
    expect(trigger.getAttribute('title')).toBe('Export immutable handoff packet');
    expect(screen.getByRole('button', { name: 'Choose handoff folder' })).toBeTruthy();
  });

  it('styles packet paths and clipboard fallback text without resizing the toolbar', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.app .handoff-split');
    expect(css).toContain('.app .handoff-export-path');
    expect(css).toContain('overflow-wrap: anywhere;');
    expect(css).toContain('.app .handoff-prompt-fallback');
    expect(css).toContain('min-height: 180px;');
  });
});
