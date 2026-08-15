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
pnpm tools-pack mac build --to all --portable
pnpm tools-pack mac install
```

Clean Design does not install a global `od` command and does not support silent or headless desktop bootstrap.

## Install a release

Download the Apple Silicon DMG or ZIP and `SHA256SUMS.txt` from the matching
[GitHub Release](https://github.com/nxxxsooo/clean-design/releases). Verify the
download before opening it:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

For a first installation, open the DMG and copy `Clean Design.app` to
`/Applications`. To update, quit Clean Design and replace the existing app;
projects and settings remain in the separate Clean Design application-data
directory. Clean Design has no automatic updater.

The v0.1.0 build is ad-hoc signed, not Apple-notarized. macOS may quarantine a
downloaded copy. After verifying that it came from this repository's Release,
Control-click the app and choose **Open**. If macOS still blocks it, remove the
quarantine attribute explicitly:

```bash
xattr -dr com.apple.quarantine "/Applications/Clean Design.app"
```

To uninstall the app, quit it and remove `/Applications/Clean Design.app`.
Removing the app does not silently delete projects or settings.

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
