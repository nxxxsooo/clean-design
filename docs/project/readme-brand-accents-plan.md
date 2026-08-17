# README Brand Accents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restrained, semantic Clean Design color layer to both public README variants through nine local SVG assets while preserving all verified copy, links, headings, commands, and GitHub behavior.

**Architecture:** Static SVG assets under `docs/assets/readme/` provide branded labels, one reusable section rule, and language-specific download CTAs. The English and Chinese README files consume those assets through relative paths while all explanatory content and section headings remain semantic Markdown. Verification uses XML checks, GitHub's Markdown API, Node 24 repository gates, and public Chromium inspection.

**Tech Stack:** SVG 1.1-compatible markup, GitHub Flavored Markdown and sanitized HTML, GitHub Markdown API, ImageMagick or browser rasterization for visual QA, Playwright CLI, Node.js 24.19.0, pnpm 10.33.2.

## Global Constraints

- Use only `#f7f3ed`, `#191816`, `#6d6962`, and `#df5d36` inside the new SVG assets.
- Do not add CSS, JavaScript, remote image services, dynamic SVG behavior, gradients, filters, or embedded raster data.
- Preserve every current product, runtime, release, installation, privacy, provenance, and license claim byte-for-byte except for punctuation or wrapper markup required by the new visual treatment.
- Preserve every Markdown H2 string so GitHub anchors and Outline entries remain stable.
- Keep English and Chinese structure aligned in the same implementation commit.
- The primary download link remains `https://github.com/nxxxsooo/clean-design/releases/latest`.
- Final repository gates run with Node.js 24.19.0 and pnpm 10.33.2.

---

### Task 1: Create the Brand Accent SVG Set

**Files:**
- Create: `docs/assets/readme/section-accent.svg`
- Create: `docs/assets/readme/value-local-default-en.svg`
- Create: `docs/assets/readme/value-no-account-en.svg`
- Create: `docs/assets/readme/value-agent-key-en.svg`
- Create: `docs/assets/readme/value-local-default-zh.svg`
- Create: `docs/assets/readme/value-no-account-zh.svg`
- Create: `docs/assets/readme/value-agent-key-zh.svg`
- Create: `docs/assets/readme/download-macos-en.svg`
- Create: `docs/assets/readme/download-macos-zh.svg`

**Interfaces:**
- Consumes: the palette and copy in `docs/project/readme-brand-accents-design.md`.
- Produces: relative SVG paths used by both README files; every asset has a fixed `viewBox`, explicit width and height, and no external references.

- [ ] **Step 1: Prove the asset inventory is absent before implementation**

Run:

```bash
for file in \
  section-accent.svg \
  value-local-default-en.svg value-no-account-en.svg value-agent-key-en.svg \
  value-local-default-zh.svg value-no-account-zh.svg value-agent-key-zh.svg \
  download-macos-en.svg download-macos-zh.svg; do
  test ! -e "docs/assets/readme/$file"
done
```

Expected: exit `0`; no planned file exists yet.

- [ ] **Step 2: Create the reusable section accent**

Create `section-accent.svg` as a `112×6` transparent SVG with a `32×6` orange rounded segment followed by a `72×2` stone segment centered vertically. It contains no text and no background rectangle.

- [ ] **Step 3: Create the six value labels**

Use a shared geometry of height `24`, corner radius `6`, a `2` px left orange signal bar, an ink surface, and warm-paper text. Use `Arial, Helvetica, sans-serif`, weight `700`, letter spacing `0.7`, and font size `11` for English or `12` for Chinese.

Use these fixed widths and visible strings:

| File | Width | Text |
|---|---:|---|
| `value-local-default-en.svg` | 132 | `LOCAL BY DEFAULT` |
| `value-no-account-en.svg` | 108 | `NO ACCOUNT` |
| `value-agent-key-en.svg` | 136 | `YOUR AGENT OR KEY` |
| `value-local-default-zh.svg` | 88 | `默认本地` |
| `value-no-account-zh.svg` | 88 | `无需账户` |
| `value-agent-key-zh.svg` | 112 | `智能体或密钥` |

