#!/usr/bin/env node
/**
 * Upstream maintenance check / candidate staging.
 *
 * Default mode is a read-only report (`--dry-run`): it never modifies tracked
 * files. With `--apply` it stages a dependency-only candidate bundle in an
 * untracked output directory:
 *
 *   <out-dir>/candidate.json          constrained data patch for the PR job
 *   <out-dir>/update-report.md        tracked maintenance report
 *   <out-dir>/diagnostics/*           install/capture/check evidence
 *
 * The candidate never edits adapter code, prompts, schemas or descriptions;
 * contract drift is reported and the accepted snapshot is preserved until a
 * human (or an agent following the saved maintenance prompt) makes the minimal
 * adjustment.
 *
 * Usage:
 *   node scripts/check-upstream.mjs [--dry-run] [--json] [--metadata <file>]
 *   node scripts/check-upstream.mjs --apply [--out-dir <dir>] [--metadata <file>] [--refresh-snapshot]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareCandidate } from "./lib/candidate-prepare.mjs";
import { buildUpdatePlan, serializeJson } from "./lib/upstream-plan.mjs";
import { fetchUpstreamMetadata, loadInjectedMetadata } from "./lib/upstream-metadata.mjs";

const USAGE = `Usage:
  node scripts/check-upstream.mjs [--dry-run] [--json] [--metadata <file>]
  node scripts/check-upstream.mjs --apply [--out-dir <dir>] [--metadata <file>] [--refresh-snapshot]

  --dry-run           report only (default); never modifies tracked files
  --apply             stage a dependency-only candidate bundle in <out-dir>
  --out-dir <dir>     candidate output directory (default: .maintenance-candidate)
  --metadata <file>   injected metadata JSON (offline tests / manual runs)
  --refresh-snapshot  also allow a no-drift snapshot metadata refresh
  --json              print the plan as JSON (dry-run)
  --help              show this help`;

function parseArgs(argv) {
  const args = { apply: false, dryRun: false, metadata: undefined, outDir: undefined, refreshSnapshot: false, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--dry-run": args.dryRun = true; break;
      case "--apply": args.apply = true; break;
      case "--refresh-snapshot": args.refreshSnapshot = true; break;
      case "--json": args.json = true; break;
      case "--help": case "-h": args.help = true; break;
      case "--metadata": args.metadata = argv[++index]; break;
      case "--out-dir": args.outDir = argv[++index]; break;
      default: throw new Error(`未知参数: ${arg}\n\n${USAGE}`);
    }
  }
  if (args.metadata === undefined && argv.includes("--metadata")) throw new Error("--metadata 需要文件路径");
  if (args.outDir === undefined && argv.includes("--out-dir")) throw new Error("--out-dir 需要目录路径");
  if (args.apply && args.dryRun) throw new Error("--apply 与 --dry-run 不能同时使用");
  return args;
}

function loadRepoState(repoRoot) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance", "manifest.json"), "utf8"));
  const baselineSnapshot = JSON.parse(readFileSync(join(repoRoot, "maintenance", "tool-contracts.json"), "utf8"));
  const workspaces = manifest.packages.map((entry) => {
    const packageJsonPath = `${entry.path}/package.json`;
    return {
      id: entry.id,
      path: entry.path,
      packageJsonPath,
      pkg: JSON.parse(readFileSync(join(repoRoot, packageJsonPath), "utf8")),
    };
  });
  return { manifest, baselineSnapshot, workspaces };
}

function printPlan(plan) {
  console.log("Upstream maintenance check (dry-run report only)");
  for (const packagePlan of plan.packagePlans) {
    console.log(
      `- ${packagePlan.id}: ${packagePlan.upstreamPackage} ${packagePlan.currentVersion} -> latest stable ${packagePlan.latestVersion} [${packagePlan.versionChange === "bump" ? "UPDATE" : "no change"}]`,
    );
  }
  for (const leanPlan of plan.leanPlans) {
    if (leanPlan.changed) {
      console.log(`- ${leanPlan.id}: lean repository HEAD changed (${leanPlan.currentCommit} -> ${leanPlan.remoteHead}) [manual reuse review required; leanCommit baseline untouched]`);
    }
  }
  for (const warning of plan.warnings) console.log(`  warning: ${warning}`);
  console.log(`status: ${plan.status}`);
}

function writeDiagnostics({ outDir, plan, metadata }) {
  const diagnosticsDir = join(outDir, "diagnostics");
  mkdirSync(diagnosticsDir, { recursive: true });
  writeFileSync(join(diagnosticsDir, "plan.json"), serializeJson(plan));
  writeFileSync(join(diagnosticsDir, "metadata.json"), serializeJson(metadata));
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const { manifest, baselineSnapshot, workspaces } = loadRepoState(repoRoot);
  const metadata = args.metadata
    ? loadInjectedMetadata(resolve(args.metadata))
    : await fetchUpstreamMetadata({ manifest, workspaces });
  const plan = buildUpdatePlan({ manifest, workspaces, metadata });

  if (plan.status === "error") {
    console.error("Upstream maintenance check failed (元数据/manifest 错误，拒绝静默报告无更新):");
    for (const error of plan.errors) console.error(`  - ${error.message}`);
    process.exit(1);
  }

  if (!args.apply) {
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
    if (plan.warnings.length > 0 && args.json) for (const warning of plan.warnings) console.error(`warning: ${warning}`);
    process.exit(0);
  }

  if (plan.status === "no-update" && !args.refreshSnapshot) {
    console.log("No upstream update detected; nothing to stage (no tracked mutations).");
    process.exit(0);
  }

  const outDir = resolve(args.outDir ?? join(repoRoot, ".maintenance-candidate"));
  const result = await prepareCandidate({
    repoRoot,
    outDir,
    plan,
    baselineSnapshot,
    refreshSnapshot: args.refreshSnapshot,
  });
  if (result.status === "no-update") {
    console.log("No upstream update detected; nothing to stage (no tracked mutations).");
    process.exit(0);
  }
  writeDiagnostics({ outDir, plan, metadata: plan.metadata ?? metadata });
  const files = result.artifact.files.map((file) => file.path).sort();
  console.log(`Candidate staged: status=${result.status}`);
  console.log(`Output: ${relative(repoRoot, outDir) || outDir}`);
  for (const file of files) console.log(`  - ${file}`);
  if (result.status === "drift") {
    console.log("Structural contract drift detected: accepted snapshot preserved; human minimal adjustment required.");
  }
  if (result.status === "failed") {
    console.log("Install/capture/check failure recorded: draft candidate staged with diagnostics.");
  }
  if (result.status === "lean-review") {
    console.log("Lean repository HEAD changed: manual reuse review required; leanCommit baseline untouched.");
  }
  process.exit(0);
} catch (error) {
  console.error(`Upstream maintenance check error: ${error.message}`);
  process.exit(1);
}
