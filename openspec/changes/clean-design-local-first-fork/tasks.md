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

- [x] 3.1 Remove account, hosted-cloud, team, billing, promotion, news, deployment, updater, external MCP, and plugin-host UI surfaces
- [x] 3.2 Remove or deny corresponding daemon routes and background initializers without changing retained creation APIs
- [x] 3.3 Remove PostHog, Langfuse, telemetry relay, updater, and hosted-service egress from active runtime dependency graphs
- [x] 3.4 Add outbound allow-policy and forbidden-service regression tests proving zero egress for local-only workflows
- [x] 3.5 Purge all removed-service and unused-transport code, configuration, UI, documentation, fixtures, and tests; reduce local coding runtimes and profile bases to Codex, Claude Code, Antigravity, OpenCode, and Pi while retaining internal BYOK OpenCode

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
- [x] 5.7 Add unit, integration, and Playwright coverage for trust, secrets, atomicity, collisions, formats, and clipboard failure

## 6. Finite Acceptance

- [x] 6.1 Run guard, typecheck, and affected package test suites and repair all regressions
- [x] 6.2 Build, install, launch, restart, quit, uninstall, and clean the Apple Silicon application; verify loopback sidecars terminate and product data stays namespace-scoped
- [x] 6.3 Complete one representative real generation through either an allowlisted local CLI or configured BYOK provider, then export and inspect one handoff packet
- [x] 6.4 Run the final product-boundary audit for removed services, unsupported runtimes, unintended outbound destinations, visible identity, secrets, and required provenance; repair concrete findings

## 7. Public v0.1.0 Release

- [ ] 7.1 Refresh Claude, Codex, Antigravity, OpenCode, and Pi model choices and focused tests without exposing retired models or writing external CLI settings
- [ ] 7.2 Implement the bilingual public launch page with the confirmed A hero, real product imagery, direct downloads, English and Chinese README files, and GitHub metadata
- [ ] 7.3 Build the Apple Silicon DMG and ZIP, generate SHA-256 checksums, and verify packaged title, icon, startup, Home, launch, quit, uninstall, and cleanup behavior
- [ ] 7.4 Run Node 24 guard, typecheck, affected tests, one real supported generation, one handoff export inspection, and the finite release-boundary audit; repair concrete failures
- [ ] 7.5 Publish the repository, `v0.1.0` tag, release notes, and verified artifacts, then confirm the public landing and download links
