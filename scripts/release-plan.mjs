#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readJson } from "./lib/files.mjs";
import { compareExactStableVersions, isExactStableVersion } from "./lib/semver.mjs";
import { validateReleaseTag } from "./lib/release-validation.mjs";
import { releaseEntries } from "./lib/package-selection.mjs";
import { validateReleaseChanges } from "./lib/check-scope.mjs";

export function chooseRelease({ event, requestedTag, currentVersion, previousVersion }) {
  if (!isExactStableVersion(currentVersion)) throw new Error("Invalid current version");
  if (event === "workflow_dispatch") {
    if (!validateReleaseTag(requestedTag).ok || requestedTag !== `v${currentVersion}`) throw new Error("Release tag must match root version");
    return { shouldRelease: true, tag: requestedTag };
  }
  if (event !== "push") throw new Error("Unsupported release event");
  if (!isExactStableVersion(previousVersion)) throw new Error("Cannot establish previous version; use manual Release for the initial release");
  const comparison = compareExactStableVersions(currentVersion, previousVersion);
  if (comparison < 0) throw new Error("Refusing release version downgrade");
  return { shouldRelease: comparison > 0, tag: `v${currentVersion}` };
}

if (process.argv.includes("--run")) {
  try {
    const current = readJson("package.json");
    const manifest = readJson("maintenance/manifest.json");
    releaseEntries(process.cwd());
    let previousVersion;
    if (process.env.GITHUB_EVENT_NAME === "push") {
      const before = process.env.RELEASE_BEFORE_SHA;
      if (!/^[0-9a-f]{40}$/.test(before || "") || /^0+$/.test(before)) throw new Error("No previous main SHA; use manual Release");
      previousVersion = JSON.parse(execFileSync("git", ["show", `${before}:package.json`], { encoding: "utf8" })).version;
    }
    const result = chooseRelease({ event: process.env.GITHUB_EVENT_NAME, requestedTag: process.env.RELEASE_TAG, currentVersion: current.version, previousVersion });
    const baseSha = manifest.release?.baseCommit ?? process.env.RELEASE_BEFORE_SHA ?? "";
    if (result.shouldRelease) {
      if (!manifest.release) throw new Error("An explicit package release selection is required for publication");
      const comparison = process.env.GITHUB_EVENT_NAME === "push" ? process.env.RELEASE_BEFORE_SHA : manifest.release?.baseCommit;
      if (comparison) validateReleaseChanges(process.cwd(), comparison);
    }
    for (const [name, value] of [["should_release", String(result.shouldRelease)], ["tag", result.tag], ["base_sha", baseSha]]) {
      console.log(`${name}=${value}`);
      if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: "a" });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
