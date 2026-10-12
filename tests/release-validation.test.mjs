// Release validation tests: tag/version/SHA rules and the final gh-based
// release step, exercised offline with a fake `gh` on PATH. The script must
// refuse retagging/overwriting and never require npm or dependency execution.
import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotes, validateReleaseContext, validateReleaseTag } from "../scripts/lib/release-validation.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const tag = `v${rootVersion}`;
const headSha = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();

function fakeGhDir(logPath) {
  const dir = mkdtempSync(join(tmpdir(), "amox-fake-gh-"));
  const script = `#!/bin/sh
echo "$@" >> "$FAKE_GH_LOG"
case "$1" in
  api)
    if [ "$FAKE_GH_TAG_EXISTS" = "1" ]; then echo '{"ref":"refs/tags/x"}'; exit 0; fi
    echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
  release)
    if [ "$2" = "view" ]; then
      if [ "$FAKE_GH_RELEASE_EXISTS" = "1" ]; then echo "title"; exit 0; fi
      echo "release not found" >&2; exit 1
    fi
    if [ "$2" = "create" ]; then echo "https://github.com/test/repo/releases/tag/$3"; exit 0; fi ;;
esac
exit 1
`;
  writeFileSync(join(dir, "gh"), script);
  chmodSync(join(dir, "gh"), 0o755);
  writeFileSync(logPath, "");
  return dir;
}

function runReleaseScript({ fakeDir, logPath, env = {}, args = [] }) {
  return spawnSync(process.execPath, ["scripts/create-release.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeDir}:${process.env.PATH}`,
      FAKE_GH_LOG: logPath,
      RELEASE_TAG: tag,
      EXPECTED_SHA: headSha,
      GITHUB_REPOSITORY: "test/repo",
      GH_TOKEN: "fake-token",
      ...env,
    },
  });
}

test("release tag and context validation rules", () => {
  assert.deepEqual(validateReleaseTag(tag), { ok: true, version: rootVersion });
  assert.deepEqual(validateReleaseTag("v10.0.2"), { ok: true, version: "10.0.2" });
  for (const invalid of ["0.1.0", "v1", "v1.2", "v1.2.3-rc.1", "v1.2.3.4", "", "v 1.2.3"]) {
    assert.equal(validateReleaseTag(invalid).ok, false, `tag must be rejected: ${invalid}`);
  }
  assert.deepEqual(validateReleaseContext({ tag, packageVersion: rootVersion, expectedSha: headSha, headSha }), []);
  assert.ok(validateReleaseContext({ tag: "v9.9.9", packageVersion: rootVersion, expectedSha: headSha, headSha }).some((error) => /不一致/.test(error)));
  assert.ok(validateReleaseContext({ tag, packageVersion: rootVersion, expectedSha: "abc", headSha }).some((error) => /EXPECTED_SHA/.test(error)));
  assert.ok(validateReleaseContext({ tag, packageVersion: rootVersion, expectedSha: "f".repeat(40), headSha }).some((error) => /checkout HEAD/.test(error)));
  const notes = releaseNotes({ tag, repository: "test/repo", sha: headSha });
  assert.match(notes, new RegExp(`pi install git:github.com/test/repo@${tag.replace(/\./g, "\\.")}`));
});

test("verify-only mode validates without any gh/token use", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-verify-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const result = runReleaseScript({ fakeDir, logPath, args: ["--verify-only"], env: { GH_TOKEN: "" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no token used/);
    assert.equal(readFileSync(logPath, "utf8").trim(), "", "verify-only must not call gh");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});

test("release script fails closed on version/SHA mismatches and missing token", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-mismatch-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const versionMismatch = runReleaseScript({ fakeDir, logPath, env: { RELEASE_TAG: "v9.9.9" } });
    assert.equal(versionMismatch.status, 1);
    assert.match(versionMismatch.stderr, /不一致/);

    const shaMismatch = runReleaseScript({ fakeDir, logPath, env: { EXPECTED_SHA: "f".repeat(40) } });
    assert.equal(shaMismatch.status, 1);
    assert.match(shaMismatch.stderr, /checkout HEAD/);

    const noToken = runReleaseScript({ fakeDir, logPath, env: { GH_TOKEN: "" } });
    assert.equal(noToken.status, 1);
    assert.match(noToken.stderr, /GH_TOKEN/);
    assert.equal(readFileSync(logPath, "utf8").trim(), "", "no gh call without a token");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});

test("release script refuses existing tags and releases", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-existing-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const existingTag = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_TAG_EXISTS: "1" } });
    assert.equal(existingTag.status, 1);
    assert.match(existingTag.stderr, /Refusing to retarget existing tag/);

    const existingRelease = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_RELEASE_EXISTS: "1" } });
    assert.equal(existingRelease.status, 1);
    assert.match(existingRelease.stderr, /Refusing to overwrite existing release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});

test("release script creates the tag via gh only after all checks pass", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-create-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const result = runReleaseScript({ fakeDir, logPath });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Created release/);
    const log = readFileSync(logPath, "utf8");
    const escapedTag = tag.replace(/\./g, "\\.");
    assert.match(log, new RegExp(`api repos\\/test\\/repo\\/git\\/ref\\/tags\\/${escapedTag}`));
    assert.match(log, new RegExp(`release view ${escapedTag} --repo test\\/repo`));
    assert.match(log, new RegExp(`release create ${escapedTag} --repo test/repo --target ${headSha}`));
    assert.ok(!log.split("\n").some((line) => /^npm\b/.test(line)), "release script must never run npm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});
