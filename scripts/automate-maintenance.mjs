#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCandidateFiles, validateCandidateArtifact } from "./lib/candidate.mjs";
import { collectSources } from "./lib/upstream-sources.mjs";
import { applyAdaptedBundle, buildAdaptedBundle, expectedGenerated, validateAdaptedBundle } from "./lib/adapted-candidate.mjs";
import { AGENT_REPORT, agentWritable, assertRegularPath, fileInventory, generatedWritable, jsonText, readJson } from "./lib/automation-policy.mjs";
import { checkedRun, run } from "./lib/process.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase = process.argv[2];
const flag = process.argv.indexOf("--dir");
const outDir = resolve(flag < 0 ? join(repoRoot, ".maintenance-candidate") : process.argv[flag + 1]);
const head = () => execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const git = (args) => execFileSync("git", ["-C", repoRoot, "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8" }).trim();
const setOutput = (name, value) => {
  console.log(`${name}=${value}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: "a" });
};
function baselineClean() {
  if (git(["status", "--porcelain", "--untracked-files=no"])) throw new Error("Requires a clean tracked baseline checkout");
}
function changedFiles(manifest, { generated = false } = {}) {
  const tracked = execFileSync("git", ["-C", repoRoot, "diff", "--name-only", "-z", "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const untracked = execFileSync("git", ["-C", repoRoot, "ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const files = [...new Set([...tracked, ...untracked])].sort();
  return files.map((path) => {
    if (!agentWritable(path, manifest) && !(generated && generatedWritable(path, manifest))) throw new Error(`Unexpected checkout modification: ${path}`);
    return { path, content: readFileSync(assertRegularPath(repoRoot, path), "utf8") };
  });
}
function measureDocs(manifest, version, baseline) {
  const snapshot = readJson(join(repoRoot, "maintenance/tool-contracts.json"));
  let upstreamTotal = 0, leanTotal = 0;
  for (const entry of manifest.packages) {
    const lean = snapshot.lean[entry.packageName];
    const upstream = snapshot.upstream[entry.upstreamPackage];
    const oldVersion = baseline.packages.find((item) => item.id === entry.id).version;
    upstreamTotal += upstream.totals.registeredProxyTokens;
    leanTotal += lean.totals.registeredProxyTokens;
    for (const file of ["README.md", "README.zh-CN.md"]) {
      const path = join(repoRoot, entry.path, file);
      let text = readFileSync(path, "utf8");
      // Replace the existing measured section, not append contradictory stats.
      const title = file === "README.zh-CN.md" ? "## 上下文占用（字符代理）" : "## Context footprint (character proxy)";
      const section = `${title}\n\n<!-- amox-measurement:start -->\n| Package | Version | Registered character proxy |\n| --- | --- | ---: |\n| ${entry.packageName} | ${version} | ${lean.totals.registeredProxyTokens} |\n| ${entry.upstreamPackage} | ${entry.upstreamVersion} | ${upstream.totals.registeredProxyTokens} |\n\nFixed ceil(characters / 4), not provider billing tokens.\n<!-- amox-measurement:end -->\n\n`;
      const start = text.search(file === "README.zh-CN.md" ? /^## 上下文占用.*$/m : /^## (Context|Token|Prompt|Measured).*$/mi);
      if (start >= 0) {
        const next = text.indexOf("\n## ", start + 3);
        text = text.slice(0, start) + section + (next < 0 ? "" : text.slice(next + 1));
      } else text = text.trimEnd() + `\n\n${section}`;
      text = text.replaceAll(`${entry.packageName}@${oldVersion}`, `${entry.packageName}@${version}`)
        .replaceAll(`\`${oldVersion}\``, `\`${version}\``);
      writeFileSync(path, text);
    }
  }
  const path = join(repoRoot, "README.md");
  const text = readFileSync(path, "utf8").replace(/\*\*\d+(?:\.\d+)?%\*\*/, `**${((1 - leanTotal / upstreamTotal) * 100).toFixed(1)}%**`);
  writeFileSync(path, text);
}

