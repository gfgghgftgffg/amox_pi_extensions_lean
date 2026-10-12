/**
 * Maintenance candidate artifact format, validation and application.
 *
 * Threat model: the candidate artifact is produced by the read-only
 * "detect" workflow job (which may be influenced by upstream registry/repo
 * metadata) and consumed by the privileged PR job. That privileged job must
 * never execute candidate code and must only accept a tightly constrained
 * data patch:
 *
 *   - allowlisted root-relative paths only, no symlinks/modes/deletions/renames
 *   - workspace package.json: only exact upstream/i18n dependency versions
 *   - maintenance/manifest.json: only upstreamVersion/upstreamGitHead
 *     (leanCommit and every other field preserved)
 *   - package-lock.json: structure preserved, bumped engines resolved
 *   - tool-contracts.json: allowed only when there is NO structural drift
 *   - update-report.md: generated report only
 *
 * Everything else is rejected before any write or token use.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { compareSnapshot } from "./snapshot-validation.mjs";
import { compareLockfile, resolvePublicRegistryMetadata } from "./lock-validation.mjs";
import { compareExactStableVersions, isExactStableVersion } from "./semver.mjs";

export const CANDIDATE_KIND = "amox-lean-maintenance-candidate";
export const CANDIDATE_STATUSES = ["ready", "drift", "failed", "lean-review", "snapshot-refresh"];

const LOCKFILE_PATH = "package-lock.json";
const MANIFEST_PATH = "maintenance/manifest.json";
const SNAPSHOT_PATH = "maintenance/tool-contracts.json";
const REPORT_PATH = "maintenance/update-report.md";
// Strict end-of-string: JavaScript $ also accepts a trailing newline.
const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_FILE_BYTES = 5_000_000;
const MAX_TOTAL_BYTES = 20_000_000;

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Reject anything that is not a plain forward-slash relative file path. */
export function assertSafeRelativePath(path) {
  if (typeof path !== "string" || path.length === 0) throw new Error(`非法路径: ${JSON.stringify(path)}`);
  if (isAbsolute(path) || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) {
    throw new Error(`拒绝绝对路径: ${path}`);
  }
  if (path.includes("\\") || path.includes("\0")) throw new Error(`拒绝非法字符: ${path}`);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`拒绝越界/空路径段: ${path}`);
  }
  if (posix.normalize(path) !== path) throw new Error(`路径未规范化: ${path}`);
  return path;
}

/** Build the candidate artifact (deterministic file ordering). */
export function buildCandidateArtifact({ baseCommit, status, files }) {
  if (!HEX40.test(baseCommit ?? "")) throw new Error(`baseCommit 必须是 40 位十六进制: ${baseCommit}`);
  if (!CANDIDATE_STATUSES.includes(status)) throw new Error(`未知候选状态: ${status}`);
  const normalizedFiles = [...files]
    .map((file) => {
      assertSafeRelativePath(file.path);
      if (typeof file.content !== "string") throw new Error(`${file.path}: content 必须是字符串`);
      return { path: file.path, contentSha256: sha256(file.content), content: file.content };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set();
  for (const file of normalizedFiles) {
    if (seen.has(file.path)) throw new Error(`重复文件: ${file.path}`);
    seen.add(file.path);
  }
  return {
    schemaVersion: 1,
    kind: CANDIDATE_KIND,
    baseCommit,
    status,
    files: normalizedFiles,
  };
}

export function serializeCandidateArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkOnlyKeys(object, allowedKeys, label, errors) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) errors.push(`${label}: 出现不允许的字段 ${JSON.stringify(key)}`);
  }
}

