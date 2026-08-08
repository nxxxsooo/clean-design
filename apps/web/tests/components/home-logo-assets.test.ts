import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const homeHeroSource = read('../../src/components/HomeHero.tsx');
const entryNavRailSource = read('../../src/components/EntryNavRail.tsx');
const primitivesCss = read('../../src/styles/primitives.css');
const logoPng = readFileSync(new URL('../../public/logo.png', import.meta.url));
const appIconPng = readFileSync(new URL('../../public/app-icon.png', import.meta.url));

function isPng(value: Buffer): boolean {
  return value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

describe('Home logo assets', () => {
  it('ships bitmap Clean Design marks for the browser and desktop', () => {
    expect(isPng(logoPng)).toBe(true);
    expect(isPng(appIconPng)).toBe(true);
  });

  it('renders the Clean Design mark on both Home entry surfaces', () => {
    expect(primitivesCss).toContain('url(/logo.png)');
    expect(primitivesCss).not.toContain('brand-icon.svg');
    expect(homeHeroSource).toContain('od-brand-glyph');
    expect(entryNavRailSource).toContain('od-brand-glyph');
  });
});
