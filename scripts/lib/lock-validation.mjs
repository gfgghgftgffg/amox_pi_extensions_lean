/** Built-in-only, public-registry-authoritative lock validation.
 * No npm, registry configuration, artifact metadata, redirects or package code.
 * Unsupported ranges/sources and peer/dev/shared-graph changes require humans.
 */
import { posix } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { compareExactStableVersions, isExactStableVersion } from "./semver.mjs";

const REGISTRY = "https://registry.npmjs.org";
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const validPackageName = (name) => typeof name === "string" && name.length <= 214 && PACKAGE_NAME.exec(name)?.[0] === name;
const FLAGS = ["dev", "optional", "devOptional", "peer", "inBundle", "link"];
const METADATA_FIELDS = ["license", "bin", "engines", "dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "os", "cpu", "funding", "deprecated"];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = (o) => o !== null && typeof o === "object" && !Array.isArray(o);

export function canonicalIntegrity(value) {
  if (typeof value !== "string") return false;
  const match = /^(sha512|sha256|sha1)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[0] !== value) return false;
  const bytes = Buffer.from(match[2], "base64");
  return bytes.length === { sha512: 64, sha256: 32, sha1: 20 }[match[1]] && bytes.toString("base64") === match[2];
}

export async function resolvePublicRegistryMetadata(name, version) {
  if (!validPackageName(name) || !isExactStableVersion(version)) throw new Error(`非法 registry identity: ${name}@${version}`);
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(name)}/${version}`, {
    redirect: "error", signal: AbortSignal.timeout(30_000), headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`public npm registry ${name}@${version}: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("registry metadata 过大");
  return JSON.parse(text);
}

/** Deliberately bounded stable npm range grammar; unknown syntax fails closed. */
export function satisfiesStableRange(version, range) {
  if (!isExactStableVersion(version) || typeof range !== "string" || range.length > 300) throw new Error(`不支持的依赖版本: ${version} / ${range}`);
  const compare = (other) => compareExactStableVersions(version, other);
  const clauses = range.trim().split(/\s*\|\|\s*/);
  const results = clauses.map((clause) => {
    if (clause === "*" || /^x$/i.test(clause) || clause === "") return true;
    const hyphen = /^(\d+\.\d+\.\d+)\s+-\s+(\d+\.\d+\.\d+)$/.exec(clause);
    if (hyphen) return compare(hyphen[1]) >= 0 && compare(hyphen[2]) <= 0;
    const tokens = clause.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/\s+/);
    return tokens.map((token) => {
      const match = /^(>=|<=|>|<|=|\^|~)?(0|[1-9]\d*)(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?$/.exec(token);
      if (!match) throw new Error(`不支持的 npm range（人工处理）: ${range}`);
      const [, op = "=", major, minor, patch] = match;
      const partial = minor === undefined || /[xX*]/.test(minor) || patch === undefined || /[xX*]/.test(patch);
      const parts = [Number(major), minor === undefined || /[xX*]/.test(minor) ? 0 : Number(minor), patch === undefined || /[xX*]/.test(patch) ? 0 : Number(patch)];
      if (parts.some((p) => !Number.isSafeInteger(p))) throw new Error(`不安全的 npm range: ${range}`);
      const lower = parts.join(".");
      if (partial && !["=", "^", "~"].includes(op)) throw new Error(`不支持的 partial comparator（人工处理）: ${range}`);
      if (minor !== undefined && /[xX*]/.test(minor) && patch !== undefined) throw new Error(`不支持的 npm range: ${range}`);
      if (partial || op === "^" || op === "~") {
        const upper = [...parts];
        const missingMinor = minor === undefined || /[xX*]/.test(minor);
        const missingPatch = patch === undefined || /[xX*]/.test(patch);
        const index = op === "^" ? (parts[0] > 0 || missingMinor ? 0 : parts[1] > 0 || missingPatch ? 1 : 2)
          : op === "~" ? (missingMinor ? 0 : 1) : missingMinor ? 0 : 1;
        upper[index] += 1;
        for (let i = index + 1; i < 3; i++) upper[i] = 0;
        if (!upper.every(Number.isSafeInteger)) throw new Error(`不安全的 npm range: ${range}`);
        return compare(lower) >= 0 && compare(upper.join(".")) < 0;
      }
      return { "=": (c) => c === 0, ">": (c) => c > 0, ">=": (c) => c >= 0, "<": (c) => c < 0, "<=": (c) => c <= 0 }[op](compare(lower));
    }).every(Boolean);
  });
  return results.some(Boolean);
}

