// Phase 7-8 entry slice / spec §10 / §11.5.1 / §21.5 — handoff atom.
//
// SKILL.md fragment lives at plugins/_official/atoms/handoff/. The
// daemon-side helper updates an ArtifactManifest's provenance +
// export metadata so subsequent runs can reverse-resolve the artifact's lineage
// without mutating any prior fields. The contract is append-only:
//
//   - sourcePluginSnapshotId NEVER changes after first write.
//   - exportTargets[] only ever GROWS.
//   - handoffKind can be promoted when build-test signals and
//     diff-review acceptance combine.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type {
  ArtifactExportTarget,
  ArtifactManifest,
  ArtifactProvenanceHandoffKind,
} from '@open-design/contracts';

export interface RecordHandoffInput {
  manifest: ArtifactManifest;
  exportTarget?: ArtifactExportTarget;
  handoffKind?: ArtifactProvenanceHandoffKind;
  // When true (default), refuse to demote handoffKind back along the
  // axis 'design-only' < 'implementation-plan' < 'patch'.
  // Setting false lets a rollback path explicitly downgrade.
  enforceMonotonicHandoff?: boolean;
}

export interface RecordHandoffResult {
  manifest: ArtifactManifest;
  changed:  Array<'exportTargets' | 'handoffKind'>;
}

const HANDOFF_RANK: Record<ArtifactProvenanceHandoffKind, number> = {
  'design-only':         0,
  'implementation-plan': 1,
  'patch':               2,
};

export function recordHandoff(input: RecordHandoffInput): RecordHandoffResult {
  const changed: RecordHandoffResult['changed'] = [];
  // Clone shallowly so the caller's reference isn't mutated; arrays
  // we touch get fresh copies before we push.
  const next: ArtifactManifest = { ...input.manifest };
  if (input.exportTarget) {
    const incoming = input.exportTarget;
    const existing = next.exportTargets ?? [];
    // Idempotency: a (surface, target) pair only ever lands once.
    const already = existing.some(
      (t: ArtifactExportTarget) => t.surface === incoming.surface && t.target === incoming.target,
    );
    if (!already) {
      next.exportTargets = [...existing, incoming];
      changed.push('exportTargets');
    }
  }
  if (input.handoffKind) {
    const enforce = input.enforceMonotonicHandoff ?? true;
    const current = next.handoffKind;
    if (!current) {
      next.handoffKind = input.handoffKind;
      changed.push('handoffKind');
    } else {
      const incomingRank = HANDOFF_RANK[input.handoffKind] ?? 0;
      const currentRank = HANDOFF_RANK[current] ?? 0;
      if (!enforce || incomingRank >= currentRank) {
        if (current !== input.handoffKind) {
          next.handoffKind = input.handoffKind;
          changed.push('handoffKind');
        }
      }
    }
  }
  return { manifest: next, changed };
}

// Plan §3.S1 — pipeline-driven handoff bridge.
//
// Reads the on-disk state previous atoms wrote (critique/build-test.json,
// review/decision.json) and returns the updated manifest with the right
// handoffKind / exportTargets[] / signals attached. The function is
// pure relative to its inputs (it reads files, never writes back). The
// caller decides where to persist the updated manifest (typically
// `<cwd>/<manifest-path>` or `.od/artifacts/<id>/manifest.json`).
//
// Promotion ladder (spec §11.5.1):
//   1. decision='reject'                              → handoffKind='design-only'
//   2. decision='accept'/'partial' AND no build-test  → handoffKind='implementation-plan'
//   3. (2) + build.passing OR tests.passing           → handoffKind='patch'
// Monotonicity is enforced via recordHandoff() — a subsequent run
// can only advance, never demote.

export interface RunHandoffAtomInput {
  cwd: string;
  manifest: ArtifactManifest;
  // Optional explicit export target the caller is recording (e.g.
  // 'cli' when od plugin export wrote to disk; 'docker' when the
  // tools-pack image build completes; 'figma' when Figma export
  // wrote a frame back).
  exportTarget?: ArtifactExportTarget;
  exportTargets?: ArtifactExportTarget[];
}

export interface RunHandoffAtomResult {
  manifest: ArtifactManifest;
  changed:  Array<'exportTargets' | 'handoffKind'>;
  signals: {
    decision?:     'accept' | 'reject' | 'partial';
    buildPassing?: boolean;
    testsPassing?: boolean;
  };
}

