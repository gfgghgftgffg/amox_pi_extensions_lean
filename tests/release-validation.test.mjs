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
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2), env = process.env;
fs.appendFileSync(env.FAKE_GH_LOG, args.join(" ") + "\\n");
const state = env.FAKE_GH_LOG + ".ref";
const mode = env.FAKE_GH_MODE;
const fail = (code, message) => { console.error("gh: " + message + " (HTTP " + code + ")"); process.exit(1); };
const respond = (sha) => { console.log(JSON.stringify({ ref: "refs/tags/" + env.RELEASE_TAG, object: { type: "commit", sha } })); process.exit(0); };
if (mode === "server-error") fail(500, "Internal Server Error");
if (mode === "auth-error") fail(403, "Forbidden");
if (args[0] === "api" && args.includes("POST")) {
  if (mode === "race") fs.writeFileSync(state, "f".repeat(40));
  if (fs.existsSync(state)) fail(422, "Reference already exists");
  const sha = args.find((a) => a.startsWith("sha=")).slice(4);
  if (!args.includes("ref=refs/tags/" + env.RELEASE_TAG)) fail(400, "Bad ref");
  fs.writeFileSync(state, mode === "moved" ? "f".repeat(40) : sha);
  respond(sha);
}
if (args[0] === "api" && args[1].includes("/git/ref/")) {
  if (env.FAKE_GH_TAG_EXISTS === "1") respond("f".repeat(40));
  if (fs.existsSync(state)) respond(fs.readFileSync(state, "utf8"));
  fail(404, "Not Found");
}
if (args[0] === "api" && args[1].includes("/releases/tags/")) {
  if (env.FAKE_GH_RELEASE_EXISTS === "1") { console.log("{}"); process.exit(0); }
  fail(404, "Not Found");
}
if (args[0] === "release" && args[1] === "create") {
  if (mode === "release-error") fail(500, "Release creation failed");
  if (!args.includes("--verify-tag") || args.includes("--target") || !fs.existsSync(state)) fail(400, "Unverified tag");
  console.log("https://github.com/test/repo/releases/tag/" + args[2]); process.exit(0);
}
fail(400, "Unexpected operation");
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
  for (const invalid of ["0.1.0", "v1", "v1.2", "v1.2.3-rc.1", "v1.2.3.4", "", "v 1.2.3", "v00.1.0", "v1.02.3", "v1.2.03", "v9007199254740992.0.0"]) {
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
    for (const malformedTag of ["v00.1.0", "v01.2.3", "v9007199254740992.0.0"]) {
      const malformed = runReleaseScript({ fakeDir, logPath, env: { RELEASE_TAG: malformedTag } });
      assert.equal(malformed.status, 1);
      assert.match(malformed.stderr, /Release validation failed|canonical/);
    }
    assert.equal(readFileSync(logPath, "utf8").trim(), "", "no gh call without a token or for malformed context");
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
    assert.match(log, new RegExp(`api repos/test/repo/releases/tags/${escapedTag}`));
    assert.match(log, new RegExp(`api --method POST repos/test/repo/git/refs -f ref=refs/tags/${escapedTag} -f sha=${headSha}`));
    assert.match(log, new RegExp(`release create ${escapedTag} --repo test/repo --verify-tag`));
    assert.doesNotMatch(log, /--target/);
    assert.equal(log.split("\n").filter((line) => line.startsWith("api repos/test/repo/git/ref/tags/")).length, 2, "precheck AND created-ref verification");
    assert.ok(!log.split("\n").some((line) => /^npm\b/.test(line)), "release script must never run npm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});


test("atomic ref reservation fails closed on a competing tag and unrelated GitHub errors", () => {
  for (const mode of ["race", "server-error", "auth-error"]) {
    const dir = mkdtempSync(join(tmpdir(), "amox-release-race-test-"));
    const logPath = join(dir, "gh.log");
    const fakeDir = fakeGhDir(logPath);
    try {
      const result = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_MODE: mode } });
      assert.equal(result.status, 1, mode);
      assert.match(result.stderr, mode === "race" ? /Reference already exists/ : /HTTP (500|403)/);
      const log = readFileSync(logPath, "utf8");
      assert.doesNotMatch(log, /release create/);
      assert.doesNotMatch(log, /DELETE|PATCH|--force|--target/);
      if (mode === "race") {
        assert.match(log, /api --method POST/);
        assert.equal(readFileSync(`${logPath}.ref`, "utf8"), "f".repeat(40), "competing ref untouched, never released");
      }
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fakeDir, { recursive: true, force: true }); }
  }
});

test("post-reservation release failure or moved ref reports manual recovery and never deletes/retargets", () => {
  for (const mode of ["release-error", "moved"]) {
    const dir = mkdtempSync(join(tmpdir(), "amox-release-reserved-test-"));
    const logPath = join(dir, "gh.log");
    const fakeDir = fakeGhDir(logPath);
    try {
      const result = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_MODE: mode } });
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /Tag .* is reserved; manual recovery needed/);
      assert.equal(existsSync(`${logPath}.ref`), true);
      const log = readFileSync(logPath, "utf8");
      assert.doesNotMatch(log, /DELETE|PATCH|--force|--target/);
      assert.equal(log.split("\n").filter((line) => line.includes("api --method POST")).length, 1);
      if (mode === "moved") assert.doesNotMatch(log, /release create/);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fakeDir, { recursive: true, force: true }); }
  }
});
