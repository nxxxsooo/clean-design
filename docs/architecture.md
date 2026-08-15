# Architecture

**Sibling:** [`skills-protocol.md`](skills-protocol.md)

This document describes the code-backed runtime topology and the boundaries
between the web app, daemon, desktop/packaged shells, agent runtimes, and local
content registries. For repository ownership rules, the root and layer
`AGENTS.md` files remain authoritative.

## 1. Runtime shapes

### Source development

`pnpm tools-dev` is the only repository lifecycle entry point. It manages the
daemon and web sidecars and, for the default target set, the Electron desktop
shell. `pnpm tools-dev run web` keeps daemon and web in the foreground without
starting desktop.

When ports are not supplied, `tools-dev` chooses available daemon and web
ports. `--daemon-port` and `--web-port` make them explicit. The web sidecar
receives the selected daemon port and rewrites `/api/*`, `/artifacts/*`, and
`/frames/*` to the sibling Express process. Ports are transport details; they
do not define process identity, namespaces, or daemon data roots.

### Packaged desktop

`apps/packaged` starts the packaged daemon and web sidecars alongside the
Electron desktop shell. Packaged code resolves namespace-scoped runtime and
data identities before spawning the daemon, and the desktop discovers the web
URL through authenticated sidecar IPC rather than assuming a port.

Read `tools/pack/AGENTS.md` before changing packaged launch, install, cleanup,
or namespace identity behavior.

## 2. Component topology

```text
browser or Electron renderer
          │
          │ same-origin HTTP + SSE
          ▼
Next.js web app ────────────────┐
          │                     │ static UI / preview state
          │ /api/* rewrites     │
          ▼                     │
Express daemon ◄────────────────┘
   │       │        │
   │       │        ├─ SQLite state and daemon-owned project files
   │       ├─ skills / design templates / design systems
   └─ runtime registry → one of five supported local CLIs
                            │
                            └─ structured events, file writes, or text output
```

The web UI and internal commands share the same daemon HTTP APIs rather than
implementing product logic twice.

## 3. Main components

### 3.1 Web app (`apps/web`)

The web app is a Next.js 16 App Router application using React 18. It owns:

- project, chat, file-workspace, preview, Settings, and creation
  workflows;
- daemon and BYOK transport providers;
- rendering of streamed runtime events and inline artifacts such as
  `<question-form>`;
- preview/export bridges and the srcDoc-versus-URL render decision.

Projects, conversations, messages, and project files are hydrated through the
daemon APIs. Browser state is used for UI state and selected local preferences,
not as an alternate browser-only project database.

### 3.2 Daemon (`apps/daemon`)

The Express daemon is the product authority for `/api/*`. It owns:

- project and conversation persistence;
- file listing, upload, version, preview, import, and export routes;
- agent detection, launch, run bookkeeping, cancellation, and SSE output;
- prompt composition from the active design system, primary skill/template,
  craft rules, project metadata, and per-turn additions;
- media, memory, library, and design-system services;
- static production serving and loopback/security policy.

`apps/daemon/src/server.ts` still composes the application, while route modules
under `apps/daemon/src/routes/` own increasingly focused HTTP boundaries.
Shared request/response shapes live in `packages/contracts`.

### 3.3 Runtime registry and detection

`apps/daemon/src/runtimes/registry.ts` collects one `RuntimeAgentDef` for Codex,
Claude Code, Antigravity, OpenCode, and Pi, plus allowed user-defined profiles.
The internal `byok-opencode` definition is not public runtime discovery.
Definitions declare launch,
prompt delivery, model discovery, auth probing, stream format, and optional
capabilities; the shared engine performs the lifecycle.

On each detection pass, definitions are probed concurrently. Detection first
uses `resolveAgentLaunch()` so the probed executable is the same configured,
fallback, or packaged path a run will spawn. A successful version launch gates
availability; help/capability, model, and declared auth probes then run in
parallel. There is no config-directory confidence heuristic or persisted
24-hour availability cache.

### 3.4 Content registries

Functional skills and rendering templates are separate listing surfaces:

| Surface | Bundled source | API | Purpose |
|---|---|---|---|
| Functional skills | `skills/` | `/api/skills` | Capabilities an agent invokes while working |
| Design templates | `design-templates/` | `/api/design-templates` | Renderable starting points for creation workflows |
| Design systems | `design-systems/` | `/api/design-systems` | Brand tokens, rules, and fixtures |
| Craft | `craft/` | composed by the daemon | Universal rules requested by a skill/template |

The skill and template endpoints scan their user-writable root first and their
bundled root second on each listing request; a user entry can shadow a bundled
entry with the same id. Chat resolution spans both roots because a persisted
project's primary `skillId` may identify either a functional skill or a design
template. Listing separation does not imply automatic composition: selecting
a Start from template replaces the creation tab's default primary skill.

The design-system service has its own import, validation, and storage rules; it
is not an additional skill root.

### 3.5 Persistence and project files

