# Clean Design Public Surfaces Refresh

**Date:** 2026-08-17
**Status:** Approved visual direction; implementation pending written-spec review
**Owners:** `nxxxsooo/clean-design` and `nxxxsooo/mjshao-portfolio`

## Objective

Refresh Clean Design's public product story across three existing surfaces:

1. the GitHub repository README;
2. the standalone product landing at `https://mjshao.fun/clean-design/`;
3. the portfolio work page at `https://mjshao.fun/work/clean-design`.

The refresh must use one verified product source of truth and one visual family while giving each surface a different reading job. It uses one newly composed product-proof visual and the two user-selected existing masters, arranged as the approved three-act sequence:

1. product proof;
2. agent workflow;
3. artifact world.

## Product Dossier

### Product identity

Clean Design is a local-first visual creation studio for Apple Silicon Macs. It uses one of five supported local AI CLIs or a separately configured BYOK provider to turn a prompt into a real project that remains editable on the canvas, inspectable as files, and exportable as a portable handoff.

Clean Design is not an account-based SaaS, a hosted collaboration workspace, a deployment service, or a multi-agent launcher. Its visual story must keep the studio and editable work at the center rather than presenting the runtime list as the product.

### Reader

The primary reader is a Mac-based AI creator, designer, developer, or product builder who already uses Codex, Claude Code, Antigravity, OpenCode, Pi, or a model-provider API key and is deciding whether Clean Design adds a useful visual workspace to that toolchain.

### First task

Within ten seconds, the reader must understand:

- what Clean Design is;
- why it differs from another chat or generation shell;
- that it works with AI tools they already use;
- that projects remain local and editable;
- where to download it.

### Differentiator

The product turns agent output into durable visual work on the user's Mac. The user brings the intelligence; Clean Design supplies the visual workspace, project model, canvas refinement, assets, themes, `DESIGN.md`, previews, and portable handoff.

### Evidence inventory

- the real Clean Design Home composer and template surface;
- the real canvas, file, asset, preview, and export surfaces;
- five supported local runtime definitions and their implemented command names;
- representative prototype, deck, document, design-system, brand, image, video, and audio outputs already present in the repository;
- the implemented local-only service, credential, project, and handoff boundaries;
- the published Apple Silicon `v0.1.0` DMG, ZIP, and checksums.

### Primary action

Download the current Apple Silicon release.

- GitHub README and portfolio work page use the stable latest-Release destination.
- The standalone landing keeps a direct `v0.1.0` DMG action while `v0.1.0` is the current release, accompanied by the Release page and exact version copy.

### Boundaries

- Platform: Apple Silicon macOS only for the current release.
- Price and account: no Clean Design account, subscription, or hosted workspace.
- Privacy: no product telemetry or automatic updater; network traffic occurs only for an explicit provider, invoked local CLI, or user-requested resource.
- Distribution: manual application replacement for updates.
- Signing: `v0.1.0` is ad-hoc signed and not Apple-notarized; Gatekeeper may require Control-click and Open.
- License: Apache-2.0 with explicit upstream provenance.
- Compatibility: internal `@open-design/*` scopes and `OD_*` development variables remain for source compatibility.

### Brand DNA

- Surface: `#faf9f7` and `#fdfcfa` warm whites.
- Foreground: `#191816` graphite.
- Muted context: `#6d6962` warm gray.
- Action: product token `#c96442`, with delivery accent `#df5d36` where the current public artwork already uses it.
- Dark field: `#1a1917` with warm off-white text.
- Visual language: calm editorial spacing, Apple-like product clarity, paper and studio material used only as supporting atmosphere, and real product windows as evidence.
- Typography: live surface typography; do not bake marketing headings into raster assets.

### Voice

Literal, calm, and confident. The copy should sound like a precise invitation to make something, not a launch campaign full of hype. English and Chinese must carry the same claims and priority.

### Release state

The current public application release is `v0.1.0`. The public-surface refresh does not create a new application version or claim new product behavior. README and website commits may be newer than the `v0.1.0` source tag; every download surface must still identify the current application version truthfully.

