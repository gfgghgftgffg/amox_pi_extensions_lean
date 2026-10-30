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
 *   --verify-only     validate tag/version/SHA/summary before any token use
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractReleaseSummary, releaseNotes, validateReleaseContext } from "./lib/release-validation.mjs";
import { validateReleaseAssets } from "./release-assets.mjs";
import { releaseEntries } from "./lib/package-selection.mjs";

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function gh(args, { allowNotFound = false } = {}) {
  try {
    return { ok: true, stdout: execFileSync("gh", args, { encoding: "utf8", env: process.env }).trim() };
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    const status = error.status;
    if (allowNotFound && (status === 1 || status === 4) && /\bHTTP 404\b/i.test(stderr)) {
      return { ok: false, notFound: true, stderr };
    }
    throw new Error(`gh ${args.join(" ")} 失败 (exit ${status}): ${stderr.trim() || error.message}`);
  }
}

let reservedTag;
function verifyRef(text, tag, sha) {
  const ref = JSON.parse(text);
  if (ref.ref !== `refs/tags/${tag}` || ref.object?.type !== "commit" || ref.object?.sha !== sha) {
    throw new Error(`created tag ref 与 verified SHA 不一致: ${tag}`);
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

  // Never call a model here. Reject missing/stale evidence before token use
  // or reserving a tag, including the read-only verification preflight.
  const summary = extractReleaseSummary({ report: readFileSync(resolve("maintenance/update-report.md"), "utf8"), tag });
  const packages = releaseEntries(process.cwd());
  const notes = releaseNotes({ tag, repository, sha: expectedSha, summary, packages });

  if (process.argv.includes("--verify-only")) {
    console.log(`Release context verified: tag=${tag} version=${packageVersion} sha=${headSha} (no token used)`);
    process.exit(0);
  }

  const assetsIndex = process.argv.indexOf("--assets-dir");
  if (assetsIndex >= 0 && !process.argv[assetsIndex + 1]) throw new Error("--assets-dir needs a directory");
  const assetsDir = assetsIndex < 0 ? undefined : process.argv[assetsIndex + 1];
  const assets = assetsDir ? [
    ...validateReleaseAssets({ repoRoot: process.cwd(), dir: assetsDir }).map((asset) => asset.path),
    resolve(assetsDir, "assets.json"),
  ] : [];

  if (!process.env.GH_TOKEN) {
    throw new Error("GH_TOKEN 缺失：release job 需要在最终步骤注入 token");
  }

  const tagRef = gh(["api", `repos/${repository}/git/ref/tags/${tag}`], { allowNotFound: true });
  if (tagRef.ok) {
    console.error(`Refusing to retarget existing tag ${tag}.`);
    process.exit(1);
  }
  const release = gh(["api", `repos/${repository}/releases/tags/${tag}`], { allowNotFound: true });
  if (release.ok) {
    console.error(`Refusing to overwrite existing release ${tag}.`);
    process.exit(1);
  }

  // Create-only GitHub ref API is the atomic reservation. An existing ref,
  // including one created after the precheck, MUST cause POST to fail.
  const reservation = gh(["api", "--method", "POST", `repos/${repository}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${expectedSha}`]);
  reservedTag = tag;
  verifyRef(reservation.stdout, tag, expectedSha);
  verifyRef(gh(["api", `repos/${repository}/git/ref/tags/${tag}`]).stdout, tag, expectedSha);
  const created = gh(["release", "create", tag, "--repo", repository, "--verify-tag", "--title", tag, "--notes", notes, ...assets]);
  console.log(`Created release ${tag} (tag target ${expectedSha}).`);
  if (created.stdout) console.log(created.stdout);
  process.exit(0);
} catch (error) {
  console.error(`Release failed: ${error.message}`);
  if (reservedTag) console.error(`Tag ${reservedTag} is reserved; manual recovery needed. No deletion, retry or retarget was attempted.`);
  process.exit(1);
}
