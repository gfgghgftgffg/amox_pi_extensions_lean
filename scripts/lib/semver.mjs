/**
 * Minimal strict semver helpers for the maintenance tooling.
 *
 * Only exact `X.Y.Z` stable versions are accepted: the maintenance flow pins
 * upstream engines to exact versions and must never accept prereleases or
 * ranges silently. No external dependencies.
 */

export const EXACT_STABLE_VERSION = /^\d+\.\d+\.\d+$/;

/** True for an exact stable `X.Y.Z` version string. */
export function isExactStableVersion(value) {
  return typeof value === "string" && EXACT_STABLE_VERSION.test(value);
}

/** Parse `X.Y.Z` into numeric parts; throws on anything else (incl. ranges). */
export function parseExactStableVersion(value) {
  if (!isExactStableVersion(value)) {
    throw new Error(`Not an exact stable version (X.Y.Z): ${JSON.stringify(value)}`);
  }
  return value.split(".").map((part) => Number.parseInt(part, 10));
}

/** Compare two exact stable versions: -1, 0, or 1. */
export function compareExactStableVersions(left, right) {
  const a = parseExactStableVersion(left);
  const b = parseExactStableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

/** True when the version string looks like a prerelease (e.g. 1.2.3-rc.1). */
export function looksLikePrerelease(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+-/.test(value);
}