### Surface inventory and owners

| Surface | Canonical location | Owner |
|---|---|---|
| GitHub repository page | `https://github.com/nxxxsooo/clean-design` | `nxxxsooo/clean-design` |
| English README | `README.md` | `nxxxsooo/clean-design` |
| Chinese README | `docs/i18n/README.zh-CN.md` | `nxxxsooo/clean-design` |
| Standalone product landing | `https://mjshao.fun/clean-design/` | `mjshao-portfolio/public/clean-design/index.html` |
| Portfolio work page | `https://mjshao.fun/work/clean-design` | `mjshao-portfolio/src/app/work/projects/clean-design.mdx` |
| Portfolio card cover | `/images/projects/clean-design/cover.webp` currently | `mjshao-portfolio` |
| Landing social preview | `/images/projects/clean-design/social-preview.jpg` currently | `mjshao-portfolio` |
| Application release | GitHub Release `v0.1.0` | `nxxxsooo/clean-design` |

## Visual Direction Record

### Reader

An AI-enabled Mac creator deciding whether Clean Design belongs in their current workflow.

### First task

Recognize a real Mac visual studio, understand that it uses the reader's existing AI tool, and reach a working download action.

### Visual argument

Clean Design is not another chat shell; it is a quiet, exact local design desk that turns agent output into editable, inspectable, portable work.

### Evidence

Real Clean Design UI, real workflow boundaries, supported runtime identities, and representative outputs. Generated atmosphere may support the composition but may not stand in for behavioral proof.

### Primary action

Download the Apple Silicon release.

### Color roles

Warm white carries the studio surface, graphite carries product and copy, warm gray carries context, terracotta orange carries the action and workflow path, and semantic status colors remain rare and functional.

### Medium map

| Communication job | Medium |
|---|---|
| Product name, promise, commands, version, privacy, signing, license | Live Markdown or HTML text |
| Product existence and usable Home surface | Real screenshot inside a deterministic editorial composition |
| Relationship among runtimes, prompt, canvas, and handoff | Deterministic composition using real icons and real product captures |
| Breadth of artifact families | Purpose-made collage using real or inspectable repository outputs |
| Small labels, path marks, and runtime identities | Local SVG, repository icons, or CSS |
| Atmosphere and depth | Restrained generated or code-native material only when it does not imply product behavior |
| Motion | Only hierarchy or workflow-state transitions on the landing, with reduced-motion fallback |

## Pattern Decisions

### Selected

- **Product-metaphor artwork** — The local studio, design desk, editable canvas, and paper material are grounded in the product. GitHub uses the metaphor only inside the three evidence images; the landing can extend it spatially around real product proof.
- **Native callout** — Gatekeeper and signing guidance is a real must-not-miss boundary. GitHub uses one semantic callout; the landing uses one accessible install note near the final download.
- **Branded glyph** — The five existing runtime icons map to exact supported CLIs. GitHub uses them in the workflow image with live command text below; the landing uses them in a responsive runtime strip and workflow scene.
- **Visual table** — Runtime-to-command mapping has repeated exact fields. GitHub keeps a live Markdown table; the landing adapts it to responsive icon cards while keeping names live.
- **Editorial voice** — Existing product language and the accepted headline direction support a restrained editorial rhythm. Both languages use direct, parallel claims.
- **Deliberate restraint** — The GitHub lower reading path stays concise because the standalone landing owns the full emotional and scenario narrative. The landing and work page do not copy the README's developer depth.

### Rejected

- **Semantic emoji** — Platform-dependent emoji would conflict with the precise runtime icon family and current product tone.
- **Animated proof** — No interaction requires a heavy GIF or video to be understood. Landing motion may reveal hierarchy, but it will not become a proof asset or ambient loop.
- **Evidence graphic** — There is no adoption-critical quantitative benchmark or comparison with trustworthy units; decorative numbers are not evidence.
- **Theme-aware media variants** — The three images will be self-contained neutral compositions with sufficient internal contrast across GitHub light and dark themes. Separate theme variants would double asset drift without current evidence that they are needed.
- **Decorative section furniture** — Repeated orange rules, black label stickers, and a hero/badge/gallery checklist are rejected because they do not add new understanding.
- **Fake terminal or dashboard** — Neither is the product experience and neither may be used as atmosphere.