function packageName(path) {
  const name = path.slice(path.lastIndexOf("node_modules/") + 13);
  if (!validPackageName(name)) throw new Error(`非法 resolved package path: ${path}`);
  return name;
}

function resolveDependency(packages, from, name) {
  if (!validPackageName(name)) throw new Error(`不支持的依赖名: ${name}`);
  let directory = from;
  while (true) {
    if (posix.basename(directory) !== "node_modules") {
      const path = directory ? `${directory}/node_modules/${name}` : `node_modules/${name}`;
      if (own(packages, path)) return path;
    }
    if (!directory) return undefined;
    const parent = posix.dirname(directory);
    directory = parent === "." ? "" : parent;
  }
}

function dependencies(record) {
  for (const field of ["dependencies", "optionalDependencies"]) {
    if (record[field] !== undefined && !object(record[field])) throw new Error(`${field} 必须是对象`);
  }
  return { ...(record.dependencies ?? {}), ...(record.optionalDependencies ?? {}) };
}

function baselineClosure(packages, roots) {
  const seen = new Set();
  const visit = (path) => {
    if (!path || seen.has(path)) return;
    const record = packages[path];
    if (!record) return;
    seen.add(path);
    if (record.link) { visit(record.resolved); return; }
    for (const name of Object.keys(dependencies(record))) visit(resolveDependency(packages, path, name));
  };
  roots.forEach(visit);
  return seen;
}

function checkMetadata(name, record, metadata, before) {
  if (!object(metadata) || metadata.name !== name || metadata.version !== record.version) throw new Error(`${name}: registry name/version 不一致`);
  const expectedTarball = `${REGISTRY}/${name}/-/${name.split("/").at(-1)}-${record.version}.tgz`;
  if (metadata.dist?.tarball !== expectedTarball || record.resolved !== expectedTarball) throw new Error(`${name}: resolved 必须等于 trusted public npm dist.tarball`);
  if (!canonicalIntegrity(metadata.dist?.integrity) || !canonicalIntegrity(record.integrity) || record.integrity !== metadata.dist.integrity) throw new Error(`${name}: integrity 必须等于 canonical trusted registry dist.integrity`);
  if (own(record, "name") && record.name !== name) throw new Error(`${name}: lock name 不一致`);
  // npm omits empty metadata, string bin is normalized to a command map.
  for (const field of METADATA_FIELDS) {
    let expected = metadata[field];
    if (field === "bin" && typeof expected === "string") expected = { [name.split("/").at(-1)]: expected };
    if (object(expected) && Object.keys(expected).length === 0) expected = undefined;
    if (field === "license" && record[field] === undefined) continue; // npm versions may omit license.
    if (!isDeepStrictEqual(record[field], expected)) throw new Error(`${name}: ${field} 与 trusted registry metadata 不一致`);
  }
  if (record.hasInstallScript !== undefined && typeof record.hasInstallScript !== "boolean") throw new Error(`${name}: hasInstallScript 必须是 boolean`);
  const hasInstallScript = ["preinstall", "install", "postinstall"].some((key) => typeof metadata.scripts?.[key] === "string");
  if (Boolean(record.hasInstallScript) !== hasInstallScript) throw new Error(`${name}: hasInstallScript 与 registry 不一致`);
  const known = new Set(["name", "version", "resolved", "integrity", "hasInstallScript", ...FLAGS, ...METADATA_FIELDS]);
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(record)])) {
    if (!known.has(key) && (!before || !isDeepStrictEqual(record[key], before[key]) || own(record, key) !== own(before, key))) throw new Error(`${name}: 额外 lock 字段 ${key} 不允许变化`);
  }
  for (const flag of FLAGS) {
    if (before && (!isDeepStrictEqual(before[flag], record[flag]) || own(before, flag) !== own(record, flag))) throw new Error(`${name}: ${flag} 标志不允许变化`);
    if (!before && own(record, flag) && !(flag === "optional" && record[flag] === true)) throw new Error(`${name}: 新增 dev/peer/link 标志需要人工处理`);
  }
  if (before) {
    for (const field of ["peerDependencies", "peerDependenciesMeta"]) {
      if (!isDeepStrictEqual(before[field], record[field])) throw new Error(`${name}: peer 变化需要人工处理`);
    }
  }
}

