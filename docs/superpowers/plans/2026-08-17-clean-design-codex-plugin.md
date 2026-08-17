# Clean Design Codex Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a repository-installable `clean-design` Codex plugin that bundles eight focused Skills with an authenticated local MCP bridge capable of creating, inspecting, previewing, rendering, opening, and exporting Clean Design projects.

**Architecture:** The plugin follows the Iterlay separation: Skills own workflow guidance and MCP owns workspace truth and deterministic application actions. A self-contained Node stdio bridge discovers an installed `Clean Design.app`, attaches to or starts one namespace-scoped daemon plus one bounded Electron render broker, authenticates through sidecar IPC, and calls an allowlisted daemon MCP profile; it never invokes an agent, provider, arbitrary shell command, or arbitrary host path.

**Tech Stack:** Node.js 24, pnpm 10.33.2, TypeScript 5.9/6.0 as already pinned per workspace package, Vitest 4.1.6, Electron 41.3.0, Express 5.2.1, `@modelcontextprotocol/server` 2.0.0, Zod 4.4.3, SQLite, Unix-domain JSON IPC, HMAC-SHA256, esbuild 0.28.0, Sharp 0.34.5, OpenAI Codex plugin manifests and agent Skills.

## Global Constraints

- Run every command with Node 24 and pnpm 10.33.2; verify `node --version` begins with `v24.` before installing or testing. The machine default is Node 26.7.0, so prepend the already-installed Homebrew Node 24 to `PATH` for every command in this plan: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. Do not change the repository `engines` pin and do not install a Node version manager.
- Install the plugin at `.agents/plugins/clean-design/`, not `plugins/clean-design/`. The repository `plugins/` tree is the Clean Design design-system plugin registry: `plugins/AGENTS.md` defines its contract and `apps/daemon/src/plugins/bundled.ts` walks `plugins/_official/**` at daemon startup. Placing an OpenAI-format Codex plugin there would collide with the OD v1 plugin schema.
- Build the MCP bridge as `packages/codex-plugin/`, not `tools/codex-plugin/`. `checkToolsLayout` in `scripts/guard.ts` allowlists `tools/` to exactly `AGENTS.md`, `dev/`, and `pack/`, and this plan must not weaken that boundary guard. `pnpm-workspace.yaml` already globs `packages/*`.
- Preserve the exact five-field `SidecarStamp`: `app`, `mode`, `namespace`, `ipc`, and `source`. Rich service state belongs in separate private runtime files.
- Keep user-visible identity `Clean Design`; retain internal `@open-design/*` scopes and `OD_*` compatibility variables.
- Bind HTTP only to loopback. Namespace sockets and runtime paths are stable identities; ports are transport details.
- Do not add a global CLI, login item, LaunchAgent, automatic updater, hosted service, telemetry, external plugin host, or public-catalog submission.
- MCP must not expose agent/provider execution, credentials, arbitrary shell, arbitrary filesystem paths, project deletion, export overwrite, accounts, collaboration, deployment, billing, telemetry, or updates.
- Production limits are fixed at 16 client leases, 2 active MCP application operations, 1 active render, 32 queued operations, a 45-second lease TTL, 20-second renewal interval, 60-second idle exit, and 3 service starts per 5 minutes.
- Store service runtime descriptors, lock files, and authentication material under the namespace runtime root with owner-only permissions; never log their contents.
- Keep app-private implementation in its owning app. Shared sidecar protocol belongs in `packages/sidecar-proto`; generic lock/private-file primitives belong in `packages/sidecar`; daemon application DTOs stay daemon-private unless a web consumer exists.
- Keep source directories source-only and tests in sibling `tests/` directories.
- Use test-driven development for every behavior change: red test, observed failure, minimal implementation, green focused test, then commit.
- Preserve unrelated user changes and stage only the files named by the current task.
- Public plugin directory submission remains out of scope until the repository release gate is separately approved, and is additionally constrained by the findings in "Official directory submission" below.

## Official directory submission

The user's stated goal is publication to the universal OpenAI plugin directory. The official documentation imposes requirements that the currently approved architecture cannot satisfy as-is.

- A submission may be **skills-only**, **MCP-only**, or **skills plus MCP** per `https://developers.openai.com/plugins/deploy/submission`.
- Any submission that includes an MCP server must supply a hosted MCP server URL. `https://developers.openai.com/plugins/deploy/app-review` requires that "Your MCP server is hosted on a publicly accessible domain" and that "You are not using a local or testing endpoint". A bundled `stdio` launcher that starts a loopback service on the user's Mac is exactly the excluded case.
- Submission also requires a verified individual or business identity, **Apps Management** write permission in the owning OpenAI organization, public website/support/privacy/terms URLs, five positive and three negative test cases, starter prompts, and country availability.
- Consequence: the local-first `stdio` bridge is **not submittable** to the universal directory. Hosting the Clean Design daemon publicly would violate this repository's loopback-only and local-first product contract.
- Therefore the plan targets two distinct artifacts from one codebase:
  1. **Local distribution (Tasks 1-14):** the full Skills + local MCP plugin, installed from the repository marketplace. This is the product experience and is unaffected by directory policy.
  2. **Directory submission (deferred, Task 15):** a **skills-only** listing derived from the same Skill sources, with no MCP server, no local service, and degraded capability. It can guide a user through Clean Design workflows but cannot read, write, preview, render, or export a local workspace.
- Task 15 is not authorized by this plan. It requires a separate user decision because it changes the plugin's advertised capability surface and requires OpenAI organization identity verification the agent cannot perform.

---

## File and responsibility map

| Area | Responsibility |
|---|---|
| `docs/project/openspec/changes/clean-design-codex-plugin/` | Product-contract delta, capability requirements, and task acceptance state |
| `packages/sidecar-proto` | Service protocol version, client roles, handshake/lease messages, status and stable errors |
| `packages/sidecar` | Generic private JSON files, atomic lock acquisition, and permission checks |
| `apps/daemon/src/services/local-service-*` | Challenge-response auth, leases, capacity, replay defense, and idle policy |
| `apps/daemon/src/services/mcp-profile.ts` | Allowlisted project/file/design/asset/preview/render/export application service |
| `apps/daemon/src/http/mcp-auth.ts` | Signed request verification and stable MCP error envelopes |
| `apps/daemon/src/routes/mcp-profile.ts` | Private `/api/mcp/v1/call/:operation` transport adapter |
| `apps/packaged/src/service-manager.ts` | Connect-lock-recheck daemon singleton and desktop lease ownership |
| `apps/packaged/src/headless.ts` | Private argument-gated daemon plus render-broker entry without visible windows |
| `apps/desktop/src/main/render-broker.ts` | One bounded FIFO renderer shared by PDF, slide, image, and handoff requests |
| `packages/codex-plugin` | MCP v2 stdio server, strict tool definitions, service client, app discovery, launcher, bundle and asset builders |
| `.agents/plugins/clean-design` | Installable Codex manifest, `.mcp.json`, bundled launcher, brand assets, and eight Skills |
| `.agents/plugins/marketplace.json` | Repository marketplace entry for the `clean-design` plugin |
| `e2e/specs/codex-plugin` | End-to-end business capability chain |
| `e2e/tests/codex-plugin` | Startup-storm, security, and evaluation hotspots |

### Task 1: Record the first-party plugin exception in OpenSpec and repository contracts

**Files:**

- Create: `docs/project/openspec/changes/clean-design-codex-plugin/.openspec.yaml`
- Create: `docs/project/openspec/changes/clean-design-codex-plugin/proposal.md`
- Create: `docs/project/openspec/changes/clean-design-codex-plugin/design.md`
- Create: `docs/project/openspec/changes/clean-design-codex-plugin/tasks.md`
- Create: `docs/project/openspec/changes/clean-design-codex-plugin/specs/local-studio/spec.md`
- Modify: `AGENTS.md`
- Modify: `scripts/product-neutrality.test.ts`

**Interfaces:**

- Consumes: approved design at `docs/superpowers/specs/2026-08-17-clean-design-codex-plugin-design.md`.
- Produces: a validated OpenSpec change named `clean-design-codex-plugin` and an explicit repository rule permitting only the first-party local plugin/headless exception.