## Shared Product Source of Truth

### Literal promise

Working English promise:

> Your agent can make. Your Mac keeps the work.

Working Chinese promise:

> 智能体负责创造，作品留在你的 Mac。

Supporting literal explanation:

> Generate with the AI tools you already use, then refine every result on a real canvas.

> 使用你已经在用的 AI 工具生成，再在真实画布上继续打磨。

The implementation may make small copy edits for grammar or line length, but it may not change the meaning, audience, or product boundary without revising this design.

### Supported local runtimes

| Runtime | Implemented command presentation |
|---|---|
| Codex | `codex` |
| Claude Code | `claude` |
| Antigravity | `agy` |
| OpenCode | `opencode-cli`, falling back to `opencode` |
| Pi | `pi` |

BYOK is a separate in-app provider path and must not be presented as a sixth local CLI.

### Artifact families

Prototype, slide deck, document, design system, brand kit, image, video, and audio. Additional inherited templates may appear in source, but the public artifact visual must not reintroduce removed marketplace, hosted, collaboration, or deployment claims.

### Maintained languages

English and Simplified Chinese. Structural and factual changes must land together.

## Three Core Visuals

Act I is a newly composed deliverable. Act II and Act III reuse the user-selected `clean-design-workflow.webp` and `clean-design-artifacts.webp` masters without cropping, recoloring, or regeneration.

### Act I — Product proof

**Job:** Prove that Clean Design is a real, coherent Mac application and make the primary action feel credible.

**Content:** A high-contrast real Home capture showing the prompt composer, template entry, local context, and visible Clean Design identity. The image may use an editorial Mac-window composition and warm paper depth, but the product window remains the largest and sharpest subject.

**Avoid:** washed-out UI, unreadable template cards, fake macOS chrome, baked headline copy, exaggerated depth that makes the screen look like a concept rather than the product.

### Act II — Agent workflow

**Job:** Explain how the five local CLIs lead into Clean Design and how a prompt becomes an editable project and handoff.

**Content:** Real runtime icons and names feeding one prompt surface, a real canvas or project surface, and a handoff object. The terracotta path supplies sequence. Exact commands remain live text outside the image.

**Avoid:** presenting five agents as simultaneous collaborators, suggesting remote orchestration, showing a fake terminal, or making runtime logos visually stronger than Clean Design.

### Act III — Artifact world

**Job:** Make the breadth of outcomes visible without reducing the product to one generated image.

**Content:** A coherent studio spread built from inspectable prototype, deck, document, design-system, brand, image, video, and audio examples. The collage uses one palette, shared lighting, and intentional scale rather than a generic thumbnail grid.

**Avoid:** upstream template branding, removed service names, illegible micro-thumbnails, unrelated stock imagery, or generated artifacts presented as captured product behavior.

## GitHub Change Contract

### Reading path

`Understand → Trust → Download → Inspect Source and Boundaries`

### First decision surface

1. product name and language switch;
2. literal one-line product explanation;
3. no more than three decision-useful badges: current release, Apple Silicon, and no account;
4. primary download action;
5. Act I product-proof image;
6. three short live-text proofs: existing agents, editable local projects, and portable handoff.

### Body sequence

1. **Bring your own agent** — Act II image plus exact live runtime table and BYOK note.
2. **Make more than screens** — Act III image plus live artifact-family labels.
3. **Local by default** — concise privacy, account, telemetry, update, and outbound boundaries.
4. **Download** — release, checksum, installation, signing, Gatekeeper, and manual update guidance.
5. **Develop locally** — Node, pnpm, run, build, and install commands.
6. **Provenance and license** — visually secondary but complete.

### GitHub removals and reductions

