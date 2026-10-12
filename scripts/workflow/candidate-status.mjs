#!/usr/bin/env node
/**
 * Workflow helper: translate the staged candidate status into strict enum
 * step outputs. Never emits anything derived from untrusted free-text, so the
 * workflow can use the outputs in `if:` expressions safely.
 *
 * Usage: node scripts/workflow/candidate-status.mjs --artifact <candidate.json>
 * Outputs (to $GITHUB_OUTPUT when present): status=<enum>, has_candidate=true|false
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANDIDATE_STATUSES } from "../lib/candidate.mjs";

function parseArgs(argv) {
  const args = { artifact: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--artifact") args.artifact = argv[++index];
  }
  if (!args.artifact) throw new Error("Usage: node scripts/workflow/candidate-status.mjs --artifact <candidate.json>");
  return args;
}

function emit(outputs) {
  const text = `${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
  else process.stdout.write(text);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const path = resolve(args.artifact);
  if (!existsSync(path)) {
    emit({ status: "no-update", has_candidate: "false" });
    console.log("No candidate artifact: no upstream update.");
    process.exit(0);
  }
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  if (!CANDIDATE_STATUSES.includes(artifact.status)) {
    throw new Error(`candidate.json 状态非法: ${JSON.stringify(artifact.status)}`);
  }
  if (!Array.isArray(artifact.files) || artifact.files.length === 0) {
    throw new Error("candidate.json 没有任何文件，拒绝标记为候选");
  }
  emit({ status: artifact.status, has_candidate: "true" });
  console.log(`Candidate status: ${artifact.status}`);
  process.exit(0);
} catch (error) {
  console.error(`candidate-status error: ${error.message}`);
  process.exit(1);
}
