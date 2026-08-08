import { describe, expect, it } from 'vitest';
import { buildPath, parseRoute } from '../src/router';

describe('local-only router', () => {
  it('keeps local creation routes available', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home', view: 'home' });
    expect(parseRoute('/projects')).toEqual({ kind: 'home', view: 'projects' });
    expect(parseRoute('/design-systems')).toEqual({ kind: 'home', view: 'design-systems' });
    expect(parseRoute('/projects/abc')).toEqual({
      kind: 'project',
      projectId: 'abc',
      conversationId: null,
      fileName: null,
    });
  });

  it.each([
    '/onboarding',
    '/automations',
    '/tasks',
    '/plugins',
    '/plugins/example',
    '/integrations',
    '/marketplace',
    '/marketplace/example',
  ])('redirects removed route %s to Home', (path) => {
    expect(parseRoute(path)).toEqual({ kind: 'home', view: 'home' });
  });

  it('never builds a removed route', () => {
    expect(buildPath({ kind: 'home', view: 'onboarding' })).toBe('/');
    expect(buildPath({ kind: 'home', view: 'plugins' })).toBe('/');
    expect(buildPath({ kind: 'marketplace' })).toBe('/');
    expect(buildPath({ kind: 'marketplace-detail', pluginId: 'example' })).toBe('/');
  });
});