- [x] **Step 1: Add a red product-boundary assertion**

Add a case to `scripts/product-neutrality.test.ts` that reads `AGENTS.md` and the new delta spec, then requires all four phrases: `first-party clean-design plugin`, `no global CLI`, `no agent or provider execution`, and `temporary headless service`. Before the contract files exist, the test must fail on the missing delta path.

```ts
test('documents the bounded first-party Codex plugin exception', () => {
  const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');
  const spec = readFileSync(
    join(repoRoot, 'docs/project/openspec/changes/clean-design-codex-plugin/specs/local-studio/spec.md'),
    'utf8',
  );
  for (const phrase of [
    'first-party `clean-design` plugin',
    'global CLI',
    'agent or provider execution',
    'temporary headless service',
  ]) {
    expect(`${agents}\n${spec}`).toContain(phrase);
  }
});
```

- [x] **Step 2: Run the red guard test**

Run: `node --import tsx --test scripts/product-neutrality.test.ts`
Expected: FAIL because `docs/project/openspec/changes/clean-design-codex-plugin/specs/local-studio/spec.md` does not exist.

- [x] **Step 3: Write the OpenSpec artifacts and repository contract**

Use `.openspec.yaml` with the existing schema:

```yaml
schema: spec-driven
created: 2026-08-17
```

The delta requirement in `specs/local-studio/spec.md` must state:

```md
## MODIFIED Requirements

### Requirement: Local-only service boundary
The product MUST NOT expose hosted services, external plugin hosting, arbitrary downstream-agent integration, or global CLI installation. The sole plugin exception SHALL be the repository-owned first-party `clean-design` plugin. Explicit invocation MAY start one authenticated, namespace-scoped, temporary headless service from an installed Clean Design application. The MCP profile MUST NOT expose agent or provider execution, credentials, arbitrary shell commands, arbitrary host paths, project deletion, or overwrite-in-place exports.

#### Scenario: Plugin invocation while the desktop is closed
- **WHEN** an installed `clean-design` plugin invokes its bundled MCP server
- **THEN** one compatible temporary headless service starts for the active namespace
- **AND** all clients share the same bounded service and render broker
- **AND** the service exits after its final lease and idle timeout
```

Update the root Product Contract with the same narrow exception; keep the existing prohibitions for third-party plugin hosts, hosted services, global CLI installation, and silent login-time startup.

- [x] **Step 4: Validate OpenSpec and guards**

Run:

```bash
cd docs/project
openspec validate clean-design-codex-plugin --strict --no-interactive
cd ../..
node --import tsx --test scripts/product-neutrality.test.ts
```

Expected: both commands PASS.

- [x] **Step 5: Commit the contract slice**

```bash
git add AGENTS.md scripts/product-neutrality.test.ts docs/project/openspec/changes/clean-design-codex-plugin
git commit -m "docs: specify Clean Design Codex plugin"
```

### Task 2: Extend the sidecar protocol without changing the stamp

**Files:**

- Modify: `packages/sidecar-proto/src/index.ts`
- Modify: `packages/sidecar-proto/tests/index.test.ts`
- Modify: `packages/sidecar-proto/tests/ipc-path.test.ts`

**Interfaces:**

- Consumes: existing `SIDECAR_MESSAGES`, `DaemonStatusSnapshot`, `SidecarStamp`, and normalizers.
- Produces: `CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION`, `CLEAN_DESIGN_SERVICE_LIMITS`, `ServiceRuntimeDescriptor`, handshake/lease message types, `ServiceStatusSnapshot`, and normalized daemon messages used by Tasks 4–9.

- [x] **Step 1: Write red protocol tests**

Add tests that assert the stamp keys remain exactly five, `APP_KEYS.RENDERER` exists, service limits match the approved constants, unknown handshake fields are rejected, and runtime descriptors are not accepted as stamps.

```ts
expect(SIDECAR_STAMP_FIELDS).toEqual(['app', 'mode', 'namespace', 'ipc', 'source']);
expect(CLEAN_DESIGN_SERVICE_LIMITS).toEqual({
  clientCapacity: 16,
  idleExitMs: 60_000,
  leaseRenewMs: 20_000,
  leaseTtlMs: 45_000,
  operationConcurrency: 2,
  queueCapacity: 32,
  renderConcurrency: 1,
  restartMaxStarts: 3,
  restartWindowMs: 300_000,
});
expect(() => normalizeDaemonSidecarMessage({
  type: SIDECAR_MESSAGES.SERVICE_CHALLENGE,
  input: { clientNonce: 'a'.repeat(43), protocolVersion: 1, role: 'mcp', extra: true },
})).toThrow(/unsupported fields/);
```

- [x] **Step 2: Run the red protocol suite**

Run: `pnpm --filter @open-design/sidecar-proto test`
Expected: FAIL because the service protocol exports and renderer app key do not exist.

- [x] **Step 3: Add exact protocol constants and types**

Add these public contracts to `packages/sidecar-proto/src/index.ts`:

```ts
export const CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION = 1 as const;
export const CLEAN_DESIGN_SERVICE_LIMITS = Object.freeze({
  clientCapacity: 16,
  idleExitMs: 60_000,
  leaseRenewMs: 20_000,
  leaseTtlMs: 45_000,
  operationConcurrency: 2,
  queueCapacity: 32,
  renderConcurrency: 1,
  restartMaxStarts: 3,
  restartWindowMs: 5 * 60_000,
});

export type ServiceClientRole = 'desktop' | 'mcp';
export type ServiceRuntimeDescriptor = {
  dataRootFingerprint: string;
  executableFingerprint: string;
  internalUrl: string;
  namespace: string;
  pid: number;
  protocolVersion: typeof CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION;
  serviceVersion: string;
  startedAt: string;
};
export type ServiceChallengeInput = {
  clientNonce: string;
  protocolVersion: number;
  role: ServiceClientRole;
};
export type ServiceChallengeResult = {
  challengeId: string;
  expiresAt: string;
  serverNonce: string;
};
export type AcquireServiceClientInput = ServiceChallengeInput & {
  challengeId: string;
  proof: string;
  serverNonce: string;
};
export type ServiceLease = {
  expiresAt: string;
  leaseId: string;
  role: ServiceClientRole;
  serverProof: string;
};
export type SignedServiceLeaseInput = {
  expiresAt: string;
  leaseId: string;
  nonce: string;
  signature: string;
};
```

Add `RENDERER: "renderer"` to `APP_KEYS`; add `service-challenge`, `acquire-service-client`, `renew-service-client`, and `release-service-client` to `SIDECAR_MESSAGES`; extend `DaemonSidecarMessage` and strict normalizers for the new inputs. Extend `DaemonStatusSnapshot` with an optional `service` field:

```ts
export type ServiceStatusSnapshot = {
  activeClients: number;
  activeOperations: number;
  protocolVersion: 1;
  queuedOperations: number;
  renderActive: number;
  renderQueued: number;
};
```

- [x] **Step 4: Run protocol tests and typecheck**

Run:

```bash
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/sidecar-proto typecheck
```

Expected: PASS; the five-field stamp assertion remains unchanged.

- [x] **Step 5: Commit the protocol slice**

```bash
git add packages/sidecar-proto
git commit -m "feat: define local service protocol"
```

### Task 3: Add generic private runtime files and startup locks

**Files:**

- Create: `packages/sidecar/src/private-json.ts`
- Create: `packages/sidecar/src/startup-lock.ts`
- Create: `packages/sidecar/tests/private-json.test.ts`
- Create: `packages/sidecar/tests/startup-lock.test.ts`
- Modify: `packages/sidecar/src/index.ts`

**Interfaces:**

- Consumes: Node filesystem primitives only; no Clean Design app keys or message names.
- Produces: `readPrivateJson`, `writePrivateJson`, `acquireStartupLock`, and `StartupLockHandle` for Tasks 4, 5, and 9.

- [x] **Step 1: Write red private-file and lock tests**

