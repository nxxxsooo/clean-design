# Clean Design Codex Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before claiming completion.

**Goal:** Ship a manually installable, repo-owned `clean-design` Codex plugin whose skills guide Codex and whose MCP server attaches every parent/subagent session to one bounded, authenticated, headless Clean Design service per namespace.

**Architecture:** Each Codex MCP client runs one lightweight Node stdio bridge from the plugin. The bridge uses connect-lock-recheck startup to attach to one packaged daemon service and one hidden Electron render broker at namespace-stable Unix sockets. The bridge authenticates once, acquires a renewable lease, and calls a dedicated allowlisted daemon API; the daemon never invokes an agent or provider on behalf of MCP. Existing five-field sidecar stamps remain unchanged, while richer runtime compatibility data and authentication material live in separate owner-only files.

**Tech Stack:** Node.js 24, TypeScript 5.9, pnpm 10.33.2, Electron, Express 5, Vitest 4, `@modelcontextprotocol/server` 2.0.0, Zod 4.4.3, Unix-domain JSON IPC, HMAC-SHA256, native Codex plugin manifests and skills.

## Global Constraints

- Preserve all unrelated dirty worktree changes. Stage and commit only the files named by the current task.
- Keep user-visible identity `Clean Design`; internal `@open-design/*` package names and `OD_*` compatibility variables stay unchanged.
- Keep `SidecarStamp` at exactly `app`, `mode`, `namespace`, `ipc`, and `source`.
- Bind HTTP only to loopback. Stable identity is `/tmp/clean-design/ipc/<namespace>/service.sock`, never a port.
- Use one daemon service, at most one Electron render broker, render concurrency `1`, MCP API concurrency `2`, client capacity `16`, queue capacity `32`, lease TTL `45s`, renewal interval `20s`, idle exit `60s`, and restart budget `3 starts / 5 minutes` unless a test justifies changing a constant.
- The MCP profile must not expose agent runs, providers, credentials, arbitrary shell, arbitrary host paths, deletion, plugin hosting, networking, or destructive project operations.
- Do not log MCP bodies, file contents, secrets, signatures, nonces, authorization headers, provider values, or decrypted credentials.
- Keep MCP stdout strictly newline-delimited JSON-RPC. Diagnostics go to stderr.
- Use a new OpenSpec change instead of modifying the dirty `clean-design-local-first-fork` change.
- For every task: write the named failing test first, run it and observe the expected failure, implement the smallest passing slice, rerun the focused checks, then make the named checkpoint commit.

## Task 1: Record the Approved First-Party Exception

**Files:**

- Create: `openspec/changes/clean-design-codex-service/proposal.md`
- Create: `openspec/changes/clean-design-codex-service/design.md`
- Create: `openspec/changes/clean-design-codex-service/tasks.md`
- Create: `openspec/changes/clean-design-codex-service/specs/local-studio/spec.md`
- Modify: `AGENTS.md`
- Modify: `apps/daemon/AGENTS.md`
- Modify: `tools/pack/AGENTS.md`
- Test: `scripts/product-neutrality.test.ts`

- [ ] Add a red policy assertion that permits only a first-party `plugins/clean-design` Codex integration and still rejects hosted/external MCP/plugin-host surfaces.

```ts
assert.match(rootGuide, /first-party Codex plugin/);
assert.match(rootGuide, /MCP cannot invoke agents or providers/);
```

- [ ] Run `node --import tsx --test scripts/product-neutrality.test.ts`; expect failure because the approved exception is not documented.
- [ ] Write the OpenSpec proposal and delta spec with these requirements: manual repo install; skill-led workflow; one namespace singleton; lightweight per-client bridge; headless rendering; bounded capacity; authenticated IPC/API; no MCP-to-agent/provider path; desktop reuse; deterministic idle shutdown.
- [ ] Amend the root product contract narrowly: allow this first-party local Codex plugin and headless service bootstrap only. Explicitly keep accounts, hosted collaboration, external plugin hosting, global CLI install, telemetry, updater, and hosted-service restoration prohibited.
- [ ] Amend daemon guidance so the private authenticated `/api/mcp/v1/*` adapter is exempt from public CLI parity; public product capabilities still require normal route/CLI parity.
- [ ] Amend pack guidance so only the signed first-party plugin may bootstrap the packaged namespace service; no public global headless CLI is introduced.
- [ ] Rerun `node --import tsx --test scripts/product-neutrality.test.ts`; expect pass.
- [ ] Commit: `git add AGENTS.md apps/daemon/AGENTS.md tools/pack/AGENTS.md scripts/product-neutrality.test.ts openspec/changes/clean-design-codex-service && git commit -m "docs: specify Clean Design Codex service"`.

