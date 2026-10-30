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