function parseJsonFile(repoRoot, path, errors, { required = true } = {}) {
  const absolute = join(repoRoot, path);
  if (!existsSync(absolute)) {
    if (required) errors.push(`仓库中缺少 ${path}`);
    return undefined;
  }
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    errors.push(`仓库中的 ${path} 是符号链接，拒绝处理`);
    return undefined;
  }
  if (!stat.isFile()) {
    errors.push(`仓库中的 ${path} 不是普通文件`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    errors.push(`无法解析仓库中的 ${path}: ${error.message}`);
    return undefined;
  }
}

function compareManifest(baselineManifest, candidateManifest, errors) {
  const changed = new Map();
  if (!isPlainObject(candidateManifest)) {
    errors.push("maintenance/manifest.json: 不是 JSON 对象");
    return changed;
  }
  checkOnlyKeys(candidateManifest, Object.keys(baselineManifest), "maintenance/manifest.json", errors);
  if (!isDeepStrictEqual(candidateManifest.monorepo, baselineManifest.monorepo)) {
    errors.push("maintenance/manifest.json: monorepo 段不允许变化");
  }
  if (!Array.isArray(candidateManifest.packages) || candidateManifest.packages.length !== baselineManifest.packages.length) {
    errors.push("maintenance/manifest.json: packages 数量/结构不允许变化");
    return changed;
  }
  for (const baselineEntry of baselineManifest.packages) {
    const candidateEntry = candidateManifest.packages.find((entry) => entry?.id === baselineEntry.id);
    if (!candidateEntry) {
      errors.push(`maintenance/manifest.json: 缺少 ${baselineEntry.id}`);
      continue;
    }
    for (const key of Object.keys(candidateEntry)) {
      if (!Object.prototype.hasOwnProperty.call(baselineEntry, key)) {
        errors.push(`maintenance/manifest.json: ${baselineEntry.id} 新增字段 ${key}`);
      }
    }
    for (const key of Object.keys(baselineEntry)) {
      if (key === "upstreamVersion" || key === "upstreamGitHead") continue;
      if (!isDeepStrictEqual(candidateEntry[key], baselineEntry[key])) {
        errors.push(`maintenance/manifest.json: ${baselineEntry.id}.${key} 不允许变化`);
      }
    }
    const versionChanged = candidateEntry.upstreamVersion !== baselineEntry.upstreamVersion;
    const headChanged = candidateEntry.upstreamGitHead !== baselineEntry.upstreamGitHead;
    if (!versionChanged && !headChanged) continue;
    if (!versionChanged) {
      errors.push(`maintenance/manifest.json: ${baselineEntry.id} 只改 upstreamGitHead 不允许（必须先有版本升级）`);
      continue;
    }
    if (!isExactStableVersion(candidateEntry.upstreamVersion)) {
      errors.push(`maintenance/manifest.json: ${baselineEntry.id} upstreamVersion 必须是精确稳定版本`);
      continue;
    }
    if (compareExactStableVersions(candidateEntry.upstreamVersion, baselineEntry.upstreamVersion) <= 0) {
      errors.push(`maintenance/manifest.json: ${baselineEntry.id} 拒绝降级 ${baselineEntry.upstreamVersion} -> ${candidateEntry.upstreamVersion}`);
      continue;
    }
    if (typeof candidateEntry.upstreamGitHead !== "string" || !HEX40.test(candidateEntry.upstreamGitHead)) {
      errors.push(`maintenance/manifest.json: ${baselineEntry.id} upstreamGitHead 必须是 40 位提交`);
      continue;
    }
    changed.set(baselineEntry.id, { version: candidateEntry.upstreamVersion });
  }
  const expected = structuredClone(baselineManifest);
  for (const entry of expected.packages) {
    const candidate = candidateManifest.packages.find((p) => p?.id === entry.id);
    if (candidate) { entry.upstreamVersion = candidate.upstreamVersion; entry.upstreamGitHead = candidate.upstreamGitHead; }
  }
  if (!isDeepStrictEqual(expected, candidateManifest)) errors.push("maintenance/manifest.json: 额外/缺失字段、顺序或无关 metadata 变化不允许");
  return changed;
}

