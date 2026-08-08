// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { PluginShareMenu } from '../../src/components/plugin-details/PluginShareMenu';

function record(): InstalledPluginRecord {
  return {
    id: 'local-plugin',
    title: 'Local Plugin',
    version: '0.1.0',
    sourceKind: 'github',
    source: 'github:owner/repo',
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: 'local-plugin',
      version: '0.1.0',
      title: 'Local Plugin',
      homepage: 'https://example.test/plugin',
      od: { kind: 'scenario' },
    },
    fsPath: '/tmp/local-plugin',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('PluginShareMenu local-only actions', () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn(async () => undefined);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    writeText.mockClear();
  });

  it('keeps local identity and explicit source links without hosted actions', async () => {
    act(() => root.render(<PluginShareMenu record={record()} />));
    const trigger = container.querySelector<HTMLButtonElement>('.plugin-share-trigger');
    act(() => trigger?.click());

    const labels = Array.from(container.querySelectorAll('.plugin-share-item'))
      .map((item) => item.textContent ?? '');
    expect(labels).toContain('Copy plugin ID');
    expect(labels).toContain('Open source on GitHub');
    expect(labels).toContain('Open homepage');
    expect(labels.join(' ')).not.toMatch(/install command|README badge|marketplace/i);

    const copy = Array.from(container.querySelectorAll<HTMLButtonElement>('button.plugin-share-item'))
      .find((item) => item.textContent?.includes('Copy plugin ID'));
    await act(async () => copy?.click());
    expect(writeText).toHaveBeenCalledWith('local-plugin');

    expect(container.querySelector<HTMLAnchorElement>('a[href="https://github.com/owner/repo"]')).toBeTruthy();
    expect(container.querySelector<HTMLAnchorElement>('a[href="https://example.test/plugin"]')).toBeTruthy();
  });
});
