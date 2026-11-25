import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { isDeepStrictEqual as equal } from "node:util";
import { HEX40, readJson } from "./files.mjs";
import { workspaceVersions } from "./package-selection.mjs";
import { compareExactStableVersions } from "./semver.mjs";

function withoutVersion(value) { const copy = structuredClone(value); delete copy.version; return copy; }
function dependencyClosure(lock, entry) {
  const records = lock.packages, seen = new Set();
  const visit = (key) => {
    const record = records[key];
    if (!record || seen.has(key)) return;
    seen.add(key);
    for (const name of Object.keys({ ...record.dependencies, ...record.optionalDependencies })) {
      let dir = key;
      while (true) {
        const candidate = `${dir ? `${dir}/` : ""}node_modules/${name}`;
        if (records[candidate]) { visit(candidate); break; }
        if (!dir) break;
        dir = posix.dirname(dir); if (dir === ".") dir = "";
      }
    }
  };
  visit(entry.path); return seen;
}

// Metadata generated for a single package must not itself force a full suite.
// Unknown/shared changes and dependencies used by multiple packages expand it.
export function scopeFromChanges({ entries, paths, before, after }) {
  const ids = new Set(), reasons = [];
  let full = false;
  const expand = (reason) => { full = true; reasons.push(reason); };
  const generated = new Set(["package.json", "package-lock.json", "maintenance/manifest.json", "maintenance/tool-contracts.json", "maintenance/agent-review.md", "maintenance/update-report.md"]);
  for (const path of paths) {
    const owner = entries.find((entry) => path.startsWith(`${entry.path}/`));
    if (owner) { ids.add(owner.id); continue; }
    if (generated.has(path)) continue;
    if (["README.md", "README.zh-CN.md"].includes(path)
      && before[path]?.replace(/\d+(?:\.\d+)?%/g, "#%") === after[path]?.replace(/\d+(?:\.\d+)?%/g, "#%")) continue;
    expand(`shared file: ${path}`);
  }
  if (!equal(withoutVersion(before.root), withoutVersion(after.root))) expand("shared root configuration");
  if (!equal(before.manifest.monorepo, after.manifest.monorepo) || before.manifest.schemaVersion !== after.manifest.schemaVersion
    || before.manifest.packages.length !== entries.length) expand("shared manifest configuration");
  for (const entry of entries) {
    const old = before.manifest.packages.find((item) => item.id === entry.id);
    if (!old) { expand("package set changed"); continue; }
    if (!equal(old, entry)) ids.add(entry.id);
    if (!equal(before.snapshot.lean?.[entry.packageName], after.snapshot.lean?.[entry.packageName])
      || !equal(before.snapshot.upstream?.[entry.upstreamPackage], after.snapshot.upstream?.[entry.upstreamPackage])) ids.add(entry.id);
  }
  for (const key of ["lean", "upstream"]) {
    if (!equal(Object.keys(before.snapshot[key] ?? {}).sort(), Object.keys(after.snapshot[key] ?? {}).sort())) expand(`contract package set: ${key}`);
  }
  for (const key of ["schemaVersion", "estimator", "environment"]) {
    if (!equal(before.snapshot[key], after.snapshot[key])) expand(`shared contract ${key}`);
  }
  const owners = new Map(entries.map((entry) => [entry.id, new Set([
    ...dependencyClosure(before.lock, entry), ...dependencyClosure(after.lock, entry),
  ])]));
  for (const key of new Set([...Object.keys(before.lock.packages), ...Object.keys(after.lock.packages)])) {
    if (!key || entries.some((entry) => entry.path === key) || equal(before.lock.packages[key], after.lock.packages[key])) continue;
    const affected = entries.filter((entry) => owners.get(entry.id).has(key));
    if (!affected.length) expand(`shared/development dependency: ${key}`);
    else for (const entry of affected) ids.add(entry.id);
  }
  if (!ids.size) expand("no package-local scope can be established");
  // Validation-only ABI pair, independent of npm dependencies/release selection.
  const integrationPair = ["pi-subagents-lean", "pi-goal-x-lean"];
  if (!full && integrationPair.some((id) => ids.has(id))) {
    for (const id of integrationPair) ids.add(id);
    reasons.push("goal/subagents global v1 API and native result/notification ABI");
  }
  return { full, packageIds: entries.filter((entry) => full || ids.has(entry.id)).map((entry) => entry.id), reasons };
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", maxBuffer: 20_000_000, stdio: ["ignore", "pipe", "pipe"] });
}