export async function compareLockfile({ baselineLock, candidateLock, candidateWorkspaces, manifestEntries, targetVersions, errors, resolveRegistryMetadata = resolvePublicRegistryMetadata }) {
  try {
    if (!object(candidateLock) || candidateLock.lockfileVersion !== 3 || !object(candidateLock.packages)) throw new Error("lock schema 必须是 v3 packages 对象");
    const { packages: oldPackages, ...oldTop } = baselineLock;
    const { packages: newPackages, ...newTop } = candidateLock;
    if (!isDeepStrictEqual(oldTop, newTop)) throw new Error("顶层 lock metadata 不允许变化");
    for (const [path, record] of Object.entries(newPackages)) {
      if (path && (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => ["", ".", ".."].includes(part)))) throw new Error(`非法 packages key ${path}`);
      if (!object(record)) throw new Error(`${path}: lock record 必须是对象`);
    }
    const roots = [];
    const changedWorkspacePaths = new Set();
    const changedNamesByWorkspace = new Map();
    for (const [id, version] of targetVersions) {
      const entry = manifestEntries.get(id);
      const workspace = candidateWorkspaces.get(id);
      if (!workspace) throw new Error(`缺少 ${id} 的候选 package.json`);
      const before = oldPackages[entry.path];
      const next = newPackages[entry.path];
      if (!next || !isDeepStrictEqual(next, { ...before, dependencies: workspace.dependencies })) throw new Error(`${entry.path}: 工作区仅允许与 package.json 一致的 dependencies 变化`);
      changedWorkspacePaths.add(entry.path);
      changedNamesByWorkspace.set(entry.path, new Set());
      for (const [name, target] of Object.entries(workspace.dependencies)) {
        if (target === before.dependencies?.[name]) continue;
        changedNamesByWorkspace.get(entry.path).add(name);
        const path = resolveDependency(newPackages, entry.path, name);
        if (!path || newPackages[path].version !== target) throw new Error(`${name}: lock 版本必须为 ${target}`);
        const oldPath = resolveDependency(oldPackages, entry.path, name);
        roots.push({ oldPath, path });
      }
      if (workspace.dependencies[entry.upstreamPackage] !== version) throw new Error(`${id}: 主依赖版本不一致`);
    }
    const oldClosure = baselineClosure(oldPackages, roots.map((r) => r.oldPath));
    const newClosure = new Set();
    const requiredReachable = new Set();
    const metadataCache = new Map();
    const visit = async (path) => {
      if (newClosure.has(path)) return;
      newClosure.add(path);
      if (newClosure.size > 1000) throw new Error("dependency closure 过大");
      const record = newPackages[path];
      if (!record || record.link || !isExactStableVersion(record.version)) throw new Error(`${path}: closure 仅允许精确稳定 public npm packages`);
      const name = packageName(path);
      const recordChanged = !isDeepStrictEqual(record, oldPackages[path]);
      if (recordChanged) {
        const identity = `${name}@${record.version}`;
        if (!metadataCache.has(identity)) metadataCache.set(identity, await resolveRegistryMetadata(name, record.version));
        checkMetadata(name, record, metadataCache.get(identity), oldPackages[path]);
      }
      for (const [peer, range] of Object.entries(recordChanged ? record.peerDependencies ?? {} : {})) {
        const peerPath = resolveDependency(newPackages, path, peer);
        if (!peerPath && record.peerDependenciesMeta?.[peer]?.optional === true) continue;
        if (!peerPath || peerPath !== resolveDependency(oldPackages, path, peer) || !isDeepStrictEqual(newPackages[peerPath], oldPackages[peerPath]) || !satisfiesStableRange(newPackages[peerPath]?.version, range)) throw new Error(`${path}: peer ${peer}@${range} 不可达/变化，需人工处理`);
      }
      for (const [dependency, range] of Object.entries(dependencies(record))) {
        const child = resolveDependency(newPackages, path, dependency);
        const isOptional = own(record.optionalDependencies ?? {}, dependency);
        if (!child && isOptional) continue;
        if (!child || !satisfiesStableRange(newPackages[child]?.version, range)) throw new Error(`${path}: ${dependency}@${range} 不可达/版本不匹配`);
        await visit(child);
      }
    };
    for (const root of roots) await visit(root.path);
    // Compute mandatory roles independently of DFS visit order: an optional
    // path may reach a shared node before a required path reaches that node.
    // Its required descendants must still be mandatory. Existing dev/peer or
    // optional-only flags cannot silently stand in for this new runtime use.
    const pendingRequired = roots.map((root) => root.path);
    while (pendingRequired.length > 0) {
      const path = pendingRequired.pop();
      if (requiredReachable.has(path)) continue;
      requiredReachable.add(path);
      const record = newPackages[path];
      for (const name of Object.keys(record.dependencies ?? {})) {
        if (own(record.optionalDependencies ?? {}, name)) continue;
        pendingRequired.push(resolveDependency(newPackages, path, name));
      }
    }
    for (const path of requiredReachable) {
      if (["optional", "dev", "devOptional", "peer"].some((flag) => newPackages[path][flag] === true)) throw new Error(`${path}: required runtime reachability 与 optional/dev/peer 标志冲突，需人工处理`);
    }
    // Freeze everything also reachable from unrelated roots, including peers
    // and dev dependencies. Upgrades needing shared/peer churn go to humans.
    const unrelatedRoots = [];
    for (const [path, record] of Object.entries(oldPackages)) {
      if (path !== "" && !path.startsWith("packages/")) continue;
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const name of Object.keys(record[field] ?? {})) {
          const child = resolveDependency(oldPackages, path, name);
          if (field === "dependencies" && changedNamesByWorkspace.get(path)?.has(name)) continue;
          unrelatedRoots.push(child);
        }
      }
    }
    // Root workspace links would traverse the bumped workspace again. Skip
    // links here; the unchanged workspace's dependencies were seeded above.
    const protectedPaths = baselineClosure(oldPackages, unrelatedRoots.filter((path) => !oldPackages[path]?.link));
    // Peers are not part of the update permission. Freeze their transitive
    // runtime graphs too, even when referenced only by an updated target.
    for (const path of oldClosure) {
      const peerRoots = Object.keys(oldPackages[path]?.peerDependencies ?? {}).map((name) => resolveDependency(oldPackages, path, name));
      for (const peerPath of baselineClosure(oldPackages, peerRoots)) protectedPaths.add(peerPath);
    }
    for (const [path, record] of Object.entries(oldPackages)) {
      for (const field of ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"]) {
        const mayChange = (field === "dependencies" || field === "optionalDependencies") && oldClosure.has(path) && !protectedPaths.has(path);
        for (const name of Object.keys(record[field] ?? {})) {
          if (mayChange || (field === "dependencies" && changedNamesByWorkspace.get(path)?.has(name))) continue;
          if (resolveDependency(oldPackages, path, name) !== resolveDependency(newPackages, path, name)) throw new Error(`${path}: 无关/peer/dev 依赖解析路径变化 ${name}`);
        }
      }
    }
    for (const path of new Set([...Object.keys(oldPackages), ...Object.keys(newPackages)])) {
      if (isDeepStrictEqual(oldPackages[path], newPackages[path])) continue;
      if (changedWorkspacePaths.has(path)) continue;
      if ((!oldClosure.has(path) && !newClosure.has(path)) || protectedPaths.has(path)) throw new Error(`${path}: 无关/共享 lock record 不允许变化或删除`);
      if (newPackages[path] && !newClosure.has(path)) throw new Error(`${path}: 新记录不在目标 dependency closure`);
      if (!newPackages[path] && newClosure.has(path)) throw new Error(`${path}: 仍然可达的依赖不能删除`);
    }
  } catch (error) {
    errors.push(`package-lock.json: ${error.message}`);
  }
}
