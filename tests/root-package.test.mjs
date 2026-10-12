// Root manifest / packaging checks: the monorepo must be a valid installable Pi
// package whose packing contains the three entrypoints and LICENSEs, without
// lifecycle hooks and without loading upstream engines as extra extensions.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

test("root manifest is a private workspace with exactly three pi extension entrypoints", () => {
  assert.equal(rootPackage.private, true);
  assert.deepEqual(rootPackage.workspaces, ["packages/*"]);
  assert.equal(rootPackage.pi.extensions.length, 3);
  assert.deepEqual(
    rootPackage.pi.extensions,
    manifest.packages.map((entry) => `./${entry.path}/index.ts`),
  );
  for (const extensionPath of rootPackage.pi.extensions) {
    assert.ok(!extensionPath.includes("node_modules"), `${extensionPath} must not point into node_modules`);
    const absolute = resolve(repoRoot, extensionPath);
    assert.ok(existsSync(absolute), `${extensionPath} must exist`);
    assert.ok(statSync(absolute).isFile(), `${extensionPath} must be a file`);
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
  assert.equal(workspacePackages.length, 3);
  for (const { entry, dir, pkg } of workspacePackages) {
    assert.equal(entry.id, entry.path.split("/").pop());
    assert.equal(pkg.name, entry.packageName);
    assert.equal(pkg.name, `@gfgghgftgffg/${entry.id}`);
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.version, entry.version);
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
  assert.deepEqual(
    Object.keys(rootPackage.dependencies).sort(),
    manifest.packages.map((entry) => entry.packageName).sort(),
    "the root bundle must depend on exactly the three workspace packages",
  );
});

test("npm pack contains the three entrypoints, LICENSEs, and maintenance records", () => {
  const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const files = JSON.parse(pack.stdout)[0].files.map((file) => file.path);
  const required = [
    "README.md",
    "maintenance/manifest.json",
    "maintenance/tool-contracts.json",
    ...manifest.packages.flatMap((entry) => [
      `${entry.path}/index.ts`,
      `${entry.path}/package.json`,
      `${entry.path}/LICENSE`,
      `${entry.path}/MAINTENANCE.md`,
    ]),
  ];
  for (const path of required) {
    assert.ok(files.includes(path), `packed tarball is missing ${path}`);
  }
});
