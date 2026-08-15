import { describe, expect, test } from 'vitest';

import * as runtime from '../../src/main/runtime.js';

type SplashHtmlRuntime = {
  createPendingHtml?: () => string;
};

function decodeSplashHtml(): string {
  const createPendingHtml = (runtime as SplashHtmlRuntime).createPendingHtml;
  expect(createPendingHtml).toBeTypeOf('function');

  const dataUrl = createPendingHtml?.() ?? '';
  expect(dataUrl).toMatch(/^data:text\/html;charset=utf-8,/);
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

describe('Clean Design startup surface', () => {
  test('renders the brand animation as self-contained SVG and CSS', () => {
    const html = decodeSplashHtml();

    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Clean Design is starting"');
    expect(html).toContain('Clean Design');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('data:video/');
  });

  test('keeps truthful boot progress alongside the decorative animation', () => {
    const html = decodeSplashHtml();

    expect(html).toContain('id="boot-progress-fill"');
    expect(html).toContain('id="boot-stage-step"');
    expect(html).toContain('id="boot-stage-text"');
    expect(html).toContain('aria-live="polite"');
  });
});
