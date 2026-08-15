# Clean Design macOS packaging

`tools-pack` is the local Apple Silicon packaging and lifecycle control plane
for Clean Design. The v0.1.0 release target is macOS only.

## Build and lifecycle

Run these commands from the repository root with Node 24 and pnpm 10.33.2:

```bash
pnpm tools-pack mac build --to all --portable
pnpm tools-pack mac install
pnpm tools-pack mac start
pnpm tools-pack mac inspect
pnpm tools-pack mac logs
pnpm tools-pack mac stop
pnpm tools-pack mac uninstall --remove-product-user-data --remove-data --remove-logs --remove-sidecars
pnpm tools-pack mac cleanup --remove-product-user-data --remove-data --remove-logs --remove-sidecars
```

Build artifacts are namespace-scoped under
`.tmp/tools-pack/out/mac/namespaces/<namespace>/`. Local runtime state is under
`.tmp/tools-pack/runtime/mac/namespaces/<namespace>/`. The namespace separates
data, logs, runtime files, cache, IPC, process stamps, and Electron user data;
ports are transport details and never persistence identities.

Use `--portable` for release artifacts. Portable builds resolve their runtime
roots on the installed machine and do not embed the build machine's local
tools-pack paths.

## Process ownership

The packaged desktop writes a namespace-scoped `runtime/desktop-root.json`
marker. Stop and cleanup validate its namespace, stamp, PID, executable, app
path, and runtime root before acting. A missing or stale marker reports the app
as not running; a marker that does not match the owned process reports it as
unmanaged. The lifecycle tool never kills an unrelated process.

`tools-pack mac logs` reads the packaged desktop lifecycle log plus the daemon
and web sidecar logs for the selected namespace. These logs cover startup,
shutdown, and process failures; they must not contain credentials or prompt
content.

## Cleanup boundary

The uninstall and cleanup flags remove only the current Clean Design product
identity and selected namespace:

- `--remove-product-user-data` removes the current product's Electron user data.
- `--remove-data` removes namespace-scoped application data.
- `--remove-logs` removes namespace-scoped logs.
- `--remove-sidecars` removes namespace-scoped runtime and sidecar state.

Cache is retained unless an explicit cache-removal option is selected. Cleanup
must preserve adjacent namespaces, unrelated applications, and any separately
installed upstream product.

## Release acceptance

A release candidate is accepted only after the installed app launches,
restarts, renders a screenshot, exposes healthy loopback sidecars, creates and
opens a project, performs the required generation and handoff checks, quits
with no owned processes remaining, and passes uninstall/cleanup path audits.
No auto-update, hosted deployment, global CLI install, telemetry, account, or
payment workflow belongs in this tool.
