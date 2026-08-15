# Changelog

## 0.1.0 — 2026-08-16

Initial Clean Design release for Apple Silicon macOS.

- Provides a local-first visual creation studio without accounts, billing,
  telemetry, automatic updates, hosted deployment, or cloud collaboration.
- Supports local generation through Codex, Claude Code, Antigravity (`agy`),
  OpenCode, and Pi, with provider credentials available through separate BYOK
  configuration.
- Preserves projects, visual editing, previews, assets, themes, exports,
  `DESIGN.md`, inherited artifact families, and immutable handoff packets.
- Uses the Clean Design application identity, bundle identifier
  `fun.mjshao.clean-design`, isolated local data paths, and loopback-only
  authenticated services.

The downloadable app is ad-hoc signed and is not Apple-notarized. See the
README installation section for the macOS Gatekeeper procedure.
