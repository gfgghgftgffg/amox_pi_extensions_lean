import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stageVersions } from "../scripts/local-maintenance.mjs";
import { maintenancePackageIds, parsePackageIds, selectEntries, workspaceVersions } from "../scripts/lib/package-selection.mjs";
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

test("workspace, manifest and lockfile must agree on each independent package version", () => {
  const f = releaseFixture({ versions: { [web]: "1.2.4", [todo]: "2.3.4", [sub]: "3.4.5" } });
  try {
    assert.doesNotThrow(() => workspaceVersions(f.root));
    const pkg = f.read(`packages/${todo}/package.json`); pkg.version = "2.3.5"; f.write(`packages/${todo}/package.json`, pkg);
    assert.throws(() => workspaceVersions(f.root), /mismatch/);
    pkg.version = "2.3.4"; f.write(`packages/${todo}/package.json`, pkg);
    const root = f.read("package.json"); root.version = "0.0.1"; f.write("package.json", root);
    assert.throws(() => workspaceVersions(f.root), /lockfile version/);
  } finally { f.cleanup(); }
});

test("staging an update bumps only the affected package and never a repository version", async (t) => {
  for (const selected of [web, sub]) await t.test(selected, async () => {
    const f = releaseFixture({ versions: { [web]: "1.2.3", [todo]: "2.3.4", [sub]: "3.4.5" } });
    try {
      const manifest = f.read("maintenance/manifest.json");
      const rootBefore = readFileSync(join(f.root, "package.json"), "utf8");
      const original = new Map(manifest.packages.map((entry) => [entry.id, readFileSync(join(f.root, entry.path, "package.json"), "utf8")]));
      const workspaces = manifest.packages.map((entry) => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: f.read(`${entry.path}/package.json`) }));
      const plan = { packagePlans: manifest.packages.map((entry) => ({ id: entry.id, versionChange: selected === web && entry.id === web ? "bump" : "none",
        latestVersion: entry.upstreamVersion, upstreamGitHead: entry.upstreamGitHead, dependencyChanges: [] })),
        leanPlans: manifest.packages.map((entry) => ({ id: entry.id, changed: selected === sub && entry.id === sub })) };
      const staged = await stageVersions({ work: f.root, scratch: f.root, state: { manifest, workspaces, plan },
        execute: async ({ command, args }) => { assert.equal(command, "npm"); assert.ok(args.includes("--ignore-scripts")); return { ok: true }; } });
      assert.deepEqual(staged.packageIds, [selected]);
      assert.deepEqual(staged.releases, [{
        id: selected,
        package: manifest.packages.find((entry) => entry.id === selected).packageName,
        version: selected === web ? "1.2.4" : "3.4.6",
        tag: `@gfgghgftgffg/${selected}@${selected === web ? "1.2.4" : "3.4.6"}`,
      }]);
      assert.equal(readFileSync(join(f.root, "package.json"), "utf8"), rootBefore, "the private root version never changes");
      assert.equal(staged.generated.has("package.json"), false);
      for (const entry of manifest.packages) {
        const actual = readFileSync(join(f.root, entry.path, "package.json"), "utf8");
        if (entry.id !== selected) { assert.equal(actual, original.get(entry.id)); assert.equal(staged.generated.has(`${entry.path}/package.json`), false); }
        else assert.equal(JSON.parse(actual).version, selected === web ? "1.2.4" : "3.4.6");
      }
    } finally { f.cleanup(); }
  });
});
