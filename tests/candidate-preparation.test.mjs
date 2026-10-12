import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCleanBaseline, cloneBaselineTree, gitHead, prepareCandidate } from "../scripts/lib/candidate-prepare.mjs";
import { contractsAreStructurallyEqual, diffContractSnapshots } from "../scripts/lib/contract-diff.mjs";
import { cleanGitFixture } from "./helpers/clean-git-fixture.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(join(repoRoot, "maintenance/tool-contracts.json"), "utf8"));

function commit(repo, paths) {
  execFileSync("git", ["-C", repo, "add", "--", ...paths]);
  execFileSync("git", ["-C", repo, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Offline test", "-c", "user.email=offline@example.invalid", "commit", "--quiet", "-m", "Temporary capture fixture"]);
}

test("producer blocks dirty tracked checkout and mismatched HEAD snapshot; excludes untracked source", () => {
  const fixture = cleanGitFixture(repoRoot);
  const temp = mkdtempSync(join(tmpdir(), "amox-candidate-git-test-"));
  try {
    const sha = assertCleanBaseline(fixture.repo, snapshot);
    writeFileSync(join(fixture.repo, "untracked-source.ts"), "untracked source must not be copied");
    assert.equal(assertCleanBaseline(fixture.repo, snapshot), sha);
    const clone = join(temp, "clone");
    cloneBaselineTree(fixture.repo, clone, sha);
    assert.equal(gitHead(clone), sha);
    assert.equal(existsSync(join(clone, "untracked-source.ts")), false);
    const badSnapshot = structuredClone(snapshot);
    badSnapshot.environment.piVersion = "99.0.0";
    assert.throws(() => assertCleanBaseline(fixture.repo, badSnapshot), /snapshot 与 HEAD 不一致/);
    writeFileSync(join(fixture.repo, "docs/maintenance.md"), "dirty tracked content");
    assert.throws(() => assertCleanBaseline(fixture.repo, snapshot), /clean tracked checkout/);
    execFileSync("git", ["-C", fixture.repo, "add", "docs/maintenance.md"]);
    assert.throws(() => assertCleanBaseline(fixture.repo, snapshot), /clean tracked checkout/);
  } finally { fixture.cleanup(); rmSync(temp, { recursive: true, force: true }); }
});

test("real Git-dependent validator tests and release verify-only run inside the temporary candidate clone", () => {
  const fixture = cleanGitFixture(repoRoot);
  const temp = mkdtempSync(join(tmpdir(), "amox-candidate-git-coverage-"));
  try {
    const clone = join(temp, "repo");
    const sha = gitHead(fixture.repo);
    cloneBaselineTree(fixture.repo, clone, sha);
    const validation = spawnSync(process.execPath, ["--test", "tests/candidate-validation.test.mjs"], { cwd: clone, encoding: "utf8" });
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);
    assert.doesNotMatch(validation.stderr, /not a git repository/);
    const version = JSON.parse(readFileSync(join(clone, "package.json"), "utf8")).version;
    const release = spawnSync(process.execPath, ["scripts/create-release.mjs", "--verify-only"], { cwd: clone, encoding: "utf8", env: { ...process.env, GH_TOKEN: "", RELEASE_TAG: `v${version}`, EXPECTED_SHA: sha, GITHUB_REPOSITORY: "test/repo" } });
    assert.equal(release.status, 0, release.stderr);
    assert.match(release.stdout, /no token used/);
    assert.equal(gitHead(fixture.repo), sha, "the source checkout was not committed or changed");
  } finally { fixture.cleanup(); rmSync(temp, { recursive: true, force: true }); }
});

test("real Agent ordering, source and registered list changes produce diagnostics AND preserve accepted baseline", async () => {
  const fixture = cleanGitFixture(repoRoot);
  const temp = mkdtempSync(join(tmpdir(), "amox-producer-drift-test-"));
  try {
    const baselinePath = join(fixture.repo, "maintenance/tool-contracts.json");
    const before = readFileSync(baselinePath, "utf8");
    const mutations = [
      (s) => { const agent = s.upstream["@tintinweb/pi-subagents"].tools.find((tool) => tool.name === "Agent"); assert.ok(agent.promptGuidelines.length > 1); agent.promptGuidelines.reverse(); },
      (s) => { s.upstream["pi-web-access"].tools[0].source = "other"; },
      (s) => { s.upstream["pi-web-access"].registeredTools.push("NewTool"); },
    ];
    for (const [i, mutate] of mutations.entries()) {
      const fresh = structuredClone(snapshot);
      mutate(fresh);
      assert.equal(contractsAreStructurallyEqual(snapshot, fresh), false);
      assert.equal(diffContractSnapshots(snapshot, fresh).drift, true);
      // Trusted read-only capture fixture. Nothing is executed by the
      // privileged consumer; this simulates a changed real capture surface.
      writeFileSync(join(fixture.repo, "scripts/capture-contracts.mjs"), `import { writeFileSync } from "node:fs"; writeFileSync(process.argv[process.argv.indexOf("--output") + 1], ${JSON.stringify(JSON.stringify(fresh))});\n`);
      commit(fixture.repo, ["scripts/capture-contracts.mjs"]);
      const outDir = join(temp, `out-${i}`);
      await assert.rejects(prepareCandidate({ repoRoot: fixture.repo, outDir, plan: { updateRequired: false, leanReviewRequired: false, packagePlans: [] }, baselineSnapshot: snapshot, refreshSnapshot: true }), /结构契约漂移/);
      const diff = JSON.parse(readFileSync(join(outDir, "diagnostics/contract-diff.json"), "utf8"));
      assert.equal(diff.drift, true);
      assert.ok(diff.packages.some((entry) => entry.structuralChanges?.length > 0));
      assert.equal(existsSync(join(outDir, "candidate.json")), false, "no ready or refresh writer artifact on drift");
      assert.equal(readFileSync(baselinePath, "utf8"), before);
    }
  } finally { fixture.cleanup(); rmSync(temp, { recursive: true, force: true }); }
});
