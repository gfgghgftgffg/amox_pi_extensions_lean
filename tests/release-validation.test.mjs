// Release validation tests: package tags, SHA rules and the final gh-based
// release step, exercised offline with a fake `gh` on PATH. The script must
// refuse retagging/overwriting and never require npm or dependency execution.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractReleaseSummary, releaseNotes, releaseSummaryBlock, validateReleaseContext, validateReleaseTag } from "../scripts/lib/release-validation.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance/manifest.json"), "utf8"));
const entry = manifest.packages.find((item) => item.id === "pi-web-access-lean");
const release = { id: entry.id, package: entry.packageName, version: entry.version, tag: `${entry.packageName}@${entry.version}` };
const releasesJson = JSON.stringify([release]);
const summary = "- 升级上游并保留工具接口，修复 Windows workflow 测试注册表路径。";
const report = `Release after human merge: ${release.tag}\n\n${releaseSummaryBlock({ tag: release.tag, summary })}`;
const headSha = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();

function fakeGhDir(logPath) {
  const dir = mkdtempSync(join(tmpdir(), "amox-fake-gh-"));
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2), env = process.env;
fs.appendFileSync(env.FAKE_GH_LOG, args.join(" ") + "\\n");
const statePath = env.FAKE_GH_LOG + ".refs";
const refs = () => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { return {}; } };
const saveRefs = (value) => fs.writeFileSync(statePath, JSON.stringify(value));
const mode = env.FAKE_GH_MODE;
const releases = JSON.parse(env.RELEASES || "[]");
const tag = releases.map((release) => release.tag).find((candidate) => args.join(" ").includes(candidate));
const fail = (code, message) => { console.error("gh: " + message + " (HTTP " + code + ")"); process.exit(1); };
const respond = (sha) => { console.log(JSON.stringify({ ref: "refs/tags/" + tag, object: { type: "commit", sha } })); process.exit(0); };
if (mode === "server-error") fail(500, "Internal Server Error");
if (mode === "auth-error") fail(403, "Forbidden");
if (args[0] === "api" && args.includes("POST")) {
  const current = refs();
  if (mode === "race") { current[tag] = "f".repeat(40); saveRefs(current); }
  if (refs()[tag]) fail(422, "Reference already exists");
  const sha = args.find((arg) => arg.startsWith("sha=")).slice(4);
  if (!args.includes("ref=refs/tags/" + tag)) fail(400, "Bad ref");
  current[tag] = mode === "moved" ? "f".repeat(40) : sha; saveRefs(current);
  respond(sha);
}
if (args[0] === "api" && args[1].includes("/git/ref/")) {
  if (env.FAKE_GH_TAG_EXISTS === "1") respond("f".repeat(40));
  if (refs()[tag]) respond(refs()[tag]);
  fail(404, "Not Found");
}
if (args[0] === "api" && args[1].includes("/releases/tags/")) {
  if (env.FAKE_GH_RELEASE_EXISTS === "1") { console.log("{}"); process.exit(0); }
  fail(404, "Not Found");
}
if (args[0] === "release" && args[1] === "create") {
  if (mode === "release-error") fail(500, "Release creation failed");
  if (!args.includes("--verify-tag") || args.includes("--target") || !refs()[tag]) fail(400, "Unverified tag");
  console.log("https://github.com/test/repo/releases/tag/" + args[2]); process.exit(0);
}
fail(400, "Unexpected operation");
`;
  writeFileSync(join(dir, "gh"), script);
  // A preload routes only gh calls to the offline Node fixture on every OS.
  writeFileSync(join(dir, "loader.mjs"), `import cp from "node:child_process";\nimport { syncBuiltinESMExports } from "node:module";\nimport fs from "node:fs";\nimport { resolve } from "node:path";\nconst originalRead = fs.readFileSync;\nfs.readFileSync = (path, ...args) => process.env.FAKE_RELEASE_REPORT !== undefined && resolve(String(path)) === resolve("maintenance/update-report.md") ? process.env.FAKE_RELEASE_REPORT : originalRead(path, ...args);\nconst original = cp.execFileSync;\ncp.execFileSync = (command, args, options) => command === "gh" ? original(process.execPath, [${JSON.stringify(join(dir, "gh"))}, ...args], options) : original(command, args, options);\nsyncBuiltinESMExports();\n`);
  chmodSync(join(dir, "gh"), 0o755);
  writeFileSync(logPath, "");
  return dir;
}

function runReleaseScript({ fakeDir, logPath, env = {}, args = [] }) {
  return spawnSync(process.execPath, ["--import", pathToFileURL(join(fakeDir, "loader.mjs")).href, "scripts/create-release.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeDir}${delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: logPath,
      RELEASES: releasesJson,
      FAKE_RELEASE_REPORT: report,
      EXPECTED_SHA: headSha,
      GITHUB_REPOSITORY: "test/repo",
      GH_TOKEN: "fake-token",
      ...env,
    },
  });
}

test("package tag, context and release-notes validation rules", () => {
  assert.deepEqual(validateReleaseTag(release.tag, manifest.packages).release, release);
  for (const invalid of ["v1.2.3", `${release.package}@1.2`, `${release.package}@1.2.3-rc.1`, "", "@unknown/pkg@1.2.3", release.package]) {
    assert.equal(validateReleaseTag(invalid, manifest.packages).ok, false, `tag must be rejected: ${invalid}`);
  }
  assert.deepEqual(validateReleaseContext({ releases: [release], expectedSha: headSha, headSha, packages: manifest.packages }), []);
  assert.ok(validateReleaseContext({ releases: [release], expectedSha: "abc", headSha, packages: manifest.packages }).some((error) => /EXPECTED_SHA/.test(error)));
  assert.ok(validateReleaseContext({ releases: [release], expectedSha: "f".repeat(40), headSha, packages: manifest.packages }).some((error) => /checkout HEAD/.test(error)));
  assert.ok(validateReleaseContext({ releases: [{ ...release, version: "99.0.0" }], expectedSha: headSha, headSha, packages: manifest.packages }).some((error) => /不一致/.test(error)));
  assert.ok(validateReleaseContext({ releases: [release, release], expectedSha: headSha, headSha, packages: manifest.packages }).some((error) => /重复/.test(error)));
  assert.ok(validateReleaseContext({ releases: [], expectedSha: headSha, headSha, packages: manifest.packages }).some((error) => /不能为空/.test(error)));

  const notes = releaseNotes({ release, repository: "test/repo", sha: headSha, summary });
  assert.ok(notes.includes(summary));
  assert.ok(notes.indexOf(summary) < notes.indexOf("## 安装"));
  assert.ok(notes.includes(`pi install npm:${release.package}`));
  assert.ok(notes.includes(`node scripts/install-extension.mjs ${release.id}`));
  assert.ok(notes.includes(`git clone --branch ${release.tag} https://github.com/test/repo.git`));
  assert.ok(notes.includes(`${release.package}@${release.version}`));
  assert.ok(notes.includes("pi update --extensions"));
  assert.ok(notes.includes("docs/npm-publishing.zh-CN.md"));
  assert.doesNotMatch(notes, /本批 npm 包|pi install git:/);
});

