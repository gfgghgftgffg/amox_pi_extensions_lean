// Read-only CLI: no mutation, no candidate artifacts, visible metadata errors.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance/manifest.json"), "utf8"));
const tracked = ["package.json", "package-lock.json", "maintenance/manifest.json", "maintenance/tool-contracts.json",
  ...manifest.packages.map((entry) => `${entry.path}/package.json`)];
const hashes = () => tracked.map((path) => createHash("sha256").update(readFileSync(join(repoRoot, path))).digest("hex"));
function metadata({ lean = {}, versions = {} } = {}) {
  const npm = {}, git = {};
  for (const entry of manifest.packages) {
    const pkg = JSON.parse(readFileSync(join(repoRoot, entry.path, "package.json"), "utf8"));
    for (const [name, version] of Object.entries(pkg.dependencies)) npm[name] = { latestStable: versions[name] ?? version, gitHead: entry.upstreamGitHead };
    git[entry.leanRepository] = { head: lean[entry.id] ?? entry.leanCommit };
    git[entry.upstreamRepository] = { head: entry.upstreamGitHead };
  }
  return { npm, git };
}
function run(args) { return spawnSync(process.execPath, ["scripts/check-upstream.mjs", ...args], { cwd: repoRoot, encoding: "utf8" }); }
function fixture(body, callback) {
  const dir = mkdtempSync(join(tmpdir(), "amox-check-cli-"));
  try {
    const path = join(dir, "metadata.json"); writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
    callback(path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test("no-update detection reports JSON without touching any tracked metadata", () => {
  const before = hashes();
  fixture(metadata(), (path) => {
    const result = run(["--dry-run", "--json", "--metadata", path]);
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, "no-update");
    assert.deepEqual(hashes(), before);
  });
});
test("lean-only source change remains read-only and reports the exact revision", () => {
  const before = hashes();
  fixture(metadata({ lean: { "rpiv-todo-lean": "9".repeat(40) } }), (path) => {
    const result = run(["--metadata", path]); assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /status: lean-only/); assert.match(result.stdout, /9999999999999999999999999999999999999999/);
    assert.match(result.stdout, /leanCommit 基线未改动/); assert.deepEqual(hashes(), before);
  });
});
test("downgrades, prereleases, malformed metadata and retired apply mode fail visibly", () => {
  const before = hashes();
  for (const body of [metadata({ versions: { "pi-web-access": "0.38.0" } }), metadata({ versions: { "pi-web-access": "0.40.0-rc.1" } }), "{ nope"]) {
    fixture(body, (path) => { const result = run(["--metadata", path]); assert.equal(result.status, 1); assert.match(result.stderr, /拒绝降级|latestStable|无法解析 metadata JSON/); });
  }
  assert.equal(run(["--apply"]).status, 1); assert.deepEqual(hashes(), before);
});
