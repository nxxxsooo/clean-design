## Context

Clean Design already owns the services a Codex plugin needs: managed projects, contained file writes, design systems, a skills catalog, preview and render pipelines, and immutable handoff export. What it lacks is a way for an external agent to reach them safely.

The approved architecture follows the Iterlay separation. Skills own workflow guidance. MCP owns workspace truth and deterministic actions. The bridge is a self-contained Node stdio server that discovers an installed `Clean Design.app`, attaches to or starts one namespace-scoped daemon plus one bounded render broker, authenticates over sidecar IPC, and calls an allowlisted daemon profile.

## Goals / Non-Goals

Goals:

- One installable plugin that creates, inspects, previews, renders, opens, and exports real local projects.
- One service and one render broker per namespace, shared by every client.
- A capability surface strictly narrower than the application's own.
- Deterministic, reviewable failure behavior under concurrency.

Non-Goals:

- Publication to the universal OpenAI plugin directory. Review requires a publicly hosted MCP endpoint and forbids local endpoints.
- A global CLI, login item, LaunchAgent, auto-updater, telemetry, or hosted service.
- Agent orchestration, provider invocation, or credential brokering through MCP.

## Decisions

### Install path

The plugin lives at `.agents/plugins/clean-design/`, not `plugins/`. The repository `plugins/` tree is the Clean Design design-system plugin registry, and `apps/daemon/src/plugins/bundled.ts` walks `plugins/_official/**` at daemon startup. An OpenAI-format manifest there would collide with the OD v1 plugin schema. `.agents/plugins/` is also the repo-scoped marketplace path in the official documentation.

### Bridge package location

The bridge is `packages/codex-plugin/`. The `tools/` root is allowlisted by `checkToolsLayout` in `scripts/guard.ts` to exactly `AGENTS.md`, `dev/`, and `pack/`, and this change does not weaken a boundary guard to make room for itself.

### Service singleton ownership

Packaged daemon startup changes from unconditional retirement to connect, lock, recheck, then start. Desktop shutdown releases a lease instead of killing the daemon. Idle policy inside the daemon, not desktop teardown, decides final shutdown. This is what allows a plugin session to survive the user quitting the visible window, and prevents two clients from racing two daemons.

### Authentication

Clients prove possession of a private mode-`0600` secret through a domain-separated HMAC challenge-response, receive a per-lease session key, and sign every HTTP call over method, path, body digest, lease, nonce, and expiry. Challenges and nonces are single-use. Roles are fixed at acquire time and never read from renew or release input.

### Render serialization

One FIFO broker with concurrency 1 serves PDF, slide, image, and handoff renders for both the visible desktop and the headless entry. Electron renderers are expensive and concurrent offscreen renders are the most likely source of memory blowup under a startup storm.

## Risks / Trade-offs

- Changing packaged shutdown ownership risks leaving an orphan daemon. Mitigated by lease expiry, idle timeout, and exact-namespace stop and uninstall paths.
- Starting an application from a plugin is a privilege-sensitive action. Mitigated by bundle-identifier validation, realpath and symlink rejection, an explicit argument array, and a sanitized environment that drops credential-shaped keys.
- A local MCP surface invites scope creep toward agent orchestration. Mitigated by a literal operation allowlist and a structural test that compares the service's own method names against an approved list.

## Migration Plan

The change is additive to a pre-release product. There is no installed user base to migrate. The existing `plugins/open-design/` Claude-format artifact remains untouched by this change and is addressed separately by the public-surface scrub.

## Open Questions

None blocking. Directory submission remains deferred pending a separate decision about a reduced skills-only listing.
