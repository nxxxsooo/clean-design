# tools/pack

Follow the root `AGENTS.md` and `tools/AGENTS.md` first. This tool owns local packaged build, install, start, stop, logs, uninstall, and cleanup workflows.

## Owns

- Apple Silicon macOS packaging and lifecycle verification for Clean Design.
- Local Windows and Linux packaging helpers retained for upstream compatibility; they are not v0.1.0 release targets.
- Packaged resource assembly and source-map stripping.
- Consumption of process and path primitives from `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform`.

## Does not own

- Product business logic or sidecar protocol definitions.
- Auto-update, release-feed fetching, analytics, attribution, telemetry, hosted deployment, or promotion flows.
- Global CLI installation or silent/headless product bootstrap.

## Rules

- Do not hand-build process-stamp arguments; use the sidecar protocol helpers.
- Namespace decides data, log, runtime, and cache paths. Ports are transient transports only.
- Public v0.1.0 artifacts use the single `Clean Design` identity and `fun.mjshao.clean-design` bundle ID.
- Use `--portable` for release artifacts so packaged config does not capture build-machine paths.
- Pack resources belong under `tools/pack/resources/`.
- Packaging must not read or forward telemetry, attribution, hosted-service, or updater environment variables.
- Browser sourcemaps are removed locally before packaging and are never uploaded.

## Verification

```bash
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-pack test
pnpm tools-pack mac build --to all
pnpm tools-pack mac install
pnpm tools-pack mac start
pnpm tools-pack mac logs
pnpm tools-pack mac uninstall --remove-product-user-data --remove-data --remove-logs --remove-sidecars
pnpm tools-pack mac cleanup --remove-product-user-data --remove-data --remove-logs --remove-sidecars
```
