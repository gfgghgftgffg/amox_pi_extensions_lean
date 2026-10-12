import assert from "node:assert/strict";
import test from "node:test";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSnapshotCopy } from "../scripts/lib/snapshot-output.mjs";
import { cleanGitFixture } from "./helpers/clean-git-fixture.mjs";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("snapshot output identity guard rejects symlink, hardlink and canonical-parent aliases without changing bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-output-alias-test-"));
  try {
    const acceptedDir = join(dir, "maintenance");
    mkdirSync(acceptedDir);
    const baselinePath = join(acceptedDir, "tool-contracts.json");
    const before = "accepted baseline bytes\n";
    writeFileSync(baselinePath, before);
    const symbolic = join(dir, "symlink.json"), hard = join(dir, "hardlink.json"), parent = join(dir, "parent-alias");
    symlinkSync(baselinePath, symbolic);
    linkSync(baselinePath, hard);
    symlinkSync(acceptedDir, parent);
    for (const outputPath of [baselinePath, symbolic, hard, join(parent, "tool-contracts.json")]) {
      assert.throws(() => writeSnapshotCopy({ outputPath, baselinePath, content: "bad" }), /--write/);
      assert.equal(readFileSync(baselinePath, "utf8"), before);
    }
    const normal = join(dir, "new", "output.json");
    writeSnapshotCopy({ outputPath: normal, baselinePath, content: "{}\n" });
    assert.equal(readFileSync(normal, "utf8"), "{}\n");
    const unrelated = join(dir, "unrelated.json"), alias = join(dir, "unrelated-alias.json");
    writeFileSync(unrelated, "unchanged referent");
    symlinkSync(unrelated, alias);
    writeSnapshotCopy({ outputPath: alias, baselinePath, content: "replacement" });
    assert.equal(readFileSync(unrelated, "utf8"), "unchanged referent", "atomic output replaces the entry, never follows an existing alias");
    assert.equal(readFileSync(alias, "utf8"), "replacement");
    assert.equal(readFileSync(baselinePath, "utf8"), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("actual capture --output CLI cannot overwrite accepted baseline through filesystem aliases", () => {
  const fixture = cleanGitFixture(repoRoot);
  const dir = mkdtempSync(join(tmpdir(), "amox-capture-alias-cli-"));
  try {
    symlinkSync(join(repoRoot, "node_modules"), join(fixture.repo, "node_modules"), "dir");
    const baseline = join(fixture.repo, "maintenance/tool-contracts.json");
    const before = readFileSync(baseline, "utf8");
    symlinkSync(baseline, join(dir, "symbolic.json"));
    linkSync(baseline, join(dir, "hard.json"));
    symlinkSync(join(fixture.repo, "maintenance"), join(dir, "parent"));
    for (const output of [join(dir, "symbolic.json"), join(dir, "hard.json"), join(dir, "parent/tool-contracts.json")]) {
      const result = spawnSync(process.execPath, ["scripts/capture-contracts.mjs", "--output", output], { cwd: fixture.repo, encoding: "utf8" });
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /--write/);
      assert.equal(readFileSync(baseline, "utf8"), before);
    }
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
