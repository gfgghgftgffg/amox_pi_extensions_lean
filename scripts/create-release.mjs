#!/usr/bin/env node
/**
 * Final release step: create the Git tag / GitHub release through `gh`.
 *
 * Runs only in the write-scoped release job (environment `release`), after the
 * read-only verification job passed at the same immutable `EXPECTED_SHA`.
 * Uses `execFileSync` with argument arrays (no shell interpolation), refuses
 * to retarget an existing tag or overwrite an existing release, and never
 * publishes to npm.
 *
 * Environment:
 *   RELEASE_TAG       vX.Y.Z (workflow input, validated again here)
 *   EXPECTED_SHA      verified immutable commit ($GITHUB_SHA from the run)
 *   GITHUB_REPOSITORY owner/repo
 *   GH_TOKEN          token used only for the final create call
 *
 * Flags:
 *   --verify-only     validate tag/version/SHA and exit before any token use
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { releaseNotes, validateReleaseContext } from "./lib/release-validation.mjs";

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function gh(args, { allowNotFound = false } = {}) {
  try {
    return { ok: true, stdout: execFileSync("gh", args, { encoding: "utf8", env: process.env }).trim() };
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    const status = error.status;
    if (allowNotFound && (status === 1 || status === 4) && /(404|Not Found)/i.test(stderr)) {
      return { ok: false, notFound: true, stderr };
    }
    throw new Error(`gh ${args.join(" ")} 失败 (exit ${status}): ${stderr.trim() || error.message}`);
  }
}

try {
  const tag = process.env.RELEASE_TAG;
  const expectedSha = process.env.EXPECTED_SHA ?? process.env.GITHUB_SHA;
  const repository = process.env.GITHUB_REPOSITORY;
  const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
  const headSha = git(["rev-parse", "HEAD"]);

  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY 缺失或非法");
  }
  const errors = validateReleaseContext({ tag, packageVersion, expectedSha, headSha });
  if (errors.length > 0) {
    console.error("Release validation failed:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  if (process.argv.includes("--verify-only")) {
    console.log(`Release context verified: tag=${tag} version=${packageVersion} sha=${headSha} (no token used)`);
    process.exit(0);
  }

  if (!process.env.GH_TOKEN) {
    throw new Error("GH_TOKEN 缺失：release job 需要在最终步骤注入 token");
  }

  const tagRef = gh(["api", `repos/${repository}/git/ref/tags/${tag}`], { allowNotFound: true });
  if (tagRef.ok) {
    console.error(`Refusing to retarget existing tag ${tag}.`);
    process.exit(1);
  }
  const release = gh(["release", "view", tag, "--repo", repository], { allowNotFound: true });
  if (release.ok) {
    console.error(`Refusing to overwrite existing release ${tag}.`);
    process.exit(1);
  }

  const notes = releaseNotes({ tag, repository, sha: expectedSha });
  const created = gh(["release", "create", tag, "--repo", repository, "--target", expectedSha, "--title", tag, "--notes", notes]);
  console.log(`Created release ${tag} (tag target ${expectedSha}).`);
  if (created.stdout) console.log(created.stdout);
  process.exit(0);
} catch (error) {
  console.error(`Release failed: ${error.message}`);
  process.exit(1);
}
