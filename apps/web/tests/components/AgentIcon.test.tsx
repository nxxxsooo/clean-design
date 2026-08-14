import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentIcon } from '../../src/components/AgentIcon';

describe('AgentIcon', () => {
  it('renders the five supported local runtime assets', () => {
    for (const id of ['claude', 'codex', 'antigravity', 'opencode', 'pi']) {
      const markup = renderToStaticMarkup(<AgentIcon id={id} size={24} />);
      expect(markup).toContain(`/agent-icons/${id}.svg`);
      expect(markup).not.toContain('agent-icon-fallback');
    }
  });

  it('renders the monochrome OpenCode mark as a CSS mask', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="opencode" size={24} />);

    expect(markup).toContain('class="agent-icon agent-icon-mono"');
    expect(markup).toContain('mask-image:url(&quot;/agent-icons/opencode.svg&quot;)');
    expect(markup).not.toContain('<img src="/agent-icons/opencode.svg"');
  });

  it('falls back to an initial-letter pill for unknown agents', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="unknown-agent" size={24} />);

    expect(markup).toContain('agent-icon-fallback');
    expect(markup).toContain('>U</span>');
    expect(markup).not.toContain('linear-gradient');
  });
});
