/**
 * Pure validation helpers for the release workflow.
 *
 * The release job is write-scoped: it must validate operator- and plan-provided
 * package tags plus the exact verified SHA before creating any tag/release, and
 * must never publish to npm. Each package release has its own
 * `<packageName>@<version>` tag; there is no repository-wide release version.
 */
import { isExactStableVersion } from "./semver.mjs";
import { packageTag, parsePackageTag } from "./release-tags.mjs";
// Strict end-of-string: JavaScript $ also accepts a trailing newline.
const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;

export function validateReleaseTag(tag, packages) {
  if (typeof tag !== "string" || tag.length === 0) return { ok: false, error: "release tag 不能为空" };
  if (!Array.isArray(packages) || !packages.length) return { ok: false, error: "release tag 校验缺少 manifest 包列表" };
  const release = parsePackageTag(tag, packages);
  if (!release) return { ok: false, error: `release tag 必须形如 <包名>@X.Y.Z 且包名在 manifest 中（得到 ${JSON.stringify(tag)}）` };
  return { ok: true, release };
}

export function validateReleaseContext({ releases, expectedSha, headSha, packages }) {
  const errors = [];
  if (!Array.isArray(releases) || !releases.length) errors.push("release 列表不能为空");
  const seen = new Set();
  for (const release of Array.isArray(releases) ? releases : []) {
    const checked = validateReleaseTag(release?.tag, packages);
    if (!checked.ok) { errors.push(checked.error); continue; }
    if (checked.release.package !== release.package || checked.release.version !== release.version) {
      errors.push(`tag ${release.tag} 与包名/版本不一致`);
    }
    if (release.tag !== packageTag(release.package, release.version)) errors.push(`tag ${release.tag} 不是规范化包 tag`);
    const entry = packages.find((item) => item.packageName === release.package);
    if (!entry) errors.push(`manifest 中没有包: ${release.package}`);
    else if (entry.version !== release.version) errors.push(`tag ${release.tag} 与当前包版本 ${entry.version} 不一致`);
    if (seen.has(release.tag)) errors.push(`重复的 release tag: ${release.tag}`);
    seen.add(release.tag);
  }
  if (typeof expectedSha !== "string" || !HEX40.test(expectedSha)) {
    errors.push(`EXPECTED_SHA 必须是 40 位提交（得到 ${JSON.stringify(expectedSha)}）`);
  }
  if (expectedSha && headSha !== expectedSha) {
    errors.push(`checkout HEAD ${headSha} != 已验证提交 ${expectedSha}`);
  }
  return errors;
}

export function releaseSummaryBlock({ tag, summary }) {
  if (typeof tag !== "string" || tag.length === 0 || !isExactStableVersion(tag.slice(tag.lastIndexOf("@") + 1))) {
    throw new Error("Release summary needs a package tag");
  }
  if (typeof summary !== "string") throw new Error("Missing release summary");
  const text = summary.replace(/\r\n/g, "\n").trim();
  if (text.length < 20 || text.length > 20_000 || text.includes("<!-- amox-release-summary:")) {
    throw new Error("Invalid release summary: provide substantive changes without reserved markers");
  }
  return `<!-- amox-release-summary:${tag}:start -->\n${text}\n<!-- amox-release-summary:${tag}:end -->`;
}

export function extractReleaseSummary({ report, tag }) {
  if (typeof tag !== "string" || !tag.includes("@")) throw new Error("Missing package tag");
  const text = typeof report === "string" ? report.replace(/\r\n/g, "\n") : "";
  const start = `<!-- amox-release-summary:${tag}:start -->`;
  const end = `<!-- amox-release-summary:${tag}:end -->`;
  const from = text.indexOf(start), to = text.indexOf(end);
  const unique = from >= 0 && to > from && text.indexOf(start, from + 1) < 0 && text.indexOf(end, to + 1) < 0;
  if (!unique || ![`Release after verified merge: ${tag}`, `Release after human merge: ${tag}`].some((line) => text.split("\n").includes(line))) {
    throw new Error(`Missing or stale release summary for ${tag}; update maintenance/update-report.md before releasing`);
  }
  const summary = text.slice(from + start.length, to).trim();
  releaseSummaryBlock({ tag, summary });
  return summary;
}

export function releaseNotes({ release, repository, sha, summary }) {
  const tag = release?.tag;
  const checked = typeof tag === "string" && isExactStableVersion(tag.slice(tag.lastIndexOf("@") + 1));
  if (!checked) throw new Error("Release notes need a package tag");
  releaseSummaryBlock({ tag, summary });
  return [
    `# ${tag}`,
    "",
    "## 更新内容",
    "",
    summary.trim(),
    "",
    "## 本包版本",
    "",
    `- ${release.package}@${release.version}`,
    "",
    "其它扩展有自己的版本和 Release，本 Release 不包含它们。",
    "",
    "## 验证",
    "",
    "受影响扩展的 macOS、Windows、Linux 测试、契约检查及独立生产安装通过；共享变更扩大验收范围。依赖安全审计已执行，上游漏洞作为警告记录，不阻断发布。",
    `验证提交：\`${sha}\`。`,
    `[详细源码审查](https://github.com/${repository}/blob/${sha}/maintenance/agent-review.md)。`,
    "",
    "## 安装",
    "",
    "npm 包可用后执行（不固定版本）：",
    "",
    "```bash",
    `pi install npm:${release.package}`,
    "pi update --extensions",
    "```",
    "",
    "若首次 npm 配置未完成或 npm job 未成功，使用 Git 回退安装：",
    "",
    "```bash",
    `git clone --branch ${tag} https://github.com/${repository}.git`,
    "cd amox_pi_extensions_lean",
    `node scripts/install-extension.mjs ${release.id}`,
    "```",
    "",
    `附件仅包含 ${release.package}@${release.version} 的 .tgz 安装包。npm 发布是后续独立 job，以它的实际结果为准。`,
    `首次配置、旧来源迁移和失败恢复见 https://github.com/${repository}/blob/${sha}/docs/npm-publishing.zh-CN.md 。`,
  ].join("\n");
}
