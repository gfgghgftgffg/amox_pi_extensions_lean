import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../scripts/lib/process.mjs";
import { nextPatch } from "../scripts/lib/files.mjs";
import { scopeFromChanges, loadCheckScope, validateReleaseChanges, checkCommands } from "../scripts/lib/check-scope.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

const web = "pi-web-access-lean", todo = "rpiv-todo-lean", sub = "pi-subagents-lean";
function data(f) { return { root: f.read("package.json"), manifest: f.read("maintenance/manifest.json"), lock: f.read("package-lock.json"), snapshot: f.read("maintenance/tool-contracts.json") }; }

test("single upstream changes select only their owner; shared code and shared dependency changes expand checks", () => {
  const f = releaseFixture();
  try {
    const before = data(f), entries = before.manifest.packages;
    let after = structuredClone(before);
    after.lock.packages["node_modules/pi-web-access"].version = nextPatch(before.lock.packages["node_modules/pi-web-access"].version);
    assert.deepEqual(scopeFromChanges({ entries, before, after, paths: ["package-lock.json"] }).packageIds, [web]);
    assert.equal(scopeFromChanges({ entries, before, after, paths: [`packages/${web}/index.ts`] }).full, false);
    assert.equal(scopeFromChanges({ entries, before, after, paths: ["scripts/lib/local-sandbox.mjs"] }).full, true);
    after.root.scripts.test = "changed";
    assert.equal(scopeFromChanges({ entries, before, after, paths: ["package.json"] }).full, true);

    const docBefore = { ...structuredClone(before), "README.md": "Saved **96.0%**\n" };
    const docAfter = structuredClone(docBefore); docAfter["README.md"] = "Saved **97.0%**\n";
    assert.equal(scopeFromChanges({ entries, before: docBefore, after: docAfter, paths: [`packages/${web}/index.ts`, "README.md"] }).full, false);
    docAfter["README.md"] += "Changed shared instructions";
    assert.equal(scopeFromChanges({ entries, before: docBefore, after: docAfter, paths: [`packages/${web}/index.ts`, "README.md"] }).full, true);

    const sharedBefore = structuredClone(before);
    sharedBefore.lock.packages["node_modules/pi-web-access"].dependencies = { shared: "1.0.0" };
    sharedBefore.lock.packages["node_modules/@juicesharp/rpiv-todo"].dependencies = { shared: "1.0.0" };
    sharedBefore.lock.packages["node_modules/shared"] = { version: "1.0.0" };
    const sharedAfter = structuredClone(sharedBefore); sharedAfter.lock.packages["node_modules/shared"].version = "1.0.1";
    const scope = scopeFromChanges({ entries, before: sharedBefore, after: sharedAfter, paths: ["package-lock.json"] });
    assert.equal(scope.full, false); assert.deepEqual(scope.packageIds, [web, todo]);
    sharedAfter.lock.packages["node_modules/unowned-dev-dependency"] = { version: "1.0.0" };
    assert.equal(scopeFromChanges({ entries, before: sharedBefore, after: sharedAfter, paths: ["package-lock.json"] }).full, true);
  } finally { f.cleanup(); }
});

test("contract changes select their owner; shared contract format changes require all packages", () => {
  const f = releaseFixture();
  try {
    const before = data(f), after = structuredClone(before), entries = before.manifest.packages;
    after.snapshot.lean[entries.find((entry) => entry.id === todo).packageName].version = "9.0.0";
    assert.deepEqual(scopeFromChanges({ entries, before, after, paths: ["maintenance/tool-contracts.json"] }).packageIds, [todo]);
    after.snapshot.lean["untracked-contract"] = {};
    assert.equal(scopeFromChanges({ entries, before, after, paths: ["maintenance/tool-contracts.json"] }).full, true);
    delete after.snapshot.lean["untracked-contract"];
    after.snapshot.schemaVersion++;
    assert.equal(scopeFromChanges({ entries, before, after, paths: ["maintenance/tool-contracts.json"] }).full, true);
    const commands = checkCommands({ full: false, packageIds: [web] });
    for (const [, args] of commands.slice(0, 3)) { assert.ok(args.includes(web)); assert.ok(!args.includes(todo)); }
    assert.equal(checkCommands({ full: true })[0][1].includes("--packages"), false);
  } finally { f.cleanup(); }
});

