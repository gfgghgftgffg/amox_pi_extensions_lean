/**
 * Pure planning logic for upstream maintenance.
 *
 * `buildUpdatePlan` compares injected/fetched registry + git metadata with the
 * tracked manifest/workspace state. It only ever plans dependency-version
 * bumps for packages that have a newer *stable* release; a newer `latest`
 * that is older than the pin is an explicit error (never downgrade), and
 * missing/prerelease/broken metadata is an explicit error (never silently
 * "no update").
 *
 * The plan never touches adapter code, prompts, schemas or tool-contracts:
 * those require a human/agent to make MINIMAL adjustments after reviewing the
 * drift evidence produced by the candidate flow.
 */
import { compareExactStableVersions, isExactStableVersion } from "./semver.mjs";
import { renderContractDiffMarkdown } from "./contract-diff.mjs";

// Strict end-of-string: JavaScript $ also accepts a trailing newline.
const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;

function errorMessage(code, context) {
  switch (code) {
    case "invalid-metadata":
      return `缺少或非法元数据: ${context}`;
    case "invalid-manifest":
      return `maintenance/manifest.json 或工作区依赖字段非法: ${context}`;
    case "downgrade":
      return `拒绝降级: ${context}`;
    default:
      return context;
  }
}

/** Serialize JSON exactly like the tracked repo files (2-space + newline). */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Build a deterministic update plan.
 *
 * @param {object} options
 * @param {object} options.manifest parsed maintenance/manifest.json
 * @param {Array<{id:string,path:string,packageJsonPath:string,pkg:object}>} options.workspaces
 * @param {{npm:Record<string,{latestStable:string}>,git:Record<string,{head:string}>}} options.metadata
 */
