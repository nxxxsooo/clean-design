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

interface ScreenshotLocator {
  screenshot(options: { path: string; type: 'png' }): Promise<unknown>;
}

interface RenderPage {
  goto(url: string, options: { waitUntil: 'load' }): Promise<unknown>;
  waitForFunction(expression: string): Promise<unknown>;
  evaluate(expression: string): Promise<unknown>;
  locator(selector: string): ScreenshotLocator;
}

interface RenderBrowser {
  newPage(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<RenderPage>;
  close(): Promise<void>;
}

interface ChromiumLauncher {
  launch(options: { headless: boolean }): Promise<RenderBrowser>;
}

const { chromium } = requireFromE2e('@playwright/test') as { chromium: ChromiumLauncher };

type VisualFormat = 'webp' | 'jpeg';

interface RenderTarget {
  source: string;
  selector: string;
  output: string;
  width: number;
  height: number;
  format: VisualFormat;
}

const targets: Record<string, RenderTarget> = {
  'product-proof': {
    source: resolve(repoRoot, 'docs/assets/launch/source/product-proof.html'),
    selector: '[data-export="product-proof"]',
    output: resolve(repoRoot, 'docs/assets/launch/clean-design-product-proof-v2.webp'),
    width: 1600,
    height: 900,
    format: 'webp',
  },
  'agent-workflow': {
    source: resolve(repoRoot, 'docs/assets/launch/source/agent-workflow.html'),
    selector: '[data-export="agent-workflow"]',
    output: resolve(repoRoot, 'docs/assets/launch/clean-design-agent-workflow-v2.webp'),
    width: 1600,
    height: 900,
    format: 'webp',
  },
  'artifact-world': {
    source: resolve(repoRoot, 'docs/assets/launch/source/artifact-world.html'),
    selector: '[data-export="artifact-world"]',
    output: resolve(repoRoot, 'docs/assets/launch/clean-design-artifact-world-v2.webp'),
    width: 1600,
    height: 900,
    format: 'webp',
  },
  'social-preview': {
    source: resolve(repoRoot, 'docs/assets/launch/source/social-preview.html'),
    selector: '[data-export="social-preview"]',
    output: resolve(repoRoot, 'docs/assets/launch/github-social-preview-v2.jpg'),
    width: 1280,
    height: 640,
    format: 'jpeg',
  },
};

export async function renderStage({ source, selector, output, width, height, format = 'webp' }: RenderTarget) {
  await mkdir(cacheDir, { recursive: true });
  const png = resolve(cacheDir, `${selector.replace(/[^a-z0-9]+/gi, '-')}.png`);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
    await page.waitForFunction('Array.from(document.images).every((image) => image.complete)');
    await page.evaluate('document.fonts.ready');
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
  let selected: Array<[string, RenderTarget]>;
  if (requested === 'all') {
    selected = Object.entries(targets);
  } else {
    const target = targets[requested];
    if (!target) throw new Error(`Unknown visual target: ${requested}`);
    selected = [[requested, target]];
  }

  for (const [name, target] of selected) {
    await renderStage(target);
    process.stdout.write(`${name}: ${target.output}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
