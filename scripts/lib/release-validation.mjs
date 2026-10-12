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

export function releaseNotes({ tag, repository, sha }) {
  return [
    `Release ${tag} of amox-pi-extensions-lean.`,
    "",
    "Git-install pinned to this immutable tag:",
    "",
    "```bash",
    `pi install git:github.com/${repository}@${tag}`,
    "```",
    "",
    `Contains the three lean Pi extension facades (pi-web-access-lean, rpiv-todo-lean, pi-subagents-lean). CI, contract snapshot, fresh production install and npm audit passed at commit ${sha} before this tag was created. No npm publish is performed by this workflow.`,
  ].join("\n");
}