Cover atomic write, mode `0600`, refusal to read group/world-readable secret files, one winner among 32 concurrent lock callers, live-owner refusal, and stale-dead-owner recovery.

```ts
const handles = await Promise.allSettled(
  Array.from({ length: 32 }, () => acquireStartupLock(lockPath, deps)),
);
expect(handles.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
expect((await stat(secretPath)).mode & 0o777).toBe(0o600);
```

- [x] **Step 2: Run the red sidecar tests**

Run: `pnpm --filter @open-design/sidecar test -- private-json.test.ts startup-lock.test.ts`
Expected: FAIL because the modules do not exist.

- [x] **Step 3: Implement atomic owner-only JSON files**

Use a sibling temporary file, explicit mode, `fsync`, and rename:

```ts
export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
  await chmod(path, 0o600);
}
```

`readPrivateJson` must `lstat`, reject symlinks/non-files, require `(mode & 0o077) === 0`, cap bytes before parsing, and accept a caller-supplied validator.

- [x] **Step 4: Implement atomic startup locks**

`acquireStartupLock(path, options)` must create a JSON lock with `open(path, 'wx', 0o600)`. On `EEXIST`, read `{pid, createdAt}`, call injected `isOwnerAlive(pid)`, and remove the lock only when the owner is dead and `now - createdAt >= staleAfterMs`. The returned handle exposes an idempotent `release()` that removes only the lock token it created.

- [x] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @open-design/sidecar test -- private-json.test.ts startup-lock.test.ts
pnpm --filter @open-design/sidecar typecheck
```

Expected: PASS.

- [x] **Step 6: Commit the runtime primitive slice**

```bash
git add packages/sidecar
git commit -m "feat: add private service runtime primitives"
```

### Task 4: Add daemon challenge-response authentication and leases

**Files:**

- Create: `apps/daemon/src/services/local-service-auth.ts`
- Create: `apps/daemon/src/services/local-service-leases.ts`
- Create: `apps/daemon/tests/services/local-service-auth.test.ts`
- Create: `apps/daemon/tests/services/local-service-leases.test.ts`
- Modify: `apps/daemon/src/sidecar/server.ts`
- Modify: `apps/daemon/tests/sidecar-server.test.ts`

**Interfaces:**

- Consumes: Task 2 protocol contracts and Task 3 private JSON helpers.
- Produces: `LocalServiceAuthenticator`, `ServiceLeaseRegistry`, live per-lease session keys, private `mcp-secret`, private `service-runtime.json`, and sidecar handshake handlers consumed by Tasks 5, 7, 8, and 9.

- [ ] **Step 1: Write red authentication and lease tests**

Test wrong protocol, expired challenge, altered nonce/proof, replay, timing-safe verification, 16-client capacity, immutable roles, renew/release signatures, expired lease reclamation, and idle eligibility only when no leases/jobs exist.

```ts
const challenge = auth.issueChallenge({ clientNonce, protocolVersion: 1, role: 'mcp' });
const acquired = auth.acquire({
  challengeId: challenge.challengeId,
  clientNonce,
  protocolVersion: 1,
  role: 'mcp',
  serverNonce: challenge.serverNonce,
  proof: clientProof(secret, clientNonce, challenge.serverNonce, challenge.challengeId, 'mcp'),
});
expect(acquired.lease.role).toBe('mcp');
expect(() => auth.acquire(/* same challenge */)).toThrow(/AUTH_FAILED/);
```

- [ ] **Step 2: Run the red daemon tests**

Run:

```bash
pnpm --filter @open-design/daemon test -- tests/services/local-service-auth.test.ts tests/services/local-service-leases.test.ts tests/sidecar-server.test.ts
```

Expected: FAIL because the services and messages are not wired.

- [ ] **Step 3: Implement the authenticator**

Expose this exact surface:

```ts
export interface LocalServiceAuthenticator {
  issueChallenge(input: ServiceChallengeInput): ServiceChallengeResult;
  acquire(input: AcquireServiceClientInput): { lease: ServiceLease; sessionKey: Buffer };
  verifyLeaseInput(input: SignedServiceLeaseInput, action: 'renew' | 'release'): ServiceLease;
  sessionKey(leaseId: string): Buffer | null;
}

export function createLocalServiceAuthenticator(options: {
  clock?: () => number;
  leaseRegistry: ServiceLeaseRegistry;
  secret: Buffer;
}): LocalServiceAuthenticator;
```

Derive proofs and session keys with domain-separated HMAC payloads. Consume each challenge once and use `timingSafeEqual` on equal-length buffers.

- [ ] **Step 4: Implement the lease registry**

Expose `acquire`, `renew`, `release`, `reclaimExpired`, `status`, and `isIdleEligible`. Store `{leaseId, role, sessionKey, expiresAt}` in memory only. Capacity overflow throws a stable `SERVICE_CAPACITY` error; role is set at acquire and never accepted from renew/release input.

- [ ] **Step 5: Wire daemon sidecar handshake messages and private files**

At sidecar startup, create a 32-byte secret, write `mcp-secret` mode `0600`, and after daemon readiness write `service-runtime.json` containing the Task 2 descriptor. Handle the four service messages in `startDaemonSidecar`; include live service counts in STATUS. Keep provider credential registration on the existing desktop-only path.

- [ ] **Step 6: Run focused tests and daemon typecheck**

Run:

```bash
pnpm --filter @open-design/daemon test -- tests/services/local-service-auth.test.ts tests/services/local-service-leases.test.ts tests/sidecar-server.test.ts
pnpm --filter @open-design/daemon typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the auth/lease slice**

```bash
git add apps/daemon/src/services/local-service-auth.ts apps/daemon/src/services/local-service-leases.ts apps/daemon/src/sidecar/server.ts apps/daemon/tests/services apps/daemon/tests/sidecar-server.test.ts
git commit -m "feat: authenticate bounded service leases"
```

### Task 5: Make packaged daemon startup attach-or-start and lease-aware

**Files:**

- Create: `apps/packaged/src/service-manager.ts`
- Create: `apps/packaged/tests/service-manager.test.ts`
- Modify: `apps/packaged/src/sidecars.ts`
- Modify: `apps/packaged/tests/sidecars.test.ts`
- Modify: `apps/packaged/src/index.ts`

**Interfaces:**

- Consumes: Task 2 handshake contracts, Task 3 startup lock, Task 4 daemon service handshake.
- Produces: `ensurePackagedDaemonService`, `PackagedDaemonServiceHandle`, reuse-safe desktop startup, and lease-based shutdown for Task 6 and Task 9.

- [ ] **Step 1: Write red singleton tests**

Test that 32 concurrent callers spawn exactly once, compatible service state is reused, incompatible fingerprints return `SERVICE_VERSION_MISMATCH`, desktop release does not stop an MCP-leased daemon, stale locks recover only after owner checks, and restart attempt four within five minutes returns `SERVICE_RESTART_BUDGET_EXCEEDED`.

- [ ] **Step 2: Run the red packaged tests**

Run: `pnpm --filter @open-design/packaged test -- tests/service-manager.test.ts tests/sidecars.test.ts`
Expected: FAIL; current `spawnSidecarChild` calls `retireExistingSidecarEndpoint` unconditionally.

- [ ] **Step 3: Add the service-manager interface**

```ts
export type PackagedDaemonServiceHandle = {
  release(): Promise<void>;
  started: boolean;
  status: DaemonStatusSnapshot;
};

export async function ensurePackagedDaemonService(options: {
  acquireRole: ServiceClientRole | null;
  paths: PackagedNamespacePaths;
  runtime: SidecarRuntimeContext<SidecarStamp>;
  spawnDaemon: () => Promise<{ child: ChildProcess; ipcPath: string }>;
}): Promise<PackagedDaemonServiceHandle>;
```

Implement connect → validate descriptor → acquire lock → recheck → restart-budget check → spawn → wait for readiness → acquire optional lease → release lock. Losing callers use bounded jittered backoff and never spawn.

- [ ] **Step 4: Refactor packaged sidecar ownership**