// Every package is released on its own version, so a version increase is the
// release request. A published file may only change together with such an
// increase; otherwise the change would never reach npm.
export function validateReleaseChanges(repoRoot, baseRef) {
  const { manifest } = workspaceVersions(repoRoot);
  const previousFiles = new Set(git(repoRoot, ["ls-tree", "-r", "--name-only", baseRef]).trim().split(/\r?\n/));
  for (const entry of manifest.packages) {
    // A package added after the comparison base has no previous version and
    // publishes its initial version when its first tag is created.
    if (!previousFiles.has(`${entry.path}/package.json`)) continue;
    const previous = JSON.parse(git(repoRoot, ["show", `${baseRef}:${entry.path}/package.json`]));
    const change = compareExactStableVersions(entry.version, previous.version);
    if (change < 0) throw new Error(`Refusing npm version downgrade: ${entry.id}`);
    if (change > 0) continue;
    const current = readJson(join(repoRoot, entry.path, "package.json"));
    // Check both published source lists before metadata so removing a files
    // entry cannot hide a changed or deleted source from the comparison base.
    const sources = [...new Set([...(previous.files ?? []), ...(current.files ?? [])])]
      .filter((file) => typeof file === "string" && file.endsWith(".ts")
        && (previousFiles.has(`${entry.path}/${file}`) || existsSync(join(repoRoot, entry.path, file))));
    const files = new Set([...sources, "package.json", "index.ts", "LICENSE", "README.md", "README.zh-CN.md", "MAINTENANCE.md"]);
    if (previousFiles.has(`${entry.path}/core.ts`) || existsSync(join(repoRoot, entry.path, "core.ts"))) files.add("core.ts");
    for (const file of files) {
      if (!previousFiles.has(`${entry.path}/${file}`) || !existsSync(join(repoRoot, entry.path, file))
        || git(repoRoot, ["show", `${baseRef}:${entry.path}/${file}`]) !== readFileSync(join(repoRoot, entry.path, file), "utf8")) {
        throw new Error(`Published package changed without a version bump: ${entry.id}/${file}`);
      }
    }
  }
}

export function loadCheckScope(repoRoot, baseRef) {
  const { manifest } = workspaceVersions(repoRoot);
  const fallback = (reason) => ({ full: true, packageIds: manifest.packages.map((entry) => entry.id), reasons: [reason] });
  if (!HEX40.test(baseRef ?? "")) return fallback("no immutable comparison base; full verification");
  let before, after, paths;
  try {
    const names = { root: "package.json", manifest: "maintenance/manifest.json", lock: "package-lock.json", snapshot: "maintenance/tool-contracts.json" };
    before = Object.fromEntries(Object.entries(names).map(([key, path]) => [key, JSON.parse(git(repoRoot, ["show", `${baseRef}:${path}`]))]));
    after = Object.fromEntries(Object.entries(names).map(([key, path]) => [key, readJson(join(repoRoot, path))]));
    paths = git(repoRoot, ["diff", "--name-only", "--no-renames", baseRef]).trim().split(/\r?\n/).filter(Boolean);
    for (const path of ["README.md", "README.zh-CN.md"]) {
      before[path] = git(repoRoot, ["show", `${baseRef}:${path}`]); after[path] = readFileSync(join(repoRoot, path), "utf8");
    }
  } catch { return fallback("comparison unavailable; full verification"); }
  validateReleaseChanges(repoRoot, baseRef);
  return scopeFromChanges({ entries: manifest.packages, paths, before, after });
}

export function checkCommands(scope) {
  const selection = scope.full ? [] : ["--packages", scope.packageIds.join(",")];
  return [["node", ["scripts/check-selected.mjs", ...selection]],
    ["npm", ["run", "contracts:check", ...(selection.length ? ["--", ...selection] : [])]],
    ["npm", ["run", "verify:production", ...(selection.length ? ["--", ...selection] : [])]],
    ["node", ["scripts/audit-dependencies.mjs"]], ["node", ["scripts/audit-dependencies.mjs", "--omit=dev"]]];
}