function bumpWeb(f, base) {
  const root = f.read("package.json"); root.version = "9.0.0"; f.write("package.json", root);
  const manifest = f.read("maintenance/manifest.json"); manifest.packages.find((entry) => entry.id === web).version = "1.0.1";
  manifest.release = { version: root.version, baseCommit: base, packageIds: [web] }; f.write("maintenance/manifest.json", manifest);
  const pkg = f.read(`packages/${web}/package.json`); pkg.version = "1.0.1"; f.write(`packages/${web}/package.json`, pkg);
  const lock = f.read("package-lock.json"); lock.version = root.version; lock.packages[""].version = root.version; lock.packages[`packages/${web}`].version = pkg.version; f.write("package-lock.json", lock);
  const snapshot = f.read("maintenance/tool-contracts.json"); snapshot.lean[pkg.name].version = pkg.version; f.write("maintenance/tool-contracts.json", snapshot);
  f.write(`packages/${web}/index.ts`, readFileSync(join(f.root, `packages/${web}/index.ts`), "utf8") + "\n// fixture change\n");
}

test("exact-base integration scopes a single independent release and rejects omitted or unversioned package changes", () => {
  const f = releaseFixture();
  try {
    const base = f.commit(); bumpWeb(f, base);
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    assert.deepEqual(loadCheckScope(f.root, base).packageIds, [web]);
    assert.equal(loadCheckScope(f.root, base).full, false);
    assert.equal(loadCheckScope(f.root, undefined).full, true);
    assert.equal(loadCheckScope(f.root, "0".repeat(40)).full, true);
    const path = `packages/${todo}/README.md`, original = readFileSync(join(f.root, path), "utf8");
    f.write(path, original + "\nUnselected published change\n");
    assert.throws(() => loadCheckScope(f.root, base), /Unselected published package changed/);
    f.write(path, original);
    const manifest = f.read("maintenance/manifest.json"); manifest.release.packageIds = [web, sub]; f.write("maintenance/manifest.json", manifest);
    assert.throws(() => validateReleaseChanges(f.root, base), /exactly match/);
    manifest.release.packageIds = [web]; manifest.release.baseCommit = "a".repeat(40); f.write("maintenance/manifest.json", manifest);
    assert.throws(() => validateReleaseChanges(f.root, base), /base/);
  } finally { f.cleanup(); }
});

test("release planning binds automatic and manual batches to the same independent version selection", () => {
  const f = releaseFixture();
  try {
    const base = f.commit(); bumpWeb(f, base);
    const script = fileURLToPath(new URL("../scripts/release-plan.mjs", import.meta.url));
    const invoke = (event) => run(process.execPath, [script, "--run"], { cwd: f.root,
      env: { ...process.env, GITHUB_EVENT_NAME: event, RELEASE_BEFORE_SHA: base, RELEASE_TAG: "v9.0.0", GITHUB_OUTPUT: "" } });
    for (const event of ["push", "workflow_dispatch"]) {
      const result = invoke(event); assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /should_release=true/); assert.match(result.stdout, /tag=v9\.0\.0/);
      assert.ok(result.stdout.includes(`base_sha=${base}`));
    }
    const manifest = f.read("maintenance/manifest.json"); manifest.release.packageIds = [web, todo]; f.write("maintenance/manifest.json", manifest);
    assert.notEqual(invoke("push").status, 0); assert.notEqual(invoke("workflow_dispatch").status, 0);
  } finally { f.cleanup(); }
});

test("new independently versioned packages must be selected when the release base predates them", () => {
  const f = releaseFixture();
  try {
    f.commit();
    const sync = f.manifest.packages.find((entry) => entry.id === "amox-pi-sync");
    f.git(["rm", "-r", sync.path]);
    const previousManifest = f.read("maintenance/manifest.json");
    previousManifest.packages = previousManifest.packages.filter((entry) => entry.id !== sync.id);
    f.write("maintenance/manifest.json", previousManifest);
    const previousLock = f.read("package-lock.json"); delete previousLock.packages[sync.path]; f.write("package-lock.json", previousLock);
    f.git(["add", "."]); f.git(["commit", "--quiet", "-m", "base without sync"]);
    const base = f.git(["rev-parse", "HEAD"]);
    f.git(["checkout", "HEAD~1", "--", "."]);
    // A normal push with an unchanged root version is not a release batch.
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    const root = f.read("package.json"); root.version = "9.0.0"; f.write("package.json", root);
    const lock = f.read("package-lock.json"); lock.version = root.version; lock.packages[""].version = root.version;
    lock.packages[sync.path].version = "0.1.0"; f.write("package-lock.json", lock);
    const pkg = f.read(`${sync.path}/package.json`); pkg.version = "0.1.0"; f.write(`${sync.path}/package.json`, pkg);
    const manifest = f.read("maintenance/manifest.json"); manifest.packages.find((entry) => entry.id === sync.id).version = pkg.version;
    manifest.release = { version: root.version, baseCommit: base, packageIds: [sync.id] }; f.write("maintenance/manifest.json", manifest);
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    assert.equal(loadCheckScope(f.root, base).full, true);
    manifest.release.packageIds = [web]; f.write("maintenance/manifest.json", manifest);
    assert.throws(() => validateReleaseChanges(f.root, base), /exactly match/);
  } finally { f.cleanup(); }
});

