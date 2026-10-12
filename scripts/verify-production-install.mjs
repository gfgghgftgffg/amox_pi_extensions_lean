#!/usr/bin/env node
/**
 * Fresh production-install verification (phase 1 phase-2-ready entrypoint).
 *
 * Reproduces what Pi 1.1.0 does for a Git package
 * (`npm install --omit=dev --legacy-peer-deps`), plus `--ignore-scripts` for
 * test safety, then loads all three monorepo entrypoints through the real Pi
 * host loader from that production tree.
 *
 * Usage: node scripts/verify-production-install.mjs [--keep]
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance", "manifest.json"), "utf8"));

const failures = [];
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    failures.push(message);
    console.log(`  FAIL ${message}`);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "amox-production-install-"));
const target = join(tempRoot, "repo");
console.log(`Production install target: ${target}`);

try {
  cpSync(repoRoot, target, {
    recursive: true,
    filter(source) {
      const rel = relative(repoRoot, source);
      if (rel === "") return true;
      const top = rel.split(/[\\/]/)[0];
      return top !== "node_modules" && top !== ".git" && top !== ".tmp" && !top.endsWith(".tgz");
    },
  });

  console.log("\n[1] npm install --omit=dev --legacy-peer-deps --ignore-scripts");
  const install = spawnSync("npm", ["install", "--omit=dev", "--legacy-peer-deps", "--ignore-scripts"], {
    cwd: target,
    encoding: "utf8",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  });
  if (install.status !== 0) {
    console.error(install.stdout?.slice(-4000));
    console.error(install.stderr?.slice(-4000));
    throw new Error("production install failed");
  }
  console.log("  ok   install exited 0");

  console.log("\n[2] production dependency tree");
  for (const entry of manifest.packages) {
    const packageJsonPath = join(target, "node_modules", ...entry.upstreamPackage.split("/"), "package.json");
    check(existsSync(packageJsonPath), `${entry.upstreamPackage} installed`);
    if (existsSync(packageJsonPath)) {
      const version = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
      check(version === entry.upstreamVersion, `${entry.upstreamPackage} is exactly ${entry.upstreamVersion} (got ${version})`);
    }
    const workspacePath = join(target, "node_modules", ...entry.packageName.split("/"));
    const workspaceExists = existsSync(workspacePath);
    check(workspaceExists, `${entry.packageName} workspace link installed`);
    if (workspaceExists && lstatSync(workspacePath).isSymbolicLink()) {
      console.log(`       link -> ${readlinkSync(workspacePath)}`);
    }
  }
  for (const peer of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
    check(
      !existsSync(join(target, "node_modules", ...peer.split("/"))),
      `host-provided peer ${peer} is NOT installed by production install`,
    );
  }
  const productionLock = JSON.parse(readFileSync(join(target, "package-lock.json"), "utf8"));
  const leakedPeers = Object.entries(productionLock.packages ?? {})
    .filter(([path, entry]) => /node_modules\/(@earendil-works\/|typebox$)/.test(path) && !entry.dev)
    .map(([path]) => path);
  check(leakedPeers.length === 0, `production lockfile has no runtime host peers (${leakedPeers.join(", ") || "none"})`);
  check(!existsSync(join(target, "node_modules", "typebox")), "host-provided typebox peer is NOT installed by production install");

  console.log("\n[3] load the three entrypoints through the real Pi host loader");
  const workDir = join(tempRoot, "work");
  mkdirSync(workDir, { recursive: true });
  for (const entry of manifest.packages) {
    const entryPath = join(target, entry.path, entry.entry);
    const inputPath = join(workDir, `${entry.id}.input.json`);
    const resultPath = join(workDir, `${entry.id}.result.json`);
    // No hostModulePath: the worker resolves the managed Pi installation because
    // this production tree has no local dev dependency.
    writeFileSync(inputPath, `${JSON.stringify({ id: entry.id, extensionPath: entryPath, resultPath }, null, 2)}\n`);
    const worker = spawnSync(process.execPath, [join(target, "scripts", "lib", "capture-worker.mjs"), inputPath], {
      cwd: target,
      encoding: "utf8",
    });
    if (worker.status !== 0) {
      console.error(worker.stderr?.slice(-4000));
      check(false, `${entry.id} worker exited 0`);
      continue;
    }
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    check(result.loadErrors.length === 0, `${entry.id} has no load errors`);
    check(result.runtimeErrors.length === 0, `${entry.id} has no runtime errors`);
    check(result.tools.length === 1, `${entry.id} registers exactly one tool (${result.tools.map((tool) => tool.name).join(",")})`);
    check(
      result.loadedPaths.length === 1 && resolve(result.loadedPaths[0]) === resolve(entryPath),
      `${entry.id} loaded only its own entrypoint`,
    );
    console.log(`       ${entry.id}: pi ${result.piVersion}, tool ${result.tools.map((tool) => tool.name).join(",")}`);
  }

  console.log("\n[4] root pi.extensions discovery");
  check(rootPackage.pi.extensions.length === 3, "root declares exactly three pi.extensions entries");
  for (const extensionPath of rootPackage.pi.extensions) {
    check(existsSync(join(target, extensionPath)), `${extensionPath} exists in the production tree`);
  }

  if (failures.length > 0) {
    console.error(`\nPRODUCTION INSTALL VERIFICATION FAILED (${failures.length})`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nProduction install verification passed.");
  }
} finally {
  if (keep) {
    console.log(`Kept: ${tempRoot}`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