- [ ] **Step 4: Create the two download CTAs**

Create a `360×48` English SVG and a `312×48` Chinese SVG. Each uses an orange rounded rectangle with radius `10`, a `2` px ink bottom-right offset shadow, warm-paper centered text, and an ink arrow circle on the right. Use `Arial, Helvetica, sans-serif`, weight `700`, and font size `15`.

Visible strings:

```text
Download for Apple Silicon Mac
下载 Apple 芯片 Mac 版本
```

The arrow is a geometric path inside the SVG rather than a text glyph.

- [ ] **Step 5: Validate SVG structure and palette**

Run:

```bash
find docs/assets/readme -name '*.svg' -print0 | xargs -0 -n1 xmllint --noout
test "$(find docs/assets/readme -name '*.svg' | wc -l | tr -d ' ')" = 9
unexpected=$(rg -o '#[0-9A-Fa-f]{6}' docs/assets/readme/*.svg | sed 's/.*://' | tr 'A-F' 'a-f' | sort -u | rg -v '^#(f7f3ed|191816|6d6962|df5d36)$' || true)
test -z "$unexpected"
! rg -n '<script|<foreignObject|data:|https?://|url\(|linearGradient|radialGradient|filter=' docs/assets/readme/*.svg
```

Expected: nine valid XML files, only the four approved colors, and no dynamic or remote content.

- [ ] **Step 6: Render a visual contact sheet**

Render the nine SVGs against both `#ffffff` and `#0d1117` backgrounds into a temporary directory, assemble a contact sheet, and inspect it at native size and 390 px width. Do not add the contact sheet to Git.

Expected: readable labels, visually centered CTA text, no clipping, and stable contrast on both GitHub themes.

- [ ] **Step 7: Commit the asset slice**

```bash
git add docs/assets/readme
git commit -m "docs: add README brand accent assets"
```

---

### Task 2: Apply the Accent System to Both README Variants

**Files:**
- Modify: `README.md`
- Modify: `docs/i18n/README.zh-CN.md`

**Interfaces:**
- Consumes: all nine SVG paths from Task 1.
- Produces: two structurally aligned public README files whose primary download links, headings, table, code blocks, and verified explanatory copy remain intact.

- [ ] **Step 1: Capture pre-change structural facts**

Run:

```bash
test "$(rg -c '^## ' README.md)" = "$(rg -c '^## ' docs/i18n/README.zh-CN.md)"
test "$(rg -c 'img.shields.io' README.md)" = 4
test "$(rg -c 'img.shields.io' docs/i18n/README.zh-CN.md)" = 4
! rg -n 'docs/assets/readme' README.md docs/i18n/README.zh-CN.md
```

Expected: both variants have the same H2 count, retain four existing shields, and do not yet reference the accent assets.

- [ ] **Step 2: Replace the English summary bullets**

Replace only the three opening bullets with three compact HTML paragraphs. Each paragraph starts with the corresponding SVG at height `24`, uses a descriptive alt matching the label, and preserves the current explanatory sentence as normal text immediately after it.

Use paths rooted from `README.md`:

```text
docs/assets/readme/value-local-default-en.svg
docs/assets/readme/value-no-account-en.svg
docs/assets/readme/value-agent-key-en.svg
```

- [ ] **Step 3: Replace the Chinese summary bullets**

Apply the same structure with paths rooted from `docs/i18n/README.zh-CN.md`:

```text
../../docs/assets/readme/value-local-default-zh.svg
../../docs/assets/readme/value-no-account-zh.svg
../../docs/assets/readme/value-agent-key-zh.svg
```

Keep the existing Chinese explanatory sentences unchanged.

- [ ] **Step 4: Replace the two plain download links with CTA images**

Keep the existing `<a href="https://github.com/nxxxsooo/clean-design/releases/latest">` wrappers. Replace only their bold text children with the matching English or Chinese CTA `<img>` element. Set descriptive alt text to the full visible action and set width to the SVG's intrinsic width.

- [ ] **Step 5: Add the reusable section accent to four sections per language**