On startup, `apps/daemon/src/server.ts` resolves `OD_DATA_DIR` once into
`RUNTIME_DATA_DIR`. SQLite, managed project workspaces, artifacts, user-owned
registry entries, credentials, and other daemon-owned data derive from that
resolved root.

The one project-workspace exception is folder import: an imported project uses
the user-selected external `metadata.baseDir`. The daemon validates and bounds
file operations against that selected workspace instead of copying it into the
managed-project root.

This document intentionally gives no concrete daemon data path. The root
`AGENTS.md` section **Daemon data directory contract** is the only path
authority.

### 3.6 Preview renderer

The file workspace previews project files in sandboxed iframes. HTML can load
from a daemon URL or through srcDoc; bridges for inspection, comment selection,
palette/edit/tweak behavior, and other host integration require the srcDoc
path. `apps/web/src/components/file-viewer-render-mode.ts` owns that decision.

The host keeps URL and srcDoc frames mounted when switching render mode to
avoid reload flashes. Message handlers validate the sending iframe, and
signals that must come from the active frame re-check the active window.

## 4. Generation data flow

### Filesystem execution profile

1. The web UI creates or selects a project through `/api/projects`.
2. A chat/run request reaches the daemon over `/api/*`.
3. The daemon resolves the project, design system, primary skill or design
   template, per-turn skills, runtime definition, and execution metadata.
4. The daemon spawns the runtime with the project workspace as its working
   directory and streams normalized events over SSE.
5. Structured/tool-capable runtimes write canonical project files. File events
   update the file workspace, and a previewable file becomes the rendered
   deliverable.
6. The assistant ends with an ordinary summary of the files it wrote; it does
   not duplicate source in a code `<artifact>` block.

### Text-artifact execution profile

Plain-stream runtimes and BYOK/API execution have no filesystem tools in the
model loop. Their canonical deliverable is one complete source-code
`<artifact>` block. The host parses and materializes that output so it reaches
the same file workspace and preview surfaces.

`packages/contracts/src/execution-profile.ts` maps a runtime's stream format to
the handoff profile. The prompt composers enforce the corresponding contract.

## 5. HTTP and streaming boundary

The shipped web/daemon protocol is HTTP plus Server-Sent Events, not the
WebSocket RPC sketched in the original architecture draft. Representative
surfaces include:

```text
GET  /api/health
GET  /api/agents
GET  /api/skills
GET  /api/design-templates
GET  /api/design-systems
GET  /api/projects
POST /api/projects
POST /api/import/folder
GET  /api/projects/:id/files
POST /api/projects/:id/upload
POST /api/chat                         -> text/event-stream
```

The exact API list and DTOs evolve in route modules and `packages/contracts`;
the table above is an orientation aid, not an exhaustive protocol schema.

SSE responses disable transforms and emit keepalives so long local runs remain
observable through the loopback boundary.

## 6. Folder import and desktop trust

`POST /api/import/folder` creates a project rooted at a user-selected folder.
The daemon canonicalizes and validates the path, rejects imports inside its own
managed storage, and applies safe path resolution to every later file access.

When paired with desktop, folder import is guarded by a short-lived,
single-use HMAC token minted by the trusted main process after the native
folder picker succeeds. Packaged and source-development launches explicitly
select whether that desktop-auth gate applies. Imported projects that may use
the desktop open-path bridge carry a server-controlled trusted-picker marker;
ordinary project create/update requests cannot forge it.

The implementation source of truth is `apps/daemon/src/desktop-auth.ts`,
`apps/daemon/src/import-export-routes.ts`, and the desktop/packaged launchers.
Shared DTOs live in `packages/contracts`.

## 7. Security boundaries

- The daemon binds to loopback. Clean Design has no public server or deployment
  mode.
- External fetch/proxy routes enforce URL and SSRF policy at their daemon
  boundary.
- Artifact previews run in sandboxed iframes without host
  same-origin access; individual surfaces opt into only the sandbox features
  they require, such as downloads or popups.
- File routes resolve and validate paths against the active project root.
  Imported-folder projects use their validated external root; managed projects
  use the daemon-managed project root.
- Runtime spawn policy is declared per adapter and augmented by daemon sandbox
  settings. Do not assume every upstream CLI has the same permission flags.
- Credentials and tokens are daemon-owned data unless a narrowly documented
  integration says otherwise. They must follow the data-root and redaction
  rules rather than being copied into project files.

## 8. Source map

| Concern | Primary source |
|---|---|
| Web product UI | `apps/web/src/` |
| Daemon composition and data-root resolution | `apps/daemon/src/server.ts` |
| Focused daemon HTTP boundaries | `apps/daemon/src/routes/` |
| Shared web/daemon DTOs and prompt contracts | `packages/contracts/src/` |
| Runtime definitions and engine | `apps/daemon/src/runtimes/` |
| Functional-skill loader | `apps/daemon/src/skills.ts` |
| Packaged launch | `apps/packaged/`, `tools/pack/` |
| Development lifecycle | `tools/dev/` |
| User-level validation | `e2e/` |

When a user-facing capability changes, keep its daemon endpoint, shared
contract and web surface aligned as required by the root `AGENTS.md` rules.
