/**
 * Candidate preparation engine for `check-upstream.mjs --apply`.
 *
 * Runs entirely with read-only repository permissions:
 *   1. materialize the tracked baseline into a temp tree (never node_modules);
 *   2. apply the planned dependency-only changes;
 *   3. `npm install --ignore-scripts` (no lifecycle scripts, no secrets);
 *   4. capture fresh contracts with the isolated Pi capture helper;
 *   5. structurally diff against the accepted snapshot;
 *   6. stage a candidate bundle (allowlisted file contents + diagnostics).
 *
 * Drift or install/capture/check failure keeps the accepted snapshot intact
 * and still stages a draft-status candidate for humans to review.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  MANIFEST_PATH,
  REPORT_PATH,
  SNAPSHOT_PATH,
  buildCandidateArtifact,
  serializeCandidateArtifact,
} from "./candidate.mjs";
import { diffContractSnapshots } from "./contract-diff.mjs";
import { applyPlanToManifest, applyPlanToWorkspacePackage, buildUpdateReport, serializeJson } from "./upstream-plan.mjs";

export function gitHead(repoRoot) {
  return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function gitTrackedFiles(repoRoot) {
  const output = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return output.split("\0").filter((entry) => entry.length > 0);
}

function copyTrackedTree(repoRoot, target) {
  for (const path of gitTrackedFiles(repoRoot)) {
    const destination = join(target, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(repoRoot, path), destination);
  }
}

function runLogged(command, args, { cwd, logFile, env = {} }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false", ...env },
  });
  const text = `$ ${command} ${args.join(" ")}\n--- stdout ---\n${result.stdout ?? ""}\n--- stderr ---\n${result.stderr ?? ""}\n`;
  writeFileSync(logFile, text);
  if (result.error) {
    return { ok: false, status: null, detail: `fail (${result.error.message})`, log: logFile };
  }
  return {
    ok: result.status === 0,
    status: result.status,
    detail: result.status === 0 ? "pass" : `fail (exit ${result.status})`,
    log: logFile,
  };
}

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function stageBundle({ outDir, status, files, plan }) {
  const diagnosticsDir = join(outDir, "diagnostics");
  mkdirSync(diagnosticsDir, { recursive: true });
  const artifact = buildCandidateArtifact({ baseCommit: plan.baseCommit, status, files });
  writeFileSync(join(outDir, "candidate.json"), serializeCandidateArtifact(artifact));
  writeFileSync(join(outDir, "update-report.md"), files.find((file) => file.path === REPORT_PATH).content);
  writeFileSync(join(diagnosticsDir, "candidate-status.json"), serializeJson({ status, files: artifact.files.map((file) => file.path) }));
  return { status, artifact, reportPath: join(outDir, "update-report.md") };
}

/**
 * @param {object} options
 * @param {string} options.repoRoot tracked repository root (read-only usage)
 * @param {string} options.outDir untracked bundle directory
 * @param {object} options.plan plan from buildUpdatePlan
 * @param {object} options.baselineSnapshot parsed accepted snapshot
 * @param {boolean} [options.refreshSnapshot] allow a snapshot-only metadata refresh
 */