export function buildUpdatePlan({ manifest, workspaces, metadata }) {
  const errors = [];
  const warnings = [];
  const packagePlans = [];
  const leanPlans = [];
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  for (const entry of manifest.packages) {
    const workspace = workspaceById.get(entry.id);
    if (!workspace) {
      errors.push({ code: "invalid-manifest", package: entry.id, message: errorMessage("invalid-manifest", `${entry.id} 缺少工作区`) });
      continue;
    }
    const dependencies = workspace.pkg.dependencies ?? {};
    const primary = entry.upstreamPackage;
    const currentVersion = dependencies[primary];
    if (!isExactStableVersion(currentVersion)) {
      errors.push({ code: "invalid-manifest", package: entry.id, message: errorMessage("invalid-manifest", `${entry.id} 的 ${primary} 必须锁定精确稳定版本`) });
      continue;
    }
    const primaryMeta = metadata.npm?.[primary];
    if (!primaryMeta || !isExactStableVersion(primaryMeta.latestStable)) {
      errors.push({ code: "invalid-metadata", package: entry.id, message: errorMessage("invalid-metadata", `${primary} latestStable=${JSON.stringify(primaryMeta?.latestStable)}`) });
      continue;
    }
    const latestVersion = primaryMeta.latestStable;
    const comparison = compareExactStableVersions(latestVersion, currentVersion);
    if (comparison < 0) {
      errors.push({ code: "downgrade", package: entry.id, message: errorMessage("downgrade", `${primary} 当前 ${currentVersion} > latest stable ${latestVersion}`) });
      continue;
    }
    const versionChange = comparison > 0 ? "bump" : "none";

    const dependencyChanges = [];
    const coupledSkipped = [];
    if (versionChange === "bump") {
      dependencyChanges.push({ name: primary, from: currentVersion, to: latestVersion, kind: "primary" });
      for (const name of Object.keys(dependencies).sort()) {
        if (name === primary) continue;
        const coupledMeta = metadata.npm?.[name];
        if (!coupledMeta || !isExactStableVersion(coupledMeta.latestStable)) {
          errors.push({ code: "invalid-metadata", package: entry.id, message: errorMessage("invalid-metadata", `${name} latestStable=${JSON.stringify(coupledMeta?.latestStable)}`) });
          continue;
        }
        const from = dependencies[name];
        if (!isExactStableVersion(from)) {
          errors.push({ code: "invalid-manifest", package: entry.id, message: errorMessage("invalid-manifest", `${entry.id} 的 ${name} 必须锁定精确稳定版本`) });
          continue;
        }
        const coupledComparison = compareExactStableVersions(coupledMeta.latestStable, from);
        if (coupledComparison < 0) {
          errors.push({ code: "downgrade", package: entry.id, message: errorMessage("downgrade", `${name} 当前 ${from} > latest stable ${coupledMeta.latestStable}`) });
        } else if (coupledMeta.latestStable === latestVersion) {
          if (from !== latestVersion) {
            dependencyChanges.push({ name, from, to: coupledMeta.latestStable, kind: "coupled" });
          }
        } else if (from !== latestVersion) {
          // Tight coupling is only safe when the coupled package has a release
          // at the exact same target version; otherwise keep the pin and flag
          // the mismatch for human review.
          coupledSkipped.push({ name, current: from, latestStable: coupledMeta.latestStable, expected: latestVersion });
          warnings.push(
            `${entry.id}: 耦合依赖 ${name} 未同步（最新稳定 ${coupledMeta.latestStable} != 主包目标 ${latestVersion}），保持 ${from}，需人工确认兼容性`,
          );
        }
      }
    }

    const upstreamGit = metadata.git?.[entry.upstreamRepository];
    let upstreamGitHead = entry.upstreamGitHead;
    if (versionChange === "bump") {
      if (!HEX40.test(primaryMeta.gitHead ?? "")) {
        errors.push({ code: "invalid-metadata", package: entry.id, message: errorMessage("invalid-metadata", `${primary}@${latestVersion} 缺少有效 npm publication gitHead；需人工审查（不回退到 repo HEAD）`) });
        continue;
      }
      upstreamGitHead = primaryMeta.gitHead;
    }
    const leanGit = metadata.git?.[entry.leanRepository];
    if (!leanGit || !HEX40.test(leanGit.head)) {
      errors.push({ code: "invalid-metadata", package: entry.id, message: errorMessage("invalid-metadata", `${entry.leanRepository} 缺少有效 git HEAD`) });
      continue;
    }
    if (!HEX40.test(entry.leanCommit)) {
      errors.push({ code: "invalid-manifest", package: entry.id, message: errorMessage("invalid-manifest", `${entry.id} leanCommit 非法`) });
      continue;
    }

    packagePlans.push({
      id: entry.id,
      path: entry.path,
      packageJsonPath: workspace.packageJsonPath,
      packageName: entry.packageName,
      upstreamPackage: primary,
      upstreamRepository: entry.upstreamRepository,
      currentVersion,
      latestVersion,
      versionChange,
      dependencyChanges,
      coupledSkipped,
      upstreamGitHead,
      remoteGitHead: upstreamGit?.head,
    });
    leanPlans.push({
      id: entry.id,
      repository: entry.leanRepository,
      currentCommit: entry.leanCommit,
      remoteHead: leanGit.head,
      changed: leanGit.head !== entry.leanCommit,
    });
    if (leanGit.head !== entry.leanCommit) {
      warnings.push(`${entry.id}: lean 仓库 HEAD ${leanGit.head.slice(0, 12)} != 基线 ${entry.leanCommit.slice(0, 12)}，需要人工复用审查（manual reuse review）`);
    }
  }

  const updateRequired = packagePlans.some((packagePlan) => packagePlan.versionChange === "bump");
  const leanReviewRequired = leanPlans.some((leanPlan) => leanPlan.changed);
  const status = errors.length > 0 ? "error" : updateRequired ? "update" : leanReviewRequired ? "lean-only" : "no-update";
  return {
    status,
    errors,
    warnings,
    packagePlans,
    leanPlans,
    updateRequired,
    leanReviewRequired,
    changedPackageIds: packagePlans.filter((packagePlan) => packagePlan.versionChange === "bump").map((packagePlan) => packagePlan.id),
    metadata,
  };
}

