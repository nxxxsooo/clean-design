// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { ComposerPlusMenu } from '../../src/components/ComposerPlusMenu';

const plugin = {
  id: 'local-plugin',
  title: 'Local Plugin',
  version: '1.0.0',
  source: 'bundled',
  capabilitiesGranted: [],
} as unknown as InstalledPluginRecord;

afterEach(cleanup);

describe('ComposerPlusMenu local-only surface', () => {
  it('keeps local context actions and omits connector and MCP integrations', () => {
    render(
      <ComposerPlusMenu
        plugins={[plugin]}
        onPickPlugin={vi.fn()}
        skills={[]}
        onPickSkill={vi.fn()}
        connectors={[{
          id: 'slack',
          name: 'Slack',
          provider: 'remote',
          category: 'communication',
          status: 'connected',
          tools: [],
        }]}
        onPickConnector={vi.fn()}
        mcpServers={[{ id: 'remote', enabled: true, transport: 'stdio', command: 'remote' }]}
        onPickMcp={vi.fn()}
        onAttachFiles={vi.fn()}
        triggerTestId="plus-trigger"
      />,
    );

    fireEvent.click(screen.getByTestId('plus-trigger'));

    expect(screen.getByRole('menuitem', { name: 'Attach files' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Plugins' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Connectors/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^MCP/i })).toBeNull();
  });

  it('preserves the editor caret when picking a local plugin', () => {
    const onPickPlugin = vi.fn();
    render(
      <ComposerPlusMenu
        plugins={[plugin]}
        onPickPlugin={onPickPlugin}
        onAttachFiles={vi.fn()}
        triggerTestId="plus-trigger"
      />,
    );

    fireEvent.click(screen.getByTestId('plus-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Plugins' }));
    const row = screen.getByRole('menuitem', { name: 'Local Plugin' });
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(row);
    expect(onPickPlugin).toHaveBeenCalledWith(plugin);
  });
});
