#!/usr/bin/env node
/**
 * Reusable contract-capture entrypoint (phase 1 + phase 2 maintenance).
 *
 * Loads every maintained lean facade AND its pinned upstream engine in
 * separate isolated Pi print-mode sessions (one child process per target), then
 * records each registered tool's description / schema / snippet / guideline
 * character counts and the fixed `ceil(chars / 4)` character proxy.
 *
 * Usage:
 *   node scripts/capture-contracts.mjs            # print report
 *   node scripts/capture-contracts.mjs --write    # refresh maintenance/tool-contracts.json
 *   node scripts/capture-contracts.mjs --check    # fail if the snapshot is stale
 *
 * The estimator is a character proxy, NOT provider tokenization or billing.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHostModulePath } from "./lib/isolated-pi-session.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const snapshotPath = join(repoRoot, "maintenance", "tool-contracts.json");
const manifestPath = join(repoRoot, "maintenance", "manifest.json");
const workerPath = join(scriptDir, "lib", "capture-worker.mjs");

const mode = process.argv.includes("--write")
  ? "write"
  : process.argv.includes("--check")
    ? "check"
    : "report";

const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifestById = new Map(manifest.packages.map((entry) => [entry.id, entry]));
const hostModulePath = resolveHostModulePath({ requireFrom: import.meta.url });

function resolveInstalledPackage(name) {
  const packageDir = join(repoRoot, "node_modules", ...name.split("/"));
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Upstream package is not installed: ${name} (run npm install first)`);
  }
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  let entry = pkg.pi?.extensions?.[0] ?? pkg.main ?? "index.js";
  let entryPath = resolve(packageDir, entry);
  if (existsSync(entryPath) && statSync(entryPath).isDirectory()) entryPath = resolve(entryPath, "index.js");
  if (!existsSync(entryPath)) {
    for (const fallback of ["index.ts", "index.js", "src/index.ts"]) {
      const candidate = resolve(packageDir, fallback);
      if (existsSync(candidate)) {
        entryPath = candidate;
        break;
      }
    }
  }
  if (!existsSync(entryPath)) throw new Error(`Cannot resolve entry for ${name}: ${entry}`);
  return { packageDir, entryPath, version: pkg.version };
}

function buildTargets() {
  const targets = [];
  for (const workspace of rootPackage.workspaces ?? []) {
    const base = workspace.replace(/\/\*$/, "");
    for (const id of readdirSync(join(repoRoot, base)).sort()) {
      const packageDir = join(repoRoot, base, id);
      const packageJsonPath = join(packageDir, "package.json");
      if (!existsSync(packageJsonPath)) continue;
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      const mapping = manifestById.get(id);
      if (!mapping) throw new Error(`maintenance/manifest.json has no entry for ${id}`);
      const leanEntry = resolve(packageDir, pkg.pi?.extensions?.[0] ?? "index.ts");
      const upstream = resolveInstalledPackage(mapping.upstreamPackage);
      targets.push({
        id,
        kind: "lean",
        packageName: pkg.name,
        version: pkg.version,
        entryPath: leanEntry,
        upstreamPackage: mapping.upstreamPackage,
        upstreamVersion: mapping.upstreamVersion,
      });
      targets.push({
        id: `upstream-${id}`,
        kind: "upstream",
        packageName: mapping.upstreamPackage,
        version: upstream.version,
        entryPath: upstream.entryPath,
        upstreamPackage: mapping.upstreamPackage,
        upstreamVersion: mapping.upstreamVersion,
      });
    }
  }
  return targets;
}

function captureTarget(target) {
  const workDir = mkdtempSync(join(tmpdir(), "amox-contract-capture-"));
  const inputPath = join(workDir, "input.json");
  const resultPath = join(workDir, "result.json");
  writeFileSync(inputPath, `${JSON.stringify({
    id: target.id,
    extensionPath: target.entryPath,
    resultPath,
    hostModulePath,
  }, null, 2)}\n`);
  const child = spawnSync(process.execPath, [workerPath, inputPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (child.status !== 0) {
    rmSync(workDir, { recursive: true, force: true });
    throw new Error(`Capture failed for ${target.packageName}:\n${child.stderr || child.stdout}`);
  }
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  rmSync(workDir, { recursive: true, force: true });
  if (result.loadErrors.length > 0 || result.runtimeErrors.length > 0) {
    throw new Error(
      `Extension load errors for ${target.packageName}:\n${JSON.stringify({ loadErrors: result.loadErrors, runtimeErrors: result.runtimeErrors }, null, 2)}`,
    );
  }
  return { target, result };
}

function totals(tools) {
  return {
    registeredProxyTokens: tools.reduce((sum, tool) => sum + tool.proxyTokens, 0),
    activeProxyTokens: tools.reduce((sum, tool) => sum + (tool.active ? tool.proxyTokens : 0), 0),
  };
}

function snapshotFrom(captures) {
  const upstream = {};
  const lean = {};
  let piVersion = "unknown";
  for (const { target, result } of captures) {
    piVersion = result.piVersion;
    const record = {
      package: target.packageName,
      version: target.version,
      entry: relative(repoRoot, target.entryPath),
      registeredTools: result.tools.map((tool) => tool.name),
      activeToolNames: result.activeToolNames,
      totals: totals(result.tools),
      tools: result.tools,
    };
    if (target.kind === "upstream") {
      upstream[target.packageName] = record;
    } else {
      lean[target.packageName] = { ...record, upstreamPackage: target.upstreamPackage };
    }
  }
  return {
    schemaVersion: 1,
    estimator: "fixed character proxy: ceil(characters / 4); NOT provider tokenization or billing",
    environment: {
      piVersion,
      nodeVersion: process.version,
    },
    upstream,
    lean,
  };
}

function comparable(snapshot) {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    estimator: snapshot.estimator,
    upstream: snapshot.upstream,
    lean: snapshot.lean,
  });
}

function printReport(snapshot) {
  const rows = [];
  for (const [id, leanRecord] of Object.entries(snapshot.lean)) {
    const upstreamRecord = snapshot.upstream[leanRecord.upstreamPackage];
    if (!upstreamRecord) continue;
    const upstreamTokens = upstreamRecord.totals.registeredProxyTokens;
    const leanTokens = leanRecord.totals.registeredProxyTokens;
    const saved = upstreamTokens - leanTokens;
    const percent = upstreamTokens === 0 ? "0.0" : ((saved / upstreamTokens) * 100).toFixed(1);
    rows.push({
      family: id,
      upstream: `${leanRecord.upstreamPackage}@${upstreamRecord.version}`,
      upstreamTools: upstreamRecord.registeredTools.join(","),
      upstreamTokens,
      leanTools: leanRecord.registeredTools.join(","),
      leanTokens,
      saved,
      percent,
    });
  }
  console.log(`\nCharacter-proxy report (ceil(chars / 4), Pi ${snapshot.environment.piVersion}, isolated print mode):\n`);
  console.table(rows);
  for (const [name, record] of Object.entries(snapshot.upstream)) {
    console.log(`${name}@${record.version} registered tools:`);
    for (const tool of record.tools) {
      console.log(`  ${tool.name.padEnd(24)} total=${String(tool.chars.total).padStart(6)} proxyTokens=${String(tool.proxyTokens).padStart(6)} active=${tool.active}`);
    }
  }
  for (const [name, record] of Object.entries(snapshot.lean)) {
    console.log(`${name}@${record.version} registered tools:`);
    for (const tool of record.tools) {
      console.log(`  ${tool.name.padEnd(24)} total=${String(tool.chars.total).padStart(6)} proxyTokens=${String(tool.proxyTokens).padStart(6)} active=${tool.active}`);
    }
  }
}

const targets = buildTargets();
const captures = targets.map(captureTarget);
const snapshot = snapshotFrom(captures);

if (mode === "report") {
  printReport(snapshot);
  process.exit(0);
}

if (mode === "write") {
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const previous = existsSync(snapshotPath) ? readFileSync(snapshotPath, "utf8") : undefined;
  if (previous === text) {
    console.log(`Tool contracts already current: ${relative(repoRoot, snapshotPath)}`);
  } else {
    writeFileSync(snapshotPath, text);
    console.log(`Wrote ${relative(repoRoot, snapshotPath)}`);
  }
  printReport(snapshot);
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  console.error(`Missing ${relative(repoRoot, snapshotPath)}; run: npm run contracts`);
  process.exit(1);
}
const tracked = JSON.parse(readFileSync(snapshotPath, "utf8"));
if (comparable(tracked) !== comparable(snapshot)) {
  console.error("Tool-contract snapshot is stale.");
  for (const [key, value] of Object.entries({ upstream: snapshot.upstream, lean: snapshot.lean })) {
    for (const packageName of Object.keys(value)) {
      const previousTools = tracked[key]?.[packageName]?.registeredTools?.join(",") ?? "(missing)";
      const currentTools = value[packageName].registeredTools.join(",");
      if (previousTools !== currentTools) {
        console.error(`  ${packageName}: tools ${previousTools} -> ${currentTools}`);
      }
    }
  }
  console.error("Run: npm run contracts");
  process.exit(1);
}
console.log("Tool-contract snapshot is current.");
