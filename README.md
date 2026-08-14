# Clean Design

<p align="center"><b>English README</b></p>

Clean Design is a local-first visual creation studio for Apple Silicon macOS. It keeps project creation, visual refinement, previews, assets, exports, BYOK generation, and a small local-runtime surface without product accounts or hosted services.

The primary workflow is:

```text
Prompt -> generate -> visually refine -> approve -> export immutable handoff packet
```

## Product Scope

Clean Design supports projects, previews, canvas editing, assets, `DESIGN.md`, themes, local CLI generation, BYOK providers, and these artifact families:

- Prototype
- Deck
- Template
- Brand
- Image
- Video
- Audio
- Document and other local artifacts

Provider credentials are stored through Electron `safeStorage`. The renderer
receives masked values or opaque credential references, never plaintext
secrets.

The only public local runtimes are Codex, Claude Code, Antigravity (`agy`),
OpenCode, and Pi. BYOK execution is configured separately inside the app and
does not appear as another public local CLI.

## Handoff Packets

Each project can select one trusted external handoff root. Export creates a new
immutable directory:

```text
<root>/<project-slug>/<YYYYMMDD-HHmmss>-<short-id>/
```

Packets include `HANDOFF.md`, `manifest.json`, filtered project files,
`DESIGN.md` when available, and format-specific previews. Required-output
failures abort atomically; optional failures are recorded as manifest warnings.

## Development

Requirements:

- macOS on Apple Silicon
- Node.js 24
- pnpm 10.33.2

```bash
pnpm install
pnpm guard
pnpm typecheck
pnpm tools-dev run web
```

Build and install the local app with:

```bash
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
```

Clean Design does not install a global `od` command and does not support silent or headless desktop bootstrap.

## Privacy

The daemon binds to loopback and retains authenticated local IPC boundaries.
Outbound requests are limited to the provider selected by the user, explicitly
invoked local CLI behavior, or a resource the user explicitly requests. See
[PRIVACY.md](PRIVACY.md).

Clean Design has no account system, billing surface, product telemetry,
automatic updater, cloud deployment, or hosted collaboration service.

## Provenance

Clean Design is an independent project derived from an upstream codebase; the
upstream project does not sponsor or endorse this fork. Internal
`@open-design/*` package scopes and `OD_*` development variables remain for
initial source compatibility. See [NOTICE](NOTICE) and
[UPSTREAM.md](UPSTREAM.md) for the exact source revision and attribution.

## License

Apache License 2.0. See [LICENSE](LICENSE).
