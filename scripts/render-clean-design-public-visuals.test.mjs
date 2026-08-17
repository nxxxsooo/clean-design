import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sourceUrl = new URL('../docs/assets/launch/source/product-proof.html', import.meta.url);

test('product proof uses the real local Home capture without baked marketing copy', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /data-export="product-proof"/);
  assert.match(source, /\.\.\/clean-design-home\.webp/);
  assert.doesNotMatch(source, /Your agent can make|Download for|智能体负责创造|下载/);
});