test("unselected core.ts cannot be changed, removed or newly added", () => {
  const f = releaseFixture();
  try {
    const base = f.commit(); bumpWeb(f, base);
    const path = "packages/amox-pi-sync/core.ts", original = readFileSync(join(f.root, path), "utf8");
    f.write(path, original + "\n// unselected change\n");
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: amox-pi-sync\/core\.ts/);
    f.git(["rm", "-f", path]);
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: amox-pi-sync\/core\.ts/);
    f.write(path, original);
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    f.write(`packages/${todo}/core.ts`, "// newly added published source\n");
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: rpiv-todo-lean\/core\.ts/);
  } finally { f.cleanup(); }
});

test("unselected sync SSH helper stays protected after removal from package files", () => {
  const f = releaseFixture();
  try {
    const base = f.commit(); bumpWeb(f, base);
    const path = "packages/amox-pi-sync/ssh-proxy.mjs", original = readFileSync(join(f.root, path), "utf8");
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    f.write(path, original + "\n// unselected proxy change\n");
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: amox-pi-sync\/ssh-proxy\.mjs/);
    const pkg = f.read("packages/amox-pi-sync/package.json");
    pkg.files = pkg.files.filter(file => file !== "ssh-proxy.mjs");
    f.write("packages/amox-pi-sync/package.json", pkg);
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: amox-pi-sync\/ssh-proxy\.mjs/);
    f.git(["rm", "-f", path]);
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: amox-pi-sync\/ssh-proxy\.mjs/);
  } finally { f.cleanup(); }
});

for (const helper of ["integration.ts", "delegation.ts"]) test(`unselected goal ${helper} is protected even after removal from package files`, () => {
  const f = releaseFixture(), goal = "pi-goal-x-lean";
  try {
    for (const file of ["integration.ts", "delegation.ts"]) {
      f.write(`packages/${goal}/${file}`, readFileSync(new URL(`../packages/${goal}/${file}`, import.meta.url), "utf8"));
    }
    const base = f.commit(); bumpWeb(f, base);
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    const path = `packages/${goal}/${helper}`, original = readFileSync(join(f.root, path), "utf8");
    const changed = new RegExp(`Unselected published package changed: ${goal}/${helper.replace(".", "\\.")}$`);
    f.write(path, original + "\n// unselected helper change\n");
    assert.throws(() => validateReleaseChanges(f.root, base), changed);
    const pkg = f.read(`packages/${goal}/package.json`), previous = structuredClone(pkg);
    pkg.files = pkg.files.filter(file => file !== helper); f.write(`packages/${goal}/package.json`, pkg);
    assert.throws(() => validateReleaseChanges(f.root, base), changed);
    f.git(["rm", "-f", path]);
    assert.throws(() => validateReleaseChanges(f.root, base), changed);
    f.write(path, original); f.write(`packages/${goal}/package.json`, previous);
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
  } finally { f.cleanup(); }
});

test("unselected published TypeScript additions are checked without protecting arbitrary source files", () => {
  const f = releaseFixture(), goal = "pi-goal-x-lean";
  try {
    const base = f.commit(); bumpWeb(f, base);
    const helper = "support.ts", path = `packages/${goal}/${helper}`;
    f.write(path, "// not yet published\n");
    f.write(`packages/${goal}/tests/fixtures/private.ts`, "// unpublished fixture\n");
    assert.doesNotThrow(() => validateReleaseChanges(f.root, base));
    const pkg = f.read(`packages/${goal}/package.json`); pkg.files.push(helper); f.write(`packages/${goal}/package.json`, pkg);
    assert.throws(() => validateReleaseChanges(f.root, base), /Unselected published package changed: pi-goal-x-lean\/support\.ts$/);
  } finally { f.cleanup(); }
});