export async function runHandoffAtom(input: RunHandoffAtomInput): Promise<RunHandoffAtomResult> {
  const cwd = path.resolve(input.cwd);
  const decision = await readDiffReviewDecision(cwd);
  const buildTest = await readBuildTestSignals(cwd);

  // Start by appending whatever explicit export targets the
  // caller passed in. Idempotency is enforced inside recordHandoff().
  let next = input.manifest;
  let changed: RunHandoffAtomResult['changed'] = [];
  const targets: ArtifactExportTarget[] = [
    ...(input.exportTarget ? [input.exportTarget] : []),
    ...(input.exportTargets ?? []),
  ];
  for (const t of targets) {
    const out = recordHandoff({ manifest: next, exportTarget: t });
    next = out.manifest;
    for (const c of out.changed) if (!changed.includes(c)) changed.push(c);
  }
  // Compute the target handoff kind from the on-disk state.
  let handoffKind: ArtifactProvenanceHandoffKind | undefined;
  if (decision === 'reject') {
    handoffKind = 'design-only';
  } else if (decision === 'accept' || decision === 'partial') {
    handoffKind = 'implementation-plan';
    if (buildTest && (buildTest.buildPassing || buildTest.testsPassing)) {
      handoffKind = 'patch';
    }
  }
  if (handoffKind) {
    const out = recordHandoff({ manifest: next, handoffKind });
    next = out.manifest;
    for (const c of out.changed) if (!changed.includes(c)) changed.push(c);
  }

  const signals: RunHandoffAtomResult['signals'] = {};
  if (decision) signals.decision = decision;
  if (buildTest) {
    signals.buildPassing = buildTest.buildPassing;
    signals.testsPassing = buildTest.testsPassing;
  }
  return { manifest: next, changed, signals };
}

async function readDiffReviewDecision(cwd: string): Promise<'accept' | 'reject' | 'partial' | undefined> {
  const p = path.join(cwd, 'review', 'decision.json');
  try {
    const raw = await fsp.readFile(p, 'utf8');
    const obj = JSON.parse(raw) as { decision?: unknown };
    if (obj.decision === 'accept' || obj.decision === 'reject' || obj.decision === 'partial') {
      return obj.decision;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// Plan §3.T1 — `<cwd>/handoff/manifest.json` round-trip.
//
// runAndPersistHandoff() is the on-disk shell around runHandoffAtom():
//
//   1. Read `<cwd>/handoff/manifest.json` (or fall back to
//      `manifestSeed`, or finally a minimal default) so promotions
//      stay monotonic across re-runs.
//   2. Call runHandoffAtom() with the chosen seed + the caller's
//      explicit export targets.
//   3. Write the updated manifest back to
//      `<cwd>/handoff/manifest.json`.
//   4. Return the report shape the caller can forward to SSE / CLI
//      audit logs.
//
// The bridge fires from the diff-review GenUI flow and from any
// pipeline runner that wants the manifest computed declaratively.

export interface RunAndPersistHandoffInput {
  cwd: string;
  // When the manifest file is missing AND no exportTargets are
  // declared, fall back to this seed. Useful for the first pipeline
  // run: the agent hasn't produced a manifest yet but we still want
  // to record the promotion ladder progress.
  manifestSeed?: ArtifactManifest;
  exportTarget?: ArtifactExportTarget;
  exportTargets?: ArtifactExportTarget[];
}

export interface RunAndPersistHandoffResult extends RunHandoffAtomResult {
  manifestPath: string;
  // 'created' = no on-disk manifest existed; 'updated' = round-tripped;
  // 'skipped' = nothing changed (re-run was a no-op).
  persistMode: 'created' | 'updated' | 'skipped';
}

const DEFAULT_MANIFEST_SEED: ArtifactManifest = {
  version:  1,
  kind:     'react-component',
  title:    'Pipeline output',
  entry:    '',
  renderer: 'react-component',
  exports:  [],
};

export async function runAndPersistHandoff(
  input: RunAndPersistHandoffInput,
): Promise<RunAndPersistHandoffResult> {
  const cwd = path.resolve(input.cwd);
  const manifestPath = path.join(cwd, 'handoff', 'manifest.json');
  const existing = await readManifestFile(manifestPath);
  const seed: ArtifactManifest = existing ?? input.manifestSeed ?? DEFAULT_MANIFEST_SEED;

  const handoffInput: RunHandoffAtomInput = { cwd, manifest: seed };
  if (input.exportTarget)  handoffInput.exportTarget  = input.exportTarget;
  if (input.exportTargets) handoffInput.exportTargets = input.exportTargets;
  const report = await runHandoffAtom(handoffInput);

  let persistMode: RunAndPersistHandoffResult['persistMode'];
  if (!existing) {
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
    await fsp.writeFile(manifestPath, JSON.stringify(report.manifest, null, 2) + '\n', 'utf8');
    persistMode = 'created';
  } else if (report.changed.length > 0) {
    await fsp.writeFile(manifestPath, JSON.stringify(report.manifest, null, 2) + '\n', 'utf8');
    persistMode = 'updated';
  } else {
    persistMode = 'skipped';
  }
  return { ...report, manifestPath, persistMode };
}

async function readManifestFile(p: string): Promise<ArtifactManifest | undefined> {
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw) as ArtifactManifest;
  } catch {
    return undefined;
  }
}

async function readBuildTestSignals(cwd: string): Promise<{ buildPassing: boolean; testsPassing: boolean } | undefined> {
  const p = path.join(cwd, 'critique', 'build-test.json');
  try {
    const raw = await fsp.readFile(p, 'utf8');
    const obj = JSON.parse(raw) as { signals?: { 'build.passing'?: unknown; 'tests.passing'?: unknown } };
    const buildPassing = obj.signals?.['build.passing'] === true;
    const testsPassing = obj.signals?.['tests.passing'] === true;
    return { buildPassing, testsPassing };
  } catch {
    return undefined;
  }
}
