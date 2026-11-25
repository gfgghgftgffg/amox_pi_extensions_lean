#!/usr/bin/env node
/**
 * Decide which package versions this run releases.
 *
 * A package release is identified by its own `<packageName>@<version>` tag.
 * A package is a candidate when its current version is ahead of the last
 * released version for that package; there is no repository-wide version.
 *
 * Legacy `vX.Y.Z` batch tags predate per-package releases. For a package that
 * has no package tag yet, the manifest recorded at the newest legacy batch tag
 * supplies the already-published baseline. A package with no release history
 * at all is compared with its version at the previous main commit, so it is
 * released only when a push introduces or bumps it; a manual Release can
 * request it explicitly.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { HEX40 } from "./lib/files.mjs";
import { compareExactStableVersions, isExactStableVersion } from "./lib/semver.mjs";
import { latestLegacyRelease, latestPackageRelease, packageTag, parsePackageTag } from "./lib/release-tags.mjs";
import { workspaceVersions } from "./lib/package-selection.mjs";
import { validateReleaseChanges } from "./lib/check-scope.mjs";

function release({ entry, baseline }) {
  return { id: entry.id, package: entry.packageName, version: entry.version, tag: packageTag(entry.packageName, entry.version), baseline };
}

export function planReleases({ event, requestedTag, beforeSha, manifest, tags, legacyBaselines = new Map(), previousVersions = new Map(), previousBase = false, commitTime = () => 0 }) {
  if (event !== "push" && event !== "workflow_dispatch") throw new Error("Unsupported release event");
  let releases = [];
  for (const entry of manifest.packages) {
    if (!isExactStableVersion(entry.version)) throw new Error(`Invalid package version: ${entry.id}`);
    let baseline = latestPackageRelease(entry.packageName, tags) ?? legacyBaselines.get(entry.id);
    // No release history: the previous main commit is the baseline, so a new
    // or bumped package is released and an untouched initial version is not.
    if (!baseline) {
      const previous = previousVersions.get(entry.id);
      if (!previous) { if (event === "push" && previousBase) releases.push(release({ entry, baseline })); continue; }
      const comparison = compareExactStableVersions(entry.version, previous.version);
      if (comparison < 0) throw new Error(`Refusing npm version downgrade: ${entry.id} ${entry.version} < ${previous.version}`);
      if (comparison > 0) releases.push(release({ entry, baseline: previous }));
      continue;
    }
    const comparison = compareExactStableVersions(entry.version, baseline.version);
    if (comparison < 0) throw new Error(`Refusing npm version downgrade: ${entry.id} ${entry.version} < ${baseline.version}`);
    if (comparison > 0) releases.push(release({ entry, baseline }));
  }
  // An empty manual tag releases every current candidate; an explicit tag
  // selects one package version, including a first release without a baseline.
  if (event === "workflow_dispatch" && requestedTag) {
    const requested = parsePackageTag(requestedTag, manifest.packages);
    if (!requested) throw new Error(`Manual Release needs a package tag <package>@X.Y.Z (got ${JSON.stringify(requestedTag)})`);
    const entry = manifest.packages.find((item) => item.packageName === requested.package);
    if (entry.version !== requested.version) throw new Error(`Tag ${requestedTag} does not match the current ${entry.packageName} version ${entry.version}`);
    const tagged = latestPackageRelease(entry.packageName, tags);
    if (tagged && compareExactStableVersions(tagged.version, entry.version) >= 0) throw new Error(`Tag ${requestedTag} is not newer than the last release ${tagged.version}`);
    releases = [release({ entry, baseline: tagged ?? legacyBaselines.get(entry.id) })];
  }
  const baselines = releases.map((item) => item.baseline?.commit).filter((commit) => HEX40.test(commit ?? ""));
  // The oldest baseline keeps verification wide enough to cover every package
  // released by this run; an unknown baseline falls back to the push range.
  const baseSha = baselines.length
    ? baselines.map((commit) => ({ commit, time: Number(commitTime(commit)) })).sort((left, right) => left.time - right.time)[0].commit
    : beforeSha ?? "";
  return { shouldRelease: releases.length > 0, releases, baseSha };
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", maxBuffer: 20_000_000, stdio: ["ignore", "pipe", "pipe"] });
}

export function readTags(repoRoot) {
  const output = git(repoRoot, ["for-each-ref", "--format=%(refname:short)%09%(objectname)%09%(*objectname)", "refs/tags"]);
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, object, peeled] = line.split("\t");
    return { name, commit: peeled || object };
  });
}

function commitTime(repoRoot, commit) {
  return Number(git(repoRoot, ["show", "-s", "--format=%ct", commit]).trim());
}

// Versions of the packages that already existed at the previous main commit.
export function previousVersions(repoRoot, manifest, beforeSha) {
  const versions = new Map();
  if (!HEX40.test(beforeSha ?? "")) return versions;
  const present = new Set(git(repoRoot, ["ls-tree", "-r", "--name-only", beforeSha]).split(/\r?\n/));
  for (const entry of manifest.packages) {
    if (!present.has(`${entry.path}/package.json`)) continue;
    const pkg = JSON.parse(git(repoRoot, ["show", `${beforeSha}:${entry.path}/package.json`]));
    versions.set(entry.id, { version: pkg.version, commit: beforeSha });
  }
  return versions;
}

export function legacyBaselines(repoRoot, manifest, tags) {
  const legacy = latestLegacyRelease(tags);
  const baselines = new Map();
  if (!legacy) return baselines;
  let recorded;
  try { recorded = JSON.parse(git(repoRoot, ["show", `${legacy.commit}:maintenance/manifest.json`])); }
  catch { throw new Error(`Legacy release tag ${legacy.version} has no maintenance manifest; cannot establish a package baseline`); }
  for (const entry of manifest.packages) {
    const previous = recorded.packages?.find((item) => item.id === entry.id);
    if (previous && isExactStableVersion(previous.version)) baselines.set(entry.id, { version: previous.version, commit: legacy.commit });
  }
  return baselines;
}

if (process.argv.includes("--run")) {
  try {
    const repoRoot = process.cwd();
    const { manifest } = workspaceVersions(repoRoot);
    const tags = readTags(repoRoot);
    const event = process.env.GITHUB_EVENT_NAME;
    const beforeSha = event === "push" ? (process.env.RELEASE_BEFORE_SHA ?? "") : "";
    const comparable = event === "push" && HEX40.test(beforeSha) && !/^0+$/.test(beforeSha);
    if (!tags.length) throw new Error("No release tags are available; fetch tags (checkout fetch-depth: 0) before planning");
    const result = planReleases({ event, requestedTag: process.env.RELEASE_TAG, beforeSha,
      manifest, tags, legacyBaselines: legacyBaselines(repoRoot, manifest, tags), commitTime: (commit) => commitTime(repoRoot, commit),
      previousBase: comparable, previousVersions: comparable ? previousVersions(repoRoot, manifest, beforeSha) : new Map() });
    // Without a trustworthy previous main commit the tag history still decides
    // releases, but no diff-based scope or introduced-package claim is made.
    if (result.shouldRelease && comparable) validateReleaseChanges(repoRoot, beforeSha);
    const outputs = [
      ["should_release", String(result.shouldRelease)],
      ["releases", JSON.stringify(result.releases.map(({ id, package: name, version, tag }) => ({ id, package: name, version, tag })))],
      ["base_sha", result.baseSha],
    ];
    for (const [name, value] of outputs) {
      console.log(`${name}=${value}`);
      if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: "a" });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
