// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';

const selectHostHandoffRoot = vi.fn();
const copyToClipboard = vi.fn();

vi.mock('@open-design/host', () => ({
  selectHostHandoffRoot: (...args: unknown[]) => selectHostHandoffRoot(...args),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboard(...args),
}));

const success = {
  ok: true,
  packetPath: '/Users/test/Handoffs/landing/20260809-123456-abcd1234',
  prompt: '# Implement the approved Clean Design reference',
  manifest: {
    schemaVersion: 1,
    packetId: '20260809-123456-abcd1234',
    createdAt: '2026-08-09T12:34:56.000Z',
    project: { id: 'p1', name: 'Landing', slug: 'landing', kind: 'prototype' },
    viewports: [],
    files: [],
    warnings: [],
  },
  warnings: [],
};

function stubExport(options: { configured: boolean; packet?: unknown } = { configured: true }) {
  const packet = options.packet ?? success;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/handoff-root') && !init?.method) {
      return new Response(JSON.stringify({ configured: options.configured, displayName: 'Handoffs' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/handoff-packet') && init?.method === 'POST') {
      return new Response(JSON.stringify(packet), {
        status: 'ok' in (packet as object) && (packet as { ok?: boolean }).ok === false ? 409 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  selectHostHandoffRoot.mockReset();
  copyToClipboard.mockReset();
});

describe('HandoffButton deterministic export', () => {
  it('chooses a trusted root once when the project has none, then creates a packet', async () => {
    const fetchMock = stubExport({ configured: false });
    selectHostHandoffRoot.mockResolvedValue({ ok: true, displayName: 'Handoffs' });
    copyToClipboard.mockResolvedValue(true);
    render(<HandoffButton projectId="p1" />);

    fireEvent.click(screen.getByTestId('handoff-trigger'));

    await waitFor(() => expect(selectHostHandoffRoot).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/handoff-packet',
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(await screen.findByText('Handoff exported')).toBeTruthy();
    expect(copyToClipboard).toHaveBeenCalledWith(success.prompt);
  });

  it('keeps the packet and exposes selectable prompt text when clipboard copy fails', async () => {
    stubExport();
    copyToClipboard.mockResolvedValue(false);
    render(<HandoffButton projectId="p1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose handoff folder' }).getAttribute('title')).toContain('Handoffs'));
    fireEvent.click(screen.getByTestId('handoff-trigger'));

    const fallback = await screen.findByRole('textbox');
    expect((fallback as HTMLTextAreaElement).value).toBe(success.prompt);
    expect(screen.getByText(success.packetPath)).toBeTruthy();
    fireEvent.focus(fallback);
    expect((fallback as HTMLTextAreaElement).selectionEnd).toBe(success.prompt.length);
  });

  it('renders stable packet failures and clears an unavailable saved root', async () => {
    stubExport({
      configured: true,
      packet: { ok: false, code: 'root_unavailable', message: 'volume was disconnected' },
    });
    render(<HandoffButton projectId="p1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose handoff folder' }).getAttribute('title')).toContain('Handoffs'));
    fireEvent.click(screen.getByTestId('handoff-trigger'));

    expect(await screen.findByRole('alert')).toHaveTextContent('The saved handoff folder is unavailable');
    expect(screen.getByRole('button', { name: 'Choose handoff folder' }).getAttribute('title')).toBe('Choose handoff folder');
  });
});
