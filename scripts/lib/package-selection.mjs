import { join } from "node:path";
import { readJson, HEX40 } from "./files.mjs";
import { isExactStableVersion } from "./semver.mjs";

export function selectEntries(entries, ids) {
  if (ids === undefined) return entries;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
    || ids.some((id) => typeof id !== "string" || !entries.some((entry) => entry.id === id))) {
    throw new Error("Package selection must contain unique known package IDs");
  }
  return entries.filter((entry) => ids.includes(entry.id));
}

export function parsePackageIds(args, { flags = [], values = [] } = {}) {
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--packages" || values.includes(arg)) {
      if (seen.has(arg) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${arg} needs one value`);
      seen.add(arg); i++;
    } else if (!flags.includes(arg)) throw new Error(`Unsupported package-selection argument: ${arg}`);
  }
  const positions = args.flatMap((arg, i) => arg === "--packages" ? [i] : []);
  if (!positions.length) return undefined;
  if (positions.length !== 1 || !args[positions[0] + 1] || args[positions[0] + 1].startsWith("--")) {
    throw new Error("--packages needs one comma-separated package selection");
  }
  return args[positions[0] + 1].split(",");
}

export function maintenancePackageIds(plan) {
  return [...new Set([
    ...plan.packagePlans.filter((item) => item.versionChange === "bump").map((item) => item.id),
    ...plan.leanPlans.filter((item) => item.changed).map((item) => item.id),
  ])];
}

export function workspaceVersions(repoRoot) {
  const root = readJson(join(repoRoot, "package.json"));
  const manifest = readJson(join(repoRoot, "maintenance/manifest.json"));
  const lock = readJson(join(repoRoot, "package-lock.json"));
  if (root.private !== true || !isExactStableVersion(root.version)) throw new Error("Invalid private release-batch root");
  if (lock.version !== root.version || lock.packages?.[""]?.version !== root.version) throw new Error("Release-batch lockfile version mismatch");
  for (const entry of manifest.packages) {
    const pkg = readJson(join(repoRoot, entry.path, "package.json"));
    if (!isExactStableVersion(entry.version) || pkg.version !== entry.version || pkg.name !== entry.packageName
      || lock.packages[entry.path]?.version !== entry.version) {
      throw new Error(`Workspace/manifest identity or version mismatch: ${entry.id}`);
    }
  }
  return { root, manifest };
}

// Root version/tag identifies a GitHub release batch, not every npm version.
// Existing uniform releases remain readable; independent releases require an
// explicit, immutable selection in the protected maintenance manifest.
export function releaseEntries(repoRoot) {
  const { root, manifest } = workspaceVersions(repoRoot);
  const release = manifest.release;
  if (release === undefined) {
    if (manifest.packages.some((entry) => entry.version !== root.version)) throw new Error("Independent package versions require an explicit release selection");
    return manifest.packages;
  }
  if (release.version !== root.version || !HEX40.test(release.baseCommit ?? "") || !Array.isArray(release.packageIds)) throw new Error("Invalid release batch version/base");
  return selectEntries(manifest.packages, release.packageIds);
}
