# Clean Design quickstart

Clean Design supports Apple Silicon macOS. Use Node.js 24 and the pnpm version
pinned by the repository.

## Requirements

- Apple Silicon Mac
- Node.js 24
- pnpm 10.33.2 through Corepack
- At least one supported local CLI, or a BYOK provider configured in Settings

Supported local CLIs are exactly Codex, Claude Code, Antigravity (`agy`),
OpenCode, and Pi. Clean Design detects them from the process `PATH`; it does not
install them globally.

```bash
corepack enable
corepack pnpm --version
pnpm install --frozen-lockfile
```

The version command should print `10.33.2`.

## Run from source

Start the full local development stack:

```bash
pnpm tools-dev
```

To keep only the daemon and web renderer in the foreground:

```bash
pnpm tools-dev run web
```

`tools-dev` prints the selected loopback URL. In the app, open Settings and use
Rescan if an installed CLI is not listed. GUI processes can receive a smaller
`PATH` than an interactive shell, so ensure the CLI's executable directory is
visible to the process that launches Clean Design.

## Build and install the app

```bash
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
```

The packaged app owns its daemon and web sidecars and stops them when the app
quits. Clean Design does not install a global command.

## Create and export

1. Create or open a project.
2. Select one of the five local CLIs, or configure a BYOK provider in Settings.
3. Choose a template and design system, then send a prompt.
4. Refine the result in the file workspace and preview.
5. Select a trusted handoff root and export an immutable packet.

An exported packet includes `HANDOFF.md`, `manifest.json`, filtered project
files, `DESIGN.md` when available, and relevant previews. A required preview
failure aborts the export; optional failures are recorded as manifest warnings.

## Development checks

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/contracts test
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/tools-pack test
```

There is no root aggregate build or test alias. Use package-scoped commands
while iterating.

## Local privacy boundary

The daemon binds to loopback. Provider credentials are saved through Electron
protected storage, and renderer state contains only masked values or credential
references. Network requests are limited to the provider, supported CLI, or
resource explicitly selected by the user. There is no account login, product
telemetry, billing, automatic update, hosted collaboration, or deployment mode.

For architecture and repository boundaries, read [AGENTS.md](AGENTS.md) and
[docs/architecture.md](docs/architecture.md).
