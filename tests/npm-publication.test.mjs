import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { packageEntries, packExtension } from "../scripts/lib/extension-package.mjs";
import { readJson } from "../scripts/lib/files.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";
import { NPM_REGISTRY, publishArchive, publishNpmArchives, validateNpmArchive, waitForPublishedArchive } from "../scripts/publish-npm.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = "gfgghgftgffg/amox_pi_extensions_lean";

test("npm publication validates actual packs, preflights all identities and recovers partial publication without retries", async (t) => {
  const fixture = releaseFixture(), root = fixture.root;
  const dir = mkdtempSync(join(tmpdir(), "amox-npm-publish-test-"));
  try {
    const version = readJson(join(root, "package.json")).version, entries = packageEntries(root);
    const files = entries.map((entry) => {
      const packed = packExtension(root, entry, dir), bytes = readFileSync(packed.archive);
      return { package: entry.packageName, filename: packed.filename,
        sha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
    });
    writeFileSync(join(dir, "assets.json"), JSON.stringify({ version, files }));
    const states = new Map(), calls = [], publishes = [];
    let mode = "normal", failAt = null, delayVisibility = false;
    const fetchImpl = async (url, options) => {
      assert.equal(options.redirect, "error"); assert.ok(options.signal); assert.equal(options.headers["cache-control"], "no-cache");
      assert.ok(url.startsWith(`${NPM_REGISTRY}/`)); calls.push(url);
      const [encoded, requested] = url.slice(NPM_REGISTRY.length + 1).split("/"), name = decodeURIComponent(encoded);
      assert.ok(files.some((file) => file.package === name));
      if (mode === "http-error") return new Response("no credentials or bodies should appear", { status: 503 });
      if (mode === "network-error") throw new Error("private response text must not appear");
      if (mode === "initial") return new Response(null, { status: 404 });
      const visible = !delayVisibility || publishes.length === files.length;
      const data = requested ? (visible ? states.get(name) : undefined) : { name, "dist-tags": { latest: mode === "downgrade" ? "99.0.0" : mode === "stale-tag" ? "0.0.1" : version } };
      return data ? Response.json(data) : new Response(null, { status: 404 });
    };
    const metadata = (file) => ({ name: file.package, version, dist: { integrity: file.integrity } });
    const publish = async (path) => {
      const file = files.find((file) => join(dir, file.filename) === path); assert.ok(file);
      publishes.push(file.package);
      if (file.package === failAt) throw new Error("ambiguous write outcome");
      states.set(file.package, metadata(file));
    };
    const run = (dryRun = false) => publishNpmArchives({ repoRoot: root, dir, repository, dryRun, fetchImpl, publish, log: () => {} });
    const reset = () => { mode = "normal"; failAt = null; delayVisibility = false; states.clear(); calls.length = 0; publishes.length = 0; };
    await t.test("all three real archives match six source files and package identities", () => {
      files.forEach((file, i) => assert.equal(validateNpmArchive({ repoRoot: root, entry: entries[i], asset: { ...file, path: join(dir, file.filename) }, version, repository }).name, entries[i].packageName));
      assert.throws(() => validateNpmArchive({ repoRoot: root, entry: entries[0], asset: { path: join(dir, files[0].filename) }, version, repository: "another/repo" }), /identity/);
    });
    await t.test("dry run does not invoke publication", async () => {
      reset(); const result = await run(true); assert.equal(result.dryRun, true); assert.deepEqual(publishes, []); assert.equal(calls.length, 6);
    });
    await t.test("existing identical versions skip; missing versions use verified paths", async () => {
      reset(); states.set(files[0].package, metadata(files[0])); await run();
      assert.deepEqual(publishes, files.slice(1).map((file) => file.package));
      publishes.length = 0; await run(); assert.deepEqual(publishes, []);
    });
    await t.test("delayed visibility of an early upload does not block the remaining uploads", async () => {
      reset(); delayVisibility = true; await run();
      assert.deepEqual(publishes, files.map((file) => file.package));
      assert.equal(states.size, 3);
    });
    await t.test("existing verified bytes do not conceal a stale latest tag or downgrade a newer one", async () => {
      reset(); for (const file of files) states.set(file.package, metadata(file));
      mode = "stale-tag"; await assert.rejects(run(), /latest needs manual review/); assert.deepEqual(publishes, []);
      mode = "downgrade"; await run(); assert.deepEqual(publishes, []);
    });
    await t.test("a conflict in the last package aborts before any first-package write", async () => {
      reset(); states.set(files[2].package, { ...metadata(files[2]), dist: { integrity: "sha512-different" } });
      await assert.rejects(run(), /Immutable npm version conflicts/); assert.deepEqual(publishes, []);
    });
    await t.test("first publish, registry failures and latest downgrades stop before writes", async () => {
      for (const [state, expected] of [["initial", /Initial npm publication/], ["http-error", /HTTP 503/], ["network-error", /lookup failed/], ["downgrade", /backwards/]]) {
        reset(); mode = state; await assert.rejects(run(), expected); assert.deepEqual(publishes, []);
      }
    });
    await t.test("ambiguous second write is not retried; explicit recovery skips the first", async () => {
      reset(); failAt = files[1].package;
      await assert.rejects(run(), /ambiguous write outcome.*Previously submitted or confirmed packages/);
      assert.deepEqual(publishes, files.slice(0, 2).map((file) => file.package));
      failAt = null; publishes.length = 0; await run(); assert.deepEqual(publishes, files.slice(1).map((file) => file.package));
    });
    await t.test("mutated archive is rejected before any registry access", async () => {
      reset(); const file = files[0], path = join(dir, file.filename), bytes = readFileSync(path);
      try {
        writeFileSync(path, "tampered"); await assert.rejects(run(), /hash mismatch/); assert.equal(calls.length, 0);
        const tar = gunzipSync(bytes); tar[156] = 50; writeFileSync(path, gzipSync(tar));
        assert.throws(() => validateNpmArchive({ repoRoot: root, entry: entries[0], asset: { path }, version, repository }), /header/);
        const appended = Buffer.concat([gunzipSync(bytes), Buffer.from("unexpected trailing archive")]); writeFileSync(path, gzipSync(appended));
        assert.throws(() => validateNpmArchive({ repoRoot: root, entry: entries[0], asset: { path }, version, repository }), /trailing/);
      } finally { writeFileSync(path, bytes); }
    });
    await t.test("actual npm command disables hooks and HTTP retries and suppresses credential-bearing diagnostics", () => {
      let count = 0;
      const spawn = (command, args, options) => {
        count++; assert.equal(command, "npm"); assert.equal(args[0], "publish"); assert.equal(args[1], "/verified/archive.tgz");
        assert.ok(args.includes("--ignore-scripts")); assert.ok(args.includes("--fetch-retries=0"));
        assert.equal(args.at(-1), NPM_REGISTRY); assert.equal(options.env.NODE_AUTH_TOKEN, ""); assert.equal(options.env.NPM_TOKEN, "");
        return { status: 1, stderr: "npm error ENEEDAUTH private-auth-diagnostics" };
      };
      assert.throws(() => publishArchive("/verified/archive.tgz", spawn), (error) => /ENEEDAUTH/.test(error.message) && !/private-auth-diagnostics/.test(error.message));
      assert.equal(count, 1);
    });
    await t.test("real CLI rejects local publication and stale SHA before registry access", () => {
      const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
      const batchVersion = readJson(join(repoRoot, "package.json")).version;
      const env = { ...process.env, GITHUB_REPOSITORY: repository, RELEASE_TAG: `v${batchVersion}`, EXPECTED_SHA: sha, GITHUB_ACTIONS: "false", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "", ACTIONS_ID_TOKEN_REQUEST_URL: "" };
      const invoke = (extra) => spawnSync(process.execPath, ["scripts/publish-npm.mjs", "--assets-dir", dir, "--publish"], { cwd: repoRoot, env: { ...env, ...extra }, encoding: "utf8" });
      const local = invoke({}); assert.equal(local.status, 1); assert.match(local.stderr, /requires.*OIDC/);
      const stale = invoke({ EXPECTED_SHA: "f".repeat(40) }); assert.equal(stale.status, 1); assert.match(stale.stderr, /checkout HEAD/);
    });
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});

test("post-publish propagation waits use only bounded GETs without accepting conflicts", async () => {
  const asset = { package: "@gfgghgftgffg/pi-web-access-lean", integrity: "sha512-verified" }, version = "0.1.4";
  let elapsed = 0, reads = 0, sleeps = 0;
  const clock = { now: () => elapsed, timeoutMs: 20, pollMs: 10, sleep: async (ms) => { sleeps++; elapsed += ms; }, log: () => {} };
  const valid = { name: asset.package, version, dist: { integrity: asset.integrity } };
  const fetchImpl = async (url, options) => {
    reads++; assert.ok([undefined, "GET"].includes(options.method)); assert.equal(options.headers["cache-control"], "no-cache");
    if (url.endsWith(`/${version}`)) return elapsed === 0 ? new Response(null, { status: 404 }) : Response.json(valid);
    return Response.json({ name: asset.package, "dist-tags": { latest: elapsed < 20 ? "0.1.3" : version } });
  };
  await waitForPublishedArchive({ asset, version, fetchImpl, ...clock });
  assert.equal(elapsed, 20); assert.equal(sleeps, 2); assert.equal(reads, 5);

  elapsed = 0; sleeps = 0; reads = 0;
  await assert.rejects(waitForPublishedArchive({ asset, version, ...clock, fetchImpl: async () => { reads++; return new Response(null, { status: 404 }); } }), /timed out.*Upload may already have succeeded.*no publish retry/);
  assert.equal(elapsed, 20); assert.equal(sleeps, 2); assert.equal(reads, 3);

  elapsed = 0; sleeps = 0;
  await assert.rejects(waitForPublishedArchive({ asset, version, ...clock, fetchImpl: async () => Response.json({ ...valid, dist: { integrity: "sha512-conflict" } }) }), /integrity conflicts/);
  assert.equal(sleeps, 0, "immutable hash conflicts cannot be hidden by waiting");
  await assert.rejects(waitForPublishedArchive({ asset, version, ...clock, fetchImpl: async () => Response.json({ ...valid, name: "@another/package" }) }), /identity mismatch/);
  assert.equal(sleeps, 0);
  await assert.rejects(waitForPublishedArchive({ asset, version, ...clock, fetchImpl: async () => new Response(null, { status: 503 }) }), /HTTP 503/);
  assert.equal(sleeps, 0);
  await assert.rejects(waitForPublishedArchive({ asset, version, ...clock, fetchImpl: async (url) => Response.json(url.endsWith(`/${version}`) ? valid : { name: asset.package, "dist-tags": { latest: "99.0.0" } }) }), /latest advanced unexpectedly/);
  assert.equal(sleeps, 0, "a newer latest must not trigger tag writes or further polling");
});
