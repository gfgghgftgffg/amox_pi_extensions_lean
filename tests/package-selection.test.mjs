import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stageVersions } from "../scripts/local-maintenance.mjs";
import { maintenancePackageIds, parsePackageIds, releaseEntries, selectEntries, workspaceVersions } from "../scripts/lib/package-selection.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

const web = "pi-web-access-lean", todo = "rpiv-todo-lean", sub = "pi-subagents-lean";

test("package selection rejects empty, duplicated and unknown IDs instead of selecting everything", () => {
  const entries = [web, todo, sub].map((id) => ({ id }));
  assert.deepEqual(selectEntries(entries, [web]), [{ id: web }]);
  assert.equal(selectEntries(entries), entries);
  for (const ids of [[], [web, web], ["unknown"], [web, ""], "all"]) assert.throws(() => selectEntries(entries, ids), /selection/);
  assert.deepEqual(parsePackageIds(["--packages", `${web},${sub}`]), [web, sub]);
  assert.throws(() => parsePackageIds(["--packages"]), /needs/);
  assert.throws(() => parsePackageIds(["--packages", web, "--packages", todo]), /needs/);
  assert.deepEqual(maintenancePackageIds({ packagePlans: [{ id: web, versionChange: "bump" }, { id: todo, versionChange: "none" }],
    leanPlans: [{ id: web, changed: true }, { id: sub, changed: true }] }), [web, sub]);
});

test("independent npm versions require a valid protected release-batch selection", () => {
  const f = releaseFixture({ batchVersion: "9.0.0", versions: { [web]: "1.2.4", [todo]: "2.3.4", [sub]: "3.4.5" }, packageIds: [web] });
  try {
    assert.doesNotThrow(() => workspaceVersions(f.root));
    assert.deepEqual(releaseEntries(f.root).map((entry) => [entry.id, entry.version]), [[web, "1.2.4"]]);
    const manifest = f.read("maintenance/manifest.json"), original = structuredClone(manifest.release);
    for (const release of [undefined, { ...original, packageIds: [] }, { ...original, packageIds: [web, web] },
      { ...original, packageIds: ["unknown"] }, { ...original, packageIds: undefined }, { ...original, version: "8.0.0" }, { ...original, baseCommit: "main" }]) {
      manifest.release = release; f.write("maintenance/manifest.json", manifest);
      assert.throws(() => releaseEntries(f.root), /selection|batch/);
    }
    manifest.release = original; f.write("maintenance/manifest.json", manifest);
    const pkg = f.read(`packages/${todo}/package.json`); pkg.version = "2.3.5"; f.write(`packages/${todo}/package.json`, pkg);
    assert.throws(() => releaseEntries(f.root), /mismatch/);
  } finally { f.cleanup(); }
});

test("staging a web-only update bumps only web; a lean-only review bumps only that lean", async (t) => {
  for (const selected of [web, sub]) await t.test(selected, async () => {
    const f = releaseFixture({ batchVersion: "9.0.0", versions: { [web]: "1.2.3", [todo]: "2.3.4", [sub]: "3.4.5" }, packageIds: [web] });
    try {
      const manifest = f.read("maintenance/manifest.json");
      const original = new Map(manifest.packages.map((entry) => [entry.id, readFileSync(join(f.root, entry.path, "package.json"), "utf8")]));
      const workspaces = manifest.packages.map((entry) => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: f.read(`${entry.path}/package.json`) }));
      const plan = { packagePlans: manifest.packages.map((entry) => ({ id: entry.id, versionChange: selected === web && entry.id === web ? "bump" : "none",
        latestVersion: entry.upstreamVersion, upstreamGitHead: entry.upstreamGitHead, dependencyChanges: [] })),
        leanPlans: manifest.packages.map((entry) => ({ id: entry.id, changed: selected === sub && entry.id === sub })) };
      let installs = 0;
      const staged = await stageVersions({ work: f.root, scratch: f.root, baseCommit: "b".repeat(40), state: { manifest, workspaces, plan },
        execute: async ({ command, args }) => { installs++; assert.equal(command, "npm"); assert.ok(args.includes("--ignore-scripts")); return { ok: true }; } });
      assert.equal(installs, 1); assert.equal(staged.version, "9.0.1");
      assert.deepEqual(staged.packageIds, [selected]); assert.equal(staged.manifest.release.baseCommit, "b".repeat(40));
      for (const entry of manifest.packages) {
        const actual = readFileSync(join(f.root, entry.path, "package.json"), "utf8");
        if (entry.id !== selected) { assert.equal(actual, original.get(entry.id)); assert.equal(staged.generated.has(`${entry.path}/package.json`), false); }
        else assert.equal(JSON.parse(actual).version, selected === web ? "1.2.4" : "3.4.6");
      }
    } finally { f.cleanup(); }
  });
});