const goalSubagentsPair = [sub, "pi-goal-x-lean"];

test("goal/subagents ABI validation closes both directions for source, manifest, lock and contract changes", () => {
  const f = releaseFixture();
  try {
    const before = data(f);
    const changes = [
      ["source", (after, entry) => [`${entry.path}/${entry.id === sub ? "index.ts" : "delegation.ts"}`]],
      ["manifest", (after, entry) => {
        entry.upstreamVersion = nextPatch(entry.upstreamVersion);
        return ["maintenance/manifest.json"];
      }],
      ["lock", (after, entry) => {
        const dependency = after.lock.packages[`node_modules/${entry.upstreamPackage}`];
        dependency.version = nextPatch(dependency.version);
        return ["package-lock.json"];
      }],
      ["lean contract", (after, entry) => {
        after.snapshot.lean[entry.packageName].version = nextPatch(entry.version);
        return ["maintenance/tool-contracts.json"];
      }],
      ["upstream contract", (after, entry) => {
        after.snapshot.upstream[entry.upstreamPackage].version = nextPatch(entry.upstreamVersion);
        return ["maintenance/tool-contracts.json"];
      }],
    ];
    for (const id of goalSubagentsPair) for (const [kind, change] of changes) {
      const after = structuredClone(before), entries = after.manifest.packages;
      const paths = change(after, entries.find(entry => entry.id === id));
      const scope = scopeFromChanges({ entries, before, after, paths });
      assert.equal(scope.full, false, `${id}: ${kind} stays package-local`);
      assert.deepEqual(scope.packageIds, goalSubagentsPair, `${id}: ${kind} validates only the ABI pair`);
      assert.deepEqual(checkCommands(scope).slice(0, 3), [
        ["node", ["scripts/check-selected.mjs", "--packages", goalSubagentsPair.join(",")]],
        ["npm", ["run", "contracts:check", "--", "--packages", goalSubagentsPair.join(",")]],
        ["npm", ["run", "verify:production", "--", "--packages", goalSubagentsPair.join(",")]],
      ]);
    }
    const scope = scopeFromChanges({ entries: before.manifest.packages, before, after: structuredClone(before),
      paths: [...goalSubagentsPair, todo].map(id => `packages/${id}/index.ts`) });
    assert.equal(scope.full, false);
    assert.deepEqual(scope.packageIds, [todo, ...goalSubagentsPair], "closure retains other affected owners without duplicates");
  } finally { f.cleanup(); }
});

