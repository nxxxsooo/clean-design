## Context

The repository is a history-free snapshot of Open Design 0.16.1 at `276b4d8e970bc143d7ad060181a89a834e3d9caf`. Its Electron shell, packaged sidecars, daemon, Next.js renderer, shared contracts, archive traversal, provider adapters, catalogs, and export renderers are retained. See `proposal.md` for motivation and the capability specs for observable behavior.

## Goals / Non-Goals

**Goals:**

- Preserve the proven creation engine while isolating all installed/runtime identity.
- Make local-only behavior mechanically testable through explicit egress and credential boundaries.
- Build handoff from existing export/render primitives with deterministic packet semantics.
- Keep changes reviewable as dependency-ordered vertical slices.

**Non-Goals:**

- Rewriting the daemon, renaming internal package scopes, or renaming all `OD_*` development variables.
- Windows/Linux delivery, collaboration, deployment, marketplace growth, or new format-specific editors.
- Direct invocation of a receiving coding agent.

## Decisions

### Snapshot provenance and release topology

Keep the squashed baseline commit, Apache-2.0 license, an upstream reference remote, and an explicit provenance notice. Develop in a private GitHub repository and make it public only after the scrub gate. This avoids GitHub's public-fork visibility restriction and keeps the inherited history out of the new repository; retaining upstream history was rejected because it expands secret/branding audit surface without improving selective patching.

### Identity changes stop at installed/runtime boundaries

Use `Clean Design`, version `0.1.0`, bundle ID `fun.mjshao.clean-design`, scheme `cleandesign`, `/tmp/clean-design/ipc`, and a separate user-data root throughout desktop, packaged runtime, process stamps, installers, and visible UI. Keep internal `@open-design/*` package names and compatible development environment variables for the first release. A global mechanical rename was rejected because it would create large, low-value conflicts with curated upstream fixes.

### Removed services are denied by construction

Remove their UI routes and daemon route registration, disable updater startup, remove telemetry initialization/relay packages from active dependency graphs, and add a central outbound allow-policy around application-owned fetches. Release/landing automation inherited from upstream is disabled or deleted before public visibility. Hiding controls alone was rejected because background egress and callable endpoints would remain.

### Credentials cross one privileged desktop boundary

The packaged Electron main process owns a small encrypted JSON vault under the Clean Design data root. Values are encrypted with Electron protected storage, the file is atomically replaced at mode `0600`, and renderer IPC exposes list/upsert/delete operations returning references and masks. Desktop-authenticated registration sends plaintext to the loopback daemon only when needed; daemon configuration stores references, not values. Plaintext localStorage or daemon-side disk encryption was rejected because either leaves secrets in the renderer or duplicates OS-key access in a less trusted process.

### Handoff root is separate privileged metadata

Do not add `handoffRoot` to generic project mutation DTOs. A desktop-authenticated route invokes the native picker, canonicalizes and validates the root, then writes dedicated project metadata. This prevents compromised project content or the renderer from selecting arbitrary destinations.

### Packet building extends the existing safe archive boundary

Extract the existing symlink-safe project walker into a packet input collector. Add secret scanning, hidden/config/data-root exclusions, byte limits, format-aware render steps, SHA-256 file records, a manifest-v1 contract, and a deterministic prompt builder. Build in a sibling temporary directory, fsync/close outputs, then atomically rename to the final version path. An archive-only output was rejected because users and receiving agents need directly inspectable prompts and previews.

### Optional and required renders are explicit

Use existing HTML screenshot, PDF, deck, document, and media exporters. Required artifacts abort and clean the temporary packet; optional deck PPTX failure becomes a manifest warning. Clipboard is outside packet transactionality, so its failure never invalidates a completed export.

## Risks / Trade-offs

- [Large inherited daemon leaves dormant code reachable by future changes] -> remove route registration and add forbidden-surface/egress regression guards.
- [Provider credentials exist in daemon memory during use] -> keep registration authenticated, avoid persistence/logging, and minimize lifetime.
- [Secret scanning can produce false positives] -> use high-confidence signatures plus explicit filenames and report the rejected relative path without echoing content.
- [Format renderers have uneven reliability] -> distinguish required from optional outputs and verify every artifact family with fixtures.
- [Public catalogs contain third-party names or assets] -> keep the repository private until the explicit licensing, trademark, branding, link, and secret scrub passes.

## Migration Plan

1. Preserve the untouched baseline commit and verify it under Node 24/pnpm 10.33.2.
2. Land isolated identity and provenance, then verify coexistence and packaging tests.
3. Remove service surfaces and establish zero-egress tests before credential work.
4. Migrate provider settings to credential references; do not import legacy plaintext Open Design localStorage.
5. Add trusted roots and handoff packets behind shared contracts, then expose the Studio UI command.
6. Package and install the Apple Silicon app, run full regression and scrub audits, then tag `v0.1.0` and change repository visibility only if every release gate passes.

Rollback is a Git revert to the last green slice. The product uses isolated data and identity, so rollback does not require migration of Open Design data.
