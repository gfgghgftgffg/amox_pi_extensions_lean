/**
 * Package-level release tags.
 *
 * Every npm package is versioned and released on its own: the Git tag for a
 * release is `<packageName>@<version>`, the same shape npm itself uses. There
 * is no repository-wide release version.
 */
import { compareExactStableVersions, isExactStableVersion } from "./semver.mjs";

export function packageTag(packageName, version) {
  if (typeof packageName !== "string" || !packageName) throw new Error("Package tag needs a package name");
  if (!isExactStableVersion(version)) throw new Error(`Package tag needs an exact stable version: ${JSON.stringify(version)}`);
  return `${packageName}@${version}`;
}

/** Resolve a tag against the manifest; undefined when it is not a package tag. */
export function parsePackageTag(tag, packages) {
  if (typeof tag !== "string") return undefined;
  for (const entry of packages) {
    const prefix = `${entry.packageName}@`;
    if (!tag.startsWith(prefix)) continue;
    const version = tag.slice(prefix.length);
    return isExactStableVersion(version) ? { id: entry.id, package: entry.packageName, version, tag } : undefined;
  }
  return undefined;
}

/** Highest `<packageName>@<version>` tag, with the commit it points at. */
export function latestPackageRelease(packageName, tags) {
  let latest;
  for (const { name, commit } of tags) {
    const prefix = `${packageName}@`;
    if (!name.startsWith(prefix) || !commit) continue;
    const version = name.slice(prefix.length);
    if (!isExactStableVersion(version)) continue;
    if (!latest || compareExactStableVersions(version, latest.version) > 0) latest = { version, commit };
  }
  return latest;
}

/** Highest legacy `vX.Y.Z` batch tag, kept only to seed pre-migration baselines. */
export function latestLegacyRelease(tags) {
  let latest;
  for (const { name, commit } of tags) {
    const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(name);
    if (!match || !commit) continue;
    const version = name.slice(1);
    if (!isExactStableVersion(version)) continue;
    if (!latest || compareExactStableVersions(version, latest.version) > 0) latest = { version, commit };
  }
  return latest;
}