## Task 2: Extend the Sidecar Protocol Without Changing Stamps

**Files:**

- Modify: `packages/sidecar-proto/src/index.ts`
- Modify: `packages/sidecar-proto/tests/index.test.ts`
- Modify: `packages/sidecar-proto/tests/ipc-path.test.ts`

- [ ] Add red tests that the stamp field array still has exactly five values, `APP_KEYS.RENDERER` derives a namespace-scoped socket, and new client messages reject unknown roles or malformed lease IDs.

```ts
expect(STAMP_FIELDS).toEqual(["app", "mode", "namespace", "ipc", "source"]);
expect(buildIpcPath({ app: APP_KEYS.RENDERER, namespace: "clean-design" }))
  .toBe("/tmp/clean-design/ipc/clean-design/renderer.sock");
expect(parseSidecarMessage({ type: "acquire-client", role: "provider" })).toBeNull();
```

- [ ] Run `pnpm --filter @open-design/sidecar-proto test`; expect failures for the missing renderer key and client messages.
- [ ] Add `APP_KEYS.RENDERER` and the following protocol types without adding stamp fields:

```ts
export type ServiceClientRole = "desktop" | "mcp" | "cli";
export type AcquireClientMessage = {
  type: typeof SIDECAR_MESSAGES.ACQUIRE_CLIENT;
  role: ServiceClientRole;
  clientId: string;
  clientNonce: string;
  expiresAt: number;
  signature: string;
};
export type RenewClientMessage = { type: typeof SIDECAR_MESSAGES.RENEW_CLIENT; leaseId: string; expiresAt: number; signature: string };
export type ReleaseClientMessage = { type: typeof SIDECAR_MESSAGES.RELEASE_CLIENT; leaseId: string; signature: string };
```

- [ ] Add success/error response DTOs carrying `leaseId`, `serverNonce`, `leaseExpiresAt`, capacity, protocol version, and stable error codes. Never carry the root runtime secret.
- [ ] Extend `DaemonStatusSnapshot` with optional compatibility fields (`protocolVersion`, `serviceVersion`, `activeClients`, `queuedJobs`, `renderBusy`) so older readers remain valid.
- [ ] Rerun sidecar-proto tests and `pnpm --filter @open-design/sidecar-proto typecheck`; expect pass.
- [ ] Commit: `git add packages/sidecar-proto && git commit -m "feat: add shared service lease protocol"`.

## Task 3: Add Owner-Only Runtime State and Startup Lock Primitives

**Files:**

- Modify: `packages/sidecar/src/json-file.ts`
- Modify: `packages/sidecar/src/index.ts`
- Create: `packages/sidecar/tests/private-json-file.test.ts`
- Create: `packages/platform/src/file-lock.ts`
- Modify: `packages/platform/src/index.ts`
- Create: `packages/platform/tests/file-lock.test.ts`

- [ ] Add red tests for mode-`0600` atomic JSON writes, mode-`0700` parent directories, exclusive lock acquisition, bounded lock waiting, and stale lock recovery only when the recorded PID is dead.
- [ ] Run `pnpm --filter @open-design/sidecar test` and `pnpm --filter @open-design/platform test`; expect missing-export failures.
- [ ] Implement these narrow primitives:

```ts
export async function writePrivateJsonFile(path: string, value: unknown): Promise<void>;
export async function readPrivateJsonFile<T>(path: string): Promise<T | null>;
export async function acquireProcessFileLock(options: {
  path: string;
  owner: { pid: number; startedAt: string };
  timeoutMs: number;
  isProcessAlive?: (pid: number) => Promise<boolean>;
}): Promise<{ release(): Promise<void> }>;
```

- [ ] Use exclusive file creation, atomic rename, and `lstat`/owner checks. Reject symlinks and non-regular files. A live or ambiguous owner is never broken.
- [ ] Keep product path and sidecar-message knowledge out of both generic packages.
- [ ] Rerun focused tests and both package typechecks; expect pass.
- [ ] Commit: `git add packages/sidecar packages/platform && git commit -m "feat: add private runtime lock primitives"`.

