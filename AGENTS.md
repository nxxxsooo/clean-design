# Clean Design Repository Guide

Read this file first, then read the nearest `AGENTS.md` under `apps/`, `packages/`, `tools/`, or `e2e/` before editing that area.

## Product Contract

Clean Design is an Apple Silicon macOS, local-first visual creation studio. Preserve projects, previews, canvas editing, assets, themes, `DESIGN.md`, exports, BYOK generation, all inherited artifact families, and local CLI generation through exactly Codex, Claude Code, Antigravity (`agy`), OpenCode, and Pi. Keep `byok-opencode` internal to BYOK flows rather than exposing it as another local CLI.

Do not restore accounts, hosted services or collaboration, teams, billing, promotions, news, deployment, external MCP/plugin-host integrations, unused agent transports, coding-agent adapters outside the five-runtime allowlist, automatic updates, telemetry, or global CLI installation.

Keep internal `@open-design/*` package scopes and `OD_*` development variables until a deliberate compatibility migration is approved. User-visible identity is always Clean Design.

## Active Boundaries

- `apps/web`: Next.js renderer and local product UI.
- `apps/daemon`: loopback-only privileged service, persistence, generation adapters, assets, projects, and exports.
- `apps/desktop`: Electron main process and authenticated privileged boundary.
- `apps/packaged`: packaged launcher that owns daemon/web sidecars and terminates them on quit.
- `packages/contracts`: pure shared web/daemon/desktop contracts.
- `packages/sidecar-proto`, `packages/sidecar`, `packages/platform`: IPC protocol, sidecar runtime, and OS primitives.
- `tools/dev`: local development lifecycle.
- `tools/pack`: local Apple Silicon package, install, inspection, and cleanup workflow.
- `e2e`: user-level Playwright coverage.

The marketing site, cloud release publisher, and update fixture server are intentionally absent.

## Security Invariants

- Bind local HTTP services only to loopback.
- Preserve authenticated HMAC boundaries between desktop and local services.
- Store provider secrets through Electron `safeStorage`; renderer state contains only masked values or credential references.
- Plaintext credentials may exist only in the authenticated desktop/daemon boundary while needed for active use.
- Outbound traffic requires an explicit provider, CLI, or user-requested resource context.
- Disabled hosted-service routes fail before service handlers execute.
- Never log credentials, authorization headers, prompt secrets, or decrypted vault contents.

## Handoff Invariants

- Trusted roots are privileged project metadata and cannot be set through generic project mutation APIs.
- Reject system paths, credential paths, app-data roots, traversal, and symlink escapes.
- Collect files with realpath containment, size limits, secret filename/content checks, and hidden/local-state exclusions.
- Build in a temporary sibling directory and publish by atomic rename.
- Never overwrite an existing packet; allocate a collision suffix.
- Required preview failures abort the export. Optional failures become manifest warnings.
- Keep prompt and manifest generation deterministic and versioned.

## Development

Use Node 24 and pnpm 10.33.2. There is no root build aggregate.

```bash
pnpm install
pnpm guard
pnpm typecheck
pnpm tools-dev run web
```

Use package-scoped checks while iterating:

```bash
pnpm --filter @open-design/contracts test
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/desktop typecheck
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/tools-pack test
```

Build and install the target app with:

```bash
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
```

## Engineering Rules

- Keep app-private implementation inside its owning app; communicate through shared contracts and local HTTP/IPC APIs.
- Keep `src/` source-only and tests in each package's sibling `tests/` directory.
- Preserve namespace-scoped data, log, runtime, cache, IPC, and process-stamp paths. Ports are transport details, never persistence identity.
- Use the narrowest affected tests during iteration, then run `pnpm guard` and `pnpm typecheck` before a checkpoint commit.
- Playwright UI automation belongs under `e2e/ui/`.
- Do not make the repository public or create `v0.1.0` until the documented scrub and acceptance gate passes.