- remove repeated section-accent SVGs;
- remove the three black value-label stickers;
- remove the duplicate code-block rendering of the same four-step workflow after Act II already explains it;
- reduce badge count from four to three by moving license to the legal section;
- keep precise names, commands, and boundaries selectable and copyable.

### GitHub assets

Publish versioned delivery files under `docs/assets/launch/`:

- `clean-design-product-proof-v2.webp`;
- `clean-design-workflow.webp`;
- `clean-design-artifacts.webp`.

Old public assets remain until no maintained surface references them. They are not deleted in the same change unless repository inspection proves they are otherwise unused.

### GitHub metadata

- Preserve the current About description unless the final literal promise makes a clearly better factual replacement.
- Preserve topics unless a removed product claim is discovered.
- Preserve `https://mjshao.fun/clean-design/` as the website.
- Derive a new GitHub social crop only if the repository social-preview control is writable in the available authenticated path; otherwise prepare the crop and report the upload gap.

## Standalone Landing Change Contract

### Reading path

`Feel → Understand the Scenario → See the Workflow → See the Work → Resolve Local/Privacy Objections → Download`

### Stable invariants

- URL remains `/clean-design/`.
- Implementation remains the existing standalone HTML owner at `public/clean-design/index.html`.
- English/Chinese toggle, language persistence, semantic navigation, keyboard focus, and reduced-motion handling remain.
- Existing product favicon remains opt-out protected by `.custom-icon`.
- GitHub, Release, license, and issue destinations remain truthful.

### Composition

1. **Hero / Act I** — retain the centered editorial introduction but use the approved literal promise, a primary direct download, a secondary GitHub action, and the new product-proof visual. Product UI contrast increases and the screenshot occupies more of the first two viewports.
2. **Proof strip** — three compact live facts: existing agents, editable local projects, portable handoff. Avoid decorative statistics such as `0 accounts` as a giant number.
3. **Act II dark field** — a full-width dark section holding the new workflow visual, five runtime identities, and a short BYOK note. The canvas remains the visual center.
4. **Act III artifact field** — a full-width warm section holding the artifact-world visual and live labels for the eight public artifact families.
5. **Local and open** — two evidence-based objection cards: local workspace boundaries and inspectable/open handoff. Keep account, telemetry, updater, and signing facts live.
6. **Final download** — current version, exact platform, direct download, Release notes, checksum reference, and Gatekeeper guidance.

### Interaction and motion

- Use restrained entry or scroll reveals only when they clarify section hierarchy.
- The workflow path reveals once as the Act II section enters view.
- No continuous floating, parallax that shifts evidence out of alignment, ambient canvas animation, or cursor-following effects.
- `prefers-reduced-motion: reduce` removes all nonessential motion without hiding content.

### SEO and social

- Preserve the canonical title and description facts while aligning copy with the shared promise.
- Publish a fresh versioned social image derived from the approved product-proof master, not a screenshot of the landing page.
- Update `og:image` to the new public path and verify the deployed bytes and SHA-256.

## Portfolio Work Page Change Contract

### Reading path

`Project identity → Why it exists → Three acts of evidence → Boundaries and distribution → Links`

### Frontmatter

- Preserve `publishedAt: "2026-08-16"`.
- Keep the project link at `/clean-design/` and GitHub link at the canonical repository.
- Publish a fresh versioned cover path rather than changing bytes behind `cover.webp`.
- Keep the summary literal and consistent with the shared product source of truth.

### Body

The work page becomes a concise bilingual project record:

1. what Clean Design is and the problem it solves;
2. why using existing AI tools matters;
3. Act I image and a short product-proof caption;
4. Act II image and supported-runtime explanation;
5. Act III image and artifact-family explanation;
6. local-only, credential, and portable-handoff boundaries;
7. current distribution state and links.

Use standard MDX headings, prose, lists, and images. Do not introduce a page-private component merely to imitate the standalone landing.

## Shared Asset Plan

### Working source and lineage

Use `Designs/clean-design-public-surfaces/` as the visual working directory and keep its review page at `Designs/clean-design-public-surfaces/index.html`. Record the source path or capture commit for every product screenshot and artifact included in a final image.

