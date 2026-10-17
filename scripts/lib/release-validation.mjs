/**
 * Pure validation helpers for the release workflow.
 *
 * The release job is write-scoped: it must validate the operator-provided tag
 * and the exact verified SHA before creating a tag/release, and must never
 * publish to npm.
 */
import { isExactStableVersion } from "./semver.mjs";
export const RELEASE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// Strict end-of-string: JavaScript $ also accepts a trailing newline.
const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;

export function validateReleaseTag(tag) {
  if (typeof tag !== "string" || tag.length === 0) return { ok: false, error: "release tag 不能为空" };
  const match = RELEASE_TAG_PATTERN.exec(tag);
  if (!match || !isExactStableVersion(tag.slice(1))) return { ok: false, error: `release tag 必须形如 canonical vX.Y.Z（得到 ${JSON.stringify(tag)}）` };
  return { ok: true, version: tag.slice(1) };
}

export function validateReleaseContext({ tag, packageVersion, expectedSha, headSha }) {
  const errors = [];
  const tagResult = validateReleaseTag(tag);
  if (!tagResult.ok) errors.push(tagResult.error);
  if (!isExactStableVersion(packageVersion)) errors.push(`根 package.json version 必须是 canonical X.Y.Z: ${packageVersion}`);
  if (tagResult.ok && tag !== `v${packageVersion}`) {
    errors.push(`tag ${tag} 对应版本 ${tagResult.version} 与根 package.json version ${packageVersion} 不一致`);
  }
  if (typeof expectedSha !== "string" || !HEX40.test(expectedSha)) {
    errors.push(`EXPECTED_SHA 必须是 40 位提交（得到 ${JSON.stringify(expectedSha)}）`);
  }
  if (expectedSha && headSha !== expectedSha) {
    errors.push(`checkout HEAD ${headSha} != 已验证提交 ${expectedSha}`);
  }
  return errors;
}

export function releaseSummaryBlock({ version, summary }) {
  if (!isExactStableVersion(version)) throw new Error("Release summary needs a canonical version");
  if (typeof summary !== "string") throw new Error("Missing release summary");
  const text = summary.replace(/\r\n/g, "\n").trim();
  if (text.length < 20 || text.length > 20_000 || text.includes("<!-- amox-release-summary:")) {
    throw new Error("Invalid release summary: provide substantive changes without reserved markers");
  }
  return `<!-- amox-release-summary:v${version}:start -->\n${text}\n<!-- amox-release-summary:v${version}:end -->`;
}

export function extractReleaseSummary({ report, tag }) {
  const checked = validateReleaseTag(tag);
  if (!checked.ok) throw new Error(checked.error);
  const text = typeof report === "string" ? report.replace(/\r\n/g, "\n") : "";
  const start = `<!-- amox-release-summary:${tag}:start -->`;
  const end = `<!-- amox-release-summary:${tag}:end -->`;
  const markers = text.match(/<!-- amox-release-summary:[^\r\n]*? -->/g) || [];
  if (markers.length !== 2 || markers[0] !== start || markers[1] !== end
    || ![`Release after verified merge: ${tag}`, `Release after human merge: ${tag}`].some((line) => text.split("\n").includes(line))) {
    throw new Error(`Missing or stale release summary for ${tag}; update maintenance/update-report.md before releasing`);
  }
  const summary = text.slice(text.indexOf(start) + start.length, text.indexOf(end)).trim();
  releaseSummaryBlock({ version: checked.version, summary });
  return summary;
}

export function releaseNotes({ tag, repository, sha, summary }) {
  const checked = validateReleaseTag(tag);
  if (!checked.ok) throw new Error(checked.error);
  releaseSummaryBlock({ version: checked.version, summary });
  return [
    `# ${tag}`,
    "",
    "## 更新内容",
    "",
    summary.trim(),
    "",
    "## 验证",
    "",
    "macOS、Windows、Linux 的测试、契约检查、三个独立生产安装及安全审计通过。",
    `验证提交：\`${sha}\`。`,
    `[详细源码审查](https://github.com/${repository}/blob/${sha}/maintenance/agent-review.md)。`,
    "",
    "## 安装",
    "",
    "每个扩展独立安装；npm 包可用后，按需执行（不固定版本）：",
    "",
    "```bash",
    "pi install npm:@gfgghgftgffg/pi-web-access-lean",
    "pi install npm:@gfgghgftgffg/rpiv-todo-lean",
    "pi install npm:@gfgghgftgffg/pi-subagents-lean",
    "pi update --extensions",
    "```",
    "",
    "若首次 npm 配置未完成或 npm job 未成功，使用 Git 回退安装：",
    "",
    "```bash",
    `git clone --branch ${tag} https://github.com/${repository}.git`,
    "cd amox_pi_extensions_lean",
    "node scripts/install-extension.mjs pi-web-access-lean",
    "node scripts/install-extension.mjs rpiv-todo-lean",
    "node scripts/install-extension.mjs pi-subagents-lean",
    "```",
    "",
    "附件包含三个独立 .tgz 安装包和 assets.json 哈希清单。npm 发布是后续独立 job，以它的实际结果为准。",
    `首次配置、旧来源迁移和失败恢复见 https://github.com/${repository}/blob/${sha}/docs/npm-publishing.zh-CN.md 。`,
  ].join("\n");
}
