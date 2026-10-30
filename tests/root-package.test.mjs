// The root is maintenance-only; every workspace is a standalone Pi package.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedRun } from "../scripts/lib/process.mjs";
import { workspaceVersions } from "../scripts/lib/package-selection.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance", "manifest.json"), "utf8"));
const workspacePackages = manifest.packages.map((entry) => ({
  entry,
  dir: join(repoRoot, entry.path),
  pkg: JSON.parse(readFileSync(join(repoRoot, entry.path, "package.json"), "utf8")),
}));

const LIFECYCLE_HOOKS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
];

test("root is maintenance-only and each workspace declares exactly one entrypoint", () => {
  assert.equal(rootPackage.private, true);
  assert.deepEqual(rootPackage.workspaces, ["packages/*"]);
  assert.equal(rootPackage.pi, undefined);
  assert.equal(rootPackage.dependencies, undefined);
  for (const { dir, pkg } of workspacePackages) {
    assert.deepEqual(pkg.pi.extensions, ["./index.ts"]);
    const absolute = resolve(dir, pkg.pi.extensions[0]);
    assert.ok(existsSync(absolute));
    assert.ok(statSync(absolute).isFile());
  }
});

test("no lifecycle hooks anywhere in the workspace tree", () => {
  for (const [label, scripts] of [
    ["root", rootPackage.scripts ?? {}],
    ...workspacePackages.map(({ entry, pkg }) => [entry.id, pkg.scripts ?? {}]),
  ]) {
    for (const hook of LIFECYCLE_HOOKS) {
      assert.equal(scripts[hook], undefined, `${label} must not define a lifecycle hook: ${hook}`);
    }
  }
});

test("workspace package metadata matches maintenance/manifest.json", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.doesNotThrow(() => workspaceVersions(repoRoot));
  assert.equal(workspacePackages.length, 3);
  for (const { entry, dir, pkg } of workspacePackages) {
    assert.equal(entry.id, entry.path.split("/").pop());
    assert.equal(pkg.name, entry.packageName);
    assert.equal(pkg.name, `@gfgghgftgffg/${entry.id}`);
    assert.equal(pkg.version, entry.version, "each package tracks its own version, not the release batch");
    assert.equal(pkg.license, "MIT");
    assert.equal(pkg.repository.directory, entry.path);
    assert.match(pkg.repository.url, /gfgghgftgffg\/amox_pi_extensions_lean\.git/);
    assert.ok(entry.leanRepository.endsWith(`${entry.id}.git`), entry.leanRepository);
    assert.match(entry.leanCommit, /^[0-9a-f]{40}$/);
    assert.equal(pkg.dependencies[entry.upstreamPackage], entry.upstreamVersion);
    assert.deepEqual(pkg.pi.extensions, ["./index.ts"]);
    assert.ok(pkg.files.includes("index.ts"));
    assert.ok(pkg.files.includes("LICENSE"));
    assert.ok(pkg.files.includes("MAINTENANCE.md"));
    assert.ok(pkg.files.includes("README.zh-CN.md"));
    const license = readFileSync(join(dir, "LICENSE"), "utf8");
    assert.match(license, /^MIT License/);
    assert.ok(existsSync(join(dir, "MAINTENANCE.md")), `${entry.id}/MAINTENANCE.md must exist`);
    assert.ok(Array.isArray(pkg.contributors) && pkg.contributors.length > 0, `${entry.id} must list upstream attribution`);
  }
});

test("host-supplied Pi packages and typebox stay peers, never runtime dependencies", () => {
  const forbidden = [/^@earendil-works\//, /^typebox$/, /^@sinclair\/typebox$/];
  for (const [label, pkg] of [["root", rootPackage], ...workspacePackages.map(({ entry, pkg }) => [entry.id, pkg])]) {
    for (const peer of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
      assert.ok(pkg.peerDependencies?.[peer], `${label} must declare peer ${peer}`);
    }
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(dependency), `${label} must not depend at runtime on ${dependency}`);
      }
    }
  }
  assert.equal(rootPackage.dependencies, undefined, "no install-all runtime bundle");
});

test("each workspace packs its own entrypoint, LICENSE and maintenance records only", () => {
  for (const { dir, pkg } of workspacePackages) {
    const output = checkedRun("npm", ["pack", "--dry-run", "--ignore-scripts", "--workspaces=false", "--json"], { cwd: dir });
    const packed = JSON.parse(output)[0];
    assert.equal(packed.name, pkg.name);
    const files = packed.files.map((file) => file.path);
    for (const path of ["index.ts", "package.json", "LICENSE", "MAINTENANCE.md", "README.md", "README.zh-CN.md"]) {
      assert.ok(files.includes(path), `packed tarball is missing ${path}`);
    }
    assert.ok(!files.some((path) => path.startsWith("packages/") || path.startsWith("node_modules/")));
  }
});
