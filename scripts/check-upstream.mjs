#!/usr/bin/env node
// Read-only upstream detection. Adaptation runs locally, not through artifacts.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./lib/files.mjs";
import { buildUpdatePlan, buildUpdateReport } from "./lib/upstream-plan.mjs";
import { fetchUpstreamMetadata, loadInjectedMetadata } from "./lib/upstream-metadata.mjs";

export function loadRepoState(repoRoot) {
  const manifest = readJson(join(repoRoot, "maintenance/manifest.json"));
  const workspaces = manifest.packages.map((entry) => ({ id: entry.id, path: entry.path,
    packageJsonPath: `${entry.path}/package.json`, pkg: readJson(join(repoRoot, entry.path, "package.json")) }));
  return { manifest, workspaces };
}
export async function upstreamPlan(repoRoot, metadata) {
  const state = loadRepoState(repoRoot);
  const fetched = metadata ?? await fetchUpstreamMetadata({ ...state,
    fetchImpl: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(30_000) }) });
  const plan = buildUpdatePlan({ ...state, metadata: fetched });
  if (plan.status === "error") throw new Error(plan.errors.map((error) => error.message).join("\n"));
  return { ...state, plan };
}
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let json = false, metadata;
    for (let i = 2; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg === "--json") json = true;
      else if (arg === "--dry-run") { /* default */ }
      else if (arg === "--metadata" && process.argv[i + 1]) metadata = loadInjectedMetadata(resolve(process.argv[++i]));
      else if (["--help", "-h"].includes(arg)) {
        console.log("Usage: node scripts/check-upstream.mjs [--dry-run] [--json] [--metadata file]\nRead-only; use scripts/local-maintenance.mjs --run for local Pi maintenance.");
        process.exit(0);
      } else throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
    const { plan } = await upstreamPlan(repoRoot, metadata);
    console.log(json ? JSON.stringify(plan, null, 2) : buildUpdateReport({ plan }));
  } catch (error) { console.error(`Upstream check failed: ${error.message}`); process.exitCode = 1; }
}
