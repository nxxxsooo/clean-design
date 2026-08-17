import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sourceUrl = new URL('../docs/assets/launch/source/product-proof.html', import.meta.url);
const sourceRoot = new URL('../docs/assets/launch/source/', import.meta.url);

test('product proof uses the real local Home capture without baked marketing copy', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /data-export="product-proof"/);
  assert.match(source, /\.\.\/clean-design-home\.webp/);
  assert.doesNotMatch(source, /Your agent can make|Download for|智能体负责创造|下载/);
});

for (const [file, id] of [
  ['agent-workflow.html', 'agent-workflow'],
  ['artifact-world.html', 'artifact-world'],
  ['social-preview.html', 'social-preview'],
]) {
  test(`${id} exposes one deterministic export stage without remote assets`, async () => {
    const source = await readFile(new URL(file, sourceRoot), 'utf8');

    assert.match(source, new RegExp(`data-export="${id}"`));
    assert.doesNotMatch(source, /https?:\/\//);
  });
}

test('agent workflow uses exactly the five supported public runtime marks', async () => {
  const source = await readFile(new URL('agent-workflow.html', sourceRoot), 'utf8');

  for (const runtime of ['codex', 'claude', 'antigravity', 'opencode', 'pi']) {
    assert.match(source, new RegExp(`agent-icons/${runtime}\\.svg`));
  }
  assert.doesNotMatch(source, /byok-opencode/);
});

test('OpenCode runtime mark has a light contrast surface for its dark icon', async () => {
  const styles = await readFile(new URL('public-visuals.css', sourceRoot), 'utf8');

  assert.match(styles, /\.runtime-mark:nth-child\(4\)\s*\{[^}]*background:\s*#f2eee7/s);
});

test('artifact world represents every public artifact family without baked labels', async () => {
  const source = await readFile(new URL('artifact-world.html', sourceRoot), 'utf8');

  for (const family of ['prototype', 'deck', 'document', 'design-system', 'brand', 'image', 'video', 'audio']) {
    assert.match(source, new RegExp(`artifact-${family}`));
  }
  assert.doesNotMatch(source, />\s*(Prototype|Deck|Document|Design system|Brand kit|Image|Video|Audio)\s*</i);
});