Remove unconditional retirement from normal daemon startup. `startPackagedSidecars` uses `ensurePackagedDaemonService({ acquireRole: 'desktop' })`, still owns the web sidecar, and on close stops web then releases the desktop lease. Daemon idle policy, not desktop teardown, decides final daemon shutdown. Explicit tools-pack stop/uninstall continues to target the exact namespace.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @open-design/packaged test -- tests/service-manager.test.ts tests/sidecars.test.ts
pnpm --filter @open-design/packaged typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the singleton slice**

```bash
git add apps/packaged/src/service-manager.ts apps/packaged/src/sidecars.ts apps/packaged/src/index.ts apps/packaged/tests/service-manager.test.ts apps/packaged/tests/sidecars.test.ts
git commit -m "feat: reuse packaged daemon service"
```

### Task 6: Add one bounded render broker and a private headless entry

**Files:**

- Create: `apps/desktop/src/main/render-broker.ts`
- Create: `apps/desktop/tests/main/render-broker.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/runtime.ts`
- Create: `apps/packaged/src/headless.ts`
- Create: `apps/packaged/tests/headless.test.ts`
- Modify: `apps/packaged/src/index.ts`
- Modify: `apps/packaged/esbuild.config.mjs`
- Modify: `apps/daemon/src/sidecar/server.ts`
- Modify: `apps/daemon/tests/sidecar-server.test.ts`

**Interfaces:**

- Consumes: Task 5 daemon singleton, existing `exportArtifact`, `renderDeckSlides`, and PDF render functions.
- Produces: `RenderBroker`, renderer IPC at `APP_KEYS.RENDERER`, `runHeadlessService`, and daemon renderer preference used by Task 7.

- [ ] **Step 1: Write red broker and headless tests**

Test FIFO ordering, one active render, queue item 33 rejection, deterministic close, no visible main/splash/pet windows, no single-instance desktop lock, no web sidecar, and daemon render delegation preferring renderer IPC before desktop IPC.

```ts
const broker = createRenderBroker({ concurrency: 1, maxQueue: 32, handlers });
const first = broker.submit({ type: SIDECAR_MESSAGES.RENDER_SLIDES, input });
const second = broker.submit({ type: SIDECAR_MESSAGES.EXPORT_ARTIFACT, input: artifact });
expect(broker.status()).toEqual({ active: 1, queued: 1 });
```

- [ ] **Step 2: Run red desktop, packaged, and daemon tests**

Run:

```bash
pnpm --filter @open-design/desktop test -- tests/main/render-broker.test.ts
pnpm --filter @open-design/packaged test -- tests/headless.test.ts
pnpm --filter @open-design/daemon test -- tests/sidecar-server.test.ts
```

Expected: FAIL because the broker/headless entry do not exist.

- [ ] **Step 3: Implement the render broker**

```ts
export type RenderBroker = {
  close(): Promise<void>;
  status(): { active: number; queued: number };
  submit(message: DesktopRenderSlidesMessage | DesktopExportArtifactMessage | DesktopExportPdfMessage): Promise<unknown>;
};

export function createRenderBroker(options: {
  concurrency: 1;
  handlers: RenderBrokerHandlers;
  maxQueue: 32;
}): RenderBroker;
```

Use one explicit FIFO array. Reject before enqueue when `active + queued` exceeds the approved bound. During close, reject queued jobs with `RENDER_FAILED`, await the active job, then mark closed. Route the visible desktop IPC render messages through this broker without changing actual render functions.

- [ ] **Step 4: Implement the argument-gated headless entry**

`runHeadlessService()` must:

1. Require `--clean-design-headless-service` and a normalized `--namespace=` value.
2. Read packaged config and resolve namespace paths.
3. Call `ensurePackagedDaemonService({ acquireRole: null })`.
4. Start one owner-only renderer IPC server at `APP_KEYS.RENDERER`.
5. Accept only render/export and STATUS messages.
6. Watch daemon liveness and exit when the daemon completes idle shutdown.
7. Never call `claimPackagedSingleInstanceLock`, `createSplashWindow`, `registerOdProtocol`, or `runDesktopMain`.

Branch at the start of `apps/packaged/src/index.ts` before visible app setup. Keep the headless code in the packaged-main bundle; do not export a public `./headless` package entry.

- [ ] **Step 5: Prefer the render broker from the daemon**

In daemon sidecar render delegates, request `APP_KEYS.RENDERER` first. Fall back to `APP_KEYS.DESKTOP` only on endpoint absence; do not fall back after a renderer returns an application error.

- [ ] **Step 6: Run focused tests and typechecks**

Run:

```bash
pnpm --filter @open-design/desktop test -- tests/main/render-broker.test.ts
pnpm --filter @open-design/desktop typecheck
pnpm --filter @open-design/packaged test -- tests/headless.test.ts
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/daemon test -- tests/sidecar-server.test.ts
pnpm --filter @open-design/daemon typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the renderer/headless slice**

```bash
git add apps/desktop apps/packaged apps/daemon/src/sidecar/server.ts apps/daemon/tests/sidecar-server.test.ts
git commit -m "feat: add singleton headless render broker"
```

### Task 7: Add the authenticated allowlisted MCP application profile

**Files:**

- Create: `apps/daemon/src/services/mcp-profile.ts`
- Create: `apps/daemon/src/services/mcp-scheduler.ts`
- Create: `apps/daemon/src/http/mcp-auth.ts`
- Create: `apps/daemon/src/routes/mcp-profile.ts`
- Create: `apps/daemon/tests/services/mcp-profile.test.ts`
- Create: `apps/daemon/tests/services/mcp-scheduler.test.ts`
- Create: `apps/daemon/tests/http/mcp-auth.test.ts`
- Create: `apps/daemon/tests/routes/mcp-profile.test.ts`
- Modify: `apps/daemon/src/server-context.ts`
- Modify: `apps/daemon/src/route-context-contract.ts`
- Modify: `apps/daemon/src/server.ts`

**Interfaces:**

- Consumes: Task 4 lease session keys, Task 6 render broker, existing project/files/design-system/skills/handoff services.
- Produces: `McpProfileService`, `McpOperationName`, signed private route, stable output/error envelope, and exact operations called by Task 8.

- [ ] **Step 1: Write red scheduler, auth, profile, and route tests**

Cover two active operations, queue capacity 32, body-bound signatures, ±30-second expiry, replayed nonce, lease-role enforcement, pagination defaults/max, response cap 25,000 characters, project containment, symlink escape, hidden/credential/oversized files, digest conflicts, bounded data-URL asset import, render status, immutable export, and structural absence of forbidden methods.

- [ ] **Step 2: Run the red daemon MCP tests**

Run:

```bash
pnpm --filter @open-design/daemon test -- tests/services/mcp-scheduler.test.ts tests/services/mcp-profile.test.ts tests/http/mcp-auth.test.ts tests/routes/mcp-profile.test.ts
```

Expected: FAIL because the MCP profile modules are absent.

- [ ] **Step 3: Implement the bounded scheduler**

Expose:

```ts
export interface McpScheduler {
  run<T>(operation: () => Promise<T>): Promise<T>;
  status(): { active: number; queued: number };
}
export function createMcpScheduler(options: { concurrency: 2; maxQueue: 32 }): McpScheduler;
```

Use FIFO ordering. Reject queue item 33 with `SERVICE_CAPACITY`; never create another worker.

- [ ] **Step 4: Implement signed HTTP request verification**

Canonical input is:

```text
METHOD + "\n" + PATH + "\n" + SHA256(BODY) + "\n" + LEASE_ID + "\n" + NONCE + "\n" + EXPIRES
```

Require headers `X-CD-Lease`, `X-CD-Nonce`, `X-CD-Expires`, and `X-CD-Signature`. Resolve the session key from Task 4, require role `mcp`, use `timingSafeEqual`, consume nonce once, and return `{ ok:false, error:{ code, message } }` with `Cache-Control: no-store`.

- [ ] **Step 5: Implement the MCP profile service**

Expose these exact methods:

```ts
export interface McpProfileService {
  serviceInfo(): Promise<ServiceInfoOutput>;
  getActiveProject(): Promise<ProjectSummary | null>;
  listProjects(input: PageInput): Promise<Page<ProjectSummary>>;
  getProject(input: ProjectIdInput): Promise<ProjectDetail>;
  createProject(input: CreateProjectInput): Promise<ProjectDetail>;
  openProject(input: ProjectIdInput): Promise<ProjectDetail>;
  listFiles(input: ProjectPageInput): Promise<Page<ProjectFileSummary>>;
  readFile(input: ProjectFileInput): Promise<ProjectFileContent>;
  writeFile(input: WriteProjectFileInput): Promise<ProjectFileContent>;
  readDesignMd(input: ProjectIdInput): Promise<ProjectFileContent | null>;
  listDesignSystems(input: PageInput): Promise<Page<DesignSystemSummary>>;
  readDesignSystem(input: IdInput): Promise<DesignSystemDetail>;
  selectDesignSystem(input: SelectDesignSystemInput): Promise<ProjectDetail>;
  listSkills(input: PageInput): Promise<Page<SkillSummary>>;
  readSkill(input: IdInput): Promise<SkillDetail>;
  listAssets(input: ProjectPageInput): Promise<Page<ProjectAssetSummary>>;
  importAsset(input: ImportAssetInput): Promise<ProjectAssetSummary>;
  preview(input: ProjectFileInput): Promise<PreviewOutput>;
  render(input: RenderInput): Promise<RenderJobOutput>;
  getRenderStatus(input: RenderStatusInput): Promise<RenderJobOutput>;
  exportHandoff(input: ExportHandoffInput): Promise<HandoffOutput>;
  getExportManifest(input: ExportManifestInput): Promise<HandoffManifestOutput>;
}
```

`ImportAssetInput` accepts `{ projectId, fileName, mimeType, dataBase64 }` only, capped at 10 MiB decoded. It never accepts a host path. File writes reuse existing `validateProjectPath`, reserved-path, realpath, size, and atomic write policies. `exportHandoff` reuses trusted-root and immutable packet logic.

- [ ] **Step 6: Register the private operation route**

Define a literal `MCP_OPERATION_NAMES` map and register only `POST /api/mcp/v1/call/:operation`. Reject an unknown operation before service dispatch. Default page size is 50; maximum is 100. Cap serialized successful responses at 25,000 characters and return `SERVICE_CAPACITY` rather than allocating unbounded output.

- [ ] **Step 7: Wire server context and assert no agent/provider dependencies**

Add a narrow `mcpProfile` context dependency. Do not pass `agents`, credential memory, connectors, research, media providers, terminal, or run services to `createMcpProfileService`. Add a test that enumerates `Object.keys(service)` and compares it to the approved method list.

- [ ] **Step 8: Run focused tests and daemon typecheck**

Run:

```bash
pnpm --filter @open-design/daemon test -- tests/services/mcp-scheduler.test.ts tests/services/mcp-profile.test.ts tests/http/mcp-auth.test.ts tests/routes/mcp-profile.test.ts
pnpm --filter @open-design/daemon typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit the MCP profile slice**

