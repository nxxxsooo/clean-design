# README Brand Accent Design

## Objective

Add a controlled layer of Clean Design color to the English and Chinese GitHub README files without turning semantic text into artwork, weakening accessibility, or changing any product, installation, privacy, release, or compatibility claim.

The result should feel more like the Clean Design product while remaining a readable GitHub document in desktop and narrow mobile layouts, in both light and dark themes.

## Design principles

1. Content remains primary. Markdown headings, paragraphs, tables, code blocks, links, and anchors stay semantic and selectable.
2. Color has a role. Orange indicates the primary action or a high-value differentiator; ink supplies structure; stone carries secondary context; warm paper supplies the branded surface.
3. Color is never the only signal. Every colored label includes text, and every action remains a descriptive link.
4. Decoration stays finite. The experiment changes only the first product summary, the download action, and four decision-oriented section entrances.
5. English and Chinese remain structural variants of one system, not independently styled documents.

## Palette and roles

| Role | Value | README use |
|---|---|---|
| Warm paper | `#f7f3ed` | light label surface and SVG background details |
| Ink | `#191816` | label structure, primary label background, dark foreground |
| Stone | `#6d6962` | secondary borders and quiet text inside SVG assets |
| Orange | `#df5d36` | primary CTA, accent segment, strongest differentiator |

No additional brand colors will be introduced. GitHub continues to own link, table, code-block, and system-state colors.

## Proposed treatment

### 1. Value labels

Replace the three plain summary bullets below the opening paragraph with three compact rows. Each row begins with a small local SVG label and continues with normal Markdown-compatible explanatory text.

English labels:

- `LOCAL BY DEFAULT`
- `NO ACCOUNT`
- `YOUR AGENT OR KEY`

Chinese labels:

- `默认本地`
- `无需账户`
- `智能体或密钥`

The explanatory text preserves the current verified claims. The label alone is never required to understand the row.

### 2. Download CTA

Replace the plain bold download text below the hero with a local SVG button inside the existing GitHub Release link.

- English: `Download for Apple Silicon Mac →`
- Chinese: `下载 Apple 芯片 Mac 版本 →`

The button uses orange as its primary surface, ink for its outline or shadow, and warm paper for text. The underlying destination remains `https://github.com/nxxxsooo/clean-design/releases/latest`.

### 3. Section entrance accent

Create one reusable, text-free SVG rule made from an orange leading segment and a muted stone continuation. Place it directly below four decision-oriented headings:

- Bring your own agent / 使用你自己的智能体
- What you can make / 可以做什么
- Download / 下载
- Privacy / 隐私

The real Markdown headings remain unchanged, so GitHub Outline entries and anchors remain stable. Decorative rule images use empty alt text.

### 4. Asset model

Add deterministic, hand-maintained SVG assets under `docs/assets/readme/`:

- one reusable section accent;
- three English value labels;
- three Chinese value labels;
- one English download CTA;
- one Chinese download CTA.

Every filename is lowercase and hyphenated. SVG dimensions, `viewBox`, font stack, colors, and text placement are explicit. No raster generation or external badge service is required.

## Explicit non-goals

- Do not color ordinary paragraphs or Markdown headings.
- Do not replace headings with images.
- Do not add more shields badges.
- Do not add new product claims, comparisons, metrics, status claims, or release promises.
- Do not change the existing hero, artifact, or workflow artwork.
- Do not change the runtime table, installation commands, Gatekeeper guidance, privacy statement, provenance, or license.
- Do not introduce JavaScript, CSS, remote image services, tracking pixels, or dynamic SVG content.

## Accessibility and theme behavior

- Labels supplement adjacent text rather than replace it.
- CTA images have descriptive alt text matching the visible action.
- Decorative section accents have empty alt text.
- SVGs use solid surfaces that remain legible on both GitHub light and dark backgrounds; they do not depend on surrounding page colors.
- Meaning is communicated through text, placement, and shape in addition to color.
- Mobile rendering must allow label rows to wrap without horizontal page overflow.

## Verification

Before publishing:

1. Render the exact English and Chinese README files through GitHub's Markdown API.
2. Confirm every SVG survives sanitization and resolves through a relative repository path.
3. Confirm both language files contain the same structural treatments and preserve translated anchors.
4. Inspect the public GitHub pages at approximately 1440 px and 390 px widths.
5. Inspect light and dark themes.
6. Confirm `scrollWidth` equals the viewport width on narrow mobile.
7. Confirm all label and CTA assets decode and the CTA destinations remain unchanged.
8. Run `git diff --check`, `pnpm guard`, and `pnpm typecheck` under Node 24 and pnpm 10.33.2.
9. Scan the edited public files and SVGs for local absolute paths, secrets, internal review wording, and stale claims.
10. Confirm the public `main` branch contains the final commit and state the existing README-versus-`v0.1.0` tag mismatch rather than implying the docs-only change is part of the tagged binary release.

## Acceptance criteria

- The README is visibly more branded without becoming a badge wall or image-based document.
- Orange remains the only high-emphasis brand color.
- The primary download action is the strongest colored text treatment.
- The three value statements are easier to scan and retain their full verified meaning.
- Four major sections gain a consistent entrance rhythm without losing Markdown headings or anchors.
- English and Chinese render as one coherent system.
- No desktop, mobile, light-theme, dark-theme, accessibility, link, or repository gate regression is observed.
