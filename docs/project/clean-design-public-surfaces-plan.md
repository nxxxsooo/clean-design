# Clean Design Public Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a coordinated three-act visual refresh across the Clean Design GitHub README, standalone product landing, and portfolio work page using three new evidence-backed visual assets.

**Architecture:** The Clean Design repository owns the visual-source HTML, renderer, three canonical README assets, and bilingual README structure. The existing `mjshao-portfolio/.worktrees/clean-design-launch` worktree receives versioned delivery derivatives, the standalone HTML composition, and the MDX project record. The two repositories commit and publish independently, but share one verified fact set and one asset lineage.

**Tech Stack:** Node.js 24, pnpm 10.33.2, Playwright 1.60 through the existing `e2e` workspace, HTML/CSS/SVG, ImageMagick/cwebp, GitHub Flavored Markdown and Markdown API, Next.js 15, Once UI MDX, Vercel, Playwright CLI.

## Global Constraints

- Preserve the current application behavior and `v0.1.0` binaries; this is a public-surface refresh only.
- The public product name is always `Clean Design`.
- The supported local CLI list is exactly Codex (`codex`), Claude Code (`claude`), Antigravity (`agy`), OpenCode (`opencode-cli` falling back to `opencode`), and Pi (`pi`).
- BYOK remains a separate provider path, not a sixth local CLI.
- Preserve Apple Silicon-only distribution, ad-hoc signing, non-notarized Gatekeeper guidance, Apache-2.0, manual updates, no account, no hosted workspace, no telemetry, and no automatic updater.
- Use the approved three-act order: product proof → agent workflow → artifact world.
- Use real Clean Design UI or deterministic, inspectable representations for evidence; generated material may support atmosphere only.
- Do not bake headlines, commands, versions, privacy claims, or legal facts into raster images.
- English and Simplified Chinese changes land together.
- Keep `https://mjshao.fun/clean-design/` and `https://mjshao.fun/work/clean-design` stable.
- Preserve `publishedAt: "2026-08-16"` on the portfolio work page.
- Use versioned portfolio asset paths; never replace bytes behind the existing `cover.webp` or `social-preview.jpg` URLs.
- Keep Clean Design and portfolio commits separate and stage only intended files.

## Post-Implementation Asset Correction

The user subsequently identified the exact Act II and Act III masters in the approved comparison image. Public consumers must use `docs/assets/launch/clean-design-workflow.webp` and `docs/assets/launch/clean-design-artifacts.webp`, not the exploratory `clean-design-agent-workflow-v2.webp` and `clean-design-artifact-world-v2.webp` outputs described in the original tasks below. Portfolio delivery copies use `/clean-design/clean-design-workflow.webp` and `/clean-design/clean-design-artifacts.webp`, preserve each source's native `1774×887` ratio, and set rendered image height to `auto`. This correction supersedes conflicting asset names in Tasks 2-5 while retaining the task history.

## File Structure

### Clean Design repository

- Create `docs/assets/launch/source/public-visuals.css` — shared palette, 16:9 stage, product-window, workflow, and artifact-world primitives.
- Create `docs/assets/launch/source/product-proof.html` — Act I real-product composition.
- Create `docs/assets/launch/source/agent-workflow.html` — Act II runtime-to-canvas-to-handoff composition.
- Create `docs/assets/launch/source/artifact-world.html` — Act III format-world composition.
- Create `docs/assets/launch/source/social-preview.html` — dedicated 2:1 share-card composition derived from Act I, not a landing screenshot.
- Create `scripts/render-clean-design-public-visuals.ts` — resolve the existing `e2e` Playwright dependency, render named stages, and invoke `cwebp` or ImageMagick for delivery formats.
- Create `scripts/render-clean-design-public-visuals.test.ts` — verify source IDs, local asset lineage, forbidden baked copy, output dimensions, and file decode.
- Create `docs/assets/launch/clean-design-product-proof-v2.webp` — canonical Act I README delivery.
- Create `docs/assets/launch/clean-design-agent-workflow-v2.webp` — canonical Act II README delivery.
- Create `docs/assets/launch/clean-design-artifact-world-v2.webp` — canonical Act III README delivery.
- Create `docs/assets/launch/github-social-preview-v2.jpg` — dedicated repository/social crop.
- Modify `README.md` — English three-act GitHub reading path.
- Modify `docs/i18n/README.zh-CN.md` — structurally identical Chinese reading path.