```bash
git add apps/daemon/src/services/mcp-profile.ts apps/daemon/src/services/mcp-scheduler.ts apps/daemon/src/http/mcp-auth.ts apps/daemon/src/routes/mcp-profile.ts apps/daemon/src/server-context.ts apps/daemon/src/route-context-contract.ts apps/daemon/src/server.ts apps/daemon/tests/services apps/daemon/tests/http/mcp-auth.test.ts apps/daemon/tests/routes/mcp-profile.test.ts
git commit -m "feat: expose bounded Clean Design MCP profile"
```

### Task 8: Build the MCP v2 stdio bridge and strict tool schemas

**Files:**

- Create: `packages/codex-plugin/package.json`
- Create: `packages/codex-plugin/tsconfig.json`
- Create: `packages/codex-plugin/tsconfig.tests.json`
- Create: `packages/codex-plugin/vitest.config.ts`
- Create: `packages/codex-plugin/esbuild.config.mjs`
- Create: `packages/codex-plugin/src/contracts.ts`
- Create: `packages/codex-plugin/src/service-client.ts`
- Create: `packages/codex-plugin/src/tool-definitions.ts`
- Create: `packages/codex-plugin/src/server.ts`
- Create: `packages/codex-plugin/src/index.ts`
- Create: `packages/codex-plugin/tests/service-client.test.ts`
- Create: `packages/codex-plugin/tests/tool-definitions.test.ts`
- Create: `packages/codex-plugin/tests/stdio.test.ts`
- Modify: `apps/daemon/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Task 2 protocol, Task 4 handshake, Task 7 operation names and DTO shapes.
- Produces: `createCleanDesignMcpServer`, `CleanDesignServiceClient`, 23 namespaced MCP tools, and `dist/launcher.bundle.mjs` for Tasks 9–12.

- [ ] **Step 1: Add the workspace package and red tests**

Pin dependencies:

```json
{
  "name": "@open-design/codex-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node ./esbuild.config.mjs && tsc -p tsconfig.json --emitDeclarationOnly",
    "test": "vitest run -c vitest.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.tests.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "2.0.0",
    "@open-design/sidecar": "workspace:*",
    "@open-design/sidecar-proto": "workspace:*",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "20.19.39",
    "esbuild": "0.28.0",
    "typescript": "5.9.3",
    "vitest": "4.1.6"
  },
  "engines": { "node": "~24" }
}
```

Remove the unused `@modelcontextprotocol/sdk` dependency from `apps/daemon/package.json`. Add red tests for 23 exact names, strict schemas, annotations, structured outputs, signed calls, lease renewal/release, stdin EOF, stderr-only diagnostics, and JSON-only stdout.

- [ ] **Step 2: Install and observe red tests**

Run:

```bash
pnpm install
pnpm --filter @open-design/codex-plugin test
```

Expected: dependency install succeeds; tests FAIL because implementation files are empty or absent.

- [ ] **Step 3: Implement the signed service client**

```ts
export interface CleanDesignServiceClient {
  call<TInput, TOutput>(operation: McpOperationName, input: TInput): Promise<TOutput>;
  close(): Promise<void>;
  serviceInfo(): Promise<ServiceInfoOutput>;
}
```

The client reads validated runtime state, performs Task 4 challenge/acquire, derives the session key, signs Task 7 HTTP calls, renews every 20 seconds, and releases on close/SIGTERM/stdin EOF. It maps stable service errors without including response bodies or secrets in logs.

- [ ] **Step 4: Define and register all tools**

The exact tool list is:

```ts
export const CLEAN_DESIGN_TOOL_NAMES = [
  'clean_design_service_info',
  'clean_design_get_active_project',
  'clean_design_list_projects',
  'clean_design_get_project',
  'clean_design_create_project',
  'clean_design_open_project',
  'clean_design_open_in_app',
  'clean_design_list_files',
  'clean_design_read_file',
  'clean_design_write_file',
  'clean_design_read_design_md',
  'clean_design_list_design_systems',
  'clean_design_read_design_system',
  'clean_design_select_design_system',
  'clean_design_list_skills',
  'clean_design_read_skill',
  'clean_design_list_assets',
  'clean_design_import_asset',
  'clean_design_preview',
  'clean_design_render',
  'clean_design_get_render_status',
  'clean_design_export_handoff',
  'clean_design_get_export_manifest',
] as const;
```

Register with:

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
```

Every tool uses strict Zod input/output schemas, returns `structuredContent` plus JSON text fallback, and has accurate `readOnlyHint`, `destructiveHint`, and `idempotentHint`. No tool is marked destructive; create/write/import/render/export tools are write operations.

`clean_design_open_project` calls the Task 7 profile operation that records/resolves the current project. `clean_design_open_in_app` is the single bridge-local exception: inject a `VisibleAppLauncher` with `openProject(projectId: string): Promise<{ opened: true }>` and let Task 9 launch only the validated Clean Design executable with the selected project identifier. It must not accept an executable or host path from tool input.

- [ ] **Step 5: Implement stdio lifecycle and deterministic bundling**

