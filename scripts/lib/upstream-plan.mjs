// Pure upstream planning; registry failures and downgrades never mean no-update.
import { compareExactStableVersions, isExactStableVersion } from "./semver.mjs";

const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;
export const serializeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
export function buildUpdatePlan({ manifest, workspaces, metadata }) {
  const errors = [], warnings = [], packagePlans = [], leanPlans = [];
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const fail = (code, id, message) => errors.push({ code, package: id, message });
  for (const entry of manifest.packages) {
    const workspace = workspaceById.get(entry.id);
    const dependencies = workspace?.pkg.dependencies ?? {};
    const primary = entry.upstreamPackage;
    const currentVersion = dependencies[primary];
    if (!workspace || !isExactStableVersion(currentVersion)) {
      fail("invalid-manifest", entry.id, `${entry.id} 的工作区依赖必须锁定精确稳定版本`); continue;
    }
    const primaryMeta = metadata.npm?.[primary];
    if (!isExactStableVersion(primaryMeta?.latestStable)) {
      fail("invalid-metadata", entry.id, `缺少或非法元数据: ${primary} latestStable`); continue;
    }
    const latestVersion = primaryMeta.latestStable;
    const comparison = compareExactStableVersions(latestVersion, currentVersion);
    if (comparison < 0) {
      fail("downgrade", entry.id, `拒绝降级: ${primary} 当前 ${currentVersion} > latest stable ${latestVersion}`); continue;
    }
    const versionChange = comparison > 0 ? "bump" : "none";
    const dependencyChanges = [], coupledSkipped = [];
    if (versionChange === "bump") {
      dependencyChanges.push({ name: primary, from: currentVersion, to: latestVersion, kind: "primary" });
      for (const name of Object.keys(dependencies).sort()) {
        if (name === primary) continue;
        const coupledMeta = metadata.npm?.[name];
        const from = dependencies[name];
        if (!isExactStableVersion(coupledMeta?.latestStable)) {
          fail("invalid-metadata", entry.id, `缺少或非法元数据: ${name} latestStable`); continue;
        }
        if (!isExactStableVersion(from)) {
          fail("invalid-manifest", entry.id, `${entry.id} 的 ${name} 必须锁定精确稳定版本`); continue;
        }
        if (compareExactStableVersions(coupledMeta.latestStable, from) < 0) {
          fail("downgrade", entry.id, `拒绝降级: ${name} 当前 ${from} > latest stable ${coupledMeta.latestStable}`);
        } else if (coupledMeta.latestStable === latestVersion) {
          if (from !== latestVersion) dependencyChanges.push({ name, from, to: latestVersion, kind: "coupled" });
        } else if (from !== latestVersion) {
          coupledSkipped.push({ name, current: from, latestStable: coupledMeta.latestStable, expected: latestVersion });
          warnings.push(`${entry.id}: 耦合依赖 ${name} 最新稳定 ${coupledMeta.latestStable} != 主包目标 ${latestVersion}，保持 ${from}，需人工确认兼容性`);
        }
      }
    }
    if (versionChange === "bump" && !HEX40.test(primaryMeta.gitHead ?? "")) {
      fail("invalid-metadata", entry.id, `${primary}@${latestVersion} 缺少有效 npm publication gitHead；不回退到 repo HEAD`); continue;
    }
    const leanGit = metadata.git?.[entry.leanRepository];
    if (!HEX40.test(leanGit?.head ?? "")) {
      fail("invalid-metadata", entry.id, `${entry.leanRepository} 缺少有效 git HEAD`); continue;
    }
    if (!HEX40.test(entry.leanCommit ?? "")) {
      fail("invalid-manifest", entry.id, `${entry.id} leanCommit 非法`); continue;
    }
    packagePlans.push({ id: entry.id, path: entry.path, packageJsonPath: workspace.packageJsonPath,
      packageName: entry.packageName, upstreamPackage: primary, upstreamRepository: entry.upstreamRepository,
      currentVersion, latestVersion, versionChange, dependencyChanges, coupledSkipped,
      upstreamGitHead: versionChange === "bump" ? primaryMeta.gitHead : entry.upstreamGitHead,
      remoteGitHead: metadata.git?.[entry.upstreamRepository]?.head });
    leanPlans.push({ id: entry.id, repository: entry.leanRepository, currentCommit: entry.leanCommit,
      remoteHead: leanGit.head, changed: leanGit.head !== entry.leanCommit });
    if (leanGit.head !== entry.leanCommit) warnings.push(`${entry.id}: lean 仓库 HEAD 变化，需要逐项复用审查（manual reuse review）`);
  }
  const updateRequired = packagePlans.some((item) => item.versionChange === "bump");
  const leanReviewRequired = leanPlans.some((item) => item.changed);
  return { status: errors.length ? "error" : updateRequired ? "update" : leanReviewRequired ? "lean-only" : "no-update",
    errors, warnings, packagePlans, leanPlans, updateRequired, leanReviewRequired,
    changedPackageIds: packagePlans.filter((item) => item.versionChange === "bump").map((item) => item.id), metadata };
}
export function applyPlanToWorkspacePackage(pkg, plan) {
  const next = structuredClone(pkg);
  for (const change of plan.dependencyChanges) {
    if (!Object.hasOwn(next.dependencies ?? {}, change.name)) throw new Error(`Cannot bump ${change.name}: not present in dependencies`);
    next.dependencies[change.name] = change.to;
  }
  return next;
}
export function applyPlanToManifest(manifest, plan) {
  const next = structuredClone(manifest);
  for (const change of plan.packagePlans.filter((item) => item.versionChange === "bump")) {
    const entry = next.packages.find((item) => item.id === change.id);
    if (!entry) throw new Error(`Cannot update manifest: no entry for ${change.id}`);
    entry.upstreamVersion = change.latestVersion; entry.upstreamGitHead = change.upstreamGitHead;
  }
  return next;
}
export function buildUpdateReport({ plan }) {
  const lines = ["# Upstream maintenance check (read-only)", "", `status: ${plan.status}`];
  for (const pkg of plan.packagePlans) lines.push(`- ${pkg.id}: ${pkg.upstreamPackage} ${pkg.currentVersion} -> ${pkg.latestVersion} [${pkg.versionChange === "bump" ? "UPDATE" : "no change"}]`);
  for (const lean of plan.leanPlans.filter((item) => item.changed)) lines.push(`- ${lean.id}: ${lean.currentCommit} -> ${lean.remoteHead} [manual reuse review; leanCommit 基线未改动]`);
  for (const warning of plan.warnings) lines.push(`- warning: ${warning}`);
  lines.push("", "维护提示词：maintenance/daily-update.md（原作者指南原文及本项目执行边界）", "", "只读检测不生成候选 artifact。完整维护：node scripts/local-maintenance.mjs --run");
  return `${lines.join("\n")}\n`;
}
