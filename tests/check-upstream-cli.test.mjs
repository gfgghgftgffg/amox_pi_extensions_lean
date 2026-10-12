// Offline CLI tests for scripts/check-upstream.mjs and the workflow status
// helper. No network access: metadata is injected. These tests pin down
// "no update => no tracked mutation", lean-only report-only candidates,
// fail-visible handling for malformed metadata, and strict enum outputs.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanGitFixture } from "./helpers/clean-git-fixture.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance", "manifest.json"), "utf8"));

const TRACKED_FILES = [
  "package.json",
  "package-lock.json",
  "maintenance/manifest.json",
  "maintenance/tool-contracts.json",
  "packages/pi-web-access-lean/package.json",
  "packages/rpiv-todo-lean/package.json",
  "packages/pi-subagents-lean/package.json",
];

function hashFiles() {
  return Object.fromEntries(
    TRACKED_FILES.map((path) => [path, createHash("sha256").update(readFileSync(join(repoRoot, path), "utf8")).digest("hex")]),
  );
}

function fixtureMetadata({ leanHeads = {}, versions = {} } = {}) {
  const npm = {};
  for (const entry of manifest.packages) {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, entry.path, "package.json"), "utf8"));
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      npm[name] = { latestStable: versions[name] ?? version, gitHead: entry.upstreamGitHead };
    }
  }
  const git = {};
  for (const entry of manifest.packages) {
    git[entry.leanRepository] = { head: leanHeads[entry.id] ?? entry.leanCommit };
    git[entry.upstreamRepository] = { head: entry.upstreamGitHead };
  }
  return { npm, git };
}

function writeMetadata(dir, name, metadata) {
  const path = join(dir, name);
  writeFileSync(path, typeof metadata === "string" ? metadata : JSON.stringify(metadata, null, 2));
  return path;
}

