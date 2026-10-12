// Privilege-boundary candidate validator tests.
//
// The write-scoped PR job must only ever accept the constrained data patch:
// allowlisted paths, no symlinks/modes/deletions/renames, no unrelated JSON
// edits, no downgrades, preserved leanCommit, and no snapshot refresh while
// structural drift exists. These tests craft real artifacts against a fixture
// copy of the repository.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_KIND,
  applyCandidateFiles,
  buildCandidateArtifact,
  validateCandidateArtifact,
} from "../scripts/lib/candidate.mjs";
import { serializeJson } from "../scripts/lib/upstream-plan.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), "amox-candidate-fixture-"));
  cpSync(repoRoot, dir, {
    recursive: true,
    filter(source) {
      if (source === repoRoot) return true;
      const top = source.slice(repoRoot.length + 1).split(/[\\/]/)[0];
      return !["node_modules", ".git", ".maintenance-candidate"].includes(top);
    },
  });
  return dir;
}

/** Build candidate file contents for a single dependency bump. */
function bumpFiles({ repo, id = "pi-web-access-lean", newVersion = "99.0.0", newHead = "b".repeat(40), dropSnapshot = false, dropLockfile = false }) {
  const manifest = JSON.parse(readFileSync(join(repo, "maintenance", "manifest.json"), "utf8"));
  const entry = manifest.packages.find((candidate) => candidate.id === id);
  const packagePath = `${entry.path}/package.json`;
  const pkg = JSON.parse(readFileSync(join(repo, packagePath), "utf8"));
  pkg.dependencies[entry.upstreamPackage] = newVersion;

  const nextManifest = JSON.parse(JSON.stringify(manifest));
  const target = nextManifest.packages.find((candidate) => candidate.id === id);
  target.upstreamVersion = newVersion;
  target.upstreamGitHead = newHead;

  const snapshot = JSON.parse(readFileSync(join(repo, "maintenance", "tool-contracts.json"), "utf8"));
  snapshot.upstream[entry.upstreamPackage].version = newVersion;

  const lock = JSON.parse(readFileSync(join(repo, "package-lock.json"), "utf8"));
  lock.packages[entry.path].dependencies[entry.upstreamPackage] = newVersion;
  lock.packages[`node_modules/${entry.upstreamPackage}`].version = newVersion;

  return { entry, packagePath, pkg, nextManifest, snapshot, lock };
}

function artifactWith({ repo, status = "ready", files, mutate, base = baseCommit }) {
  const baseArtifact = buildCandidateArtifact({
    baseCommit: base,
    status,
    files: files.map((file) => ({ path: file.path, content: file.content })),
  });
  if (mutate) mutate(baseArtifact);
  return baseArtifact;
}

function reportFor(status) {
  return `# Upstream maintenance candidate\n\n<!-- amox-maintenance-candidate; status: ${status} -->\n\nbody\n`;
}

