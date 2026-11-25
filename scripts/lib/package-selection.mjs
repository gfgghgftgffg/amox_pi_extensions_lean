import { join } from "node:path";
import { readJson } from "./files.mjs";
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
    ...(plan.forkPlans ?? []).filter((item) => item.changed && item.decision === "port").map((item) => item.id),
  ])];
}

// The private root is maintenance-only: its version never identifies a release.
// Every package is released on its own `<packageName>@<version>` tag.
export function workspaceVersions(repoRoot) {
  const root = readJson(join(repoRoot, "package.json"));
  const manifest = readJson(join(repoRoot, "maintenance/manifest.json"));
  const lock = readJson(join(repoRoot, "package-lock.json"));
  if (root.private !== true || !isExactStableVersion(root.version)) throw new Error("Invalid private workspace root");
  if (lock.version !== root.version || lock.packages?.[""]?.version !== root.version) throw new Error("Root lockfile version mismatch");
  for (const entry of manifest.packages) {
    const pkg = readJson(join(repoRoot, entry.path, "package.json"));
    if (!isExactStableVersion(entry.version) || pkg.version !== entry.version || pkg.name !== entry.packageName
      || lock.packages[entry.path]?.version !== entry.version) {
      throw new Error(`Workspace/manifest identity or version mismatch: ${entry.id}`);
    }
  }
  return { root, manifest };
}