function runCli(args, env = {}, repo = repoRoot) {
  return spawnSync(process.execPath, ["scripts/check-upstream.mjs", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runStatus(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/workflow/candidate-status.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("no update: dry-run report is JSON, apply stages nothing and mutates no tracked file", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-cli-no-update-"));
  const before = hashFiles();
  try {
    const metadataPath = writeMetadata(dir, "metadata.json", fixtureMetadata());
    const dry = runCli(["--dry-run", "--json", "--metadata", metadataPath]);
    assert.equal(dry.status, 0, dry.stderr);
    const plan = JSON.parse(dry.stdout);
    assert.equal(plan.status, "no-update");

    const outDir = join(dir, "out");
    const applied = runCli(["--apply", "--metadata", metadataPath, "--out-dir", outDir]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /no tracked mutations/);
    assert.equal(existsSync(outDir), false, "no candidate output for no-update");
    assert.deepEqual(hashFiles(), before, "tracked files must not change");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lean-only update stages a report-only draft candidate and leaves leanCommit untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-cli-lean-"));
  const before = hashFiles();
  const fixture = cleanGitFixture(repoRoot);
  try {
    const metadataPath = writeMetadata(dir, "metadata.json", fixtureMetadata({ leanHeads: { "rpiv-todo-lean": "9".repeat(40) } }));
    const outDir = join(dir, "out");
    const applied = runCli(["--apply", "--metadata", metadataPath, "--out-dir", outDir], {}, fixture.repo);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /status=lean-review/);
    assert.match(applied.stdout, /manual reuse review/);
    const artifact = JSON.parse(readFileSync(join(outDir, "candidate.json"), "utf8"));
    assert.equal(artifact.status, "lean-review");
    assert.deepEqual(artifact.files.map((file) => file.path), ["maintenance/update-report.md"]);
    assert.match(readFileSync(join(outDir, "update-report.md"), "utf8"), /manual reuse review/);
    assert.deepEqual(hashFiles(), before, "lean-only candidate must not touch the manifest");

    const validated = spawnSync(process.execPath, ["scripts/validate-candidate.mjs", "--artifact", join(outDir, "candidate.json"), "--repo", fixture.repo], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(validated.stdout, /Candidate valid/);
  } finally {
    fixture.cleanup();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("downgrade, prerelease and malformed metadata fail visibly", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-cli-errors-"));
  const before = hashFiles();
  try {
    const downgrade = runCli(["--dry-run", "--metadata", writeMetadata(dir, "downgrade.json", fixtureMetadata({ versions: { "pi-web-access": "0.38.0" } }))]);
    assert.equal(downgrade.status, 1);
    assert.match(downgrade.stderr, /拒绝降级/);

    const prerelease = runCli(["--dry-run", "--metadata", writeMetadata(dir, "prerelease.json", fixtureMetadata({ versions: { "pi-web-access": "0.40.0-rc.1" } }))]);
    assert.equal(prerelease.status, 1);
    assert.match(prerelease.stderr, /latestStable/);

    const malformed = runCli(["--dry-run", "--metadata", writeMetadata(dir, "malformed.json", "{ nope")]);
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /无法解析 metadata JSON/);

    for (const version of ["01.2.3", "0.01.0", "0.1.00", "9007199254740992.0.0"]) {
      const invalid = runCli(["--dry-run", "--metadata", writeMetadata(dir, "noncanonical.json", fixtureMetadata({ versions: { "pi-web-access": version } }))]);
      assert.equal(invalid.status, 1, version);
      assert.match(invalid.stderr, /latestStable/);
      assert.doesNotMatch(invalid.stdout, /no-update/);
    }
    const missing = runCli(["--dry-run", "--metadata", join(dir, "absent.json")]);
    assert.equal(missing.status, 1);
    assert.deepEqual(hashFiles(), before, "error paths must not mutate tracked files");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("candidate-status helper emits strict enums and rejects malformed candidates", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-status-"));
  try {
    const outputPath = join(dir, "github-output.txt");
    writeFileSync(outputPath, "");
    const missing = runStatus(["--artifact", join(dir, "absent.json")], { GITHUB_OUTPUT: outputPath });
    assert.equal(missing.status, 0, missing.stderr);
    assert.match(readFileSync(outputPath, "utf8"), /status=no-update\n/);
    assert.match(readFileSync(outputPath, "utf8"), /has_candidate=false/);

    const validPath = join(dir, "candidate.json");
    writeFileSync(validPath, JSON.stringify({ schemaVersion: 1, status: "drift", files: [{ path: "maintenance/update-report.md" }] }));
    const valid = runStatus(["--artifact", validPath], { GITHUB_OUTPUT: outputPath });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(readFileSync(outputPath, "utf8"), /status=drift\n/);
    assert.match(readFileSync(outputPath, "utf8"), /has_candidate=true/);

    const malformedPath = join(dir, "malformed.json");
    writeFileSync(malformedPath, JSON.stringify({ status: "evil; rm -rf /", files: [{ path: "x" }] }));
    const malformed = runStatus(["--artifact", malformedPath], { GITHUB_OUTPUT: outputPath });
    assert.equal(malformed.status, 1);
    assert.doesNotMatch(readFileSync(outputPath, "utf8"), /evil/);

    const emptyFilesPath = join(dir, "empty.json");
    writeFileSync(emptyFilesPath, JSON.stringify({ status: "ready", files: [] }));
    assert.equal(runStatus(["--artifact", emptyFilesPath], { GITHUB_OUTPUT: outputPath }).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate-candidate CLI refuses a candidate whose baseCommit drifted", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-validate-cli-"));
  try {
    const artifactPath = join(dir, "candidate.json");
    writeFileSync(artifactPath, JSON.stringify({
      schemaVersion: 1,
      kind: "amox-lean-maintenance-candidate",
      baseCommit: "d".repeat(40),
      status: "lean-review",
      files: [{ path: "maintenance/update-report.md", contentSha256: "e".repeat(64), content: "# Upstream maintenance candidate\n<!-- amox-maintenance-candidate; status: lean-review -->\n" }],
    }));
    const result = spawnSync(process.execPath, ["scripts/validate-candidate.mjs", "--artifact", artifactPath, "--repo", repoRoot], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /baseCommit/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("actual producer CLI rejects uncommitted tracked edits before creating a candidate", () => {
  const fixture = cleanGitFixture(repoRoot);
  const dir = mkdtempSync(join(tmpdir(), "amox-cli-dirty-"));
  try {
    const metadataPath = writeMetadata(dir, "metadata.json", fixtureMetadata({ leanHeads: { "rpiv-todo-lean": "9".repeat(40) } }));
    writeFileSync(join(fixture.repo, "docs/maintenance.md"), "uncommitted tracked content");
    const outDir = join(dir, "out");
    const result = runCli(["--apply", "--metadata", metadataPath, "--out-dir", outDir], {}, fixture.repo);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /clean tracked checkout/);
    assert.equal(existsSync(join(outDir, "candidate.json")), false);
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