/** Return a copy of a workspace package.json with the planned dependency bumps. */
export function applyPlanToWorkspacePackage(pkg, packagePlan) {
  const next = JSON.parse(JSON.stringify(pkg));
  for (const change of packagePlan.dependencyChanges) {
    if (!next.dependencies || !Object.prototype.hasOwnProperty.call(next.dependencies, change.name)) {
      throw new Error(`Cannot bump ${change.name}: not present in dependencies`);
    }
    next.dependencies[change.name] = change.to;
  }
  return next;
}

/** Return a copy of the manifest with upstreamVersion/upstreamGitHead updated. */
export function applyPlanToManifest(manifest, plan) {
  const next = JSON.parse(JSON.stringify(manifest));
  for (const packagePlan of plan.packagePlans) {
    if (packagePlan.versionChange !== "bump") continue;
    const target = next.packages.find((entry) => entry.id === packagePlan.id);
    if (!target) throw new Error(`Cannot update manifest: no entry for ${packagePlan.id}`);
    target.upstreamVersion = packagePlan.latestVersion;
    target.upstreamGitHead = packagePlan.upstreamGitHead;
  }
  return next;
}

const STATUS_LABELS = {
  ready: "ready：依赖升级候选，结构契约无漂移，快照元数据可刷新",
  drift: "drift：检测到结构契约漂移，已接受快照未改动，需要人工最小调整",
  failed: "failed：安装/捕获/检查失败，候选已暂存但不可直接合并",
  "lean-review": "lean-review：lean 仓库有新 HEAD，仅生成报告，leanCommit 基线未改动",
  "snapshot-refresh": "snapshot-refresh：无依赖变化，仅刷新无漂移快照元数据",
};

const MAINTENANCE_PROMPT = `把本仓库（三个 lean 门面）同步到上游最新稳定版，保持最小改动：

1. 先读对应包的 MAINTENANCE.md，确认当前锁定版本、适配点与依赖的上游内部细节。
2. 对比两个版本代码与 CHANGELOG，列出：新增/删除工具、参数与默认值变化、行为变化，以及 MAINTENANCE.md 记录的工具名、执行签名、prepareArguments、私有字段等细节是否仍然成立。
3. 仅版本号与内部实现变化时，只升级依赖，不改 index.ts。
4. 有新参数或新工具的，按原精简规则补进 lean 版：常用参数进 schema，冷门参数放 help；上游行为变化时同步更新描述，不要让描述与行为对不上。
5. 保持工具列表在会话中不变、保持 prompt/schema/execute 结构；删哪些规则、合哪些工具有歧义时，先给出方案，不要直接改。
6. 运行 npm ci、npm run check、npm run contracts、npm run contracts:check、node scripts/verify-production-install.mjs；重新统计字符代理并同步 README、MAINTENANCE.md 与 maintenance/manifest.json。
7. 把改动清单交给人工确认后再合并或发版。`;

/**
 * Render the tracked maintenance report for a staged candidate.
 * Deterministic: no timestamps, stable ordering.
 */