Insert the section accent immediately after these headings and before the next paragraph:

```text
Bring your own agent / 使用你自己的智能体
What you can make / 可以做什么
Download / 下载
Privacy / 隐私
```

Use an HTML image with `alt=""` and `width="112"`. Do not alter the heading strings.

- [ ] **Step 6: Run local structural checks**

Run:

```bash
git diff --check
test "$(rg -c '^## ' README.md)" = "$(rg -c '^## ' docs/i18n/README.zh-CN.md)"
test "$(rg -c 'section-accent.svg' README.md)" = 4
test "$(rg -c 'section-accent.svg' docs/i18n/README.zh-CN.md)" = 4
test "$(rg -c 'value-.*-en.svg' README.md)" = 3
test "$(rg -c 'value-.*-zh.svg' docs/i18n/README.zh-CN.md)" = 3
test "$(rg -c 'download-macos-en.svg' README.md)" = 1
test "$(rg -c 'download-macos-zh.svg' docs/i18n/README.zh-CN.md)" = 1
test "$(rg -c 'img.shields.io' README.md)" = 4
test "$(rg -c 'img.shields.io' docs/i18n/README.zh-CN.md)" = 4
```

Expected: aligned structure, four section accents, three labels, one CTA, and no additional shields in each variant.

- [ ] **Step 7: Commit the README slice**

```bash
git add README.md docs/i18n/README.zh-CN.md
git commit -m "docs: add semantic README color accents"
```

---

### Task 3: Verify, Publish, and Inspect the Public Result

**Files:**
- Verify: `README.md`
- Verify: `docs/i18n/README.zh-CN.md`
- Verify: `docs/assets/readme/*.svg`
- Temporary only: GitHub-rendered HTML and Playwright screenshots outside tracked source.

**Interfaces:**
- Consumes: the asset and README commits from Tasks 1 and 2.
- Produces: a verified public `main` commit and an evidence-backed visual verdict.

- [ ] **Step 1: Render both README files through GitHub's Markdown API**

Build each request as a JSON payload file with `jq -Rs`, submit it with `gh api --method POST markdown --input`, and inspect the returned HTML.

Expected per language: four shields, three product illustrations, three value labels, four section accents, one CTA, one runtime table, and no stripped or rewritten local SVG references.

- [ ] **Step 2: Run repository gates under the required runtime**

```bash
export PATH='/Users/mingjian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH
node --version
pnpm --version
pnpm guard
pnpm typecheck
```

Expected: Node `v24.19.0`, pnpm `10.33.2`, guard `86/86`, and typecheck exit `0`.

- [ ] **Step 3: Run the public-surface scan**

```bash
git diff --check HEAD~2..HEAD
rg -n '/Users/|/home/|BEGIN (RSA|OPENSSH|PRIVATE)|API[_ -]?KEY|token=' \
  README.md docs/i18n/README.zh-CN.md docs/assets/readme || true
```

Expected: no whitespace errors, local paths, secret patterns, or credential material.

- [ ] **Step 4: Confirm the remote base and push**

Verify `git ls-remote origin refs/heads/main` still matches the pre-implementation public base before pushing the new commits. If it differs, re-read the remote graph and reconcile without force pushing. Push the current `HEAD` to `origin/main` only after a fast-forward is proven.

- [ ] **Step 5: Inspect the public English and Chinese pages in Chromium**

Use Playwright CLI to inspect:

- desktop at `1440×1100`;
- mobile at `390×844`;
- GitHub light mode;
- GitHub dark mode;
- English root README;
- Chinese README blob page.

Expected: all SVGs have positive natural dimensions, label rows wrap without clipping, the CTA remains clickable, headings and anchors exist, console errors are zero, and mobile `scrollWidth` equals `390`.

- [ ] **Step 6: Record the release boundary honestly**

Confirm the latest Release remains `v0.1.0`, resolve its tag commit, and report that the docs-only README accents live after the tagged release unless a new release has actually been created.

- [ ] **Step 7: Final status check**

```bash
git status --short --branch
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Expected: clean worktree and identical local and remote commit IDs.