## Task 4: Implement Service Runtime State, Leases, and Circuit Breaking

**Files:**

- Create: `apps/daemon/src/sidecar/service-runtime.ts`
- Create: `apps/daemon/src/sidecar/service-leases.ts`
- Create: `apps/daemon/tests/sidecar/service-runtime.test.ts`
- Create: `apps/daemon/tests/sidecar/service-leases.test.ts`
- Modify: `apps/daemon/src/sidecar/server.ts`

- [ ] Add red tests for runtime descriptor compatibility, namespace/fingerprint-bound HMAC acquisition, replay rejection, capacity `16`, renewal, release, expired-lease reclamation, `60s` idle shutdown eligibility, and restart budget `3 / 5min`.
- [ ] Run `pnpm --filter @open-design/daemon test -- tests/sidecar/service-runtime.test.ts tests/sidecar/service-leases.test.ts`; expect module-not-found failures.
- [ ] Define a separate descriptor and secret path under the namespace runtime directory:

```ts
export interface ServiceRuntimeDescriptor {
  pid: number;
  protocolVersion: 1;
  serviceVersion: string;
  namespace: string;
  executableFingerprint: string;
  dataRootFingerprint: string;
  internalUrl: string;
  startedAt: string;
}
```

- [ ] Store `service-runtime.json`, `mcp-secret`, `service-start.lock`, and restart-attempt timestamps as private files. Never add them to `SidecarStamp`.
- [ ] Implement `ServiceLeaseRegistry` with immutable role, `crypto.randomUUID()` lease IDs, a monotonic/clock-injected expiry check, used-nonce cache, and explicit `SERVICE_CAPACITY`, `AUTH_FAILED`, and `SERVICE_RESTART_BUDGET_EXCEEDED` results.
- [ ] Extend daemon sidecar handling for `ACQUIRE_CLIENT`, `RENEW_CLIENT`, and `RELEASE_CLIENT`; report counts through status. Idle shutdown is eligible only when no live lease and no active/queued job remain.
- [ ] Rerun focused daemon tests and daemon typecheck; expect pass.
- [ ] Commit: `git add apps/daemon/src/sidecar apps/daemon/tests/sidecar && git commit -m "feat: manage bounded service leases"`.

## Task 5: Make Packaged Daemon Startup Attach-or-Start

**Files:**

- Create: `apps/packaged/src/service-manager.ts`
- Create: `apps/packaged/tests/service-manager.test.ts`
- Modify: `apps/packaged/src/sidecars.ts`
- Modify: `apps/packaged/tests/sidecars.test.ts`
- Modify: `apps/packaged/src/index.ts`

- [ ] Add red tests that 32 concurrent callers invoke the daemon spawn function exactly once, compatible running service is reused, incompatible service returns `SERVICE_VERSION_MISMATCH`, and releasing a desktop lease does not kill MCP-owned service.
- [ ] Run `pnpm --filter @open-design/packaged test -- tests/service-manager.test.ts tests/sidecars.test.ts`; expect failures because startup currently retires an existing daemon.
- [ ] Extract `ensurePackagedDaemonService` with injectable socket connector, lock, spawner, clock, and backoff:

```ts
export async function ensurePackagedDaemonService(options: EnsureServiceOptions): Promise<{
  status: DaemonStatusSnapshot;
  lease: ServiceLease;
  started: boolean;
}>;
```

- [ ] Implement connect -> lock -> recheck -> restart-budget check -> spawn -> readiness -> descriptor publish. Losing callers use bounded jittered backoff and attach; they do not spawn.
- [ ] Remove the unconditional `retireExistingSidecarEndpoint` behavior from normal desktop startup. Keep exact-namespace stop/uninstall paths in `tools/pack` authoritative for explicit shutdown.
- [ ] Change packaged desktop teardown to release its lease and stop only desktop-owned web/renderer resources; daemon idle policy decides final shutdown.
- [ ] Rerun packaged tests and typecheck; expect pass.
- [ ] Commit: `git add apps/packaged && git commit -m "feat: reuse packaged daemon singleton"`.

## Task 6: Add One Headless Electron Render Broker

**Files:**

