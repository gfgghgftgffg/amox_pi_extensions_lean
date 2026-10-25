#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/process.mjs";

// Upstream advisories are informational by repository-owner policy. A missing
// or invalid audit report is an execution error, never a clean audit result.
export function auditDependencies({ production = false, execute = run } = {}) {
  const args = ["audit", "--json", "--fetch-retries=0", "--fetch-timeout=60000", ...(production ? ["--omit=dev"] : [])];
  const result = execute("npm", args, { timeout: 180000, maxBuffer: 10_000_000 });
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error("Dependency audit command failed; no valid report confirmed");
  let report;
  try { report = JSON.parse(result.stdout.replace(/^\uFEFF/, "")); }
  catch { throw new Error("Dependency audit returned invalid JSON; no valid report confirmed"); }
  const counts = report?.metadata?.vulnerabilities;
  const severities = ["info", "low", "moderate", "high", "critical"];
  if (report.error || !report.vulnerabilities || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)
    || !counts || ![...severities, "total"].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
    || severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total
    || (result.status === 1 && counts.total === 0)) throw new Error("Dependency audit did not provide a complete vulnerability report");
  return { scope: production ? "production" : "all", findings: counts.total > 0, counts, report };
}

export function auditSummary(result) {
  return `Dependency audit (${result.scope}): ${result.counts.total} affected packages; high=${result.counts.high}, critical=${result.counts.critical}. Upstream findings are warnings, not release blockers.`;
}

export function parseAuditArguments(args) {
  const outputIndex = args.indexOf("--output");
  const output = outputIndex < 0 ? undefined : args[outputIndex + 1];
  if (outputIndex >= 0 && (!output || output.startsWith("--"))) throw new Error("--output needs a file path");
  const flags = outputIndex < 0 ? args : args.filter((_, i) => i !== outputIndex && i !== outputIndex + 1);
  if (flags.some((arg) => arg !== "--omit=dev")) throw new Error("Unsupported audit argument");
  return { production: flags.includes("--omit=dev"), output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { production, output } = parseAuditArguments(process.argv.slice(2));
    const result = auditDependencies({ production });
    if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(result.report, null, 2)}\n`); }
    console.log(JSON.stringify(result.report, null, 2));
    const summary = auditSummary(result); console.log(summary);
    if (result.findings) console.warn(process.env.GITHUB_ACTIONS === "true" ? `::warning title=Upstream dependency advisories::${summary}` : `WARNING: ${summary}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