export async function prepareCandidate({ repoRoot, outDir, plan, baselineSnapshot, refreshSnapshot = false }) {
  const baseCommit = gitHead(repoRoot);
  const fullPlan = { ...plan, baseCommit };
  const diagnosticsDir = join(outDir, "diagnostics");

  const manifestPath = join(repoRoot, MANIFEST_PATH);
  const baselineManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestContent = plan.updateRequired ? serializeJson(applyPlanToManifest(baselineManifest, plan)) : undefined;

  const packageFiles = new Map();
  for (const packagePlan of plan.packagePlans) {
    if (packagePlan.versionChange !== "bump") continue;
    const current = JSON.parse(readFileSync(join(repoRoot, packagePlan.packageJsonPath), "utf8"));
    const next = applyPlanToWorkspacePackage(current, packagePlan);
    packageFiles.set(packagePlan.id, {
      path: packagePlan.packageJsonPath,
      content: serializeJson(next),
    });
  }

  if (!plan.updateRequired) {
    if (plan.leanReviewRequired && !refreshSnapshot) {
      const report = buildUpdateReport({ plan, status: "lean-review", baseCommit });
      const files = [{ path: REPORT_PATH, content: report }];
      mkdirSync(diagnosticsDir, { recursive: true });
      return stageBundle({ outDir, status: "lean-review", files, plan: fullPlan });
    }
    if (!refreshSnapshot) return { status: "no-update", files: [] };

    // Snapshot-metadata-only refresh: capture against the current installed tree.
    mkdirSync(diagnosticsDir, { recursive: true });
    const captureOut = join(diagnosticsDir, "candidate-tool-contracts.json");
    const capture = runLogged(process.execPath, ["scripts/capture-contracts.mjs", "--output", captureOut], {
      cwd: repoRoot,
      logFile: join(diagnosticsDir, "capture.log"),
    });
    if (!capture.ok) {
      throw new Error(`refresh-snapshot 捕获失败（已接受快照保持不变）: 详见 ${capture.log}`);
    }
    const candidateSnapshot = JSON.parse(readFileSync(captureOut, "utf8"));
    const diff = diffContractSnapshots(baselineSnapshot, candidateSnapshot);
    writeFileSync(join(diagnosticsDir, "contract-diff.json"), serializeJson(diff));
    if (diff.drift) {
      throw new Error("refresh-snapshot 请求被拒绝：检测到结构契约漂移；已接受快照保持不变，请先人工调整适配代码");
    }
    const report = buildUpdateReport({ plan, status: "snapshot-refresh", baseCommit, capture, diff, refreshSnapshot: true });
    const files = [
      { path: REPORT_PATH, content: report },
      { path: SNAPSHOT_PATH, content: serializeJson(candidateSnapshot) },
    ];
    return stageBundle({ outDir, status: "snapshot-refresh", files, plan: fullPlan });
  }

  // Dependency update candidate: work on a pristine tracked copy.
  const tempRoot = mkdtempSync(join(tmpdir(), "amox-maintenance-candidate-"));
  const workTree = join(tempRoot, "repo");
  try {
    copyTrackedTree(repoRoot, workTree);
    for (const file of packageFiles.values()) {
      writeFileSync(join(workTree, file.path), file.content);
    }
    if (manifestContent) writeFileSync(join(workTree, MANIFEST_PATH), manifestContent);
    mkdirSync(diagnosticsDir, { recursive: true });

    const install = runLogged(NPM, ["install", "--ignore-scripts"], {
      cwd: workTree,
      logFile: join(diagnosticsDir, "install.log"),
      env: { npm_config_ignore_scripts: "true" },
    });
    if (!install.ok) {
      const report = buildUpdateReport({ plan, status: "failed", baseCommit, install });
      const files = [...packageFiles.values(), { path: MANIFEST_PATH, content: manifestContent }, { path: REPORT_PATH, content: report }];
      return stageBundle({ outDir, status: "failed", files, plan: fullPlan });
    }

    const captureOut = join(diagnosticsDir, "candidate-tool-contracts.json");
    const capture = runLogged(process.execPath, ["scripts/capture-contracts.mjs", "--output", captureOut], {
      cwd: workTree,
      logFile: join(diagnosticsDir, "capture.log"),
    });
    if (!capture.ok) {
      const report = buildUpdateReport({ plan, status: "failed", baseCommit, install, capture });
      const files = [...packageFiles.values(), { path: MANIFEST_PATH, content: manifestContent }, { path: REPORT_PATH, content: report }];
      return stageBundle({ outDir, status: "failed", files, plan: fullPlan });
    }
    const candidateSnapshot = JSON.parse(readFileSync(captureOut, "utf8"));
    const diff = diffContractSnapshots(baselineSnapshot, candidateSnapshot);
    writeFileSync(join(diagnosticsDir, "contract-diff.json"), serializeJson(diff));

    const lockfileContent = readFileSync(join(workTree, "package-lock.json"), "utf8");
    const drift = diff.drift;
    if (!drift) {
      // Refresh only metadata: write the snapshot back so `npm run check`
      // (which includes contracts:check) can pass in the candidate tree.
      writeFileSync(join(workTree, SNAPSHOT_PATH), serializeJson(candidateSnapshot));
    }
    const check = runLogged(NPM, ["run", "check"], { cwd: workTree, logFile: join(diagnosticsDir, "check.log") });
    const contractsCheck = runLogged(NPM, ["run", "contracts:check"], { cwd: workTree, logFile: join(diagnosticsDir, "contracts-check.log") });
    const checkDetail = {
      detail: `${check.detail}; contracts:check ${contractsCheck.detail}`,
      ok: check.ok && contractsCheck.ok,
    };
    const status = drift ? "drift" : check.ok && contractsCheck.ok ? "ready" : "failed";
    const report = buildUpdateReport({ plan, status, baseCommit, diff, install, capture, check: checkDetail, refreshSnapshot: status === "ready" });
    const files = [
      ...packageFiles.values(),
      { path: MANIFEST_PATH, content: manifestContent },
      { path: REPORT_PATH, content: report },
    ];
    if (status === "ready" || status === "drift" || (status === "failed" && install.ok)) {
      files.push({ path: "package-lock.json", content: lockfileContent });
    }
    if (status === "ready") {
      files.push({ path: SNAPSHOT_PATH, content: serializeJson(candidateSnapshot) });
    }
    return stageBundle({ outDir, status, files, plan: fullPlan });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