### Portfolio worktree

- Create `public/clean-design/clean-design-product-proof-v2.webp` — landing Act I derivative.
- Create `public/clean-design/clean-design-agent-workflow-v2.webp` — landing and work-page Act II derivative.
- Create `public/clean-design/clean-design-artifact-world-v2.webp` — landing and work-page Act III derivative.
- Create `public/images/projects/clean-design/cover-v2.webp` — standalone 16:9 portfolio-card cover.
- Create `public/images/projects/clean-design/social-preview-v2.jpg` — 1280×640 landing/portfolio share card.
- Modify `public/clean-design/index.html` — bilingual standalone landing using the three-act composition.
- Modify `src/app/work/projects/clean-design.mdx` — bilingual project record with three visual proofs and versioned cover.

### Shared visual review workspace

- Create `/Users/mingjian/Documents/sync/Designs/clean-design-public-surfaces/index.html` — persistent review page showing the approved masters, README-width reductions, portfolio-card crop, and social crop.
- Create `/Users/mingjian/Documents/sync/Designs/clean-design-public-surfaces/assets/` — review copies only; production consumers continue to use their repository-owned assets.

---

### Task 1: Reproducible Act I Product-Proof Asset

**Files:**
- Create: `scripts/render-clean-design-public-visuals.test.ts`
- Create: `scripts/render-clean-design-public-visuals.ts`
- Create: `docs/assets/launch/source/public-visuals.css`
- Create: `docs/assets/launch/source/product-proof.html`
- Create: `docs/assets/launch/clean-design-product-proof-v2.webp`

**Interfaces:**
- Consumes: `docs/assets/launch/clean-design-home.webp` as the factual product capture; `e2e/package.json` as the Playwright module-resolution anchor.
- Produces: `renderStage({ source, selector, png, output, width, height, format })` in the renderer and a 1600×900 WebP with the selector `[data-export="product-proof"]`.

- [ ] **Step 1: Write the failing source-contract test**

Create `scripts/render-clean-design-public-visuals.test.ts` with Node's built-in test runner. The first test must require a local source, one export selector, the existing real Home capture, and no baked public headline:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
```

Expected: FAIL with `ENOENT` for `product-proof.html`.

- [ ] **Step 3: Implement the shared visual source and Act I composition**

Create `public-visuals.css` with a fixed 1600×900 `.stage`, warm-white background, graphite product frame, terracotta path/accent, and internal 80-pixel safe area. Create `product-proof.html` as a full document with exactly one export element:

```html
<main class="stage product-proof" data-export="product-proof">
  <div class="paper paper-a" aria-hidden="true"></div>
  <div class="paper paper-b" aria-hidden="true"></div>
  <figure class="product-window">
    <img src="../clean-design-home.webp" alt="" />
  </figure>
  <div class="proof-path" aria-hidden="true"></div>
</main>
```

Keep the real screen at least 72% of the canvas width, raise its contrast, and remove the old washed-out overexposure. Do not add fake macOS controls or marketing text.

- [ ] **Step 4: Implement the deterministic renderer**

Create `scripts/render-clean-design-public-visuals.ts`. Resolve Playwright from the existing `e2e` package and render a selector to PNG before converting to WebP:

```js
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('@playwright/test');
const execFileAsync = promisify(execFile);

