# Contributing to Clean Design

Clean Design is a local-first macOS visual studio derived from Open Design
0.16.1. Contributions must preserve its prompt-to-visual-to-handoff workflow and
must not reintroduce accounts, hosted product services, telemetry, deployment,
auto-update, or direct coding-agent integration.

## Development setup

Use Node 24 and the pnpm version pinned in `package.json`:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm guard
pnpm typecheck
```

Use `pnpm tools-dev` for local lifecycle commands and package-scoped scripts for
builds and tests. Internal `@open-design/*` package scopes and `OD_*` development
variables are retained in v0.1.0 for source compatibility; they are not the
installed product identity.

## Change boundaries

- Shared web/daemon DTOs belong in `packages/contracts`.
- Browser code must not import daemon implementation files.
- Privileged filesystem and credential operations belong behind the
  authenticated Electron desktop boundary.
- New source files are TypeScript unless a documented compatibility boundary
  requires otherwise.
- Tests live in the package-level `tests/` directory; Playwright flows live in
  `e2e/ui/`.
- Do not commit credentials, internal hosts, personal paths, generated runtime
  data, or handoff packets.

Read the nearest `AGENTS.md` before editing a package. Preserve all user changes
and keep commits focused. Do not add co-author trailers.

## Verification

Run the narrowest tests for the changed behavior first, then:

```bash
pnpm guard
pnpm typecheck
```

Changes to installed identity, lifecycle, credentials, network policy, or
handoff export also require their focused package tests and a packaged macOS
smoke test.

## Upstream patches

The `upstream` remote is reference-only. Select security, provider, and macOS
compatibility patches manually. Review every candidate for product-scope drift,
new egress, branding, account/cloud coupling, and conflicts with Clean Design's
OpenSpec contracts before applying it.

## Public release

Do not make the repository public or publish a release until every item in
`RELEASE.md` passes. The public-release gate includes source/history secret
scanning, license and trademark review, visible-branding review, endpoint and
affiliate-link removal, network verification, installation smoke tests, and
artifact inspection.
