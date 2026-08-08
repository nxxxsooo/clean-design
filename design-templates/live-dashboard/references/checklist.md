# Pre-emit checklist

Every P0 item must pass before completion.

## Visual integrity

- [ ] **P0 - Display face.** Use the active `DESIGN.md` typography or a system stack; body text remains readable at 14px or larger.
- [ ] **P0 - Accent restraint.** Accent is reserved for the primary refresh action and data emphasis.
- [ ] **P0 - Flat hierarchy.** No decorative gradients, glass panels, or nested cards.
- [ ] **P0 - Contrast.** Body text meets 4.5:1 and secondary text meets 4:1.

## Honesty and data safety

- [ ] **P0 - No invented metric.** User-provided or loaded values are shown as data; seeded values are labeled `Sample data`.
- [ ] **P0 - Source visible.** The footer identifies `Local snapshot`, `Daemon tool`, or `Sample data`.
- [ ] **P0 - No secrets.** Output contains no credentials, tokens, cookies, headers, transcripts, absolute local paths, or application configuration.
- [ ] **P0 - Local-only refresh.** Network access is limited to the project-relative `data.json` or an authenticated daemon tool explicitly supplied by the host.
- [ ] **P0 - Stale fallback.** A failed refresh preserves the last valid values and clearly marks them stale.

## Structure and behavior

- [ ] **P0 - Self-contained UI.** `index.html` has no remote scripts, fonts, analytics, or deployment SDKs.
- [ ] **P0 - Responsive.** Sidebar collapses below 980px, KPI grid stacks, and secondary table columns hide when needed.
- [ ] **P0 - Reduced motion.** Tweens and pulses stop under `prefers-reduced-motion: reduce`.
- [ ] **P0 - Stable numerals.** KPI values use tabular numerals and do not shift during refresh.
- [ ] **P0 - Complete states.** Loading, empty, error, stale, and sample states are present.

## Polish

- [ ] P1 - Refresh button reports progress without layout shift.
- [ ] P1 - Changed rows receive a short, restrained highlight.
- [ ] P1 - Sparkline uses the active design system and remains legible without color.
- [ ] P1 - Keyboard focus is visible on every interactive control.
