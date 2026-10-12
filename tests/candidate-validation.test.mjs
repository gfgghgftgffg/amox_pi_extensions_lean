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
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_KIND,
  applyCandidateFiles,
  buildCandidateArtifact,
  validateCandidateArtifact as validateActualCandidate,
} from "../scripts/lib/candidate.mjs";
import { compareLockfile } from "../scripts/lib/lock-validation.mjs";
import { fixtureRegistryMetadata, fixtureDist } from "./helpers/registry-fixture.mjs";
import { serializeJson } from "../scripts/lib/upstream-plan.mjs";

const validateCandidateArtifact = (options) => validateActualCandidate({ ...options, resolveRegistryMetadata: fixtureRegistryMetadata });

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
  Object.assign(lock.packages[`node_modules/${entry.upstreamPackage}`], { version: newVersion, ...fixtureDist(entry.upstreamPackage, newVersion) });

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

test("a valid ready candidate validates and applies", async () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    const result = (await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit }));
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

test("baseCommit must match the checked-out HEAD exactly", async () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    artifact.baseCommit = "c".repeat(40);
    const result = (await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /baseCommit/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("unsafe paths are rejected (escaping, absolute, index.ts, root scripts)", async () => {
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
      const result = (await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit }));
      assert.equal(result.ok, false, `path must be rejected: ${path}`);
    }
    assert.throws(() => buildCandidateArtifact({ baseCommit, status: "ready", files: [{ path: "../x", content: "{}" }] }), /越界|拒绝/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("symlink/mode/deletion/rename style file entries are rejected", async () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    for (const extra of [{ mode: "120000" }, { symlink: true }, { delete: true }, { rename: "x" }, { kind: "symlink" }]) {
      const mutated = JSON.parse(JSON.stringify(artifact));
      mutated.files[0] = { ...mutated.files[0], ...extra };
      const result = (await validateCandidateArtifact({ artifact: mutated, repoRoot: repo, headSha: baseCommit }));
      assert.equal(result.ok, false, `extra entry keys must be rejected: ${JSON.stringify(extra)}`);
      assert.ok(result.errors.some((error) => /不允许的字段/.test(error)));
    }
    const topLevel = JSON.parse(JSON.stringify(artifact));
    topLevel.probe = true;
    assert.equal((await validateCandidateArtifact({ artifact: topLevel, repoRoot: repo, headSha: baseCommit })).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("content hash mismatches and duplicate paths are rejected", async () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    const badHash = JSON.parse(JSON.stringify(artifact));
    badHash.files[0].contentSha256 = "0".repeat(64);
    const result = (await validateCandidateArtifact({ artifact: badHash, repoRoot: repo, headSha: baseCommit }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /哈希不匹配/.test(error)));

    const duplicate = JSON.parse(JSON.stringify(artifact));
    duplicate.files.push({ ...duplicate.files[0] });
    assert.equal((await validateCandidateArtifact({ artifact: duplicate, repoRoot: repo, headSha: baseCommit })).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("workspace JSON edits outside exact dependency versions are rejected", async () => {
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
      const result = (await validateCandidateArtifact({ artifact: artifactWith({ repo, files }), repoRoot: repo, headSha: baseCommit }));
      assert.equal(result.ok, false, `workspace edit must be rejected: ${mutate.toString()}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dependency downgrades and version mismatches are rejected", async () => {
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
    const downgradeResult = (await validateCandidateArtifact({ artifact: artifactWith({ repo, files: downgradeFiles }), repoRoot: repo, headSha: baseCommit }));
    assert.equal(downgradeResult.ok, false);
    assert.ok(downgradeResult.errors.some((error) => /降级/.test(error)));

    // package.json != manifest target
    const mismatch = bumpFiles({ repo, newVersion: "99.0.0" });
    mismatch.pkg.dependencies["pi-web-access"] = "99.0.1";
    const mismatchResult = (await validateCandidateArtifact({
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
    }));
    assert.equal(mismatchResult.ok, false);
    assert.ok(mismatchResult.errors.some((error) => /目标版本/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("coupled i18n cannot move without the todo primary bump", async () => {
  const repo = fixtureRepo();
  try {
    const bumped = bumpFiles({ repo, id: "rpiv-todo-lean", newVersion: "99.0.0" });
    bumped.pkg.dependencies["@juicesharp/rpiv-todo"] = "2.13.5";
    bumped.pkg.dependencies["@juicesharp/rpiv-i18n"] = "99.0.0";
    const result = (await validateCandidateArtifact({
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
    }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /主依赖 @juicesharp\/rpiv-todo/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("manifest leanCommit/monorepo/extra-field edits are rejected", async () => {
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
      const result = (await validateCandidateArtifact({
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
      }));
      assert.equal(result.ok, false, `manifest edit must be rejected: ${mutate.toString()}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("snapshot refresh is rejected while structural drift exists", async () => {
  const repo = fixtureRepo();
  try {
    const bumped = bumpFiles({ repo });
    bumped.snapshot.upstream["pi-web-access"].tools[0].description = "drifted description";
    const result = (await validateCandidateArtifact({
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
    }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /结构契约漂移/.test(error)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("drift/failed/lean-review statuses have strictly scoped file sets", async () => {
  const repo = fixtureRepo();
  try {
    // drift: lockfile + manifest + package.json + report, no snapshot
    const bumped = bumpFiles({ repo });
    const driftResult = (await validateCandidateArtifact({
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
    }));
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
    const rejected = (await validateCandidateArtifact({ artifact: driftArtifact, repoRoot: repo, headSha: baseCommit }));
    assert.equal(rejected.ok, false);
    assert.ok(rejected.errors.some((error) => /不允许包含/.test(error) || /必须包含/.test(error)));

    // failed without lockfile is valid
    const failedResult = (await validateCandidateArtifact({
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
    }));
    assert.deepEqual(failedResult.errors, []);
    assert.equal(failedResult.ok, true);

    // lean-review is report-only
    const leanResult = (await validateCandidateArtifact({
      artifact: artifactWith({ repo, status: "lean-review", files: [{ path: "maintenance/update-report.md", content: reportFor("lean-review") }] }),
      repoRoot: repo,
      headSha: baseCommit,
    }));
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
    assert.equal((await validateCandidateArtifact({ artifact: leanWithManifest, repoRoot: repo, headSha: baseCommit })).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("report marker must match the artifact status", async () => {
  const repo = fixtureRepo();
  try {
    const bumped = bumpFiles({ repo });
    for (const report of [reportFor("drift"), "not a report", ""]) {
      const result = (await validateCandidateArtifact({
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
      }));
      assert.equal(result.ok, false, `report must be rejected: ${JSON.stringify(report)}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("apply refuses to write through symlinked paths", async () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    rmSync(join(repo, "maintenance/update-report.md"), { force: true });
    symlinkSync(join(repo, "package.json"), join(repo, "maintenance/update-report.md"));
    const result = (await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit }));
    assert.equal(result.ok, true);
    assert.throws(() => applyCandidateFiles({ repoRoot: repo, writes: result.writes }), /符号链接/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("snapshot-only refresh status stays structur-free", async () => {
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
    const result = (await validateCandidateArtifact({ artifact: okArtifact, repoRoot: repo, headSha: baseCommit }));
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
    assert.equal((await validateCandidateArtifact({ artifact: driftArtifact, repoRoot: repo, headSha: baseCommit })).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("lockfile entries cannot smuggle non-registry sources or missing integrity", async () => {
  const repo = fixtureRepo();
  try {
    for (const mutate of [
      (lock) => { lock.packages["node_modules/pi-web-access"].resolved = "file:../evil"; },
      (lock) => { lock.packages["node_modules/pi-web-access"].resolved = "git+https://evil.test/x.git"; },
      (lock) => { delete lock.packages["node_modules/pi-web-access"].integrity; },
    ]) {
      const bumped = bumpFiles({ repo });
      mutate(bumped.lock);
      const result = (await validateCandidateArtifact({
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
      }));
      assert.equal(result.ok, false, `lockfile mutation must be rejected: ${mutate.toString()}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("buildCandidateArtifact output is deterministic and hashed", async () => {
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

function mutateArtifactJson(artifact, path, mutate) {
  const file = artifact.files.find((f) => f.path === path);
  const json = JSON.parse(file.content);
  mutate(json);
  file.content = serializeJson(json);
  file.contentSha256 = sha256(file.content);
}

test("independent lock smuggling probes fail even with a coherent trusted target fixture", async () => {
  const repo = fixtureRepo();
  try {
    const mutations = [
      (lock) => { lock.packages["node_modules/jiti"].resolved = "https://attacker.invalid/jiti.tgz"; lock.packages["node_modules/jiti"].integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`; },
      (lock) => { lock.packages["packages/rpiv-todo-lean"].peerDependencies.typebox = "99.0.0"; },
      (lock) => { delete lock.packages["node_modules/typescript"]; },
      (lock) => { lock.payload = { exec: "injected" }; },
      (lock) => { lock.packages["node_modules/pi-web-access"].resolved = "https://attacker.invalid/evil.tgz"; lock.packages["node_modules/pi-web-access"].integrity = "sha512-NOT_BASE64"; },
      (lock) => { lock.packages["node_modules/pi-web-access"].integrity = lock.packages["node_modules/pi-web-access"].integrity.replace(/=+$/, ""); },
      (lock) => { lock.packages["node_modules/pi-web-access"].dev = true; },
      (lock) => { lock.packages["node_modules/pi-web-access"].payload = true; },
      (lock) => { lock.packages["node_modules/pi-web-access"].resolved = lock.packages["node_modules/pi-web-access"].resolved.replace("99.0.0", "0.39.0"); },
      (lock) => { lock.packages["node_modules/pi-web-access"].peerDependencies.typebox = "99.0.0"; },
      (lock) => { delete lock.version; },
      (lock) => { lock.packages[""].license = "Unrelated"; },
      (lock) => { lock.packages["node_modules/unused"] = { version: "1.0.0", ...fixtureDist("unused", "1.0.0") }; },
    ];
    for (const mutation of mutations) {
      const { artifact } = validReadyArtifact({ repo });
      mutateArtifactJson(artifact, "package-lock.json", mutation);
      const result = await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
      assert.equal(result.ok, false, mutation.toString());
      assert.ok(result.errors.some((e) => e.startsWith("package-lock.json:")), result.errors.join("\n"));
      assert.deepEqual(result.writes, []);
    }
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

/** Minimal fixture for the peer/shared graph: an updated target wrapper
 * resolves primary -> shared, while an unrelated wrapper consumes its
 * baseline graph through a peerDependency. baselineClosure does not traverse
 * peers, so the freeze must follow peer edges explicitly. `nested` adds a
 * peer -> runtime-closure -> peer chain (unrelated -peer-> peer-a -runtime->
 * peer-a-dep -peer-> shared) plus a peer cycle between the protected
 * peer-a-dep and peer-b records to exercise the fixed-point traversal.
 */
function peerGraphPackages({ withUnrelatedPeer = true, nested = false } = {}) {
  const rec = (name, version, extra = {}) => ({ version, ...fixtureDist(name, version), ...extra });
  const packages = {
    "": { name: "fixture", version: "1.0.0" },
    "packages/target": { name: "target-wrapper", version: "1.0.0", dependencies: { primary: "1.0.0" } },
    "node_modules/primary": rec("primary", "1.0.0", { dependencies: { shared: "^1.0.0" } }),
    "node_modules/shared": rec("shared", "1.0.0"),
  };
  if (nested) {
    packages["node_modules/peer-a"] = rec("peer-a", "1.0.0", { dependencies: { "peer-a-dep": "1.0.0" } });
    packages["node_modules/peer-a-dep"] = rec("peer-a-dep", "1.0.0", { peerDependencies: { shared: "^1.0.0", "peer-b": "^1.0.0" } });
    packages["node_modules/peer-b"] = rec("peer-b", "1.0.0", { peerDependencies: { "peer-a-dep": "^1.0.0" } });
  }
  if (withUnrelatedPeer) {
    packages["packages/unrelated"] = { name: "unrelated-wrapper", version: "1.0.0", dependencies: { unrelated: "1.0.0" } };
    packages["node_modules/unrelated"] = rec("unrelated", "1.0.0", { peerDependencies: nested ? { "peer-a": "^1.0.0" } : { shared: "^1.0.0" } });
  }
  return packages;
}

function peerGraphLocks(options) {
  const baselineLock = { name: "fixture", version: "1.0.0", lockfileVersion: 3, packages: peerGraphPackages(options) };
  const candidateLock = structuredClone(baselineLock);
  candidateLock.packages["packages/target"].dependencies.primary = "2.0.0";
  candidateLock.packages["node_modules/primary"] = { version: "2.0.0", ...fixtureDist("primary", "2.0.0"), dependencies: { shared: "^1.0.0" } };
  candidateLock.packages["node_modules/shared"] = { version: "1.1.0", ...fixtureDist("shared", "1.1.0") };
  return { baselineLock, candidateLock };
}

/** Registry metadata derived from the trusted fixture formula, never from the candidate. */
function peerGraphMetadata(name, version, withGitHead = false) {
  return {
    name,
    version,
    dist: { tarball: fixtureDist(name, version).resolved, integrity: fixtureDist(name, version).integrity },
    ...(name === "primary" ? { dependencies: { shared: "^1.0.0" }, ...(withGitHead ? { gitHead: "b".repeat(40) } : {}) } : {}),
  };
}

async function comparePeerGraph(options) {
  const { baselineLock, candidateLock } = peerGraphLocks(options);
  const errors = [];
  await compareLockfile({
    baselineLock,
    candidateLock,
    candidateWorkspaces: new Map([["target", { dependencies: { primary: "2.0.0" } }]]),
    manifestEntries: new Map([["target", { path: "packages/target", upstreamPackage: "primary" }]]),
    targetVersions: new Map([["target", "2.0.0"]]),
    errors,
    resolveRegistryMetadata: async (name, version) => peerGraphMetadata(name, version),
  });
  return errors;
}

test("unrelated transitive peer consumers freeze shared target records (independent probe graph)", async () => {
  assert.deepEqual(await comparePeerGraph({ withUnrelatedPeer: false }), [], "same changed target closure without a peer consumer stays accepted");
  const rejected = await comparePeerGraph({ withUnrelatedPeer: true });
  assert.ok(rejected.some((error) => /node_modules\/shared: 无关\/共享 lock record/.test(error)), rejected.join("\n"));
});

test("peer freeze reaches peers of newly protected runtime closures and terminates peer cycles", async () => {
  // shared is reachable from the unrelated graph only through
  // unrelated -peer-> peer-a -runtime-> peer-a-dep -peer-> shared, and
  // peer-a-dep <-> peer-b is a peer cycle among newly protected records.
  assert.deepEqual(await comparePeerGraph({ withUnrelatedPeer: false, nested: true }), [], "nested graph without the unrelated consumer stays accepted");
  const rejected = await comparePeerGraph({ withUnrelatedPeer: true, nested: true });
  assert.ok(rejected.some((error) => /node_modules\/shared: 无关\/共享 lock record/.test(error)), rejected.join("\n"));
});

test("full validator rejects unrelated-peer shared churn but accepts the same closure without the peer consumer", async () => {
  const repo = fixtureRepo();
  try {
    const manifest = { schemaVersion: 1, monorepo: {}, packages: [{ id: "target", path: "packages/target", upstreamPackage: "primary", upstreamVersion: "1.0.0", upstreamGitHead: "a".repeat(40) }] };
    const nextManifest = structuredClone(manifest);
    nextManifest.packages[0].upstreamVersion = "2.0.0";
    nextManifest.packages[0].upstreamGitHead = "b".repeat(40);
    const workspace = { name: "target-wrapper", version: "1.0.0", dependencies: { primary: "2.0.0" } };
    for (const withUnrelatedPeer of [false, true]) {
      const { baselineLock, candidateLock } = peerGraphLocks({ withUnrelatedPeer });
      writeFileSync(join(repo, "maintenance/manifest.json"), serializeJson(manifest));
      writeFileSync(join(repo, "package-lock.json"), serializeJson(baselineLock));
      mkdirSync(join(repo, "packages/target"), { recursive: true });
      writeFileSync(join(repo, "packages/target/package.json"), serializeJson({ ...workspace, dependencies: { primary: "1.0.0" } }));
      const artifact = buildCandidateArtifact({
        baseCommit,
        status: "drift",
        files: [
          { path: "package-lock.json", content: serializeJson(candidateLock) },
          { path: "packages/target/package.json", content: serializeJson(workspace) },
          { path: "maintenance/manifest.json", content: serializeJson(nextManifest) },
          { path: "maintenance/update-report.md", content: reportFor("drift") },
        ],
      });
      const result = await validateActualCandidate({
        artifact,
        repoRoot: repo,
        headSha: baseCommit,
        resolveRegistryMetadata: async (name, version) => peerGraphMetadata(name, version, true),
      });
      if (withUnrelatedPeer) {
        assert.equal(result.ok, false, "unrelated peer consumer must reject shared churn at the artifact layer");
        assert.ok(result.errors.some((error) => /node_modules\/shared: 无关\/共享 lock record/.test(error)), result.errors.join("\n"));
        assert.deepEqual(result.writes, []);
      } else {
        assert.deepEqual(result.errors, []);
        assert.equal(result.ok, true);
        assert.deepEqual(result.writes.map((write) => write.path).sort(), [
          "maintenance/manifest.json",
          "maintenance/update-report.md",
          "package-lock.json",
          "packages/target/package.json",
        ]);
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

/** Same-workspace synchronized cohort fixture (todo/i18n style): ONE updated
 * workspace directly pins a primary and its cohort peer, and the primary's
 * unchanged peerDependencies reach that peer. The narrow validator exception
 * lets exactly this paired DIRECT-root edge move together at one approved
 * target version. `unrelatedPeer` adds an unrelated consumer of the cohort
 * peer (direct, or a nested peer -> runtime -> peer chain) which must still
 * freeze it with its runtime closure; `transitiveConsumer` makes a changed
 * non-root closure record consume the changed peer, which stays fail-closed. */
function cohortPackages({ peerRange = "*", transitiveConsumer = false, unrelatedPeer = "none", otherPeerWorkspace = false } = {}) {
  const rec = (name, version, extra = {}) => ({ version, ...fixtureDist(name, version), ...extra });
  const packages = {
    "": { name: "fixture", version: "1.0.0" },
    "packages/cohort": { name: "cohort-wrapper", version: "1.0.0", dependencies: { primary: "1.0.0", "cohort-peer": "1.0.0" } },
    "node_modules/primary": rec("primary", "1.0.0", transitiveConsumer
      ? { dependencies: { mid: "^1.0.0" }, peerDependencies: { "cohort-peer": peerRange } }
      : { peerDependencies: { "cohort-peer": peerRange } }),
    "node_modules/cohort-peer": rec("cohort-peer", "1.0.0"),
  };
  if (transitiveConsumer) packages["node_modules/mid"] = rec("mid", "1.0.0", { peerDependencies: { "cohort-peer": "*" } });
  if (otherPeerWorkspace) packages["packages/other"] = { name: "other-wrapper", version: "1.0.0", dependencies: { "cohort-peer": "1.0.0" } };
  if (unrelatedPeer !== "none") {
    packages["packages/unrelated"] = { name: "unrelated-wrapper", version: "1.0.0", dependencies: { unrelated: "1.0.0" } };
    if (unrelatedPeer === "direct") {
      packages["node_modules/unrelated"] = rec("unrelated", "1.0.0", { peerDependencies: { "cohort-peer": "^1.0.0" } });
    } else {
      packages["node_modules/unrelated"] = rec("unrelated", "1.0.0", { peerDependencies: { "peer-a": "^1.0.0" } });
      packages["node_modules/peer-a"] = rec("peer-a", "1.0.0", { dependencies: { "peer-a-dep": "1.0.0" } });
      packages["node_modules/peer-a-dep"] = rec("peer-a-dep", "1.0.0", { peerDependencies: { "cohort-peer": "^1.0.0" } });
    }
  }
  return packages;
}

function cohortLocks({
  peerRange = "*", candidatePeerRange = peerRange, transitiveConsumer = false, unrelatedPeer = "none", otherPeerWorkspace = false,
  primaryTo = "2.0.0", peerTo = "2.0.0", workspacePeerTo = peerTo, otherPeerPin = peerTo, midTo = "2.0.0", nestedPeerCopy = false,
} = {}) {
  const baselineLock = { name: "fixture", version: "1.0.0", lockfileVersion: 3, packages: cohortPackages({ peerRange, transitiveConsumer, unrelatedPeer, otherPeerWorkspace }) };
  const candidateLock = structuredClone(baselineLock);
  candidateLock.packages["packages/cohort"].dependencies.primary = primaryTo;
  candidateLock.packages["node_modules/primary"] = {
    version: primaryTo, ...fixtureDist("primary", primaryTo),
    ...(transitiveConsumer ? { dependencies: { mid: `^${midTo}` } } : {}),
    peerDependencies: { "cohort-peer": candidatePeerRange },
  };
  if (transitiveConsumer) candidateLock.packages["node_modules/mid"] = { version: midTo, ...fixtureDist("mid", midTo), peerDependencies: { "cohort-peer": "*" } };
  candidateLock.packages["packages/cohort"].dependencies["cohort-peer"] = workspacePeerTo;
  candidateLock.packages["node_modules/cohort-peer"] = { version: peerTo, ...fixtureDist("cohort-peer", peerTo) };
  if (otherPeerWorkspace) candidateLock.packages["packages/other"].dependencies["cohort-peer"] = otherPeerPin;
  if (nestedPeerCopy) candidateLock.packages["node_modules/primary/node_modules/cohort-peer"] = { version: peerTo, ...fixtureDist("cohort-peer", peerTo) };
  return { baselineLock, candidateLock };
}

/** Registry metadata derived from the trusted fixture formula, never from the candidate. */
function cohortMetadata(name, version, { peerRange = "*", transitiveConsumer = false, gitHead = false } = {}) {
  const dist = fixtureDist(name, version);
  return {
    name, version,
    dist: { tarball: dist.resolved, integrity: dist.integrity },
    ...(name === "primary" ? {
      peerDependencies: { "cohort-peer": peerRange },
      ...(transitiveConsumer ? { dependencies: { mid: "^2.0.0" } } : {}),
      ...(gitHead ? { gitHead: "b".repeat(40) } : {}),
    } : {}),
    ...(name === "mid" ? { peerDependencies: { "cohort-peer": "*" } } : {}),
  };
}

async function compareCohortGraph(options) {
  const { baselineLock, candidateLock } = cohortLocks(options);
  const errors = [];
  const other = options.otherPeerWorkspace ? candidateLock.packages["packages/other"].dependencies : null;
  await compareLockfile({
    baselineLock,
    candidateLock,
    candidateWorkspaces: new Map([
      ["cohort", { dependencies: candidateLock.packages["packages/cohort"].dependencies }],
      ...(other ? [["other", { dependencies: other }]] : []),
    ]),
    manifestEntries: new Map([
      ["cohort", { path: "packages/cohort", upstreamPackage: "primary" }],
      ...(other ? [["other", { path: "packages/other", upstreamPackage: "cohort-peer" }]] : []),
    ]),
    targetVersions: new Map([["cohort", "2.0.0"], ...(other ? [["other", "2.0.0"]] : [])]),
    errors,
    // Metadata is only fetched for changed records' NEW versions, so the
    // fixture catalog mirrors the candidate-side declaration coherently; a
    // forged declaration must still be caught against the baseline record.
    resolveRegistryMetadata: async (name, version) => cohortMetadata(name, version, {
      peerRange: options.candidatePeerRange ?? options.peerRange ?? "*",
      transitiveConsumer: options.transitiveConsumer,
    }),
  });
  return errors;
}

test("same-workspace synchronized cohort peer pair is accepted; every deviation from the paired cohort fails closed", async () => {
  assert.deepEqual(await compareCohortGraph({}), [], "synchronized todo/i18n-style paired direct roots move together");
  const rejections = [
    ["undeclared peer bump", { workspacePeerTo: "1.0.0" }, /node_modules\/primary: peer cohort-peer@\* 不可达\/变化/],
    ["peer changed only in another workspace", { otherPeerWorkspace: true, workspacePeerTo: "1.0.0" }, /node_modules\/primary: peer cohort-peer@\* 不可达\/变化/],
    ["mismatched cohort versions", { peerTo: "2.1.0", workspacePeerTo: "2.1.0" }, /node_modules\/primary: peer cohort-peer@\* 不可达\/变化/],
    ["target outside the unchanged peer range", { peerRange: "^1.0.0" }, /node_modules\/primary: peer cohort-peer@\^1\.0\.0 不可达\/变化/],
    ["changed peer declaration", { candidatePeerRange: "^2.0.0" }, /primary: peer 变化需要人工处理/],
    ["changed peer resolution", { nestedPeerCopy: true }, /node_modules\/primary: peer cohort-peer@\* 不可达\/变化/],
    ["transitive peer consumer of the paired target", { transitiveConsumer: true }, /node_modules\/mid: peer cohort-peer@\* 不可达\/变化/],
    ["unrelated direct peer consumer of the paired target", { unrelatedPeer: "direct" }, /node_modules\/cohort-peer: 无关\/共享 lock record/],
    ["unrelated transitive peer consumer of the paired target", { unrelatedPeer: "transitive" }, /node_modules\/cohort-peer: 无关\/共享 lock record/],
  ];
  for (const [label, options, pattern] of rejections) {
    const errors = await compareCohortGraph(options);
    assert.ok(errors.some((error) => pattern.test(error)), `${label}: ${errors.join("\n")}`);
  }
});

test("full validator accepts the synchronized cohort and still freezes it for unrelated peer consumers", async () => {
  const repo = fixtureRepo();
  try {
    const manifest = { schemaVersion: 1, monorepo: {}, packages: [{ id: "cohort", path: "packages/cohort", upstreamPackage: "primary", upstreamVersion: "1.0.0", upstreamGitHead: "a".repeat(40) }] };
    const nextManifest = structuredClone(manifest);
    nextManifest.packages[0].upstreamVersion = "2.0.0";
    nextManifest.packages[0].upstreamGitHead = "b".repeat(40);
    mkdirSync(join(repo, "packages/cohort"), { recursive: true });
    for (const withUnrelatedPeer of [false, true]) {
      const { baselineLock, candidateLock } = cohortLocks({ unrelatedPeer: withUnrelatedPeer ? "direct" : "none" });
      writeFileSync(join(repo, "maintenance/manifest.json"), serializeJson(manifest));
      writeFileSync(join(repo, "package-lock.json"), serializeJson(baselineLock));
      writeFileSync(join(repo, "packages/cohort/package.json"), serializeJson({ name: "cohort-wrapper", version: "1.0.0", dependencies: baselineLock.packages["packages/cohort"].dependencies }));
      const artifact = buildCandidateArtifact({
        baseCommit,
        status: "drift",
        files: [
          { path: "package-lock.json", content: serializeJson(candidateLock) },
          { path: "packages/cohort/package.json", content: serializeJson({ name: "cohort-wrapper", version: "1.0.0", dependencies: candidateLock.packages["packages/cohort"].dependencies }) },
          { path: "maintenance/manifest.json", content: serializeJson(nextManifest) },
          { path: "maintenance/update-report.md", content: reportFor("drift") },
        ],
      });
      const result = await validateActualCandidate({
        artifact,
        repoRoot: repo,
        headSha: baseCommit,
        resolveRegistryMetadata: async (name, version) => cohortMetadata(name, version, { gitHead: true }),
      });
      if (withUnrelatedPeer) {
        assert.equal(result.ok, false, "unrelated peer consumer must freeze the synchronized cohort peer at the artifact layer");
        assert.ok(result.errors.some((error) => /node_modules\/cohort-peer: 无关\/共享 lock record/.test(error)), result.errors.join("\n"));
        assert.deepEqual(result.writes, []);
      } else {
        assert.deepEqual(result.errors, []);
        assert.equal(result.ok, true);
        assert.deepEqual(result.writes.map((write) => write.path).sort(), [
          "maintenance/manifest.json",
          "maintenance/update-report.md",
          "package-lock.json",
          "packages/cohort/package.json",
        ]);
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("justified dependency closure additions work; invented dependencies and extra records fail", async () => {
  const repo = fixtureRepo();
  try {
    // Pin this fixture's historical baseline explicitly so the regression also
    // runs INSIDE the real 0.21 proposal tree, not just at the source's 0.20.
    for (const [path, update] of [
      ["maintenance/manifest.json", (m) => { m.packages.find((p) => p.id === "pi-subagents-lean").upstreamVersion = "0.20.0"; }],
      ["maintenance/tool-contracts.json", (s) => { s.upstream["@tintinweb/pi-subagents"].version = "0.20.0"; }],
      ["packages/pi-subagents-lean/package.json", (p) => { p.dependencies["@tintinweb/pi-subagents"] = "0.20.0"; }],
      ["package-lock.json", (l) => { l.packages["packages/pi-subagents-lean"].dependencies["@tintinweb/pi-subagents"] = "0.20.0"; Object.assign(l.packages["node_modules/@tintinweb/pi-subagents"], { version: "0.20.0", ...fixtureDist("@tintinweb/pi-subagents", "0.20.0") }); }],
    ]) {
      const data = JSON.parse(readFileSync(join(repo, path), "utf8"));
      update(data);
      writeFileSync(join(repo, path), serializeJson(data));
    }
    const name = "phase2-fixture-dependency";
    const { artifact } = validReadyArtifact({ repo, id: "pi-subagents-lean", version: "0.21.0" });
    const primaryMetadata = await fixtureRegistryMetadata("@tintinweb/pi-subagents", "0.21.0");
    primaryMetadata.dependencies[name] = "^1.0.0";
    const dist = fixtureDist(name, "1.2.0");
    const childMetadata = { name, version: "1.2.0", dist: { tarball: dist.resolved, integrity: dist.integrity } };
    const resolver = async (pkg, version) => pkg === name ? structuredClone(childMetadata) : pkg === primaryMetadata.name ? structuredClone(primaryMetadata) : fixtureRegistryMetadata(pkg, version);
    mutateArtifactJson(artifact, "package-lock.json", (lock) => {
      lock.packages["node_modules/@tintinweb/pi-subagents"].dependencies[name] = "^1.0.0";
      lock.packages[`node_modules/${name}`] = { version: "1.2.0", ...dist };
    });
    const validate = (candidate) => validateActualCandidate({ artifact: candidate, repoRoot: repo, headSha: baseCommit, resolveRegistryMetadata: resolver });
    assert.deepEqual((await validate(artifact)).errors, [], "legitimate direct 0.20 -> 0.21 plus dependency closure addition");
    for (const mutate of [
      (lock) => { lock.packages[`node_modules/${name}`].dependencies = { jiti: "*" }; },
      (lock) => { lock.packages[`node_modules/${name}`].version = "2.0.0"; },
      (lock) => { delete lock.packages[`node_modules/${name}`]; },
      (lock) => { lock.packages[`node_modules/${name}`].resolved = "https://evil.invalid/package.tgz"; },
      (lock) => { lock.packages[`node_modules/${name}`].optional = true; },
      (lock) => { lock.packages["node_modules/nanoid"].dev = true; },
      (lock) => { lock.packages["node_modules/@tintinweb/pi-subagents"].dependencies[name] = "npm:other@1.2.0"; },
    ]) {
      const bad = structuredClone(artifact);
      mutateArtifactJson(bad, "package-lock.json", mutate);
      assert.equal((await validate(bad)).ok, false, mutate.toString());
    }
    // Shared node is encountered through an optional route first, then a
    // mandatory route. Its required child must NOT inherit optional flags.
    const chain = structuredClone(artifact);
    const catalog = new Map();
    for (const suffix of ["b", "e", "c", "d"]) {
      const pkg = `phase2-chain-${suffix}`;
      const source = fixtureDist(pkg, "1.0.0");
      catalog.set(pkg, { name: pkg, version: "1.0.0", dist: { tarball: source.resolved, integrity: source.integrity } });
    }
    catalog.get("phase2-chain-b").optionalDependencies = { "phase2-chain-c": "1.0.0" };
    catalog.get("phase2-chain-e").dependencies = { "phase2-chain-c": "1.0.0" };
    catalog.get("phase2-chain-c").dependencies = { "phase2-chain-d": "1.0.0" };
    childMetadata.dependencies = { "phase2-chain-b": "1.0.0", "phase2-chain-e": "1.0.0" };
    mutateArtifactJson(chain, "package-lock.json", (lock) => {
      lock.packages[`node_modules/${name}`].dependencies = childMetadata.dependencies;
      for (const [pkg, metadata] of catalog) {
        lock.packages[`node_modules/${pkg}`] = { version: "1.0.0", ...fixtureDist(pkg, "1.0.0") };
        for (const field of ["dependencies", "optionalDependencies"]) if (metadata[field]) lock.packages[`node_modules/${pkg}`][field] = metadata[field];
      }
      lock.packages["node_modules/phase2-chain-d"].optional = true;
    });
    const chainResult = await validateActualCandidate({ artifact: chain, repoRoot: repo, headSha: baseCommit, resolveRegistryMetadata: async (pkg, version) => catalog.has(pkg) ? structuredClone(catalog.get(pkg)) : resolver(pkg, version) });
    assert.equal(chainResult.ok, false, "required reachability must propagate after an earlier optional visit");
    assert.match(chainResult.errors.join("\n"), /optional|runtime|reachability/);

    // New mandatory use of an existing dev-only record requires flag churn;
    // preserving that wrong flag must not evade the human-handling gate.
    const devUse = structuredClone(artifact);
    assert.equal(JSON.parse(readFileSync(join(repo, "package-lock.json"), "utf8")).packages["node_modules/typescript"].dev, true, "fixture record is genuinely dev-only");
    const devPrimary = structuredClone(primaryMetadata);
    devPrimary.dependencies.typescript = "*";
    mutateArtifactJson(devUse, "package-lock.json", (lock) => { lock.packages["node_modules/@tintinweb/pi-subagents"].dependencies.typescript = "*"; });
    const devResult = await validateActualCandidate({ artifact: devUse, repoRoot: repo, headSha: baseCommit, resolveRegistryMetadata: async (pkg, version) => pkg === devPrimary.name ? devPrimary : pkg === name ? { name, version: "1.2.0", dist: { tarball: dist.resolved, integrity: dist.integrity } } : fixtureRegistryMetadata(pkg, version) });
    assert.equal(devResult.ok, false, "required runtime dependency cannot keep a dev-only flag");
    assert.match(devResult.errors.join("\n"), /dev|runtime|reachability/);

    const errors = await validateActualCandidate({ artifact, repoRoot: repo, headSha: baseCommit, resolveRegistryMetadata: async () => { throw new Error("HTTP 500"); } });
    assert.equal(errors.ok, false);
    assert.match(errors.errors.join("\n"), /HTTP 500/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("ready AND snapshot-refresh reject unknown fields, unrelated metadata and forged counters", async () => {
  const repo = fixtureRepo();
  try {
    for (const status of ["ready", "snapshot-refresh"]) {
      for (const mutation of [
        (s) => { s.lean["@gfgghgftgffg/rpiv-todo-lean"].payload = { anything: "extra data" }; },
        (s) => { s.upstream["@tintinweb/pi-subagents"].version = "999.0.0"; s.upstream["@tintinweb/pi-subagents"].entry = "/arbitrary/path.ts"; },
        (s) => { s.upstream["pi-web-access"].entry = "node_modules/evil/index.ts"; },
        (s) => { s.lean["@gfgghgftgffg/pi-web-access-lean"].version = "99.0.0"; },
        (s) => { s.environment.payload = true; },
        (s) => { s.payload = true; },
        (s) => { s.estimator = "forged estimator"; },
        (s) => { s.upstream["pi-web-access"].tools[0].extra = "code"; },
        (s) => { s.upstream["pi-web-access"].tools[0].chars.total++; },
        (s) => { s.upstream["pi-web-access"].tools[0].proxyTokens++; },
        (s) => { s.upstream["pi-web-access"].totals.registeredProxyTokens++; },
        (s) => { delete s.lean["@gfgghgftgffg/rpiv-todo-lean"].entry; },
      ]) {
        const artifact = status === "ready" ? validReadyArtifact({ repo }).artifact : artifactWith({ repo, status, files: [
          { path: "maintenance/tool-contracts.json", content: readFileSync(join(repo, "maintenance/tool-contracts.json"), "utf8") },
          { path: "maintenance/update-report.md", content: reportFor(status) },
        ] });
        mutateArtifactJson(artifact, "maintenance/tool-contracts.json", mutation);
        const result = await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
        assert.equal(result.ok, false, `${status}: ${mutation}`);
        assert.ok(result.errors.some((e) => e.startsWith("maintenance/tool-contracts.json:")), result.errors.join("\n"));
        assert.deepEqual(result.writes, []);
      }
    }
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("privileged manifest validation checks published npm gitHead, not plausible repo HEAD", async () => {
  const repo = fixtureRepo();
  try {
    const { artifact } = validReadyArtifact({ repo });
    mutateArtifactJson(artifact, "maintenance/manifest.json", (m) => { m.packages[0].upstreamGitHead = "a".repeat(40); });
    const result = await validateCandidateArtifact({ artifact, repoRoot: repo, headSha: baseCommit });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /trusted npm release gitHead/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