`src/index.ts` creates the client, connects `StdioServerTransport`, closes on EOF/SIGINT/SIGTERM, writes diagnostics only to stderr, and never writes non-JSON data to stdout. Bundle to `packages/codex-plugin/dist/launcher.bundle.mjs` with Node 24 target and no absolute source paths.

- [ ] **Step 6: Run bridge tests, typecheck, and build**

Run:

```bash
pnpm --filter @open-design/codex-plugin test
pnpm --filter @open-design/codex-plugin typecheck
pnpm --filter @open-design/codex-plugin build
```

Expected: PASS and `packages/codex-plugin/dist/launcher.bundle.mjs` exists.

- [ ] **Step 7: Commit the bridge slice**

```bash
git add packages/codex-plugin apps/daemon/package.json pnpm-lock.yaml
git commit -m "feat: add Clean Design MCP bridge"
```

### Task 9: Discover and launch only a valid Clean Design application

**Files:**

- Create: `packages/codex-plugin/src/app-discovery.ts`
- Create: `packages/codex-plugin/src/launcher.ts`
- Create: `packages/codex-plugin/tests/app-discovery.test.ts`
- Create: `packages/codex-plugin/tests/launcher.test.ts`
- Modify: `packages/codex-plugin/src/service-client.ts`

**Interfaces:**

- Consumes: Task 5 attach-or-start behavior and Task 8 client injection seam.
- Produces: `resolveCleanDesignApp`, `validateCleanDesignApp`, `launchHeadlessService`, and `ensureServiceRuntime` used by the real bridge.

- [ ] **Step 1: Write red discovery and launcher tests**

Test precedence `CLEAN_DESIGN_APP_PATH` → `/Applications/Clean Design.app` → `$HOME/Applications/Clean Design.app`; reject symlinks, wrong bundle ID, non-regular executable, missing `clean-design-config.json`, incompatible protocol, shell interpolation, provider-secret forwarding, and startup timeout.

- [ ] **Step 2: Run red launcher tests**

Run: `pnpm --filter @open-design/codex-plugin test -- tests/app-discovery.test.ts tests/launcher.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement validated app discovery**

```ts
export type CleanDesignApp = {
  appPath: string;
  configPath: string;
  executablePath: string;
  namespace: string;
  namespaceBaseRoot: string;
  protocolVersion: 1;
};

export async function resolveCleanDesignApp(options?: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}): Promise<CleanDesignApp>;
```

Use `lstat` plus `realpath`; reject a symlink at the bundle or executable boundary. Read `Info.plist` and require the Clean Design bundle identifier already defined in `tools/pack/src/mac/identity.ts`. Read packaged config and require protocol version 1.

- [ ] **Step 4: Implement explicit argument-array launch**

```ts
spawn(app.executablePath, [
  '--clean-design-headless-service',
  `--namespace=${app.namespace}`,
  `--startup-request=${requestId}`,
], {
  detached: true,
  env: sanitizedEnv,
  stdio: 'ignore',
});
```

Preserve only `HOME`, locale, temp, and proxy variables; drop keys ending in `_API_KEY`, `_TOKEN`, `_SECRET`, or `_PASSWORD`. The startup-lock winner unrefs only after the runtime descriptor becomes valid and the sidecar answers STATUS.

- [ ] **Step 5: Connect service client startup to discovery**

`ensureServiceRuntime` first checks existing private state. When absent, it calls discovery and launch, then performs bounded readiness polling. Map failures to `APP_NOT_INSTALLED`, `SERVICE_VERSION_MISMATCH`, `SERVICE_START_TIMEOUT`, or `SERVICE_RESTART_BUDGET_EXCEEDED`.

- [ ] **Step 6: Run tests, typecheck, and rebuild**

Run:

```bash
pnpm --filter @open-design/codex-plugin test
pnpm --filter @open-design/codex-plugin typecheck
pnpm --filter @open-design/codex-plugin build
```

Expected: PASS.

- [ ] **Step 7: Commit app discovery**

```bash
git add packages/codex-plugin
git commit -m "feat: launch validated Clean Design service"
```

### Task 10: Package the private service protocol and headless branch

**Files:**

- Modify: `apps/packaged/src/config.ts`
- Modify: `apps/packaged/tests/config.test.ts`
- Modify: `tools/pack/src/mac/app.ts`
- Modify: `tools/pack/src/mac-prebundle.ts`
- Modify: `tools/pack/tests/mac-prebundle.test.ts`
- Modify: `tools/pack/tests/desktop-package-runtime.test.ts`
- Modify: `tools/pack/tests/mac.test.ts`

**Interfaces:**

- Consumes: Task 2 protocol version and Task 6 private headless branch.
- Produces: `serviceProtocolVersion: 1` in packaged config, a bundled argument-gated headless path, and package assertions consumed by Task 9 and final acceptance.

- [ ] **Step 1: Replace the obsolete no-headless assertion with red private-entry assertions**

Change `desktop-package-runtime.test.ts` to require no global bin and no public `./headless` export, while requiring the packaged main to recognize `--clean-design-headless-service` and to keep it argument-gated.

```ts
expect(readPackageJson('package.json').bin).toBeUndefined();
expect(readPackageJson('apps/packaged/package.json').exports).not.toHaveProperty('./headless');
expect(readFileSync(packagedSourcePath, 'utf8')).toContain('--clean-design-headless-service');
```

- [ ] **Step 2: Run the red pack tests**

Run:

```bash
pnpm --filter @open-design/tools-pack test -- tests/mac-prebundle.test.ts tests/desktop-package-runtime.test.ts tests/mac.test.ts
pnpm --filter @open-design/packaged test -- tests/config.test.ts
```

Expected: FAIL because packaged config does not expose a protocol version and pack tests still expect the removed headless prohibition.

- [ ] **Step 3: Add protocol version to packaged config**

Add `serviceProtocolVersion?: number` to `RawPackagedConfig` and required literal `serviceProtocolVersion: 1` to `PackagedConfig`. Reject any value other than `CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION`. `renderMacPackagedConfig` writes the same literal.

- [ ] **Step 4: Keep the headless branch inside packaged-main policy**

Because `apps/packaged/src/index.ts` imports `headless.ts`, the existing packaged-main prebundle owns the code. Extend the metafile policy test to require headless input while retaining `electron` as the only packaged-main external and retaining every forbidden web/provider dependency assertion.

- [ ] **Step 5: Run focused pack tests and typechecks**

Run:

```bash
pnpm --filter @open-design/packaged test -- tests/config.test.ts tests/headless.test.ts
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/tools-pack test -- tests/mac-prebundle.test.ts tests/desktop-package-runtime.test.ts tests/mac.test.ts
pnpm --filter @open-design/tools-pack typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit packaged protocol support**

```bash
git add apps/packaged/src/config.ts apps/packaged/tests/config.test.ts tools/pack/src/mac/app.ts tools/pack/src/mac-prebundle.ts tools/pack/tests
git commit -m "feat: package private plugin service entry"
```

### Task 11: Scaffold the native plugin, marketplace, bundle, and brand assets

**Files:**

- Create: `.agents/plugins/marketplace.json`
- Create: `.agents/plugins/clean-design/.codex-plugin/plugin.json`
- Create: `.agents/plugins/clean-design/.mcp.json`
- Create: `.agents/plugins/clean-design/README.md`
- Create: `.agents/plugins/clean-design/mcp/launcher.bundle.mjs`
- Create: `.agents/plugins/clean-design/assets/composer-icon.png`
- Create: `.agents/plugins/clean-design/assets/logo.png`
- Create: `.agents/plugins/clean-design/assets/logo-dark.png`
- Create: `.agents/plugins/clean-design/assets/screenshot-create.png`
- Create: `.agents/plugins/clean-design/assets/screenshot-refine.png`
- Create: `.agents/plugins/clean-design/assets/screenshot-export.png`
- Create: `packages/codex-plugin/scripts/build-plugin-assets.mjs`
- Create: `packages/codex-plugin/tests/plugin-package.test.ts`
- Modify: `packages/codex-plugin/package.json`
- Modify: `packages/codex-plugin/esbuild.config.mjs`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Task 8 launcher bundle, existing Clean Design macOS icon and real launch imagery, approved screenshot art direction.
- Produces: a valid rich plugin shell and repository marketplace for Task 12 Skills and Task 13 installation tests.