test("release summaries are substantive and bound to exactly one package tag", () => {
  assert.equal(extractReleaseSummary({ report, tag: release.tag }), summary);
  assert.equal(extractReleaseSummary({ report: report.replace("Release after human merge:", "Release after verified merge:"), tag: release.tag }), summary);
  assert.equal(extractReleaseSummary({ report: report.replaceAll("\n", "\r\n"), tag: release.tag }), summary);
  for (const invalid of ["", report.replace(release.tag, "@gfgghgftgffg/other@9.9.9"), report + "\n" + releaseSummaryBlock({ tag: release.tag, summary }), report.replace(":end -->", ":start -->")]) {
    assert.throws(() => extractReleaseSummary({ report: invalid, tag: release.tag }), /Missing or stale/);
  }
  for (const invalid of [undefined, "too short", "a".repeat(20_001), `- reserved <!-- amox-release-summary:${release.tag}:start --> marker`]) {
    assert.throws(() => releaseSummaryBlock({ tag: release.tag, summary: invalid }), /summary/);
  }
  assert.throws(() => releaseSummaryBlock({ tag: "v1.0.0", summary }), /package tag/);
  assert.throws(() => releaseNotes({ release, repository: "test/repo", sha: headSha }), /summary/);
});

test("missing or stale summaries fail before token use, gh calls or tag reservation", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-summary-test-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const stale = `Release after human merge: @gfgghgftgffg/other@9.9.9\n\n${releaseSummaryBlock({ tag: "@gfgghgftgffg/other@9.9.9", summary: "- An old update must never appear in the current release." })}`;
    for (const bad of ["", stale]) {
      for (const args of [[], ["--verify-only"]]) {
        const result = runReleaseScript({ fakeDir, logPath, args, env: { FAKE_RELEASE_REPORT: bad, GH_TOKEN: "" } });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing or stale release summary/);
        assert.equal(readFileSync(logPath, "utf8"), "");
        assert.ok(!existsSync(`${logPath}.refs`));
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fakeDir, { recursive: true, force: true }); }
});

