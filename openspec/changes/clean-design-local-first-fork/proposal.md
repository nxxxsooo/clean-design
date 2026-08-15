## Why

Open Design 0.16.1 provides the visual creation workflow we want, but its later product direction and existing cloud, telemetry, update, and downstream-agent surfaces conflict with a private local-first studio. Clean Design preserves the proven creation surface while making local ownership and deterministic prompt handoff explicit product guarantees.

## What Changes

- Rename and isolate the installed product as Clean Design for Apple Silicon macOS.
- Preserve every 0.16.1 artifact type, catalog, BYOK runtime, editing surface, preview, asset, `DESIGN.md`, and export workflow while limiting local coding CLIs to Codex, Claude Code, Antigravity (`agy`), OpenCode, and Pi.
- **BREAKING** Remove accounts, hosted cloud services, teams, billing, promotions, news, deployment, auto-update, telemetry, external MCP/plugin-host integration, and inherited coding-agent adapters outside the five-runtime allowlist.
- Replace coding-agent selection and generated transcript handoff with deterministic, immutable prompt packets written to a trusted external root.
- Replace renderer-stored plaintext provider secrets with an Electron `safeStorage` credential vault and reference-based daemon registration.

## Capabilities

### New Capabilities

- `local-studio`: Clean Design identity, isolated local lifecycle, preserved artifact creation surface, and explicit outbound-network policy.
- `credential-vault`: Encrypted provider credentials exposed to the renderer only as masks and references.
- `prompt-handoff`: Trusted handoff roots and atomic, secret-filtered, versioned implementation packets for agent-agnostic prompt handover.

### Modified Capabilities

None. This repository has no existing OpenSpec capability baseline.

## Impact

The change affects Electron desktop and packaged runtimes, daemon routes and persistence, shared API contracts, web settings and Studio controls, macOS packaging, tests, and product documentation. Internal `@open-design/*` package scopes and `OD_*` development variables remain temporarily for source compatibility, while installed/runtime identity is fully isolated.
