// Repository integration only: never touch user Pi settings or SSH remotes.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoState } from "../scripts/check-upstream.mjs";
import { buildUpdatePlan, applyPlanToManifest } from "../scripts/lib/upstream-plan.mjs";
import { fetchUpstreamMetadata, requiredGitUrls } from "../scripts/lib/upstream-metadata.mjs";
import { collectSources } from "../scripts/lib/upstream-sources.mjs";
import { adapterWritable } from "../scripts/lib/files.mjs";
import { stageVersions } from "../scripts/local-maintenance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const state = loadRepoState(root);
// Preserve the explicit opt-out contract for truly manual forks. The live sync
// package now opts into selective review; its flow is tested separately.
state.manifest.packages.find(entry => entry.id === "amox-pi-sync").maintenanceMode = "manual-fork";
const fork = state.manifest.packages.find(entry => entry.id === "amox-pi-sync");
function metadata() {
  const npm = {}, git = {};
  for (const entry of state.manifest.packages.filter(entry => entry !== fork)) {
    const workspace = state.workspaces.find(workspace => workspace.id === entry.id);
    for (const [name, version] of Object.entries(workspace.pkg.dependencies)) npm[name] = { latestStable: version, gitHead: entry.upstreamGitHead };
    git[entry.upstreamRepository] = { head: entry.upstreamGitHead };
    git[entry.leanRepository] = { head: entry.leanCommit };
  }
  return { npm, git };
}

test("manual sync fork is excluded from automatic discovery and adaptation", async () => {
  assert.equal(requiredGitUrls(state.manifest).includes(fork.upstreamRepository), false);
  const plan = buildUpdatePlan({ ...state, metadata: metadata() });
  assert.equal(plan.status, "no-update");
  assert.equal(plan.packagePlans.some(entry => entry.id === fork.id), false);
  assert.equal(plan.leanPlans.some(entry => entry.id === fork.id), false);
  assert.deepEqual(applyPlanToManifest(state.manifest, plan), state.manifest);
  for (const path of ["index.ts", "core.ts", "README.md", "README.zh-CN.md", "MAINTENANCE.md", "tests/core.test.mjs"]) {
    assert.equal(adapterWritable(`${fork.path}/${path}`, state.manifest), false, path);
  }
  // Even an accidental runtime dependency in a manual fork must not start registry discovery.
  const workspaces = structuredClone(state.workspaces);
  workspaces.find(entry => entry.id === fork.id).pkg.dependencies = { "pi-sync-suite": "0.1.1" };
  const requested = [];
  const fetched = await fetchUpstreamMetadata({ manifest: state.manifest, workspaces,
    fetchImpl: async url => {
      const name = decodeURIComponent(url.slice("https://registry.npmjs.org/".length));
      requested.push(name);
      const version = metadata().npm[name].latestStable;
      return { ok: true, json: async () => ({ "dist-tags": { latest: version }, versions: { [version]: { name, version, gitHead: "a".repeat(40) } } }) };
    }, gitHeadResolver: () => "a".repeat(40) });
  assert.equal(requested.includes("pi-sync-suite"), false);
  assert.equal(fetched.git[fork.upstreamRepository], undefined);
});

test("automatic source collection and version staging leave the sync fork untouched", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "amox-sync-integration-"));
  try {
    const plan = buildUpdatePlan({ ...state, metadata: metadata() });
    mkdirSync(join(scratch, "sources", "context"), { recursive: true });
    assert.deepEqual(collectSources({ repoRoot: root, outDir: join(scratch, "sources"), ...state, plan,
      runGit() { throw new Error("No source fetch expected for an unchanged plan"); } }), []);
    const work = join(scratch, "repo");
    mkdirSync(work);
    writeFileSync(join(work, "package.json"), readFileSync(join(root, "package.json")));
    writeFileSync(join(work, "package-lock.json"), "fixture lock\n");
    mkdirSync(join(work, "maintenance"));
    for (const workspace of state.workspaces) {
      mkdirSync(join(work, workspace.path), { recursive: true });
      writeFileSync(join(work, workspace.packageJsonPath), JSON.stringify(workspace.pkg));
    }
    const before = readFileSync(join(work, fork.path, "package.json"), "utf8");
    const stagePlan = { ...plan, leanPlans: plan.leanPlans.map((entry, index) => ({ ...entry, changed: index === 0 })) };
    const staged = await stageVersions({ work, state: { ...state, plan: stagePlan }, scratch, baseCommit: "b".repeat(40),
      execute: async ({ command, args }) => { assert.equal(command, "npm"); assert.equal(args[0], "install"); return { ok: true }; } });
    assert.equal(readFileSync(join(work, fork.path, "package.json"), "utf8"), before);
    assert.deepEqual(staged.manifest.packages.find(entry => entry.id === fork.id), fork);
    assert.equal(staged.generated.has(`${fork.path}/package.json`), false);
    const selectedId = plan.leanPlans[0].id;
    assert.deepEqual(staged.packageIds, [selectedId]);
    for (const entry of staged.manifest.packages.filter(entry => entry.id !== selectedId)) {
      assert.deepEqual(entry, state.manifest.packages.find(previous => previous.id === entry.id));
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