test("release attaches only the planned package archive, not the integrity index", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-attachments-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const assetsDir = join(dir, "assets");
    mkdirSync(assetsDir);
    const filename = `${release.package.replace(/^@/, "").replaceAll("/", "-")}-${release.version}.tgz`;
    const bytes = Buffer.from(release.package);
    writeFileSync(join(assetsDir, filename), bytes);
    const files = [{ package: release.package, version: release.version, filename, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` }];
    writeFileSync(join(assetsDir, "assets.json"), JSON.stringify({ schemaVersion: 3, files }));
    const result = runReleaseScript({ fakeDir, logPath, args: ["--assets-dir", assetsDir] });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(logPath, "utf8");
    assert.ok(calls.includes("release create"));
    assert.ok(calls.includes(join(assetsDir, filename)));
    assert.ok(!calls.includes(join(assetsDir, "assets.json")), "the internal integrity index is not published as an asset");
    writeFileSync(join(assetsDir, filename), "tampered");
    const rejected = runReleaseScript({ fakeDir, logPath, args: ["--assets-dir", assetsDir], env: { GH_TOKEN: "" } });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /hash/);
    assert.equal(readFileSync(logPath, "utf8"), calls, "tampered assets rejected before token/ref use");
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fakeDir, { recursive: true, force: true }); }
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
    const versionMismatch = runReleaseScript({ fakeDir, logPath, env: { RELEASES: JSON.stringify([{ ...release, version: "9.9.9", tag: `${release.package}@9.9.9` }]) } });
    assert.equal(versionMismatch.status, 1);
    assert.match(versionMismatch.stderr, /不一致/);

    const shaMismatch = runReleaseScript({ fakeDir, logPath, env: { EXPECTED_SHA: "f".repeat(40) } });
    assert.equal(shaMismatch.status, 1);
    assert.match(shaMismatch.stderr, /checkout HEAD/);

    const noToken = runReleaseScript({ fakeDir, logPath, env: { GH_TOKEN: "" } });
    assert.equal(noToken.status, 1);
    assert.match(noToken.stderr, /GH_TOKEN/);
    for (const malformedTag of [`${release.package}@01.2.3`, "v1.2.3", `${release.package}@1.2`]) {
      const malformed = runReleaseScript({ fakeDir, logPath, env: { RELEASES: JSON.stringify([{ ...release, version: "1.2.3", tag: malformedTag }]) } });
      assert.equal(malformed.status, 1);
      assert.match(malformed.stderr, /Invalid planned release tag|Release validation failed/);
    }
    assert.equal(readFileSync(logPath, "utf8").trim(), "", "no gh call without a token or for malformed context");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});

test("existing tags are never retargeted and an existing release is skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-existing-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const existingTag = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_TAG_EXISTS: "1" } });
    assert.equal(existingTag.status, 1);
    assert.match(existingTag.stderr, /Refusing to retarget existing tag/);

    const existingRelease = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_RELEASE_EXISTS: "1" } });
    assert.equal(existingRelease.status, 0, existingRelease.stderr);
    assert.match(existingRelease.stdout, /already exists/);
    assert.doesNotMatch(readFileSync(logPath, "utf8"), /release create/);
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
    const escaped = release.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(log, new RegExp(`api repos/test/repo/git/ref/tags/${escaped}`));
    assert.match(log, new RegExp(`api repos/test/repo/releases/tags/${escaped}`));
    assert.match(log, new RegExp(`api --method POST repos/test/repo/git/refs -f ref=refs/tags/${escaped} -f sha=${headSha}`));
    assert.match(log, new RegExp(`release create ${escaped} --repo test/repo --verify-tag`));
    assert.doesNotMatch(log, /--target/);
    assert.equal(log.split("\n").filter((line) => line.startsWith(`api repos/test/repo/git/ref/tags/${release.tag}`)).length, 2, "precheck AND created-ref verification");
    assert.ok(!log.split("\n").some((line) => /^npm (publish|run|ci|install)\b/.test(line)), "release script must never run npm");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fakeDir, { recursive: true, force: true });
  }
});

test("two package versions create two independent tags and releases", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-release-multi-"));
  const logPath = join(dir, "gh.log");
  const fakeDir = fakeGhDir(logPath);
  try {
    const second = manifest.packages.find((item) => item.id !== entry.id);
    const releases = [release, { id: second.id, package: second.packageName, version: second.version, tag: `${second.packageName}@${second.version}` }];
    const multiReport = releases.map((item) => `Release after human merge: ${item.tag}\n\n${releaseSummaryBlock({ tag: item.tag, summary })}`).join("\n\n");
    const result = runReleaseScript({ fakeDir, logPath, env: { RELEASES: JSON.stringify(releases), FAKE_RELEASE_REPORT: multiReport } });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(logPath, "utf8");
    for (const item of releases) {
      assert.match(log, new RegExp(`api --method POST repos/test/repo/git/refs -f ref=refs/tags/${item.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -f sha=${headSha}`));
      assert.ok(log.includes(`release create ${item.tag} --repo test/repo`), item.tag);
    }
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
      if (mode === "race") assert.equal(JSON.parse(readFileSync(`${logPath}.refs`, "utf8"))[release.tag], "f".repeat(40), "competing ref untouched, never released");
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fakeDir, { recursive: true, force: true }); }
  }
});

test("post-reservation release failure or a moved ref stops and never deletes/retargets", () => {
  for (const mode of ["release-error", "moved"]) {
    const dir = mkdtempSync(join(tmpdir(), "amox-release-reserved-test-"));
    const logPath = join(dir, "gh.log");
    const fakeDir = fakeGhDir(logPath);
    try {
      const result = runReleaseScript({ fakeDir, logPath, env: { FAKE_GH_MODE: mode } });
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /manual recovery is required/);
      assert.equal(existsSync(`${logPath}.refs`), true);
      const log = readFileSync(logPath, "utf8");
      assert.doesNotMatch(log, /DELETE|PATCH|--force|--target/);
      assert.equal(log.split("\n").filter((line) => line.includes("api --method POST")).length, 1);
      if (mode === "moved") assert.doesNotMatch(log, /release create/);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fakeDir, { recursive: true, force: true }); }
  }
});