function validReadyArtifact({ repo, id, version = "99.0.0" }) {
  const bumped = bumpFiles({ repo, id, newVersion: version });
  const files = [
    { path: "package-lock.json", content: serializeJson(bumped.lock) },
    { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
    { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
    { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
    { path: "maintenance/update-report.md", content: reportFor("ready") },
  ];
  return { artifact: artifactWith({ repo, status: "ready", files }), bumped };
}

test("a valid ready candidate validates and applies", () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    const result = validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    // baseline files untouched before apply
    assert.equal(JSON.parse(readFileSync(join(repo, "packages/pi-web-access-lean/package.json"), "utf8")).dependencies["pi-web-access"], "0.39.0");
    const applied = applyCandidateFiles({ repoRoot: repo, writes: result.writes });
    assert.equal(applied.length, 5);
    const after = JSON.parse(readFileSync(join(repo, "packages/pi-web-access-lean/package.json"), "utf8"));
    assert.equal(after.dependencies["pi-web-access"], "99.0.0");
    assert.equal(lstatSync(join(repo, "maintenance/update-report.md")).isFile(), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("baseCommit must match the checked-out HEAD exactly", () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    artifact.baseCommit = "c".repeat(40);
    const result = validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /baseCommit/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("unsafe paths are rejected (escaping, absolute, index.ts, root scripts)", () => {
  const repo = fixtureRepo();
  try {
    for (const path of ["../evil.json", "/etc/passwd", "packages/pi-web-access-lean/index.ts", "package.json", "scripts/check-upstream.mjs", ".github/workflows/test.yml", "packages/../outside.json"]) {
      const artifact = {
        schemaVersion: 1,
        kind: CANDIDATE_KIND,
        baseCommit,
        status: "ready",
        files: [{ path, contentSha256: sha256("{}"), content: "{}" }],
      };
      const result = validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
      assert.equal(result.ok, false, `path must be rejected: ${path}`);
    }
    assert.throws(() => buildCandidateArtifact({ baseCommit, status: "ready", files: [{ path: "../x", content: "{}" }] }), /越界|拒绝/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("symlink/mode/deletion/rename style file entries are rejected", () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    for (const extra of [{ mode: "120000" }, { symlink: true }, { delete: true }, { rename: "x" }, { kind: "symlink" }]) {
      const mutated = JSON.parse(JSON.stringify(artifact));
      mutated.files[0] = { ...mutated.files[0], ...extra };
      const result = validateCandidateArtifact({ artifact: mutated, repoRoot: repo, headSha: baseCommit });
      assert.equal(result.ok, false, `extra entry keys must be rejected: ${JSON.stringify(extra)}`);
      assert.ok(result.errors.some((error) => /不允许的字段/.test(error)));
    }
    const topLevel = JSON.parse(JSON.stringify(artifact));
    topLevel.probe = true;
    assert.equal(validateCandidateArtifact({ artifact: topLevel, repoRoot: repo, headSha: baseCommit }).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("content hash mismatches and duplicate paths are rejected", () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    const badHash = JSON.parse(JSON.stringify(artifact));
    badHash.files[0].contentSha256 = "0".repeat(64);
    const result = validateCandidateArtifact({ artifact: badHash, repoRoot: repo, headSha: baseCommit });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /哈希不匹配/.test(error)));

    const duplicate = JSON.parse(JSON.stringify(artifact));
    duplicate.files.push({ ...duplicate.files[0] });
    assert.equal(validateCandidateArtifact({ artifact: duplicate, repoRoot: repo, headSha: baseCommit }).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("workspace JSON edits outside exact dependency versions are rejected", () => {
  const repo = fixtureRepo();
  try {
    const variants = [
      (pkg) => { pkg.name = "@evil/name"; },
      (pkg) => { pkg.license = "GPL-3.0"; },
      (pkg) => { pkg.peerDependencies["typebox"] = "1.0.0"; },
      (pkg) => { pkg.scripts.postinstall = "curl evil"; },
      (pkg) => { pkg.dependencies["left-pad"] = "1.0.0"; },
      (pkg) => { delete pkg.dependencies["pi-web-access"]; },
    ];
    for (const mutate of variants) {
      const bumped = bumpFiles({ repo });
      mutate(bumped.pkg);
      const files = [
        { path: "package-lock.json", content: serializeJson(bumped.lock) },
        { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
        { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
        { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
        { path: "maintenance/update-report.md", content: reportFor("ready") },
      ];
      const result = validateCandidateArtifact({ artifact: artifactWith({ repo, files }), repoRoot: repo, headSha: baseCommit });
      assert.equal(result.ok, false, `workspace edit must be rejected: ${mutate.toString()}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dependency downgrades and version mismatches are rejected", () => {
  const repo = fixtureRepo();
  try {
    // downgrade in package.json
    const downgrade = bumpFiles({ repo, newVersion: "0.38.0" });
    const downgradeFiles = [
      { path: "package-lock.json", content: serializeJson(downgrade.lock) },
      { path: downgrade.packagePath, content: serializeJson(downgrade.pkg) },
      { path: "maintenance/manifest.json", content: serializeJson(downgrade.nextManifest) },
      { path: "maintenance/tool-contracts.json", content: serializeJson(downgrade.snapshot) },
      { path: "maintenance/update-report.md", content: reportFor("ready") },
    ];
    const downgradeResult = validateCandidateArtifact({ artifact: artifactWith({ repo, files: downgradeFiles }), repoRoot: repo, headSha: baseCommit });
    assert.equal(downgradeResult.ok, false);
    assert.ok(downgradeResult.errors.some((error) => /降级/.test(error)));

    // package.json != manifest target
    const mismatch = bumpFiles({ repo, newVersion: "99.0.0" });
    mismatch.pkg.dependencies["pi-web-access"] = "99.0.1";
    const mismatchResult = validateCandidateArtifact({
      artifact: artifactWith({
        repo,
        files: [
          { path: "package-lock.json", content: serializeJson(mismatch.lock) },
          { path: mismatch.packagePath, content: serializeJson(mismatch.pkg) },
          { path: "maintenance/manifest.json", content: serializeJson(mismatch.nextManifest) },
          { path: "maintenance/tool-contracts.json", content: serializeJson(mismatch.snapshot) },
          { path: "maintenance/update-report.md", content: reportFor("ready") },
        ],
      }),
      repoRoot: repo,
      headSha: baseCommit,
    });
    assert.equal(mismatchResult.ok, false);
    assert.ok(mismatchResult.errors.some((error) => /目标版本/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("coupled i18n cannot move without the todo primary bump", () => {
  const repo = fixtureRepo();
  try {
    const bumped = bumpFiles({ repo, id: "rpiv-todo-lean", newVersion: "99.0.0" });
    bumped.pkg.dependencies["@juicesharp/rpiv-todo"] = "2.13.5";
    bumped.pkg.dependencies["@juicesharp/rpiv-i18n"] = "99.0.0";
    const result = validateCandidateArtifact({
      artifact: artifactWith({
        repo,
        files: [
          { path: "package-lock.json", content: serializeJson(bumped.lock) },
          { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
          { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
          { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
          { path: "maintenance/update-report.md", content: reportFor("ready") },
        ],
      }),
      repoRoot: repo,
      headSha: baseCommit,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /主依赖 @juicesharp\/rpiv-todo/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("manifest leanCommit/monorepo/extra-field edits are rejected", () => {
  const repo = fixtureRepo();
  try {
    const variants = [
      (manifest) => { manifest.packages[0].leanCommit = "f".repeat(40); },
      (manifest) => { manifest.monorepo = { evil: true }; },
      (manifest) => { manifest.packages[0].extra = true; },
      (manifest) => { manifest.packages[0].upstreamVersion = "0.39.0"; manifest.packages[0].upstreamGitHead = "e".repeat(40); }, // head without version
      (manifest) => { manifest.packages[0].upstreamVersion = "0.38.0"; manifest.packages[0].upstreamGitHead = "e".repeat(40); },
    ];
    for (const mutate of variants) {
      const bumped = bumpFiles({ repo });
      mutate(bumped.nextManifest);
      const result = validateCandidateArtifact({
        artifact: artifactWith({
          repo,
          files: [
            { path: "package-lock.json", content: serializeJson(bumped.lock) },
            { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
            { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
            { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
            { path: "maintenance/update-report.md", content: reportFor("ready") },
          ],
        }),
        repoRoot: repo,
        headSha: baseCommit,
      });
      assert.equal(result.ok, false, `manifest edit must be rejected: ${mutate.toString()}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("snapshot refresh is rejected while structural drift exists", () => {
  const repo = fixtureRepo();
  try {
    const bumped = bumpFiles({ repo });
    bumped.snapshot.upstream["pi-web-access"].tools[0].description = "drifted description";
    const result = validateCandidateArtifact({
      artifact: artifactWith({
        repo,
        files: [
          { path: "package-lock.json", content: serializeJson(bumped.lock) },
          { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
          { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
          { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
          { path: "maintenance/update-report.md", content: reportFor("ready") },
        ],
      }),
      repoRoot: repo,
      headSha: baseCommit,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /结构契约漂移/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("drift/failed/lean-review statuses have strictly scoped file sets", () => {
  const repo = fixtureRepo();
  try {
    // drift: lockfile + manifest + package.json + report, no snapshot
    const bumped = bumpFiles({ repo });
    const driftResult = validateCandidateArtifact({
      artifact: artifactWith({
        repo,
        status: "drift",
        files: [
          { path: "package-lock.json", content: serializeJson(bumped.lock) },
          { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
          { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
          { path: "maintenance/update-report.md", content: reportFor("drift") },
        ],
      }),
      repoRoot: repo,
      headSha: baseCommit,
    });
    assert.deepEqual(driftResult.errors, []);
    assert.equal(driftResult.ok, true);

    const driftWithSnapshot = JSON.parse(JSON.stringify(driftResult.writes));
    const driftArtifact = artifactWith({
      repo,
      status: "drift",
      files: [
        ...driftWithSnapshot,
        { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
      ],
    });
    const rejected = validateCandidateArtifact({ artifact: driftArtifact, repoRoot: repo, headSha: baseCommit });
    assert.equal(rejected.ok, false);
    assert.ok(rejected.errors.some((error) => /不允许包含/.test(error) || /必须包含/.test(error)));

    // failed without lockfile is valid
    const failedResult = validateCandidateArtifact({
      artifact: artifactWith({
        repo,
        status: "failed",
        files: [
          { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
          { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
          { path: "maintenance/update-report.md", content: reportFor("failed") },
        ],
      }),
      repoRoot: repo,
      headSha: baseCommit,
    });
    assert.deepEqual(failedResult.errors, []);
    assert.equal(failedResult.ok, true);

    // lean-review is report-only
    const leanResult = validateCandidateArtifact({
      artifact: artifactWith({ repo, status: "lean-review", files: [{ path: "maintenance/update-report.md", content: reportFor("lean-review") }] }),
      repoRoot: repo,
      headSha: baseCommit,
    });
    assert.deepEqual(leanResult.errors, []);
    assert.equal(leanResult.ok, true);

    const leanWithManifest = artifactWith({
      repo,
      status: "lean-review",
      files: [
        { path: "maintenance/update-report.md", content: reportFor("lean-review") },
        { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
      ],
    });
    assert.equal(validateCandidateArtifact({ artifact: leanWithManifest, repoRoot: repo, headSha: baseCommit }).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("report marker must match the artifact status", () => {
  const repo = fixtureRepo();
  try {
    const bumped = bumpFiles({ repo });
    for (const report of [reportFor("drift"), "not a report", ""]) {
      const result = validateCandidateArtifact({
        artifact: artifactWith({
          repo,
          files: [
            { path: "package-lock.json", content: serializeJson(bumped.lock) },
            { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
            { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
            { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
            { path: "maintenance/update-report.md", content: report },
          ],
        }),
        repoRoot: repo,
        headSha: baseCommit,
      });
      assert.equal(result.ok, false, `report must be rejected: ${JSON.stringify(report)}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("apply refuses to write through symlinked paths", () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    rmSync(join(repo, "maintenance/update-report.md"), { force: true });
    symlinkSync(join(repo, "package.json"), join(repo, "maintenance/update-report.md"));
    const result = validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
    assert.equal(result.ok, true);
    assert.throws(() => applyCandidateFiles({ repoRoot: repo, writes: result.writes }), /符号链接/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("snapshot-only refresh status stays structur-free", () => {
  const repo = fixtureRepo();
  try {
    const snapshot = JSON.parse(readFileSync(join(repo, "maintenance/tool-contracts.json"), "utf8"));
    snapshot.environment.nodeVersion = "v99.0.0";
    const okArtifact = artifactWith({
      repo,
      status: "snapshot-refresh",
      files: [
        { path: "maintenance/tool-contracts.json", content: serializeJson(snapshot) },
        { path: "maintenance/update-report.md", content: reportFor("snapshot-refresh") },
      ],
    });
    const result = validateCandidateArtifact({ artifact: okArtifact, repoRoot: repo, headSha: baseCommit });
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);

    const drifted = JSON.parse(JSON.stringify(snapshot));
    drifted.lean["@gfgghgftgffg/rpiv-todo-lean"].tools[0].description = "drifted";
    const driftArtifact = artifactWith({
      repo,
      status: "snapshot-refresh",
      files: [
        { path: "maintenance/tool-contracts.json", content: serializeJson(drifted) },
        { path: "maintenance/update-report.md", content: reportFor("snapshot-refresh") },
      ],
    });
    assert.equal(validateCandidateArtifact({ artifact: driftArtifact, repoRoot: repo, headSha: baseCommit }).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("lockfile entries cannot smuggle non-registry sources or missing integrity", () => {
  const repo = fixtureRepo();
  try {
    for (const mutate of [
      (lock) => { lock.packages["node_modules/pi-web-access"].resolved = "file:../evil"; },
      (lock) => { lock.packages["node_modules/pi-web-access"].resolved = "git+https://evil.test/x.git"; },
      (lock) => { delete lock.packages["node_modules/pi-web-access"].integrity; },
    ]) {
      const bumped = bumpFiles({ repo });
      mutate(bumped.lock);
      const result = validateCandidateArtifact({
        artifact: artifactWith({
          repo,
          files: [
            { path: "package-lock.json", content: serializeJson(bumped.lock) },
            { path: bumped.packagePath, content: serializeJson(bumped.pkg) },
            { path: "maintenance/manifest.json", content: serializeJson(bumped.nextManifest) },
            { path: "maintenance/tool-contracts.json", content: serializeJson(bumped.snapshot) },
            { path: "maintenance/update-report.md", content: reportFor("ready") },
          ],
        }),
        repoRoot: repo,
        headSha: baseCommit,
      });
      assert.equal(result.ok, false, `lockfile mutation must be rejected: ${mutate.toString()}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("buildCandidateArtifact output is deterministic and hashed", () => {
  const files = [
    { path: "maintenance/update-report.md", content: "b" },
    { path: "package-lock.json", content: "a" },
  ];
  const one = buildCandidateArtifact({ baseCommit, status: "ready", files });
  const two = buildCandidateArtifact({ baseCommit, status: "ready", files: [...files].reverse() });
  assert.deepEqual(one, two);
  assert.deepEqual(one.files.map((file) => file.path), ["maintenance/update-report.md", "package-lock.json"]);
  assert.equal(one.files[1].contentSha256, sha256("a"));
});
