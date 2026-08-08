## 1. Bootstrap and Provenance

- [x] 1.1 Import the pinned Open Design 0.16.1 snapshot as a history-free baseline and configure the upstream reference remote
- [x] 1.2 Create the private GitHub repository and record green Node 24/pnpm 10.33.2 guard and typecheck baselines
- [x] 1.3 Add Clean Design provenance, license, privacy, release-gate, and contribution documentation
- [x] 1.4 Set root product version to 0.1.0 without renaming internal package scopes

## 2. Product Identity and Lifecycle

- [x] 2.1 Replace user-visible application identity with Clean Design across renderer, desktop, packaged runtime, and macOS packaging
- [x] 2.2 Apply bundle ID, URI scheme, IPC root, data-root, and process-stamp isolation with focused identity tests
- [x] 2.3 Remove global CLI installation and silent/headless bootstrap paths while preserving local CLI generation adapters
- [x] 2.4 Verify packaged sidecar startup, loopback binding, normal quit cleanup, and coexistence with Open Design paths

## 3. Local-Only Service Boundary

- [ ] 3.1 Remove account, AMR/cloud, team, billing, promotion, news, deployment, updater, external MCP, and plugin-host UI surfaces
- [ ] 3.2 Remove or deny corresponding daemon routes and background initializers without changing retained creation APIs
- [ ] 3.3 Remove PostHog, Langfuse, telemetry relay, updater, and hosted-service egress from active runtime dependency graphs
- [ ] 3.4 Add outbound allow-policy and forbidden-service regression tests proving zero egress for local-only workflows

## 4. Encrypted Credential References

- [x] 4.1 Add shared credential-reference contracts and authenticated desktop IPC/API boundaries
- [x] 4.2 Implement the Electron protected-storage vault with atomic mode-0600 writes, masking, deletion, and fail-closed behavior
- [x] 4.3 Replace renderer localStorage secrets for chat, media, and CLI overrides with credential references
- [x] 4.4 Register decrypted values ephemerally with the daemon and add authorization, persistence, and redaction tests

## 5. Immutable Prompt Handoff

- [x] 5.1 Add manifest-v1, trusted-root, packet request/response, warning, and stable error contracts
- [x] 5.2 Implement desktop-authenticated folder selection and privileged canonical handoff-root metadata
- [x] 5.3 Refactor the symlink-safe archive walker into a size-limited, realpath-contained, secret-filtered packet collector
- [x] 5.4 Implement deterministic prompt, manifest hashing, immutable path allocation, temporary build, and atomic publication
- [x] 5.5 Integrate required HTML/deck/document/media/brand previews and optional PPTX warning behavior
- [x] 5.6 Replace agent-selector handoff UI with Export handoff, progress, warnings, stable errors, and clipboard fallback
- [ ] 5.7 Add unit, integration, and Playwright coverage for trust, secrets, atomicity, collisions, formats, and clipboard failure

## 6. Acceptance and Release Gate

- [ ] 6.1 Run guard, typecheck, and affected package test suites and repair all regressions
- [ ] 6.2 Exercise every artifact family with mocked runtimes plus one real local-CLI and one real BYOK generation
- [ ] 6.3 Build and install the Apple Silicon application, capture screenshots, inspect a real packet, and perform a pasted handoff
- [ ] 6.4 Verify restart, quit process cleanup, identity coexistence, and uninstall cleanup on macOS
- [ ] 6.5 Audit secrets, history, licenses, trademarks, visible branding, catalogs, telemetry, affiliate links, update endpoints, and outbound destinations
- [ ] 6.6 Make the repository public and tag v0.1.0 only after every scrub and acceptance check passes
