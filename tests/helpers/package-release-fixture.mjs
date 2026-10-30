import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function releaseFixture({ batchVersion, versions = {}, packageIds } = {}) {
  const root = mkdtempSync(join(tmpdir(), "amox-package-release-"));
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const write = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); };
  const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(source, "maintenance/manifest.json"), "utf8"));
  pkg.version = batchVersion ?? "1.0.0";
  delete manifest.release;
  const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { "": { name: pkg.name, version: pkg.version } } };
  for (const entry of manifest.packages) {
    const directory = join(source, entry.path);
    for (const file of ["index.ts", "package.json", "LICENSE", "MAINTENANCE.md", "README.md", "README.zh-CN.md"]) write(`${entry.path}/${file}`, readFileSync(join(directory, file), "utf8"));
    const workspace = read(`${entry.path}/package.json`);
    workspace.version = versions[entry.id] ?? "1.0.0"; entry.version = workspace.version;
    write(`${entry.path}/package.json`, workspace);
    lock.packages[entry.path] = { name: workspace.name, version: workspace.version, dependencies: workspace.dependencies };
    for (const [name, version] of Object.entries(workspace.dependencies)) lock.packages[`node_modules/${name}`] = { version };
  }
  if (packageIds !== undefined) manifest.release = { version: pkg.version, baseCommit: "a".repeat(40), packageIds };
  write("package.json", pkg); write("maintenance/manifest.json", manifest); write("package-lock.json", lock);
  const snapshot = JSON.parse(readFileSync(join(source, "maintenance/tool-contracts.json"), "utf8"));
  for (const entry of manifest.packages) snapshot.lean[entry.packageName].version = entry.version;
  write("maintenance/tool-contracts.json", snapshot);
  for (const file of ["README.md", "README.zh-CN.md", ".npmrc"]) write(file, readFileSync(join(source, file), "utf8"));
  const git = (args) => execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", "-c", "commit.gpgSign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { encoding: "utf8" }).trim();
  return { root, read, write, git, manifest,
    commit() { git(["init", "--quiet"]); git(["add", "."]); git(["commit", "--quiet", "-m", "fixture baseline"]); return git(["rev-parse", "HEAD"]); },
    cleanup() { rmSync(root, { recursive: true, force: true }); } };
}