The best source for each visual remains a master before delivery compression. AI-generated material, if used, is limited to background texture, lighting, or spatial support and is recorded as such. Real UI and artifact evidence is composited deterministically above it.

### Surface derivatives

| Master | GitHub derivative | Standalone landing derivative | Portfolio derivative |
|---|---|---|---|
| Product proof | full-width README WebP | responsive hero WebP | 16:9 card cover WebP and 1280×640 social JPEG |
| Agent workflow | full-width README WebP | full-width dark-section WebP | inline work-page WebP |
| Artifact world | full-width README WebP | full-width warm-section WebP | inline work-page WebP |

The portfolio repository keeps production-safe local assets. It does not hotlink GitHub raw URLs. Versioned filenames prevent the Next Image and CDN cache from serving old bytes.

### Delivery constraints

- honest source detail at full size;
- sRGB delivery profile;
- no baked marketing headline or command text;
- self-contained contrast on light and dark GitHub themes;
- no image wider than necessary for its consuming surface;
- no tiny UI text used as the only evidence;
- descriptive alt text in both maintained README languages and the work page;
- WebP for mixed photographic or generated compositions, PNG only when lossless flat edges materially matter, JPEG for the final social crop.

## Verification Matrix

| Surface | Local verification | Public verification |
|---|---|---|
| English README | GitHub Markdown API render; image decode; anchors; tables; links; desktop and narrow snapshots | `github.com/nxxxsooo/clean-design` light/dark and narrow widths |
| Chinese README | GitHub Markdown API render; translated anchors; relative assets; structural parity | public Chinese README URL and language switch |
| GitHub metadata | About, topics, website, release link, social crop availability | repository header and share-card inspection |
| Standalone landing | HTML validation; desktop `1440×1000`; mobile `390×844`; English/Chinese; keyboard; reduced motion; no overflow | `mjshao.fun/clean-design/`, deployed commit, current image URLs and hashes |
| Portfolio work page | Next.js production build; MDX render; card crop; inline images; links | `mjshao.fun/work/clean-design`, desktop and mobile |
| Portfolio listing card | production build and image optimization route | `/work` card crop and currentSrc |
| Download path | HEAD/redirect and release asset presence | direct DMG and Release page |
| Shared copy | automated or manual fact comparison across the three sources | public rendered text agrees on platform, runtimes, account, privacy, signing, license, and version |

## Implementation Boundaries

- Do not change application behavior, product Home, packaging, or release binaries.
- Do not create a new framework or route architecture.
- Do not reintroduce hosted services, collaboration, deployment, accounts, billing, telemetry, updates, or unsupported runtime families.
- Do not use a landing screenshot as the portfolio cover or social image.
- Do not overwrite unversioned portfolio cover bytes in place.
- Keep Clean Design repository and portfolio repository commits separate.
- Preserve unrelated work in both repositories and stage only intended files.

## Acceptance Criteria

1. All three public surfaces use the same name, promise, runtime list, release state, privacy boundaries, and primary download path.
2. The new product-proof visual and the two selected existing masters appear in the approved three-act order where the surface supports the full story.
3. A ten-second scan answers what the product is, why it differs, and what to do next.
4. The standalone landing and work page no longer rely on one Home screenshot followed by mostly text-only sections.
5. Real product and output evidence remains recognizable at delivered width.
6. English and Chinese claims remain structurally and factually aligned.
7. GitHub, standalone landing, and work page pass their real renderer and public URL checks.
8. No surface implies a new application release or notarization state.

## Persistence Decisions

- **Project treatment:** Keep the exact palette, three-act geometry, asset lineage, accepted headline, and rejected visual directions with Clean Design.
- **Observation:** The GitHub and landing adapters use different compositions even when they share the same asset family.
- **Candidate judgment:** When trust depends on a real application, lead with authentic product proof and let atmosphere support rather than replace it.
- **Established method:** No shared skill change is warranted from this project alone; verify the result before promoting any candidate judgment.
