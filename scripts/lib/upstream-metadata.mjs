/**
 * Upstream metadata collection (npm registry + git HEADs).
 *
 * Network failures, HTTP errors, malformed registry payloads, prereleases and
 * broken git output all throw. The maintenance flow must fail visibly instead
 * of silently reporting "no update". Tests inject a metadata file instead of
 * touching the network.
 */
import { isExactStableVersion, looksLikePrerelease } from "./semver.mjs";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Strict end-of-string: JavaScript $ also accepts a trailing newline.
const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;

/** Sorted unique dependency names pinned across all workspace packages. */
export function trackedDependencies(workspaces) {
  const names = new Set();
  for (const workspace of workspaces) {
    for (const name of Object.keys(workspace.pkg.dependencies ?? {})) names.add(name);
  }
  return [...names].sort();
}

/** Sorted unique git URLs needed for detection/planning. */
export function requiredGitUrls(manifest) {
  const urls = new Set();
  for (const entry of manifest.packages) {
    urls.add(entry.leanRepository);
    urls.add(entry.upstreamRepository);
  }
  return [...urls].filter((url) => typeof url === "string" && url.length > 0).sort();
}

function assertMetadataShape(metadata, origin) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${origin}: metadata must be a JSON object`);
  }
  if (!metadata.npm || typeof metadata.npm !== "object" || Array.isArray(metadata.npm)) {
    throw new Error(`${origin}: metadata.npm must be an object`);
  }
  if (!metadata.git || typeof metadata.git !== "object" || Array.isArray(metadata.git)) {
    throw new Error(`${origin}: metadata.git must be an object`);
  }
  for (const [name, value] of Object.entries(metadata.npm)) {
    if (!value || typeof value !== "object" || !isExactStableVersion(value.latestStable)) {
      throw new Error(`${origin}: metadata.npm[${name}].latestStable must be an exact stable X.Y.Z version`);
    }
    if (value.gitHead !== undefined && !HEX40.test(value.gitHead)) throw new Error(`${origin}: metadata.npm[${name}].gitHead must be a full publication commit`);
  }
  for (const [url, value] of Object.entries(metadata.git)) {
    if (!value || typeof value !== "object" || typeof value.head !== "string" || !HEX40.test(value.head)) {
      throw new Error(`${origin}: metadata.git[${url}].head must be a full 40-hex commit`);
    }
  }
  return metadata;
}

/** Load an injected metadata snapshot (offline tests / manual runs). */
export function loadInjectedMetadata(filePath) {
  const text = readFileSync(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${filePath}: 无法解析 metadata JSON: ${error.message}`);
  }
  return assertMetadataShape(parsed, filePath);
}

async function fetchNpmLatest({ name, fetchImpl, registry }) {
  const url = `${registry.replace(/\/$/, "")}/${name.startsWith("@") ? name.replace("/", "%2f") : name}`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "amox-lean-maintenance" } });
  } catch (error) {
    throw new Error(`npm registry 请求失败 (${name}): ${error.message}`);
  }
  if (!response || typeof response.ok !== "boolean") {
    throw new Error(`npm registry 响应非法 (${name})`);
  }
  if (!response.ok) {
    throw new Error(`npm registry HTTP ${response.status} (${name})`);
  }
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(`npm registry JSON 解析失败 (${name}): ${error.message}`);
  }
  const latest = body?.["dist-tags"]?.latest;
  if (typeof latest !== "string" || latest.trim().length === 0) {
    throw new Error(`npm registry 缺少 dist-tags.latest (${name})`);
  }
  if (!isExactStableVersion(latest)) {
    throw new Error(`${looksLikePrerelease(latest) ? "拒绝预发布版本" : "latest 不是精确稳定版本"} (${name}): ${latest}`);
  }
  if (!body.versions || typeof body.versions !== "object" || Array.isArray(body.versions) || !body.versions[latest] || body.versions[latest].name !== name || body.versions[latest].version !== latest) {
    throw new Error(`npm registry latest ${latest} 缺少 version-specific metadata (${name})`);
  }
  const gitHead = body.versions[latest].gitHead;
  if (!HEX40.test(gitHead ?? "")) throw new Error(`npm publication gitHead 缺失/非法 (${name}@${latest})；需人工审查`);
  return { latestStable: latest, gitHead };
}

/** Default git HEAD resolver: `git ls-remote <url> HEAD`. */
export function defaultGitHeadResolver(url, { timeoutMs = 90_000 } = {}) {
  const result = spawnSync("git", ["ls-remote", url, "HEAD"], { encoding: "utf8", timeout: timeoutMs });
  if (result.error) {
    throw new Error(`git ls-remote 执行失败 (${url}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git ls-remote 失败 (${url}): ${(result.stderr ?? "").trim() || `exit ${result.status}`}`);
  }
  const line = (result.stdout ?? "").trim().split("\n").find((candidate) => candidate.trim().length > 0) ?? "";
  const match = /^([0-9a-f]{40})\s+HEAD$/.exec(line.trim());
  if (!match) {
    throw new Error(`git ls-remote 输出无法识别 (${url}): ${JSON.stringify(line)}`);
  }
  return match[1];
}

/**
 * Fetch metadata for every tracked dependency and required git repository.
 * Deterministic key order; throws on any failure.
 */
export async function fetchUpstreamMetadata({
  manifest,
  workspaces,
  fetchImpl = globalThis.fetch,
  gitHeadResolver = defaultGitHeadResolver,
  registry = "https://registry.npmjs.org",
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("当前 Node 运行时没有可用的 fetch；请使用 --metadata <file> 注入元数据");
  }
  const npm = {};
  for (const name of trackedDependencies(workspaces)) {
    npm[name] = await fetchNpmLatest({ name, fetchImpl, registry });
  }
  const git = {};
  for (const url of requiredGitUrls(manifest)) {
    git[url] = { head: gitHeadResolver(url) };
  }
  return { npm, git };
}

export { assertMetadataShape };
