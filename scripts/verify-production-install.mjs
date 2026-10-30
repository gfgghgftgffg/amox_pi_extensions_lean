#!/usr/bin/env node
// Pack and install each workspace in an independent npm prefix, exactly as
// the per-extension installer does. No sibling or host peer may be installed.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installPackedExtension, packageEntries } from "./lib/extension-package.mjs";
import { checkedRun } from "./lib/process.mjs";
import { resolveHostModulePath } from "./lib/isolated-pi-session.mjs";
import { resolveUpstreamRuntimeEntry } from "./lib/upstream-runtime.mjs";
import { parsePackageIds } from "./lib/package-selection.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostModulePath = resolveHostModulePath({ requireFrom: import.meta.url });
const allEntries = packageEntries(repoRoot);
const entries = packageEntries(repoRoot, parsePackageIds(process.argv.slice(2), { flags: ["--keep"] }));
console.log(`Host module (from dev checkout): ${hostModulePath}`);
const tempRoot = mkdtempSync(join(tmpdir(), "amox-production-install-"));
const failures = [];
function check(ok, message) {
  console.log(`  ${ok ? "ok" : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
}
try {
  check(!JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).pi, "root is not an install-all Pi package");
  for (const entry of entries) {
    console.log(`\nIndependent production install: ${entry.packageName}`);
    const prefix = join(tempRoot, entry.id);
    const packageDir = installPackedExtension({ repoRoot, entry, prefix, outDir: join(tempRoot, "archives") });
    for (const sibling of allEntries.filter((item) => item.id !== entry.id)) {
      check(!existsSync(join(prefix, "node_modules", ...sibling.packageName.split("/"))), `${sibling.packageName} is NOT installed`);
      check(!existsSync(join(prefix, "node_modules", ...sibling.upstreamPackage.split("/"))), `${sibling.upstreamPackage} is NOT installed`);
    }
    for (const peer of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
      check(!existsSync(join(prefix, "node_modules", ...peer.split("/"))), `host peer ${peer} is NOT installed`);
    }
    const upstream = JSON.parse(readFileSync(join(prefix, "node_modules", ...entry.upstreamPackage.split("/"), "package.json"), "utf8"));
    check(upstream.version === entry.upstreamVersion, `${entry.upstreamPackage} is pinned to ${entry.upstreamVersion}`);
    if (entry.upstreamEntry !== undefined) {
      resolveUpstreamRuntimeEntry(join(prefix, "node_modules", ...entry.upstreamPackage.split("/")), entry.upstreamEntry);
      check(true, `${entry.upstreamPackage}/${entry.upstreamEntry} exists in the fresh production install`);
    }
    const workDir = join(tempRoot, "workers");
    mkdirSync(workDir, { recursive: true });
    const input = join(workDir, `${entry.id}.input.json`);
    const resultPath = join(workDir, `${entry.id}.result.json`);
    const extensionPath = join(packageDir, entry.entry);
    writeFileSync(input, JSON.stringify({ id: entry.id, extensionPath, resultPath, hostModulePath }));
    checkedRun(process.execPath, [join(repoRoot, "scripts/lib/capture-worker.mjs"), input], { cwd: repoRoot });
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    check(result.loadErrors.length === 0 && result.runtimeErrors.length === 0, `${entry.id} loads without errors`);
    check(result.tools.length === 1, `${entry.id} registers exactly one tool`);
    check(result.loadedPaths.length === 1 && resolve(result.loadedPaths[0]) === resolve(extensionPath), `${entry.id} loads only its own entrypoint`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("\nProduction install verification passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (process.argv.includes("--keep")) console.log(`Kept: ${tempRoot}`);
  else rmSync(tempRoot, { recursive: true, force: true });
}