try {
  if (phase === "prepare") {
    baselineClean();
    mkdirSync(outDir, { recursive: true });
    const output = checkedRun(process.execPath, [join(repoRoot, "scripts/check-upstream.mjs"), "--apply", "--out-dir", outDir], { cwd: repoRoot, timeout: 35 * 60_000 });
    console.log(output);
    const candidatePath = join(outDir, "candidate.json");
    if (output.includes("No upstream update detected; nothing to stage") || !existsSync(candidatePath)) { setOutput("has_candidate", "false"); process.exit(0); }
    const candidate = readJson(candidatePath);
    const validation = await validateCandidateArtifact({ artifact: candidate, repoRoot, headSha: head() });
    if (!validation.ok) throw new Error(validation.errors.join("\n"));
    const manifest = readJson(join(repoRoot, "maintenance/manifest.json"));
    const plan = readJson(join(outDir, "diagnostics/plan.json"));
    if (plan.updateRequired && !validation.writes.some((file) => file.path === "package-lock.json")) throw new Error("Dependency install failed; inspect diagnostics, not an adaptable candidate");
    collectSources({ repoRoot, outDir, plan, manifest });
    const contextDiagnostics = join(outDir, "context", "diagnostics");
    mkdirSync(contextDiagnostics, { recursive: true });
    for (const name of ["capture.log", "contract-diff.json", "candidate-tool-contracts.json", "check.log", "contracts-check.log"]) {
      const path = join(outDir, "diagnostics", name);
      if (existsSync(path)) writeFileSync(join(contextDiagnostics, name), readFileSync(path, "utf8").slice(-1_000_000));
    }
    setOutput("has_candidate", "true");
  } else if (phase === "adapt") {
    baselineClean();
    const dependencyCandidate = readJson(join(outDir, "candidate.json"));
    const plan = readJson(join(outDir, "diagnostics/plan.json"));
    const manifest = readJson(join(repoRoot, "maintenance/manifest.json"));
    const baseCommit = head();
    const checked = await validateCandidateArtifact({ artifact: dependencyCandidate, repoRoot, headSha: baseCommit });
    if (!checked.ok) throw new Error(checked.errors.join("\n"));
    applyCandidateFiles({ repoRoot, writes: checked.writes });
    const { runMaintenanceAgent } = await import("./lib/maintenance-agent.mjs");
    const review = await runMaintenanceAgent({ repoRoot, contextRoot: join(outDir, "context"), manifest, plan });
    const files = changedFiles(manifest, { generated: true }).filter((file) => agentWritable(file.path, manifest));
    const bundle = buildAdaptedBundle({ baseCommit, dependencyCandidate, plan, review, files });
    writeFileSync(join(outDir, "adapted.json"), jsonText(bundle));
    console.log("Agent proposal saved. No test success is claimed until independent verification.");
  } else if (phase === "verify") {
    baselineClean();
    const bundle = readJson(join(outDir, "adapted.json"));
    const checked = await validateAdaptedBundle({ bundle, repoRoot, headSha: head() });
    const baseCommit = head();
    const expected = expectedGenerated({ repoRoot, dependencyWrites: checked.dependencyWrites, plan: checked.plan });
    applyAdaptedBundle(repoRoot, checked);
    applyCandidateFiles({ repoRoot, writes: [...expected.map].filter(([path]) => path !== "maintenance/tool-contracts.json" && path !== "maintenance/update-report.md").map(([path, content]) => ({ path, content })) });
    // No model key or repository write token exists in this job.
    checkedRun("npm", ["ci", "--ignore-scripts"], { cwd: repoRoot });
    checkedRun("npm", ["run", "contracts"], { cwd: repoRoot });
    // Stats are regenerated by trusted code, never supplied by the model.
    measureDocs(expected.manifest, expected.version, checked.baseline);
    const report = `# Upstream maintenance candidate\n\n<!-- amox-maintenance-adapted; verified -->\n\nBase: ${baseCommit}\nRelease after human merge: v${expected.version}\n\n${bundle.review.summary}\n\nDetailed source/API review: [agent-review.md](agent-review.md).\n\nLean source changes were reviewed individually, not copied wholesale. Tests, contract capture, standalone production installs and both high-level npm audits must pass before this report is exported. Human diff review is still required.\n`;
    writeFileSync(join(repoRoot, "maintenance/update-report.md"), report);
    // Existing Git-based tests require a clean proposal tree. TEMP runner only;
    // the artifact remains bound to the original, immutable baseline SHA.
    const beforeTest = changedFiles(checked.baseline, { generated: true });
    git(["add", "--", ...beforeTest.map((file) => file.path)]);
    git(["-c", "commit.gpgSign=false", "-c", "user.name=Maintenance verification", "-c", "user.email=maintenance@example.invalid", "commit", "--quiet", "-m", "Temporary verified proposal"]);
    const verificationCommit = head();
    for (const args of [["run", "check"], ["run", "contracts:check"], ["run", "verify:production"], ["audit", "--audit-level=high"], ["audit", "--omit=dev", "--audit-level=high"]]) {
      mkdirSync(join(outDir, "verification"), { recursive: true });
      writeFileSync(join(outDir, "verification/current-step.json"), jsonText({ command: "npm", args, startedAt: new Date().toISOString() }));
      const result = run("npm", args, { cwd: repoRoot, timeout: 35 * 60_000 });
      const log = `$ npm ${args.join(" ")}\n${result.stdout || ""}\n${result.stderr || ""}`;
      writeFileSync(join(outDir, "verification", `${args.join("-").replace(/[^\w-]/g, "")}.log`), log);
      if (result.error || result.status !== 0) throw new Error(`Independent verification failed: npm ${args.join(" ")}; see verification artifact`);
    }
    if (head() !== verificationCommit) throw new Error("Checks rewrote the verification commit; refusing to export a different proposal");
    if (git(["status", "--porcelain", "--untracked-files=all"])) throw new Error("Checks modified the candidate tree; refusing to export unverified changes");
    const paths = execFileSync("git", ["-C", repoRoot, "diff", "--name-only", "-z", baseCommit, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
    const files = paths.map((path) => ({ path, content: readFileSync(assertRegularPath(repoRoot, path), "utf8") }));
    // Required generated files are included even when structurally unchanged.
    for (const path of [AGENT_REPORT, "package.json", "package-lock.json", "maintenance/manifest.json", "maintenance/tool-contracts.json", "maintenance/update-report.md", ...checked.baseline.packages.map((entry) => `${entry.path}/package.json`)]) {
      if (!files.some((file) => file.path === path)) files.push({ path, content: readFileSync(assertRegularPath(repoRoot, path), "utf8") });
    }
    writeFileSync(join(outDir, "verified.json"), jsonText(buildAdaptedBundle({ ...bundle, files, status: "verified" })));
    setOutput("verified", "true");
  } else if (phase === "apply") {
    baselineClean();
    const remote = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0];
    if (remote !== head()) throw new Error("main advanced during adaptation; rerun on its current baseline before creating a PR");
    const checked = await validateAdaptedBundle({ bundle: readJson(join(outDir, "verified.json")), repoRoot, headSha: head(), verified: true });
    applyAdaptedBundle(repoRoot, checked, { verified: true });
    setOutput("version", checked.version);
  } else throw new Error("Usage: node scripts/automate-maintenance.mjs prepare|adapt|verify|apply [--dir <artifact-dir>]");
} catch (error) {
  console.error(`Maintenance ${phase} failed: ${error.message}`);
  process.exitCode = 1;
}
