import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = resolve(repoRoot, '.cache/public-visuals');
const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('@playwright/test');

const targets = {
  'product-proof': {
    source: resolve(repoRoot, 'docs/assets/launch/source/product-proof.html'),
    selector: '[data-export="product-proof"]',
    output: resolve(repoRoot, 'docs/assets/launch/clean-design-product-proof-v2.webp'),
    width: 1600,
    height: 900,
    format: 'webp',
  },
};

export async function renderStage({ source, selector, output, width, height, format = 'webp' }) {
  await mkdir(cacheDir, { recursive: true });
  const png = resolve(cacheDir, `${selector.replace(/[^a-z0-9]+/gi, '-')}.png`);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((image) =>
          image.complete ? Promise.resolve() : new Promise((resolveImage) => image.addEventListener('load', resolveImage, { once: true })),
        ),
      );
      await document.fonts.ready;
    });
    await page.locator(selector).screenshot({ path: png, type: 'png' });
  } finally {
    await browser.close();
  }

  await mkdir(dirname(output), { recursive: true });
  if (format === 'webp') {
    await execFileAsync('cwebp', ['-quiet', '-q', '84', '-metadata', 'icc', png, '-o', output]);
  } else {
    await execFileAsync('magick', [png, '-strip', '-colorspace', 'sRGB', '-quality', '88', output]);
  }
  await rm(png, { force: true });
}

async function main() {
  const requested = process.argv[2] ?? 'all';
  const selected = requested === 'all' ? Object.entries(targets) : [[requested, targets[requested]]];
  if (selected.some(([, target]) => !target)) {
    throw new Error(`Unknown visual target: ${requested}`);
  }

  for (const [name, target] of selected) {
    await renderStage(target);
    process.stdout.write(`${name}: ${target.output}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