- Create: `apps/desktop/src/main/render-broker.ts`
- Create: `apps/desktop/tests/main/render-broker.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Create: `apps/packaged/src/headless-service.ts`
- Create: `apps/packaged/tests/headless-service.test.ts`
- Modify: `apps/packaged/src/index.ts`
- Modify: `apps/daemon/src/sidecar/server.ts`
- Modify: `apps/daemon/tests/sidecar-server.test.ts`

- [ ] Add red tests that PDF, slide, and artifact requests share one FIFO broker, only one render executes at a time, the queue rejects item `33` with `SERVICE_CAPACITY`, and shutdown waits for/cancels jobs deterministically without opening a visible window.
- [ ] Run focused desktop, packaged, and daemon sidecar tests; expect missing broker/entry failures.
- [ ] Extract existing `EXPORT_PDF`, `RENDER_SLIDES`, and `EXPORT_ARTIFACT` dispatch from `apps/desktop/src/main/index.ts` into:

```ts
export interface RenderBroker {
  submit(message: DesktopRenderMessage): Promise<DesktopRenderResponse>;
  status(): { active: boolean; queued: number };
  close(): Promise<void>;
}
export function createRenderBroker(options: { concurrency: 1; maxQueue: 32 }): RenderBroker;
```

- [ ] Preserve the existing hidden-window implementations in `pdf-export.ts`, `deck-capture.ts`, and `artifact-export.ts`; do not create a persistent visible `BrowserWindow`.
- [ ] Implement `runHeadlessService()` as an early packaged-main branch selected by `--clean-design-headless-service`. It must not claim the desktop single-instance lock, create splash/main/pet windows, or start web. It ensures the daemon singleton and starts one `renderer.sock` IPC server, but it does **not** acquire a client lease of its own. MCP/desktop clients alone keep the daemon alive; the broker watches the daemon PID/socket and exits when daemon idle shutdown completes.
- [ ] Change daemon render delegation to prefer the renderer socket, fall back to an attached desktop renderer for compatibility, and return `RENDER_FAILED` without sensitive logs when neither is available.
- [ ] Rerun focused tests and typechecks for desktop, packaged, and daemon; expect pass.
- [ ] Commit: `git add apps/desktop apps/packaged apps/daemon/src/sidecar apps/daemon/tests/sidecar && git commit -m "feat: add singleton headless render broker"`.

## Task 7: Add a Dedicated Authenticated MCP Application Service

**Files:**

- Create: `apps/daemon/src/services/mcp-profile.ts`
- Create: `apps/daemon/src/http/mcp-auth.ts`
- Create: `apps/daemon/src/routes/mcp-profile.ts`
- Create: `apps/daemon/tests/services/mcp-profile.test.ts`
- Create: `apps/daemon/tests/http/mcp-auth.test.ts`
- Create: `apps/daemon/tests/routes/mcp-profile.test.ts`
- Modify: `apps/daemon/src/server-context.ts`
- Modify: `apps/daemon/src/route-context-contract.ts`
- Modify: `apps/daemon/src/server.ts`

- [ ] Add red unit and route tests covering signature verification, expiry, replay, body-digest binding, immutable lease role, project containment, symlink escape, hidden/secret/oversized files, atomic write, pagination, response cap, and absence of agent/provider dependencies.
- [ ] Run the three focused test files; expect missing service/registrar failures.
- [ ] Implement canonical request signing:

```text
HMAC-SHA256(sessionKey,
  METHOD + "\n" + PATH + "\n" + SHA256(BODY) + "\n" + LEASE_ID + "\n" + NONCE + "\n" + EXPIRES)