export function buildUpdateReport({ plan, status, baseCommit, diff, install, capture, check, refreshSnapshot = false }) {
  const lines = [];
  lines.push("# Upstream maintenance candidate");
  lines.push("");
  lines.push(`<!-- amox-maintenance-candidate; status: ${status} -->`);
  lines.push("");
  lines.push(`- 状态: ${STATUS_LABELS[status] ?? status}`);
  lines.push(`- 基线 commit: \`${baseCommit}\``);
  lines.push(`- 生成方式: \`node scripts/check-upstream.mjs --apply\`（仅依赖升级候选；不改写适配代码）`);
  lines.push("");
  lines.push("## 检测结果");
  lines.push("");
  lines.push("| 包 | 上游依赖 | 当前 | 最新稳定 | 变化 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const packagePlan of plan.packagePlans) {
    lines.push(`| ${packagePlan.id} | \`${packagePlan.upstreamPackage}\` | ${packagePlan.currentVersion} | ${packagePlan.latestVersion} | ${packagePlan.versionChange === "bump" ? "升级" : "无"} |`);
  }
  lines.push("");
  if (plan.leanPlans.some((leanPlan) => leanPlan.changed)) {
    lines.push("### lean 仓库 HEAD 变化（需要人工复用审查 / manual reuse review）");
    lines.push("");
    for (const leanPlan of plan.leanPlans) {
      if (!leanPlan.changed) continue;
      lines.push(`- ${leanPlan.id}: \`${leanPlan.repository}\` HEAD \`${leanPlan.remoteHead}\` != 基线 \`${leanPlan.currentCommit}\``);
    }
    lines.push("");
    lines.push("> leanCommit 基线在人工确认前保持不动；上游 lean 仓库的改动不会被自动拉取，只作为可复用改进的来源参考。");
    lines.push("");
  }
  if (plan.warnings.length > 0) {
    lines.push("### 警告");
    lines.push("");
    for (const warning of plan.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  lines.push("## 候选文件（仅允许清单内）");
  lines.push("");
  for (const packagePlan of plan.packagePlans) {
    for (const change of packagePlan.dependencyChanges) {
      lines.push(`- \`${packagePlan.path}/package.json\`: ${change.name} ${change.from} -> ${change.to}（${change.kind === "primary" ? "上游引擎" : "耦合依赖"}）`);
    }
  }
  if (plan.updateRequired) {
    lines.push("- `package-lock.json`（npm 重新解析，仅在安装成功时提供）");
    lines.push("- `maintenance/manifest.json`: 仅 upstreamVersion / upstreamGitHead");
  }
  if (refreshSnapshot && status === "ready") {
    lines.push("- `maintenance/tool-contracts.json`: 仅刷新无漂移的当前快照元数据");
  }
  lines.push("- `maintenance/update-report.md`（本文件）");
  lines.push("");
  if (diff) {
    lines.push("## 工具契约对比（相对已接受快照）");
    lines.push("");
    lines.push(renderContractDiffMarkdown(diff).trimEnd());
    lines.push("");
  }
  lines.push("## 自动化诊断");
  lines.push("");
  lines.push(`- 候选依赖安装: ${install ? install.detail : "未执行"}`);
  lines.push(`- 契约捕获: ${capture ? capture.detail : "未执行"}`);
  lines.push(`- npm run check: ${check ? check.detail : "未执行"}`);
  lines.push("");
  lines.push("安装/检查的完整日志与 JSON 证据见 CI 工作流 artifact 的 `diagnostics/` 目录。");
  lines.push("");
  lines.push("## 人工审查要求（必须）");
  lines.push("");
  lines.push("1. 阅读上游 CHANGELOG 与代码 diff，检查不可见的运行时行为变化（旧测试通过不等于新特性已被 lean 版正确处理）。");
  lines.push("2. 核对 help 返回的完整参数面与精简描述是否仍准确；本脚本不会自动改写任何适配代码或描述。");
  lines.push("3. 新增参数/新工具按最小改动原则人工补充；默认值变化、枚举新增要同步到 schema 或 help。");
  lines.push("4. 如涉及 lean 仓库改动的复用，逐条审查后手动更新 leanCommit 基线。");
  lines.push("5. 重新运行 npm ci、npm run check、npm run contracts、npm run contracts:check、node scripts/verify-production-install.mjs。");
  lines.push("6. 该 PR 为 draft，不会自动合并或发布；机器人分支 `maintenance/upstream-update` 不要手工编辑（自动化会重建）。");
  lines.push("");
  lines.push("## 维护提示词（交给人工/agent 做最小调整）");
  lines.push("");
  lines.push("```text");
  lines.push(MAINTENANCE_PROMPT);
  lines.push("```");
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}

export { MAINTENANCE_PROMPT, STATUS_LABELS };