- [ ] **Step 1: Scaffold through plugin-creator**

Run from the plugin-creator skill root:

```bash
python3 scripts/create_basic_plugin.py clean-design \
  --path /Users/mingjian/Documents/sync/GitHub/clean-design/.agents/plugins \
  --marketplace-path /Users/mingjian/Documents/sync/GitHub/clean-design/.agents/plugins/marketplace.json \
  --marketplace-name clean-design \
  --category Creativity \
  --with-skills --with-assets --with-mcp --with-marketplace
```

Expected: scaffold creates the required manifest and repo marketplace entry without placeholders. The repo marketplace uses `clean-design` instead of the reserved default personal-marketplace identity, so it can be registered independently.

- [ ] **Step 2: Add red package-shape tests**

Assert exact identity, version `0.1.0`, `Creativity`, `Interactive`/`Write`, three prompts each ≤128 characters, legal/repository URLs, real asset files, 1600×900 PNG screenshots, relative manifest paths, `.mcp.json` command shape, bundle existence, no absolute build path, no `od`/Open Design user copy, and no hooks/apps entry.

- [ ] **Step 3: Run the red package test**

Run: `pnpm --filter @open-design/codex-plugin test -- tests/plugin-package.test.ts`
Expected: FAIL on incomplete rich metadata, assets, and launcher bundle.

- [ ] **Step 4: Write the rich manifest and MCP configuration**

Use this metadata contract:

```json
{
  "name": "clean-design",
  "version": "0.1.0",
  "description": "Create, refine, preview, and export local visual projects with Clean Design.",
  "author": {
    "name": "Clean Design",
    "url": "https://github.com/nxxxsooo/clean-design"
  },
  "homepage": "https://github.com/nxxxsooo/clean-design",
  "repository": "https://github.com/nxxxsooo/clean-design",
  "license": "Apache-2.0",
  "keywords": ["design", "prototype", "presentation", "brand", "local-first"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "Clean Design",
    "shortDescription": "Local-first visual creation from Codex",
    "longDescription": "Create and refine websites, prototypes, presentations, documents, design systems, brand kits, and media in a local Clean Design workspace. Inspect files and DESIGN.md, verify rendered previews, open projects in the Mac app, and export immutable handoff packets without a hosted account.",
    "developerName": "Clean Design",
    "category": "Creativity",
    "capabilities": ["Interactive", "Write"],
    "websiteURL": "https://github.com/nxxxsooo/clean-design",
    "privacyPolicyURL": "https://github.com/nxxxsooo/clean-design/blob/main/PRIVACY.md",
    "termsOfServiceURL": "https://github.com/nxxxsooo/clean-design/blob/main/LICENSE",
    "defaultPrompt": [
      "Design a polished landing page and open the result in Clean Design.",
      "Create an eight-slide narrative deck and render a verified preview.",
      "Build a reusable brand kit with DESIGN.md and export a handoff packet."
    ],
    "brandColor": "#DF5D36",
    "composerIcon": "./assets/composer-icon.png",
    "logo": "./assets/logo.png",
    "logoDark": "./assets/logo-dark.png",
    "screenshots": [
      "./assets/screenshot-create.png",
      "./assets/screenshot-refine.png",
      "./assets/screenshot-export.png"
    ]
  }
}
```

`.mcp.json` uses `cwd: "."`, `command: "node"`, and `args: ["./mcp/launcher.bundle.mjs", "--stdio"]`, with title, description, and icon entries.

Update the scaffolded marketplace entry to this exact policy and category while preserving top-level `interface.displayName: "Clean Design"`:

```json
{
  "name": "clean-design",
  "source": {
    "source": "local",
    "path": "./.agents/plugins/clean-design"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Creativity"
}
```

- [ ] **Step 5: Build deterministic brand assets**

Pin `sharp: 0.34.5` as a dev dependency of `@open-design/codex-plugin`. The asset script uses `tools/pack/resources/mac/icon.png` and the three real launch images under `docs/assets/launch/`. Compose original 1600×900 screenshots on `#111820` with a subtle dotted grid, warm off-white rounded panels, and `#DF5D36` accents, following the supplied image only as layout direction. Do not copy the supplied pixels or add invented product UI.

- [ ] **Step 6: Copy the deterministic bridge bundle**

Extend `esbuild.config.mjs` to write the same bundle bytes to `packages/codex-plugin/dist/launcher.bundle.mjs` and `.agents/plugins/clean-design/mcp/launcher.bundle.mjs`. Scan output for `/Users/`, the repository absolute path, provider secret names, and source maps; fail the build if found.

- [ ] **Step 7: Validate the plugin and package test**

Run:

```bash
pnpm --filter @open-design/codex-plugin build
pnpm --filter @open-design/codex-plugin test -- tests/plugin-package.test.ts
python3 /Users/mingjian/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .agents/plugins/clean-design
```

Expected: PASS.

- [ ] **Step 8: Commit the plugin shell and assets**

```bash
git add .agents/plugins/marketplace.json .agents/plugins/clean-design packages/codex-plugin pnpm-lock.yaml
git commit -m "feat: add Clean Design Codex plugin shell"
```

### Task 12: Write and validate the router plus seven focused Skills

**Files:**

- Create: `.agents/plugins/clean-design/skills/clean-design/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/clean-design/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/create-web-prototype/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/create-web-prototype/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/create-presentation/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/create-presentation/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/create-document/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/create-document/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/create-design-system/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/create-design-system/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/create-brand-kit/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/create-brand-kit/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/create-media/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/create-media/agents/openai.yaml`
- Create: `.agents/plugins/clean-design/skills/refine-and-export/SKILL.md`
- Create: `.agents/plugins/clean-design/skills/refine-and-export/agents/openai.yaml`
- Create: `packages/codex-plugin/tests/skill-package.test.ts`
- Create: `packages/codex-plugin/tests/fixtures/skill-routing.json`

**Interfaces:**

- Consumes: Task 8 tool names and Task 11 plugin identity/assets.
- Produces: eight discoverable Skills with precise triggers, progressive disclosure, tool dependencies, and completion rules for Task 13 evaluations.

- [ ] **Step 1: Add red Skill package tests and routing fixtures**

Create fixtures covering web/prototype, deck, document, design system, brand kit, image/video/audio, existing-project refinement, and export. Add negative fixtures for ordinary coding, generic image questions, and requests to invoke a provider directly. Test unique names, concise descriptions, exclusion clauses, preview verification, relevant tool dependencies, and exactly eight Skill folders.

- [ ] **Step 2: Run the red Skill test**

Run: `pnpm --filter @open-design/codex-plugin test -- tests/skill-package.test.ts`
Expected: FAIL because Skill files are missing.

- [ ] **Step 3: Write the router Skill**

The router frontmatter must be:

```yaml
---
name: clean-design
description: Create, edit, inspect, preview, render, or export visual projects in Clean Design; routes websites, prototypes, presentations, documents, design systems, brand kits, images, video, and audio to focused workflows. Do not use for ordinary code-only changes that do not need a Clean Design workspace.
---
```

Its workflow is: confirm MCP → resolve explicit/active project → choose exactly one primary focused Skill → read one canonical workflow when needed → inspect before write → preview/render to terminal status → open in app when visual review helps → export only on request. It must name all seven focused Skills and all intentional non-capabilities.

- [ ] **Step 4: Write the seven focused Skills**

Every focused Skill includes: trigger/exclusions, inputs, inspect-first sequence, exact MCP tool names, error recovery, preview completion criteria, and output report. `create-media` must never retry a paid provider generation because MCP does not invoke providers; it operates only on user-supplied or already-managed assets. `refine-and-export` requires a successful preview/render before export and never overwrites an existing packet.

- [ ] **Step 5: Add `agents/openai.yaml` metadata and dependencies**

Use this shape per Skill, changing display text, prompt, and the minimal tool list:

```yaml
interface:
  display_name: "Create web prototype"
  short_description: "Build and verify a web or product prototype in Clean Design"
  icon_small: "../../../assets/composer-icon.png"
  icon_large: "../../../assets/logo.png"
  brand_color: "#DF5D36"
  default_prompt: "Use $create-web-prototype to build a responsive prototype and verify its preview."
dependencies:
  tools:
    - type: "mcp"
      value: "clean_design_create_project"
      description: "Create a managed Clean Design project"
    - type: "mcp"
      value: "clean_design_write_file"
      description: "Write a contained project file"
    - type: "mcp"
      value: "clean_design_preview"
      description: "Verify the rendered project preview"
```

Keep implicit invocation enabled for the router and focused artifact Skills. Descriptions front-load trigger phrases because Codex may shorten the initial Skill list.

- [ ] **Step 6: Validate all Skills and the plugin**

Run:

```bash
pnpm --filter @open-design/codex-plugin test -- tests/skill-package.test.ts tests/plugin-package.test.ts
for skill in .agents/plugins/clean-design/skills/*; do
  python3 /Users/mingjian/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$skill"
done
python3 /Users/mingjian/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .agents/plugins/clean-design
```

Expected: every command PASS.

- [ ] **Step 7: Commit the Skill slice**

```bash
git add .agents/plugins/clean-design/skills packages/codex-plugin/tests/skill-package.test.ts packages/codex-plugin/tests/fixtures/skill-routing.json
git commit -m "feat: add Clean Design plugin workflows"
```

### Task 13: Prove the plugin flow, startup bounds, and security invariants

**Files:**

- Create: `e2e/specs/codex-plugin/main.spec.ts`
- Create: `e2e/tests/codex-plugin/startup-storm.test.ts`
- Create: `e2e/tests/codex-plugin/security.test.ts`
- Create: `e2e/tests/codex-plugin/evaluations.test.ts`
- Create: `e2e/resources/codex-plugin/evaluations.json`
- Create: `e2e/lib/codex-plugin/harness.ts`

**Interfaces:**

- Consumes: completed service, bridge, app launcher, plugin, and Skills from Tasks 2–12.
- Produces: hermetic end-to-end evidence for every functional, concurrency, and security acceptance criterion.

- [ ] **Step 1: Write the red business-flow spec**

The `[P0]` spec must start an isolated namespace with no provider credentials, invoke the real bridge, create a project, write `index.html` and `DESIGN.md`, read a canonical Skill, request preview/render, verify output, open the project through a fake visible-app boundary, export a handoff packet, and inspect its manifest. Use daemon/service APIs and stdio; do not use Playwright.

- [ ] **Step 2: Write red startup-storm and security tests**

Startup storm: launch 64 bridge processes simultaneously; assert one daemon PID, at most one renderer PID, 16 accepted leases, stable `SERVICE_CAPACITY` for excess live clients, bounded retries, and final idle exit. Security: forged descriptors, mode violations, wrong/cross-namespace secret, replay, expired signature, traversal, symlink escape, credential filename/content, oversized content, arbitrary shell/provider/agent operations, and unexpected outbound connection attempts must all fail closed.

- [ ] **Step 3: Write declarative Skill/tool evaluations**

`evaluations.json` contains at least 12 cases: service inspection, active project, create web project, deck, document, design system, brand kit, managed media import, refinement, render status, handoff export, and forbidden provider execution. Each case names expected Skill and required/forbidden tools.

- [ ] **Step 4: Run the red E2E group**

Run:

```bash
pnpm --filter @open-design/e2e test specs/codex-plugin tests/codex-plugin
```

Expected: FAIL until the harness supplies isolated app/runtime fixtures and all integrations are complete.

- [ ] **Step 5: Implement the hermetic harness**

The harness creates a temporary namespace/data root, fake signed app bundle/config, captured stdout/stderr, no provider env, fake visible-app opener, exact PID registry, curated report output, and exact-namespace cleanup. Preserve scratch/logs only on failure. Do not use fixed ports.

- [ ] **Step 6: Run E2E, focused package gates, and RSS check**

Run:

```bash
pnpm --filter @open-design/e2e test specs/codex-plugin tests/codex-plugin
pnpm --filter @open-design/e2e typecheck
pnpm --filter @open-design/codex-plugin test
pnpm --filter @open-design/daemon test -- tests/services/mcp-profile.test.ts tests/http/mcp-auth.test.ts tests/routes/mcp-profile.test.ts
pnpm --filter @open-design/packaged test -- tests/service-manager.test.ts tests/headless.test.ts
```

Expected: PASS. RSS must stabilize after repeated render requests and return within the recorded tolerance after all clients close; do not assert an exact platform-fragile byte count.

- [ ] **Step 7: Commit E2E evidence**

```bash
git add e2e
git commit -m "test: verify Clean Design Codex plugin"
```

### Task 14: Document installation, run acceptance, and close the OpenSpec tasks

**Files:**

- Modify: `README.md`
- Create: `docs/codex-plugin.md`
- Modify: `tools/pack/README.md`
- Modify: `docs/project/openspec/changes/clean-design-codex-plugin/tasks.md`

**Interfaces:**

- Consumes: all previous tasks.
- Produces: user installation/recovery documentation, complete verification evidence, and a ready-for-review branch without publishing or merging.

- [ ] **Step 1: Document install and lifecycle**

Document repository marketplace installation, starting a new Codex task after installation, app requirement, `CLEAN_DESIGN_APP_PATH` development override, one-service/lease/idle behavior, tool boundaries, and exact namespace recovery. Do not recommend `pkill`, a global CLI, fixed ports, or manual secret handling.

- [ ] **Step 2: Run all focused package gates**

```bash
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/platform test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/desktop test
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/tools-pack test
pnpm --filter @open-design/codex-plugin test
pnpm --filter @open-design/e2e test specs/codex-plugin tests/codex-plugin
```

Expected: every command PASS.

- [ ] **Step 3: Run repository gates**

```bash
pnpm guard
pnpm typecheck
git diff --check
```

Expected: PASS and no whitespace errors.

- [ ] **Step 4: Build and inspect the real Apple Silicon package**

```bash
pnpm tools-pack mac build --to all --portable
pnpm tools-pack mac inspect
```

Inspect the app for Clean Design identity, protocol version 1, private argument-gated headless code, daemon/render resources, no build-machine absolute paths, no provider secrets, no global CLI, and no stale Open Design user-visible plugin assets.

- [ ] **Step 5: Install and smoke-test the real plugin boundary**

```bash
pnpm tools-pack mac install
python3 /Users/mingjian/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .agents/plugins/clean-design
codex plugin marketplace add /Users/mingjian/Documents/sync/GitHub/clean-design
codex plugin add clean-design@clean-design
```

Install `clean-design` from the repo marketplace in the Codex app, start a new task, call service info from two clients, confirm identical namespace/daemon PID, create and preview a small project, export a handoff packet, close both clients, and verify idle shutdown. Record any UI-only plugin-install step that cannot be automated as the sole manual verification gap; do not claim it passed without observation.

- [ ] **Step 6: Mark OpenSpec tasks complete only from evidence**

Update `docs/project/openspec/changes/clean-design-codex-plugin/tasks.md` checkbox by checkbox, then run:

```bash
cd docs/project
openspec validate clean-design-codex-plugin --strict --no-interactive
cd ../..
```

Expected: PASS and every checked task has a corresponding successful command or manual observation.

- [ ] **Step 7: Commit documentation and acceptance state**

```bash
git add README.md docs/codex-plugin.md tools/pack/README.md docs/project/openspec/changes/clean-design-codex-plugin/tasks.md
git commit -m "docs: explain Clean Design Codex plugin"
```

- [ ] **Step 8: Run completion review**

Invoke `superpowers:requesting-code-review`; address findings using `superpowers:receiving-code-review`. Then invoke `superpowers:verification-before-completion` and rerun every gate claimed in the final report. Confirm `git status --short` contains only pre-existing unrelated user changes.

- [ ] **Step 9: Offer branch integration choices**

Use `superpowers:finishing-a-development-branch` to offer merge, PR, keep, or discard choices. Do not merge, push, publish the plugin, submit to the universal directory, or create a release without explicit user direction.