function compareWorkspacePackage({ id, path, baselinePackage, candidatePackage, manifestEntry, targetVersion, errors }) {
  if (!isPlainObject(candidatePackage)) {
    errors.push(`${path}: 不是 JSON 对象`);
    return false;
  }
  checkOnlyKeys(candidatePackage, Object.keys(baselinePackage), `${path}`, errors);
  for (const key of Object.keys(baselinePackage)) {
    if (key === "dependencies") continue;
    if (!isDeepStrictEqual(candidatePackage[key], baselinePackage[key])) {
      errors.push(`${path}: 字段 ${key} 不允许变化`);
    }
  }
  const baselineDependencies = baselinePackage.dependencies ?? {};
  const candidateDependencies = candidatePackage.dependencies;
  if (!isPlainObject(candidateDependencies)) {
    errors.push(`${path}: dependencies 必须是对象`);
    return false;
  }
  const baselineNames = Object.keys(baselineDependencies).sort();
  const candidateNames = Object.keys(candidateDependencies).sort();
  if (!isDeepStrictEqual(baselineNames, candidateNames)) {
    errors.push(`${path}: 不允许新增/删除依赖（只允许修改既有依赖的精确版本）`);
    return false;
  }
  const primary = manifestEntry.upstreamPackage;
  if (candidateDependencies[primary] !== targetVersion) {
    errors.push(`${path}: 主依赖 ${primary} 必须等于 manifest 目标版本 ${targetVersion}，得到 ${candidateDependencies[primary]}`);
  }
  let changed = false;
  for (const name of candidateNames) {
    const from = baselineDependencies[name];
    const to = candidateDependencies[name];
    if (from === to) continue;
    changed = true;
    if (!isExactStableVersion(to)) {
      errors.push(`${path}: ${name} 必须改为精确稳定版本，得到 ${JSON.stringify(to)}`);
      continue;
    }
    if (compareExactStableVersions(to, from) <= 0) {
      errors.push(`${path}: 拒绝降级 ${name} ${from} -> ${to}`);
      continue;
    }
    if (name === primary) {
      if (to !== targetVersion) {
        errors.push(`${path}: ${name} 必须等于 manifest 目标版本 ${targetVersion}，得到 ${to}`);
      }
    } else if (to !== targetVersion) {
      errors.push(`${path}: 耦合依赖 ${name} 只能在存在同版本发布时同步（${targetVersion}），得到 ${to}`);
    }
  }
  if (!changed) errors.push(`${path}: 未检测到依赖版本变化（status=${JSON.stringify("update")} 时不允许）`);
  return changed;
}

function checkReport({ content, status, errors }) {
  if (typeof content !== "string" || content.length === 0) {
    errors.push(`${REPORT_PATH}: 内容为空`);
    return;
  }
  if (content.length > 200_000) errors.push(`${REPORT_PATH}: 内容过大`);
  if (!content.startsWith("# Upstream maintenance candidate")) {
    errors.push(`${REPORT_PATH}: 标题不符合生成器格式`);
  }
  const marker = `<!-- amox-maintenance-candidate; status: ${status} -->`;
  if (!content.includes(marker)) {
    errors.push(`${REPORT_PATH}: 缺少状态标记 ${marker}`);
  }
}

/**
 * Validate a candidate artifact against the checked-out baseline.
 *
 * @returns {{ok:boolean, errors:string[], writes:Array<{path:string,content:string}>}}
 */
