import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectProductNeutralityViolationsFromSource,
  isProductNeutralityCheckedPath,
} from "./guard.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("documents the bounded first-party Codex plugin exception", () => {
  const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  const spec = readFileSync(
    join(
      repoRoot,
      "docs/project/openspec/changes/clean-design-codex-plugin/specs/local-studio/spec.md",
    ),
    "utf8",
  );
  const combined = `${agents}\n${spec}`;

  for (const phrase of [
    "first-party `clean-design` plugin",
    "global CLI",
    "agent or provider execution",
    "temporary headless service",
  ]) {
    assert.ok(
      combined.includes(phrase),
      `expected the plugin exception contract to document: ${phrase}`,
    );
  }
});

test("product-neutrality check rejects named orchestrator examples on public surfaces", () => {
  const violations = collectProductNeutralityViolationsFromSource(
    "packages/contracts/src/api/chat.ts",
    "Run-scoped tool bundle supplied by an orchestrator such as Acme.",
    [],
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.lineNumber, 1);
});

test("product-neutrality check covers web App Router public copy", () => {
  assert.equal(isProductNeutralityCheckedPath("apps/web/app/page.tsx"), true);

  const violations = collectProductNeutralityViolationsFromSource(
    "apps/web/app/page.tsx",
    "This page mentions an orchestrator such as Acme.",
    [],
  );

  assert.equal(violations.length, 1);
});

test("product-neutrality check supports local forbidden terms without committing them", () => {
  const violations = collectProductNeutralityViolationsFromSource(
    "docs/example.md",
    "This private deployment name should not ship.",
    ["private deployment"],
  );

  assert.equal(violations.length, 1);
});

test("product-neutrality check ignores out-of-scope paths", () => {
  assert.equal(isProductNeutralityCheckedPath("tmp/scratch.md"), false);
  assert.deepEqual(
    collectProductNeutralityViolationsFromSource(
      "tmp/scratch.md",
      "A scratch note can mention an orchestrator such as Acme.",
      [],
    ),
    [],
  );
});
