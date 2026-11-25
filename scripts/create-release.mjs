#!/usr/bin/env node
/**
 * Final release step: create one Git tag / GitHub release per planned package
 * release through `gh`.
 *
 * Runs only in the write-scoped release job (environment `release`), after the
 * read-only verification job passed at the same immutable `EXPECTED_SHA`.
 * Uses `execFileSync` with argument arrays (no shell interpolation), never
 * retargets an existing tag, never overwrites an existing release, and never
 * publishes to npm. Re-running a partially completed plan completes only the
 * missing releases.
 *
 * Environment:
 *   RELEASES          JSON package releases from the release plan
 *   EXPECTED_SHA      verified immutable commit ($GITHUB_SHA from the run)
 *   GITHUB_REPOSITORY owner/repo
 *   GH_TOKEN          token used only for the final create calls
 *
 * Flags:
 *   --verify-only     validate tags/versions/SHA/summaries before any token use
 *   --assets-dir DIR  verified release archives (one .tgz per package release)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractReleaseSummary, releaseNotes, validateReleaseContext } from "./lib/release-validation.mjs";
import { validateReleaseAssets, parseReleaseList } from "./release-assets.mjs";
import { readJson } from "./lib/files.mjs";

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function gh(args, { allowNotFound = false } = {}) {
  try {
    return { ok: true, stdout: execFileSync("gh", args, { encoding: "utf8", env: process.env }).trim() };
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    if (allowNotFound && (error.status === 1 || error.status === 4) && /\bHTTP 404\b/i.test(stderr)) return { ok: false, notFound: true, stderr };
    throw new Error(`gh ${args.join(" ")} 失败 (exit ${error.status}): ${stderr.trim() || error.message}`);
  }
}

function tagCommit(repository, tag) {
  const response = gh(["api", `repos/${repository}/git/ref/tags/${tag}`]);
  const ref = JSON.parse(response.stdout);
  if (ref.ref !== `refs/tags/${tag}`) throw new Error(`tag lookup 返回了其它引用: ${tag}`);
  return ref.object?.sha;
}

const created = [];
try {
  const expectedSha = process.env.EXPECTED_SHA ?? process.env.GITHUB_SHA;
  const repository = process.env.GITHUB_REPOSITORY;
  const releases = parseReleaseList(process.env.RELEASES);
  const manifest = readJson(resolve("maintenance/manifest.json"));
  const headSha = git(["rev-parse", "HEAD"]);

  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY 缺失或非法");
  const errors = validateReleaseContext({ releases, expectedSha, headSha, packages: manifest.packages });
  if (errors.length > 0) {
    console.error("Release validation failed:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  // Never call a model here. Reject missing/stale evidence before token use or
  // reserving a tag, including the read-only verification preflight.
  const report = readFileSync(resolve("maintenance/update-report.md"), "utf8");
  const summaries = new Map(releases.map((release) => [release.tag, extractReleaseSummary({ report, tag: release.tag })]));

  if (process.argv.includes("--verify-only")) {
    console.log(`Release context verified for ${releases.map((release) => release.tag).join(", ")} at sha=${headSha} (no token used)`);
    process.exit(0);
  }

  const assetsIndex = process.argv.indexOf("--assets-dir");
  if (assetsIndex >= 0 && !process.argv[assetsIndex + 1]) throw new Error("--assets-dir needs a directory");
  const assetsDir = assetsIndex < 0 ? undefined : process.argv[assetsIndex + 1];
  const assets = assetsDir ? validateReleaseAssets({ repoRoot: process.cwd(), dir: assetsDir, releases }) : [];
  const assetFor = (release) => {
    if (!assetsDir) return undefined;
    const asset = assets.find((item) => item.package === release.package);
    if (!asset) throw new Error(`缺少已验证归档: ${release.tag}`);
    return asset.path;
  };
  for (const release of releases) assetFor(release);

  if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN 缺失：release job 需要在最终步骤注入 token");

  for (const release of releases) {
    const notes = releaseNotes({ release, repository, sha: expectedSha, summary: summaries.get(release.tag) });
    const tagRef = gh(["api", `repos/${repository}/git/ref/tags/${release.tag}`], { allowNotFound: true });
    if (tagRef.ok) {
      if (tagCommit(repository, release.tag) !== expectedSha) throw new Error(`Refusing to retarget existing tag ${release.tag}`);
    } else {
      // Create-only GitHub ref API is the atomic reservation. An existing ref,
      // including one created after the precheck, MUST cause POST to fail.
      const reservation = gh(["api", "--method", "POST", `repos/${repository}/git/refs`, "-f", `ref=refs/tags/${release.tag}`, "-f", `sha=${expectedSha}`]);
      const ref = JSON.parse(reservation.stdout);
      if (ref.ref !== `refs/tags/${release.tag}` || ref.object?.sha !== expectedSha) throw new Error(`created tag ref 与 verified SHA 不一致: ${release.tag}`);
      if (tagCommit(repository, release.tag) !== expectedSha) throw new Error(`created tag ${release.tag} 未指向 verified SHA`);
    }
    const existing = gh(["api", `repos/${repository}/releases/tags/${release.tag}`], { allowNotFound: true });
    if (existing.ok) { console.log(`Release ${release.tag} already exists at ${expectedSha}; skipped.`); continue; }
    const asset = assetFor(release);
    gh(["release", "create", release.tag, "--repo", repository, "--verify-tag", "--title", release.tag, "--notes", notes, ...(asset ? [asset] : [])]);
    created.push(release.tag);
    console.log(`Created release ${release.tag} (tag target ${expectedSha}).`);
  }
  process.exit(0);
} catch (error) {
  console.error(`Release failed: ${error.message}`);
  if (created.length) console.error(`Created before failure: ${created.join(", ")}.`);
  console.error("Existing tags are never retargeted or deleted. Rerun this job to complete missing releases while every created tag still points at the verified SHA; otherwise manual recovery is required.");
  process.exit(1);
}