export async function validateCandidateArtifact({ artifact, repoRoot, headSha, resolveRegistryMetadata = resolvePublicRegistryMetadata }) {
  const metadataCache = new Map();
  const registryMetadata = (name, version) => {
    const key = `${name}@${version}`;
    if (!metadataCache.has(key)) metadataCache.set(key, Promise.resolve().then(() => resolveRegistryMetadata(name, version)));
    return metadataCache.get(key);
  };
  const errors = [];
  const writes = [];
  if (!isPlainObject(artifact)) {
    return { ok: false, errors: ["candidate.json: 不是 JSON 对象"], writes };
  }
  checkOnlyKeys(artifact, ["schemaVersion", "kind", "baseCommit", "status", "files"], "candidate.json", errors);
  if (artifact.schemaVersion !== 1) errors.push("candidate.json: schemaVersion 必须为 1");
  if (artifact.kind !== CANDIDATE_KIND) errors.push("candidate.json: kind 不正确");
  if (!CANDIDATE_STATUSES.includes(artifact.status)) errors.push(`candidate.json: 未知 status ${JSON.stringify(artifact.status)}`);
  if (!HEX40.test(artifact.baseCommit ?? "")) {
    errors.push("candidate.json: baseCommit 必须是 40 位提交");
  } else if (headSha && artifact.baseCommit !== headSha) {
    errors.push(`candidate.json: baseCommit ${artifact.baseCommit} != 当前 checkout ${headSha}（基线已变化，拒绝应用）`);
  }
  if (!Array.isArray(artifact.files)) {
    return { ok: false, errors: [...errors, "candidate.json: files 必须是数组"], writes };
  }

  const baselineManifest = parseJsonFile(repoRoot, MANIFEST_PATH, errors);
  const baselineSnapshot = parseJsonFile(repoRoot, SNAPSHOT_PATH, errors);
  const baselineLock = parseJsonFile(repoRoot, LOCKFILE_PATH, errors);
  const manifestEntries = new Map((baselineManifest?.packages ?? []).map((entry) => [entry.id, entry]));
  const packageJsonPaths = new Map();
  for (const [id, entry] of manifestEntries.entries()) {
    packageJsonPaths.set(`${entry.path}/package.json`, id);
  }

  const status = artifact.status;
  const staticAllowed = new Set([MANIFEST_PATH, REPORT_PATH, LOCKFILE_PATH, SNAPSHOT_PATH, ...packageJsonPaths.keys()]);
  const seen = new Set();
  const contents = new Map();
  for (const file of artifact.files) {
    if (!isPlainObject(file)) {
      errors.push("candidate.json: files 元素必须是对象");
      continue;
    }
    checkOnlyKeys(file, ["path", "contentSha256", "content"], "candidate.json files[]", errors);
    let path;
    try {
      path = assertSafeRelativePath(file.path);
    } catch (error) {
      errors.push(`candidate.json: ${error.message}`);
      continue;
    }
    if (seen.has(path)) {
      errors.push(`candidate.json: 重复路径 ${path}`);
      continue;
    }
    seen.add(path);
    if (typeof file.content !== "string") {
      errors.push(`candidate.json: ${path} content 必须是字符串`);
      continue;
    }
    if (file.content.length > MAX_FILE_BYTES) {
      errors.push(`candidate.json: ${path} 内容过大`);
      continue;
    }
    if (typeof file.contentSha256 !== "string" || !SHA256.test(file.contentSha256)) {
      errors.push(`candidate.json: ${path} contentSha256 非法`);
      continue;
    }
    if (sha256(file.content) !== file.contentSha256) {
      errors.push(`candidate.json: ${path} 内容哈希不匹配`);
      continue;
    }
    if (!staticAllowed.has(path)) {
      errors.push(`candidate.json: 路径不在允许清单内: ${path}`);
      continue;
    }
    contents.set(path, file.content);
  }
  const totalBytes = [...contents.values()].reduce((sum, content) => sum + content.length, 0);
  if (totalBytes > MAX_TOTAL_BYTES) errors.push("candidate.json: 总内容过大");
  if (errors.length > 0) return { ok: false, errors, writes };

  const packagesByStatus = {
    ready: new Set([MANIFEST_PATH, REPORT_PATH, LOCKFILE_PATH, SNAPSHOT_PATH]),
    drift: new Set([MANIFEST_PATH, REPORT_PATH, LOCKFILE_PATH]),
    failed: new Set([MANIFEST_PATH, REPORT_PATH, LOCKFILE_PATH]),
    "lean-review": new Set([REPORT_PATH]),
    "snapshot-refresh": new Set([REPORT_PATH, SNAPSHOT_PATH]),
  };
  for (const path of contents.keys()) {
    const isWorkspacePackageJson = packageJsonPaths.has(path);
    if (!packagesByStatus[status].has(path) && !isWorkspacePackageJson) {
      errors.push(`candidate.json: status=${status} 不允许包含 ${path}`);
    }
  }

  const changedIds = new Map();
  const candidateManifest = baselineManifest && contents.has(MANIFEST_PATH)
    ? parseJsonFileFromContent(contents.get(MANIFEST_PATH), MANIFEST_PATH, errors)
    : undefined;
  if (status === "ready" || status === "drift" || status === "failed") {
    if (!baselineManifest) errors.push("candidate.json: 缺少基线 manifest，无法校验");
    else if (!candidateManifest) errors.push(`candidate.json: status=${status} 必须包含 ${MANIFEST_PATH}`);
    else {
      for (const [id, change] of compareManifest(baselineManifest, candidateManifest, errors).entries()) {
        changedIds.set(id, change.version);
      }
      if (changedIds.size === 0) errors.push(`candidate.json: status=${status} 但 manifest 没有任何版本升级`);
    }
  }
  if (status === "lean-review" || status === "snapshot-refresh") {
    if (contents.has(MANIFEST_PATH)) errors.push(`candidate.json: status=${status} 不允许修改 ${MANIFEST_PATH}`);
  }

  // Publication commit is authority from version-specific public npm DATA,
  // never live repository HEAD or artifact-supplied metadata.
  for (const [id, version] of changedIds) {
    const entry = manifestEntries.get(id);
    try {
      const metadata = await registryMetadata(entry.upstreamPackage, version);
      const claimedHead = candidateManifest.packages.find((p) => p.id === id).upstreamGitHead;
      if (metadata?.name !== entry.upstreamPackage || metadata?.version !== version || !HEX40.test(metadata.gitHead ?? "") || metadata.gitHead !== claimedHead) {
        errors.push(`maintenance/manifest.json: ${id} upstreamGitHead 必须等于 trusted npm release gitHead（缺失时需人工处理）`);
      }
    } catch (error) {
      errors.push(`maintenance/manifest.json: trusted npm release metadata 失败: ${error.message}`);
    }
  }

  const candidateWorkspaces = new Map();
  const packageChangedIds = new Set();
  for (const [path, id] of packageJsonPaths.entries()) {
    const entry = manifestEntries.get(id);
    const target = changedIds.get(id);
    if (!contents.has(path)) {
      if (target !== undefined) errors.push(`candidate.json: manifest 声明 ${id} 升级但缺少 ${path}`);
      continue;
    }
    if (status === "lean-review" || status === "snapshot-refresh") {
      errors.push(`candidate.json: status=${status} 不允许修改 ${path}`);
      continue;
    }
    const baselinePackage = parseJsonFile(repoRoot, path, errors);
    const candidatePackage = parseJsonFileFromContent(contents.get(path), path, errors);
    if (!baselinePackage || !candidatePackage) continue;
    candidateWorkspaces.set(id, candidatePackage);
    if (target === undefined) {
      errors.push(`candidate.json: ${path} 有变化但 manifest 未声明 ${id} 的版本升级`);
      continue;
    }
    if (compareWorkspacePackage({ id, path, baselinePackage, candidatePackage, manifestEntry: entry, targetVersion: target, errors })) {
      packageChangedIds.add(id);
    }
  }
  for (const id of changedIds.keys()) {
    if (!packageChangedIds.has(id)) errors.push(`candidate.json: manifest 声明 ${id} 升级但对应 package.json 无有效变化`);
  }

  if (status === "ready" || status === "drift" || (status === "failed" && contents.has(LOCKFILE_PATH))) {
    if (!baselineLock) errors.push("candidate.json: 缺少基线 lockfile，无法校验");
    else if (!contents.has(LOCKFILE_PATH)) errors.push(`candidate.json: status=${status} 必须包含 ${LOCKFILE_PATH}`);
    else {
      const candidateLock = parseJsonFileFromContent(contents.get(LOCKFILE_PATH), LOCKFILE_PATH, errors);
      if (candidateLock) {
        await compareLockfile({
          baselineLock,
          candidateLock,
          resolveRegistryMetadata: registryMetadata,
          candidateWorkspaces,
          manifestEntries,
          targetVersions: changedIds,
          errors,
        });
      }
    }
  }
  if (status === "ready") {
    if (!baselineSnapshot) errors.push("candidate.json: 缺少基线快照，无法校验");
    else if (!contents.has(SNAPSHOT_PATH)) errors.push(`candidate.json: status=ready 必须包含 ${SNAPSHOT_PATH}`);
    else {
      const candidateSnapshot = parseJsonFileFromContent(contents.get(SNAPSHOT_PATH), SNAPSHOT_PATH, errors);
      if (candidateSnapshot) {
        compareSnapshot({
          baselineSnapshot,
          candidateSnapshot,
          candidateWorkspaces,
          manifestEntries,
          targetVersions: changedIds,
          errors,
        });
      }
    }
  }
  if (status === "snapshot-refresh") {
    if (!baselineSnapshot) errors.push("candidate.json: 缺少基线快照，无法校验");
    else if (!contents.has(SNAPSHOT_PATH)) errors.push(`candidate.json: status=snapshot-refresh 必须包含 ${SNAPSHOT_PATH}`);
    else {
      const candidateSnapshot = parseJsonFileFromContent(contents.get(SNAPSHOT_PATH), SNAPSHOT_PATH, errors);
      if (candidateSnapshot) {
        compareSnapshot({ baselineSnapshot, candidateSnapshot, manifestEntries, targetVersions: new Map(), errors });
      }
    }
  }
  if (contents.has(REPORT_PATH)) checkReport({ content: contents.get(REPORT_PATH), status, errors });
  else errors.push(`candidate.json: 缺少 ${REPORT_PATH}`);

  if (errors.length > 0) return { ok: false, errors, writes };
  for (const [path, content] of contents.entries()) writes.push({ path, content });
  writes.sort((left, right) => left.path.localeCompare(right.path));
  return { ok: true, errors, writes };
}

function parseJsonFileFromContent(content, path, errors) {
  try {
    return JSON.parse(content);
  } catch (error) {
    errors.push(`candidate.json: ${path} 不是合法 JSON: ${error.message}`);
    return undefined;
  }
}

function assertNoSymlinkChain(repoRoot, path) {
  const segments = path.split("/");
  let current = repoRoot;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`拒绝通过符号链接目录写入: ${current}`);
    }
  }
  const target = join(repoRoot, path);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    throw new Error(`拒绝覆盖符号链接: ${path}`);
  }
  if (existsSync(target) && lstatSync(target).isDirectory()) {
    throw new Error(`目标路径是目录: ${path}`);
  }
}

/** Apply validated writes to the checkout. Never removes or chmods anything. */
export function applyCandidateFiles({ repoRoot, writes }) {
  const applied = [];
  for (const write of writes) {
    const path = assertSafeRelativePath(write.path);
    assertNoSymlinkChain(repoRoot, path);
    const target = join(repoRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, write.content, "utf8");
    applied.push(path);
  }
  return applied;
}

export { LOCKFILE_PATH, MANIFEST_PATH, SNAPSHOT_PATH, REPORT_PATH };