```

Use `timingSafeEqual`; permit ±30 seconds; consume each nonce once; reject missing/extra auth fields before route execution.
- [ ] Implement a pure `McpProfileService` by composing existing owners (`db.ts`, `projects.ts`, skills, design-system server services, preview/render/export/handoff). Put calls behind a two-active/32-queued scheduler shared by every MCP lease. Expose only:

```ts
getServiceInfo();
listProjects(cursor?, limit?); getProject(projectId); createProject(input);
listFiles(projectId, cursor?, limit?); readFile(projectId, path); writeFile(projectId, path, content, expectedDigest?);
listDesignSystems(cursor?, limit?); readDesignSystem(id); selectDesignSystem(projectId, id);
listSkills(cursor?, limit?); readSkill(id);
preview(projectId, path); render(projectId, path, format); exportHandoff(projectId, options);
```

- [ ] Do not expose delete, run/start-agent, provider, connector, credential, network, shell, generic mutation, or arbitrary filesystem methods. Assert this structurally in the service test.
- [ ] Register private `/api/mcp/v1/*` routes with strict JSON parsing, `25_000` character response cap, default page `50`, max page `100`, stable error envelope, and explicit `Cache-Control: no-store`.
- [ ] Rerun focused tests and daemon typecheck; expect pass.
- [ ] Commit: `git add apps/daemon/src/services/mcp-profile.ts apps/daemon/src/http/mcp-auth.ts apps/daemon/src/routes/mcp-profile.ts apps/daemon/src/server-context.ts apps/daemon/src/route-context-contract.ts apps/daemon/src/server.ts apps/daemon/tests/services/mcp-profile.test.ts apps/daemon/tests/http/mcp-auth.test.ts apps/daemon/tests/routes/mcp-profile.test.ts && git commit -m "feat: expose bounded MCP profile API"`.

## Task 8: Build the Modern MCP v2 Stdio Bridge

**Files:**

- Create: `tools/codex-plugin/package.json`
- Create: `tools/codex-plugin/tsconfig.json`
- Create: `tools/codex-plugin/vitest.config.ts`
- Create: `tools/codex-plugin/esbuild.config.mjs`
- Create: `tools/codex-plugin/src/service-client.ts`
- Create: `tools/codex-plugin/src/tool-definitions.ts`
- Create: `tools/codex-plugin/src/server.ts`
- Create: `tools/codex-plugin/src/index.ts`
- Create: `tools/codex-plugin/tests/service-client.test.ts`
- Create: `tools/codex-plugin/tests/tool-definitions.test.ts`
- Create: `tools/codex-plugin/tests/stdio.test.ts`
- Modify: `apps/daemon/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Add the workspace package with `@modelcontextprotocol/server` `2.0.0` and `zod` `4.4.3`. Remove the unused legacy `@modelcontextprotocol/sdk` dependency from the daemon.
- [ ] Add red tests for connect-lock-recheck attach, signed fetch requests, lease heartbeat/release on stdin EOF, strict schemas, tool annotations, structured outputs, pagination, errors on stderr, and zero non-JSON output on stdout.
- [ ] Run `pnpm --filter @open-design/codex-plugin test`; expect failures because the package implementation is absent.
- [ ] Implement v2 stdio with only official v2 imports:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
```

- [ ] Register namespaced tools with strict `inputSchema`, `outputSchema`, `structuredContent`, JSON text fallback, read-only/destructive annotations, actionable stable errors, and bounded descriptions:

```text
clean_design_service_info
clean_design_list_projects
clean_design_get_project
clean_design_create_project
clean_design_list_files
clean_design_read_file
clean_design_write_file
clean_design_list_design_systems
clean_design_read_design_system
clean_design_select_design_system
clean_design_list_skills
clean_design_read_skill
clean_design_preview
clean_design_render
clean_design_export_handoff
```

- [ ] The service client discovers the exact namespace, validates `service-runtime.json`, authenticates through sidecar IPC, derives the session key from both nonces, renews every `20s`, and releases on EOF/SIGTERM. Startup failures map to the approved stable error codes.
- [ ] Ensure stdin EOF closes transport and exits; only JSON-RPC reaches stdout; all diagnostics use stderr and the shared redactor.
- [ ] Rerun package tests/typecheck plus daemon typecheck; expect pass.
- [ ] Commit: `git add tools/codex-plugin apps/daemon/package.json pnpm-lock.yaml && git commit -m "feat: add Clean Design MCP bridge"`.

## Task 9: Package Headless Service Discovery and Launch

**Files:**

- Modify: `apps/packaged/src/config.ts`
- Modify: `apps/packaged/tests/config.test.ts`
- Modify: `tools/pack/src/mac-prebundle.ts`
- Modify: `tools/pack/tests/mac-prebundle.test.ts`
- Modify: `tools/pack/src/mac/app-config.ts`
- Modify: `tools/pack/tests/desktop-package-runtime.test.ts`
- Create: `tools/codex-plugin/src/app-discovery.ts`
- Create: `tools/codex-plugin/src/launcher.ts`
- Create: `tools/codex-plugin/tests/app-discovery.test.ts`
- Create: `tools/codex-plugin/tests/launcher.test.ts`

- [ ] Replace the existing red assertion that packaged apps have no headless entry with assertions for one private, argument-gated headless service path and no public/global CLI installer.
- [ ] Add failing launcher tests for precedence: `CLEAN_DESIGN_APP_PATH`, `/Applications/Clean Design.app`, `$HOME/Applications/Clean Design.app`; reject symlinks, wrong bundle ID, missing/non-regular executable, missing packaged config, or incompatible protocol.
- [ ] Run focused `@open-design/tools-pack`, packaged config, and codex-plugin tests; expect failures.
- [ ] Extend packaged config with `serviceProtocolVersion` and the relative paths required for bridge validation. Do not expose dynamic ports or secrets.
- [ ] Ensure mac prebundle includes the packaged headless branch and runtime dependencies while keeping `electron` external and the existing forbidden-input audits intact.
- [ ] Implement launcher spawn as an explicit argument array, not a shell command:

```ts
spawn(appExecutable, [
  "--clean-design-headless-service",
  `--namespace=${namespace}`,
  `--startup-request=${requestId}`,
], { detached: true, stdio: "ignore", env: sanitizedEnv });
```

- [ ] Sanitize inherited env, preserve only required locale/proxy values, never forward provider secrets, and let the startup winner unref the process after readiness is observable.
- [ ] Rerun focused tests and typechecks; expect pass.
- [ ] Commit: `git add apps/packaged tools/pack tools/codex-plugin && git commit -m "feat: package private headless service launch"`.

## Task 10: Create the Native Clean Design Plugin and Marketplace

**Files:**

- Create: `.agents/plugins/marketplace.json`
- Create: `plugins/clean-design/.codex-plugin/plugin.json`
- Create: `plugins/clean-design/.mcp.json`
- Create: `plugins/clean-design/README.md`
- Create: `plugins/clean-design/skills/clean-design/SKILL.md`
- Create: `plugins/clean-design/skills/project-files/SKILL.md`
- Create: `plugins/clean-design/skills/design-systems/SKILL.md`
- Create: `plugins/clean-design/skills/preview-render/SKILL.md`
- Create: `plugins/clean-design/skills/export-handoff/SKILL.md`
- Create: `plugins/clean-design/assets/icon.svg`
- Create: `plugins/clean-design/mcp/launcher.bundle.mjs`
- Create: `tools/codex-plugin/tests/plugin-package.test.ts`
- Modify: `tools/codex-plugin/esbuild.config.mjs`

- [ ] Add a red package test that validates exact identity, manifest paths, relative MCP command, bundled launcher existence, skill frontmatter, no `open-design`/`od` user-visible strings, no fixed port, and no provider/agent tool.
- [ ] Run `pnpm --filter @open-design/codex-plugin test -- tests/plugin-package.test.ts`; expect missing plugin failures.
- [ ] Create `.agents/plugins/marketplace.json` with one `clean-design` entry, relative source `./plugins/clean-design`, category `design`, installation policy `AVAILABLE`, and authentication policy `ON_INSTALL`.
- [ ] Create the native manifest with user-visible name `Clean Design`, description explaining local-first design guidance, the Clean Design icon, and no remote URL requirement.
- [ ] Configure `.mcp.json` to run `node ./mcp/launcher.bundle.mjs` with `cwd: "."`; the launcher must be self-contained and use only relative plugin assets plus validated app discovery.
- [ ] Write a routing skill that tells Codex when to use the focused project/files, design-system, preview/render, and export/handoff skills. Each focused skill must name its relevant `clean_design_*` tools, safe sequencing, expected errors, and non-capabilities. The full daemon catalog remains discoverable through `clean_design_list_skills` and `clean_design_read_skill` rather than copying 139 skills into the plugin.
- [ ] Build the launcher bundle deterministically into `plugins/clean-design/mcp/launcher.bundle.mjs` and ensure it contains no absolute build-machine paths.
- [ ] Validate:

```bash
python3 /Users/mingjian/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/clean-design
pnpm --filter @open-design/codex-plugin test
```

- [ ] Commit: `git add .agents/plugins/marketplace.json plugins/clean-design tools/codex-plugin && git commit -m "feat: add Clean Design Codex plugin"`.

## Task 11: Prove OOM, Security, and End-to-End Invariants

**Files:**

- Create: `e2e/specs/codex-service/main.spec.ts`
- Create: `e2e/tests/codex-service/startup-storm.test.ts`
- Create: `e2e/tests/codex-service/security.test.ts`
- Create: `e2e/resources/codex-service/evaluations.json`
- Create: `e2e/tests/codex-service/evaluations.test.ts`
- Create: `e2e/lib/codex-service/harness.ts`

- [ ] Add a red startup-storm test that starts 64 stdio bridges in one namespace and asserts one daemon PID, at most one Electron render-broker PID, 16 accepted live leases, deterministic `SERVICE_CAPACITY` for the rest, and no unbounded retry loop.
- [ ] Add red security tests for forged/copied descriptors, secret mode, replay, cross-namespace use, path traversal, symlink escape, credential filenames/content, arbitrary shell/provider/agent requests, and outbound network denial.
- [ ] Add 10 fixture-based evaluations that exercise skill selection and read-only tool use without invoking providers: inspect service, list/open project, inspect files, read `DESIGN.md`, inspect design system, read catalog skill, preview, render queue error, handoff preflight, and unavailable capability.
- [ ] Run `pnpm --filter @open-design/e2e test tests/codex-service specs/codex-service`; expect failures before the harness/integration is complete.
- [ ] Implement a hermetic harness with isolated namespace/data root, fake app executable, no provider credentials, captured stdout/stderr, PID snapshots, and automatic exact-namespace cleanup. Preserve diagnostics on failure.
- [ ] Assert RSS stabilizes after bridge startup and returns within an explicit tolerance after all bridges close; never assert a platform-fragile exact byte count.
- [ ] Assert the final lease triggers idle shutdown after the injected/shortened test clock and that the restart breaker opens after three induced crashes without continuing to spawn.
- [ ] Rerun the full codex-service e2e group; expect pass.
- [ ] Commit: `git add e2e && git commit -m "test: verify Codex service isolation and bounds"`.

## Task 12: Integrate, Document, and Run Acceptance Gates

**Files:**

- Modify: `README.md`
- Create: `docs/codex-plugin.md`
- Modify: `openspec/changes/clean-design-codex-service/tasks.md`
- Modify: `tools/pack/README.md`

- [ ] Document two manual install paths: repository marketplace install and direct `plugins/clean-design` install. State that Clean Design.app must be installed, show `CLEAN_DESIGN_APP_PATH` only as an explicit development override, and explain one-service/lease/idle behavior.
- [ ] Document exact inspection and recovery commands for one namespace. Do not recommend `pkill`, broad process scans, a global CLI install, or fixed ports.
- [ ] Mark OpenSpec tasks complete only after their corresponding checks pass.
- [ ] Run the focused package gates:

```bash
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/platform test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/desktop test
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/tools-pack test
pnpm --filter @open-design/codex-plugin test
pnpm --filter @open-design/e2e test tests/codex-service specs/codex-service
```

- [ ] Run repository gates: `pnpm guard` and `pnpm typecheck`; expect pass.
- [ ] Run the real packaging gate: `pnpm tools-pack mac build --to all`, then inspect the artifact for Clean Design identity, plugin/headless entry resources, absence of build-machine paths, and absence of provider secrets.
- [ ] Install with `pnpm tools-pack mac install`, install the repo plugin manually in Codex, start two MCP clients, verify they report the same daemon PID/namespace, run project/files/design-system/preview/export smoke calls, close both, and verify idle shutdown.
- [ ] If the environment cannot drive Codex plugin installation automatically, record that single manual verification gap rather than claiming it passed.
- [ ] Commit: `git add README.md docs/codex-plugin.md tools/pack/README.md openspec/changes/clean-design-codex-service/tasks.md && git commit -m "docs: explain Clean Design Codex service"`.

## Completion Review

- [ ] Invoke `superpowers:requesting-code-review` and address all findings with `superpowers:receiving-code-review`.
- [ ] Invoke `superpowers:verification-before-completion` and rerun every claimed gate from a clean command output.
- [ ] Confirm `git status --short` contains only the user's pre-existing unrelated changes.
- [ ] Use `superpowers:finishing-a-development-branch` to offer merge/PR/keep/discard choices; do not merge, push, or publish without explicit user direction.