export async function renderStage({ source, selector, png, output, width, height, format = 'webp' }) {
  await mkdir(new URL('../.cache/public-visuals/', import.meta.url), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(new URL(source, import.meta.url).href);
  await page.locator(selector).screenshot({ path: png, type: 'png' });
  await browser.close();
  if (format === 'webp') await execFileAsync('cwebp', ['-quiet', '-q', '84', png, '-o', output]);
  else await execFileAsync('magick', [png, '-strip', '-colorspace', 'sRGB', '-quality', '88', output]);
}
```

The executable entry renders Act I to `docs/assets/launch/clean-design-product-proof-v2.webp`. Keep temporary PNGs under `.cache/public-visuals/`, which is already excluded as a dot-directory by the user's global Git ignore.

- [ ] **Step 5: Render and verify Act I**

Run:

```bash
node --experimental-strip-types scripts/render-clean-design-public-visuals.ts product-proof
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
file docs/assets/launch/clean-design-product-proof-v2.webp
magick identify -format '%wx%h %[colorspace]\n' docs/assets/launch/clean-design-product-proof-v2.webp
```

Expected: test PASS; output `1600x900`, sRGB-compatible WebP.

Inspect the full image and a README-width downscale. Reject the asset if Home copy or template cards are unreadable, the product window is less important than paper decoration, or the image still looks overexposed.

- [ ] **Step 6: Commit Act I source and output**

```bash
git add scripts/render-clean-design-public-visuals.ts scripts/render-clean-design-public-visuals.test.ts docs/assets/launch/source/public-visuals.css docs/assets/launch/source/product-proof.html docs/assets/launch/clean-design-product-proof-v2.webp
git commit -m "design: add reproducible Clean Design product proof"
```

### Task 2: Act II Workflow, Act III Artifact World, and Social Source

**Files:**
- Modify: `scripts/render-clean-design-public-visuals.test.ts`
- Modify: `scripts/render-clean-design-public-visuals.ts`
- Modify: `docs/assets/launch/source/public-visuals.css`
- Create: `docs/assets/launch/source/agent-workflow.html`
- Create: `docs/assets/launch/source/artifact-world.html`
- Create: `docs/assets/launch/source/social-preview.html`
- Create: `docs/assets/launch/clean-design-agent-workflow-v2.webp`
- Create: `docs/assets/launch/clean-design-artifact-world-v2.webp`
- Create: `docs/assets/launch/github-social-preview-v2.jpg`

**Interfaces:**
- Consumes: `renderStage(...)`, the five SVG files under `apps/web/public/agent-icons/`, and the accepted Act I palette and geometry.
- Produces: two 1600×900 WebPs and one 1280×640 JPEG. The renderer accepts `product-proof`, `agent-workflow`, `artifact-world`, `social-preview`, and `all` CLI targets.

- [ ] **Step 1: Extend the tests before adding sources**

Add source cases and output metadata assertions:

```js
const sources = [
  ['agent-workflow.html', 'agent-workflow'],
  ['artifact-world.html', 'artifact-world'],
  ['social-preview.html', 'social-preview'],
];

for (const [file, id] of sources) {
  test(`${id} exposes one deterministic export stage`, async () => {
    const source = await readFile(new URL(`../docs/assets/launch/source/${file}`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`data-export="${id}"`));
    assert.doesNotMatch(source, /https?:\/\//);
  });
}
```

The workflow test additionally requires all five local SVG paths and forbids `byok-opencode`. The artifact-world test requires eight semantic class names: `prototype`, `deck`, `document`, `design-system`, `brand`, `image`, `video`, and `audio`.

- [ ] **Step 2: Run the extended tests to verify they fail**

Run:

```bash
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
```

Expected: Act I test PASS and new source tests FAIL with `ENOENT`.

- [ ] **Step 3: Build Act II as a real relationship graphic**

Create `agent-workflow.html` on the dark field. Use the five repository SVGs in one restrained source cluster, one prompt/composer object, a large central canvas object, and one handoff folder. Connect them with a single terracotta path. The DOM must keep concepts separate:

```html
<main class="stage agent-workflow" data-export="agent-workflow">
  <div class="runtime-cluster">
    <img src="../../../../apps/web/public/agent-icons/codex.svg" alt="" />
    <img src="../../../../apps/web/public/agent-icons/claude.svg" alt="" />
    <img src="../../../../apps/web/public/agent-icons/antigravity.svg" alt="" />
    <img src="../../../../apps/web/public/agent-icons/opencode.svg" alt="" />
    <img src="../../../../apps/web/public/agent-icons/pi.svg" alt="" />
  </div>
  <div class="composer-object" aria-hidden="true">
    <span class="composer-plus">+</span>
    <span class="composer-line"></span>
    <span class="composer-send">→</span>
  </div>
  <div class="canvas-object" aria-hidden="true">
    <span class="canvas-sidebar"></span>
    <span class="canvas-artboard"></span>
    <span class="canvas-inspector"></span>
  </div>
  <div class="handoff-object" aria-hidden="true">
    <span class="handoff-folder"></span>
    <span class="handoff-sheet handoff-sheet-a"></span>
    <span class="handoff-sheet handoff-sheet-b"></span>
  </div>
  <svg class="workflow-line" viewBox="0 0 1600 900" aria-hidden="true">
    <path d="M 270 410 C 430 410 430 250 610 250 S 850 450 1010 450 S 1190 620 1360 620" />
  </svg>
</main>
```

Do not place command names or marketing claims inside the raster. Runtime identity comes from the existing marks; exact commands remain live text on the consuming surfaces.

- [ ] **Step 4: Build Act III as a purpose-made format world**

Create `artifact-world.html` as a studio spread of eight code-native objects: prototype browser, deck stack, document pages, design-system board, brand card, image frame, video timeline, and audio waveform. Use no upstream brand name or template title. The objects should read at README width through silhouette, scale, and one consistent light source rather than microscopic labels.

- [ ] **Step 5: Build the dedicated social composition**

Create `social-preview.html` at 1280×640 using the product-proof source treatment with a larger real product crop and generous left or top negative space. Do not screenshot the landing and do not bake the project name unless the typography can be inspected as final artwork; live surrounding metadata remains the primary naming surface.

- [ ] **Step 6: Extend the renderer and render the family**

Add the three target definitions and an `all` loop. Run:

```bash
node --experimental-strip-types scripts/render-clean-design-public-visuals.ts all
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
magick identify docs/assets/launch/clean-design-*-v2.webp docs/assets/launch/github-social-preview-v2.jpg
```

Expected: WebPs are 1600×900; JPEG is 1280×640; all decode successfully.

- [ ] **Step 7: Build the persistent review page and inspect the family together**

Create `/Users/mingjian/Documents/sync/Designs/clean-design-public-surfaces/index.html` with four labeled rows: full-width three-act family, 720-pixel README simulation, 360-pixel portfolio-card crop, and 1280×640 social preview. Copy review-only derivatives into its `assets/` directory. Inspect the page in a browser at desktop and narrow widths. Confirm one palette and hierarchy, distinct jobs for each image, legible silhouette at small size, and no visual suggestion of hosted collaboration or simultaneous multi-agent orchestration.

- [ ] **Step 8: Commit the complete canonical visual family**

```bash
git add scripts/render-clean-design-public-visuals.ts scripts/render-clean-design-public-visuals.test.ts docs/assets/launch/source docs/assets/launch/clean-design-agent-workflow-v2.webp docs/assets/launch/clean-design-artifact-world-v2.webp docs/assets/launch/github-social-preview-v2.jpg
git commit -m "design: add Clean Design workflow and artifact visuals"
```

### Task 3: Bilingual GitHub README Three-Act Refresh

**Files:**
- Modify: `README.md`
- Modify: `docs/i18n/README.zh-CN.md`

**Interfaces:**
- Consumes: the three canonical v2 WebPs and the verified shared product source of truth.
- Produces: structurally paired English and Chinese GFM documents with stable download, release, privacy, license, and development paths.

- [ ] **Step 1: Write a failing structural assertion**

Add a test to `scripts/render-clean-design-public-visuals.test.ts` that reads both READMEs and expects the three v2 images, no section-accent SVG, and no old value-label SVG references:

```js
for (const readme of ['README.md', 'docs/i18n/README.zh-CN.md']) {
  test(`${readme} uses the three-act v2 visual family`, async () => {
    const text = await readFile(new URL(`../${readme}`, import.meta.url), 'utf8');
    for (const asset of ['clean-design-product-proof-v2.webp', 'clean-design-agent-workflow-v2.webp', 'clean-design-artifact-world-v2.webp']) {
      assert.match(text, new RegExp(asset));
    }
    assert.doesNotMatch(text, /section-accent\.svg|value-(?:local-default|no-account|agent-key)/);
  });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
```

Expected: image-reference assertions FAIL against both current READMEs.

- [ ] **Step 3: Rewrite the English first decision surface**

Use this order: name and language switch, direct literal promise, three badges, existing versioned download SVG link, Act I image, concise explanation, and three live proof statements. Remove the license badge from the hero and keep license live in the legal section.

- [ ] **Step 4: Build the English Act II and Act III sections**

Place `clean-design-agent-workflow-v2.webp` before the exact runtime table and BYOK note. Place `clean-design-artifact-world-v2.webp` before the eight live artifact-family labels. Replace the duplicate old workflow code block with concise prose.

- [ ] **Step 5: Compress the remaining English reference depth**

Keep local/privacy boundaries, download/checksum/Gatekeeper/manual-update guidance, local development commands, provenance, and license. Use one GitHub-native `> [!IMPORTANT]` callout for non-notarized Gatekeeper guidance and no decorative section labels.

- [ ] **Step 6: Apply the identical structure in Simplified Chinese**

Translate the approved promise and section copy while preserving exact commands, paths, version, and link targets. Verify translated anchors from the Chinese document rather than copying English anchor fragments.

- [ ] **Step 7: Render both files through GitHub's Markdown API**

Run each file through stdin so long content is not truncated:

```bash
jq -n --rawfile text README.md '{text:$text,mode:"gfm",context:"nxxxsooo/clean-design"}' | gh api markdown --input - > /Users/mingjian/.cache/clean-design-readme-en.html
jq -n --rawfile text docs/i18n/README.zh-CN.md '{text:$text,mode:"gfm",context:"nxxxsooo/clean-design"}' | gh api markdown --input - > /Users/mingjian/.cache/clean-design-readme-zh.html
```

Inspect rendered images, table markup, alerts, and links in both outputs.

- [ ] **Step 8: Run focused and repository checks**

```bash
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
pnpm guard
pnpm typecheck
git diff --check
```

Expected: all PASS.

- [ ] **Step 9: Commit the GitHub public-surface refresh**

```bash
git add README.md docs/i18n/README.zh-CN.md scripts/render-clean-design-public-visuals.test.ts
git commit -m "docs: refresh Clean Design GitHub landing"
```

### Task 4: Portfolio Asset Derivatives and Standalone Landing

**Files:**
- Create: `public/clean-design/clean-design-product-proof-v2.webp`
- Create: `public/clean-design/clean-design-agent-workflow-v2.webp`
- Create: `public/clean-design/clean-design-artifact-world-v2.webp`
- Create: `public/images/projects/clean-design/cover-v2.webp`
- Create: `public/images/projects/clean-design/social-preview-v2.jpg`
- Modify: `public/clean-design/index.html`

**Interfaces:**
- Consumes: the four canonical Clean Design repository outputs and shared fact set.
- Produces: local, versioned portfolio assets; a bilingual standalone landing with stable `/clean-design/` route, persistent language toggle, reduced-motion fallback, and direct current-release download.

- [ ] **Step 1: Load required landing and image-delivery workflows**

Before editing, load `design-taste-frontend`, declare redesign mode and visual dials from the approved direction, then load `image-pipeline` before copying or transforming raster delivery assets. Do not introduce a framework or runtime CDN.

- [ ] **Step 2: Create versioned local delivery derivatives**

Copy the three approved 1600×900 WebPs into `public/clean-design/` under the exact v2 names. Create a standalone 1440×810 cover from the product-proof master and a 1280×640 JPEG from the dedicated social source. Keep sRGB and inspect source detail before accepting the files.

Run:

```bash
magick identify public/clean-design/clean-design-*-v2.webp public/images/projects/clean-design/cover-v2.webp public/images/projects/clean-design/social-preview-v2.jpg
shasum -a 256 public/clean-design/clean-design-*-v2.webp public/images/projects/clean-design/cover-v2.webp public/images/projects/clean-design/social-preview-v2.jpg
```

- [ ] **Step 3: Add a failing static surface check**

Before changing HTML, confirm the current landing lacks the new asset paths and approved promise:

```bash
rg -n 'clean-design-(product-proof|agent-workflow|artifact-world)-v2|Your agent can make' public/clean-design/index.html
```

Expected: no matches.

- [ ] **Step 4: Recompose the hero and proof strip**

Keep the existing semantic header and language toggle. Replace the hero copy with the approved bilingual promise, keep direct `v0.1.0` DMG and GitHub actions, use the new product-proof asset, and replace giant decorative numbers with three compact facts: existing agents, editable local projects, and portable handoff.

- [ ] **Step 5: Implement the Act II dark workflow field**

Create a full-width dark section containing the Act II image, five live runtime names, exact accessible labels, and a short BYOK note. Add a single workflow-path reveal using `IntersectionObserver`; set the completed state immediately when `prefers-reduced-motion: reduce` matches.

- [ ] **Step 6: Implement the Act III artifact field**

Create a full-width warm section containing the Act III image and eight live bilingual artifact-family labels. Keep the image full-width on mobile; do not reduce it to a two-column thumbnail.

- [ ] **Step 7: Tighten local/open and final download sections**

Keep two objection cards for local ownership and inspectable/open handoff. State no account, no telemetry, no automatic updater, ad-hoc signing, non-notarized Gatekeeper guidance, and manual update semantics as live copy. Keep the final direct DMG action and Release-notes action.

- [ ] **Step 8: Update SEO and social metadata**

Align title, description, and bilingual document title with the shared literal promise. Update `og:image` to `/images/projects/clean-design/social-preview-v2.jpg`. Preserve favicon and theme-color ownership.

- [ ] **Step 9: Run local static checks and production build**

```bash
rg -n 'clean-design-(product-proof|agent-workflow|artifact-world)-v2|Your agent can make|智能体负责创造' public/clean-design/index.html
npm run build
git diff --check
```

Expected: all required paths and both language promises match; Next.js build PASS.

- [ ] **Step 10: Visually verify the local landing**

Serve the production build and use Playwright at `1440×1000` and `390×844`. Verify English and Chinese, keyboard focus, language persistence, reduced motion, no horizontal overflow, direct download, GitHub link, and full-width legibility of all three images.

- [ ] **Step 11: Commit the standalone landing refresh**

```bash
git add public/clean-design/index.html public/clean-design/clean-design-*-v2.webp public/images/projects/clean-design/cover-v2.webp public/images/projects/clean-design/social-preview-v2.jpg
git commit -m "refresh: redesign Clean Design product landing"
```

### Task 5: Bilingual Portfolio Work Page

**Files:**
- Modify: `src/app/work/projects/clean-design.mdx`

**Interfaces:**
- Consumes: `/images/projects/clean-design/cover-v2.webp`, the three `/clean-design/*-v2.webp` assets, and the shared product source of truth.
- Produces: a bilingual MDX project record at the existing `/work/clean-design` route.

- [ ] **Step 1: Record current frontmatter invariants**

Run:

```bash
rg -n 'publishedAt: "2026-08-16"|link: "/clean-design/"|github: "https://github.com/nxxxsooo/clean-design"' src/app/work/projects/clean-design.mdx
```

Expected: all three invariants match before editing.

- [ ] **Step 2: Update frontmatter without changing publication date**

Change the summary to the shared literal product explanation and change the image to `/images/projects/clean-design/cover-v2.webp`. Preserve creator, link, GitHub, live URL, and original date.

- [ ] **Step 3: Write the English three-act project record**

Use concise sections: What it is, Why it exists, Product proof, Bring your own agent, Make more than screens, Local boundaries, Distribution, and Links. Insert standard Markdown images using the three versioned `/clean-design/` asset paths and descriptive English alt text.

- [ ] **Step 4: Write the structurally paired Chinese record**

After a horizontal divider, repeat the same evidence and section order in natural Chinese. Keep commands, URLs, version, license, and signing state exact. Do not use blog-only `<En>` or `<Cn>` components.

- [ ] **Step 5: Build and inspect the work page**

```bash
npm run build
git diff --check
```

Run the production server and inspect `/work/clean-design` at desktop and mobile widths. Verify the cover crop, all three inline images, headings, Related Projects boundary, GitHub link, Product website link, and Latest release link.

- [ ] **Step 6: Commit the portfolio record**

```bash
git add src/app/work/projects/clean-design.mdx
git commit -m "refresh: expand Clean Design work page"
```

### Task 6: Cross-Surface Verification, Publication, and Deployment

**Files:**
- Verify only; repair files from Tasks 1–5 only when a concrete failure is found.

**Interfaces:**
- Consumes: green commits in both repositories and the current public `v0.1.0` Release.
- Produces: fast-forwarded public branches, deployed Vercel pages, and evidence from the real GitHub and mjshao.fun URLs.

- [ ] **Step 1: Load verification and deployment workflows**

Load `superpowers:verification-before-completion` before any success claim. Use `deploy-to-vercel` for the existing portfolio deployment path, preserving the Git-connected project and canonical domain.

- [ ] **Step 2: Re-run the Clean Design repository acceptance set**

```bash
node --experimental-strip-types --test scripts/render-clean-design-public-visuals.test.ts
pnpm guard
pnpm typecheck
git diff --check
git status --short
```

Expected: all PASS and no unintended files.

- [ ] **Step 3: Re-run the portfolio acceptance set**

```bash
npm run build
git diff --check
git status --short
```

Expected: build PASS and no unintended files. Inspect the committed path set because the favicon prebuild hook may stage unrelated landing assets; remove only unintended staged paths before any corrective amend.

- [ ] **Step 4: Verify remote bases before publication**

In each repository, fetch `origin`, confirm local commits descend from current `origin/main`, and stop on divergence. Do not force-push or rewrite shared history.

- [ ] **Step 5: Publish the Clean Design repository**

Push the current Clean Design branch to `origin/main` as a fast-forward. Verify the remote SHA and open the actual GitHub repository page. Inspect README desktop and narrow widths, image decode, English/Chinese language links, alerts, table, download action, and dark/light themes.

- [ ] **Step 6: Update GitHub metadata only where callable**

Confirm About description, topics, website, and latest Release still match the SSOT. Upload or set the new GitHub social preview only if the authenticated GitHub surface exposes a supported write path; otherwise retain the prepared `github-social-preview-v2.jpg` and report the exact upload gap without blocking README publication.

- [ ] **Step 7: Publish and deploy the portfolio repository**

Push `codex/clean-design-launch` to `origin/main` as a fast-forward. Use the repository's existing Vercel project and Git-connected production path. If the webhook does not produce the canonical deployment, use the diagnosed `deploy-to-vercel` fallback without creating a second project.

- [ ] **Step 8: Verify the two canonical website URLs**

Use Playwright against:

- `https://mjshao.fun/clean-design/`;
- `https://mjshao.fun/work/clean-design`.

Capture desktop `1440×1000` and mobile `390×844` screenshots. On the landing, test EN/中文 toggle, keyboard focus, reduced motion, direct DMG, GitHub, and Release links. On the work page, test the versioned cover/currentSrc, three inline images, product website, repository, and release links.

- [ ] **Step 9: Verify public asset bytes and shared facts**

Fetch every versioned public asset, confirm HTTP 200, dimensions, decode, and SHA-256 against the committed local file. Compare public text across GitHub, landing, and work page for product name, five runtimes, Apple Silicon, `v0.1.0`, no account, local projects, signing/notarization, manual updates, Apache-2.0, and canonical URLs.

- [ ] **Step 10: Stop the brainstorming companion and clean ignored session state**

After the public result is verified, stop the visual-companion server using its recorded session directory. Remove only the ignored `.superpowers/brainstorm/21572-1786958254` session after preserving any approved mockup evidence in the design document or `Designs/clean-design-public-surfaces/` review output.

- [ ] **Step 11: Record final evidence**

Report exactly four fields in Chinese: 变更、验证、未验证、剩余风险. Include both repository SHAs, the three public URLs, asset paths, the latest Release URL, deployment result, and any uncallable GitHub social-preview step.
