#!/usr/bin/env node
/**
 * Privileged candidate application for the write-scoped PR job.
 *
 * This script only reads JSON/text data and writes allowlisted files after
 * strict validation (see scripts/lib/candidate.mjs). It never runs npm,
 * never executes candidate code, needs no dependencies, and is safe to run
 * in a job that holds `contents: write` / `pull-requests: write` only.
 *
 * Usage:
 *   node scripts/validate-candidate.mjs --artifact <candidate.json> [--repo <dir>] [--head-sha <sha>] [--apply]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyCandidateFiles, validateCandidateArtifact } from "./lib/candidate.mjs";

const USAGE = `Usage:
  node scripts/validate-candidate.mjs --artifact <candidate.json> [--repo <dir>] [--head-sha <sha>] [--apply]

Validates the constrained maintenance candidate before any token/commit use.
With --apply it writes the allowlisted files to the checkout.`;

function parseArgs(argv) {
  const args = { artifact: undefined, repo: ".", headSha: undefined, apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case "--artifact": args.artifact = argv[++index]; break;
      case "--repo": args.repo = argv[++index]; break;
      case "--head-sha": args.headSha = argv[++index]; break;
      case "--apply": args.apply = true; break;
      case "--help": case "-h": args.help = true; break;
      default: throw new Error(`未知参数: ${argv[index]}\n\n${USAGE}`);
    }
  }
  if (args.artifact === undefined && argv.includes("--artifact")) throw new Error("--artifact 需要文件路径");
  return args;
}

function fail(message, errors = []) {
  console.error(`Candidate validation FAILED: ${message}`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.artifact) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const repoRoot = resolve(args.repo);
  const artifactPath = resolve(args.artifact);
  const headSha = args.headSha ?? execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  if (args.apply) {
    const porcelain = execFileSync("git", ["-C", repoRoot, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" });
    if (porcelain.trim().length > 0) {
      fail("checkout 存在未提交的 tracked 变更，拒绝应用候选", porcelain.trim().split("\n"));
    }
  }

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (error) {
    fail(`无法读取/解析 ${artifactPath}: ${error.message}`);
  }

  const { ok, errors, writes } = validateCandidateArtifact({ artifact, repoRoot, headSha });
  if (!ok) fail(`artifact=${artifactPath}`, errors);

  console.log(`Candidate valid: status=${artifact.status}, baseCommit=${artifact.baseCommit}, files=${writes.map((write) => write.path).join(", ")}`);
  if (args.apply) {
    const applied = applyCandidateFiles({ repoRoot, writes });
    console.log(`Applied ${applied.length} file(s):`);
    for (const path of applied) console.log(`  - ${path}`);
  } else {
    console.log("Dry validation only (pass --apply to write files).");
  }
  process.exit(0);
} catch (error) {
  console.error(`Candidate validation error: ${error.message}`);
  process.exit(1);
}