test("goal/subagents daily gate captures and checks the ABI pair without expanding the independent release", async t => {
  const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
  const { stageVersions } = await import("../scripts/local-maintenance.mjs");
  const { createCheckGate, protectedBaseline, validateLocalChanges } = await import("../scripts/lib/local-checks.mjs");
  const { releaseEntries } = await import("../scripts/lib/package-selection.mjs");
  for (const selected of goalSubagentsPair) await t.test(selected, async () => {
    const f = releaseFixture(), scratch = `${f.root}-checks`;
    mkdirSync(scratch);
    try {
      const goal = goalSubagentsPair[1], sibling = goalSubagentsPair.find(id => id !== selected);
      for (const helper of ["delegation.ts", "integration.ts"]) {
        f.write(`packages/${goal}/${helper}`, readFileSync(new URL(`../packages/${goal}/${helper}`, import.meta.url), "utf8"));
      }
      const existingTest = `packages/${selected}/tests/retained.test.mjs`, retained = "// retained regression assertions\n";
      f.write(existingTest, retained);
      const base = f.commit(), manifest = f.read("maintenance/manifest.json");
      f.git(["config", "user.name", "Fixture"]); f.git(["config", "user.email", "fixture@example.invalid"]);
      const workspaces = manifest.packages.map(entry => ({ id: entry.id, path: entry.path,
        packageJsonPath: `${entry.path}/package.json`, pkg: f.read(`${entry.path}/package.json`) }));
      const originals = new Map(workspaces.map(workspace => [workspace.id, readFileSync(join(f.root, workspace.packageJsonPath), "utf8")]));
      const plan = { leanPlans: [], packagePlans: manifest.packages.filter(entry => entry.id === selected).map(entry => {
        const latestVersion = nextPatch(entry.upstreamVersion);
        return { id: entry.id, versionChange: "bump", latestVersion, upstreamGitHead: "b".repeat(40),
          upstreamRef: `npm:${entry.upstreamPackage}@${latestVersion}`,
          dependencyChanges: [{ name: entry.upstreamPackage, to: latestVersion }] };
      }) };
      const baseline = protectedBaseline(f.root, manifest, plan);
      const staged = await stageVersions({ work: f.root, scratch, baseCommit: base, state: { manifest, workspaces, plan },
        execute: async () => {
          // Stand in only for npm's lockfile writes; staging/gate/scope logic is real.
          const lock = f.read("package-lock.json"), root = f.read("package.json");
          lock.version = root.version; lock.packages[""].version = root.version;
          const pkg = f.read(`packages/${selected}/package.json`);
          lock.packages[`packages/${selected}`].version = pkg.version;
          lock.packages[`packages/${selected}`].dependencies = pkg.dependencies;
          for (const [name, version] of Object.entries(pkg.dependencies)) lock.packages[`node_modules/${name}`].version = version;
          f.write("package-lock.json", lock);
          return { ok: true };
        } });
      assert.deepEqual(staged.packageIds, [selected]);
      assert.deepEqual(staged.manifest.release.packageIds, [selected]);
      assert.deepEqual(loadCheckScope(f.root, base).packageIds, goalSubagentsPair);
      assert.equal(loadCheckScope(f.root, base).full, false);
      for (const workspace of workspaces.filter(workspace => workspace.id !== selected)) {
        assert.equal(readFileSync(join(f.root, workspace.packageJsonPath), "utf8"), originals.get(workspace.id));
        assert.equal(staged.generated.has(workspace.packageJsonPath), false);
      }
      f.write(existingTest, "// removed assertions\n");
      assert.throws(() => validateLocalChanges(f.root, staged.manifest, baseline, staged.generated, plan), /Existing tests are append-only/);
      f.write(existingTest, retained);
      const siblingSource = `packages/${sibling}/${sibling === goal ? "delegation.ts" : "index.ts"}`;
      const originalSource = readFileSync(join(f.root, siblingSource), "utf8");
      f.write(siblingSource, originalSource + "\n// unselected ABI repair\n");
      assert.throws(() => loadCheckScope(f.root, base), /Unselected published package changed/);
      f.write(siblingSource, originalSource);

      f.write("maintenance/agent-review.md", "# Exact upstream source review\n");
      const calls = []; let incompatible = true;
      const gate = createCheckGate({ repo: f.root, scratch, manifest: staged.manifest, plan, baseCommit: base,
        baseline, generated: staged.generated, log() {}, execute: async ({ command, args, writable }) => {
          calls.push([command, args]);
          if (command === "npm" && args[1] === "contracts") {
            const snapshot = f.read("maintenance/tool-contracts.json");
            const entry = staged.manifest.packages.find(entry => entry.id === selected);
            snapshot.lean[entry.packageName].version = entry.version;
            snapshot.upstream[entry.upstreamPackage].version = entry.upstreamVersion;
            writeFileSync(writable[0][0], `${JSON.stringify(snapshot, null, 2)}\n`);
          }
          const failed = incompatible && args[0] === "scripts/check-selected.mjs";
          return { ok: !failed, status: failed ? 1 : 0, timedOut: false, output: failed ? "Sibling dist ABI incompatible" : "ok" };
        } });
      const summary = "- Validate goal/subagents compatibility against the published dist ABI.";
      const failed = await gate.check(summary);
      assert.equal(failed.ok, false); assert.match(failed.output, /Sibling dist ABI incompatible/);
      assert.throws(() => gate.verified(), /No unchanged, locally verified candidate/);
      assert.deepEqual(calls, [
        ["npm", ["run", "contracts", "--", "--packages", goalSubagentsPair.join(",")]],
        checkCommands(loadCheckScope(f.root, base))[0],
      ], "daily capture and functional checks both use the pair; failure stops later checks");
      const candidate = f.git(["rev-parse", "HEAD"]);
      calls.length = 0; incompatible = false;
      const passed = await gate.check(summary);
      assert.equal(passed.ok, true); assert.equal(passed.sha, candidate); assert.equal(gate.verified(), candidate);
      assert.deepEqual(calls.slice(1), checkCommands(loadCheckScope(f.root, base)));
      assert.deepEqual(releaseEntries(f.root).map(entry => entry.id), [selected], "validation never adds a publish target");
      assert.equal(f.git(["diff", "--name-only", base, "--", `packages/${sibling}`]), "", "sibling source, version and docs stay untouched");
    } finally { f.cleanup(); rmSync(scratch, { recursive: true, force: true }); }
  });
});
