# Clean Design

Clean Design is a local-first visual creation studio for Apple Silicon macOS. It preserves the Open Design 0.16.1 creation experience while removing accounts, hosted collaboration, telemetry, promotions, deployment, updates, and downstream coding-agent integrations.

The primary workflow is:

```text
Prompt -> generate -> visually refine -> approve -> export immutable handoff -> paste prompt into any coding agent
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

Provider credentials are stored through Electron `safeStorage`. The renderer receives masked values or opaque credential references, never plaintext secrets.

## Handoff Packets

Each project can select one trusted external handoff root. Export creates a new immutable directory:

```text
<root>/<project-slug>/<YYYYMMDD-HHmmss>-<short-id>/
```

Packets include `HANDOFF.md`, `manifest.json`, filtered project files, `DESIGN.md` when available, and format-specific previews. Required-output failures abort atomically; optional failures are recorded as manifest warnings.

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

The daemon binds to loopback and retains authenticated local IPC boundaries. Outbound requests are limited to the provider selected by the user, explicitly invoked local CLI behavior, or a resource the user explicitly requests. See [PRIVACY.md](PRIVACY.md).

## Provenance

Clean Design is based on a squashed snapshot of Open Design 0.16.1 at commit `276b4d8e970bc143d7ad060181a89a834e3d9caf`. Internal `@open-design/*` package scopes and `OD_*` development variables remain for initial compatibility. See [NOTICE](NOTICE) and [UPSTREAM.md](UPSTREAM.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
