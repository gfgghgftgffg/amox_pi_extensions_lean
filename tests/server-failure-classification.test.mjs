import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalTools, openLocalPi } from "../scripts/lib/local-pi.mjs";
import { githubClient } from "../scripts/lib/github-maintenance.mjs";
import { fetchUpstreamMetadata } from "../scripts/lib/upstream-metadata.mjs";
import { stageVersions, launcherEnvironment } from "../scripts/local-maintenance.mjs";
import { serverFailure, gitReadHttpError } from "../scripts/lib/remote-errors.mjs";
import { collectSources } from "../scripts/lib/upstream-sources.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

async function modelError(root, errorMessage, stopReason = "error", throws = false) {
  const messages = [];
  const pi = await openLocalPi({ repo: root, scratch: root, tools: [], log: () => {},
    config: { provider: "fixture", model: "offline", apiKey: "fake-private-key", thinking: "off" },
    runtimeFactory: async () => ({ async setRuntimeApiKey() {}, getModel: () => ({ id: "offline", provider: "fixture" }) }),
    sessionFactory: async ({ settingsManager }) => {
      assert.equal(settingsManager.getRetrySettings().enabled, false, "no hidden immediate model retries");
      return { session: { messages, subscribe() {}, dispose() {}, async prompt() {
        if (throws) throw new Error(errorMessage);
        messages.push({ role: "assistant", stopReason, errorMessage });
      } } };
    } });
  try { await pi.prompt("offline fixture"); assert.fail("expected model failure"); }
  catch (error) { return error; }
  finally { pi.dispose(); }
}

test("real local-Pi error boundary preserves sanitized retry classification without provider bodies", async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-model-status-"));
  try {
    for (const status of [500, 502, 503, 504]) {
      const error = await modelError(root, `fixture API error (${status}): fake-private-key secret response`);
      assert.equal(serverFailure(error)?.httpStatus, status);
      assert.equal(serverFailure(error)?.phase, "model");
      assert.doesNotMatch(error.message, /fake-private-key|secret response/);
    }
    for (const args of [["fixture API error (401): says HTTP 502"], ["assertion says HTTP 503"],
      ["fixture API error (502): aborted", "aborted"], ["HTTP 503 secret response", "error", true]]) {
      const error = await modelError(root, ...args);
      assert.equal(serverFailure(error), undefined);
      assert.doesNotMatch(error.message, /secret response|says HTTP/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("check failures remain pending repair until a complete check succeeds, including thrown validation errors", async () => {
  const f = releaseFixture();
  try {
    const context = join(f.root, "context"); mkdirSync(context);
    const outcomes = []; let next = false;
    const gate = { async check() { if (next === "throw") throw new Error("validation still failed"); return { ok: next, output: "fixture check" }; }, invalidate() {} };
    const tools = createLocalTools({ repo: f.root, context, manifest: f.manifest, baseline: new Map(), gate, onCheckResult: ok => outcomes.push(ok) });
    const check = tools.find(tool => tool.name === "check");
    assert.equal((await check.execute("one", { summary: "- Fixture complete validation summary." })).isError, true);
    next = true;
    assert.equal((await check.execute("two", { summary: "- Fixture complete validation summary." })).terminate, true);
    next = "throw";
    await assert.rejects(check.execute("three", { summary: "- Fixture complete validation summary." }), /validation still failed/);
    assert.deepEqual(outcomes, [false, true, false]);
  } finally { f.cleanup(); }
});

test("explicit read-only HTTP server errors are classified; writes, 4xx and ambiguous transport errors are not", async () => {
  await assert.rejects(fetchUpstreamMetadata({ manifest: { packages: [] }, workspaces: [{ pkg: { dependencies: { fixture: "1.0.0" } } }],
    fetchImpl: async () => new Response("secret provider body", { status: 503 }) }), error => serverFailure(error)?.phase === "upstream-read" && !error.message.includes("secret provider body"));
  for (const [method, status, retryable] of [["GET", 503, true], ["GET", 404, false], ["POST", 502, false], ["PUT", 504, false]]) {
    let requests = 0;
    const api = githubClient("example/repo", "fake-token", async () => { requests++; return new Response("secret provider body", { status }); });
    await assert.rejects(api.request("/fixture", { method }), error => Boolean(serverFailure(error)) === retryable && !error.message.includes("secret provider body"));
    assert.equal(requests, 1, "HTTP calls themselves must not be automatically retried");
  }
  const uncertain = githubClient("example/repo", "fake-token", async () => { throw new Error("HTTP 502 secret body"); });
  await assert.rejects(uncertain.request("/fixture"), error => !serverFailure(error) && /uncertain/.test(error.message));
});

test("launcher forwards only a valid systemd invocation ID for notification correlation", () => {
  const root = mkdtempSync(join(tmpdir(), "amox-retry-invocation-")), previous = process.env.INVOCATION_ID;
  try {
    process.env.INVOCATION_ID = "c".repeat(32);
    assert.equal(launcherEnvironment(root).INVOCATION_ID, "c".repeat(32));
    process.env.INVOCATION_ID = "invalid-private-value";
    assert.equal(launcherEnvironment(root).INVOCATION_ID, undefined);
    assert.equal(launcherEnvironment(root).GH_TOKEN, undefined);
  } finally {
    if (previous === undefined) delete process.env.INVOCATION_ID; else process.env.INVOCATION_ID = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit public Git read HTTP failures are classified, not assertion strings or credentialed URLs", () => {
  const line = "fatal: unable to access 'https://github.com/example/repo.git/': The requested URL returned error: 502";
  assert.equal(serverFailure(gitReadHttpError(line))?.httpStatus, 502);
  assert.equal(serverFailure(gitReadHttpError(`git failed: ${line}`))?.phase, "upstream-read");
  assert.equal(gitReadHttpError(`assertion expected ${line}`), undefined);
  assert.equal(gitReadHttpError(line.replace("https://github.com", "https://user:secret@github.com")), undefined);
  assert.equal(gitReadHttpError(line.replace("502", "404")), undefined);
  const f = releaseFixture();
  try {
    const entry = f.manifest.packages[0];
    assert.throws(() => collectSources({ repoRoot: f.root, outDir: join(f.root, "context-fixture"), manifest: { packages: [entry] },
      plan: { packagePlans: [{ id: entry.id, versionChange: "bump", upstreamGitHead: "b".repeat(40) }], leanPlans: [{ id: entry.id, changed: false }] },
      runGit: args => { if (args.includes("fetch")) throw new Error(`git failed: ${line}`); return ""; },
    }), error => serverFailure(error)?.httpStatus === 502);
  } finally { f.cleanup(); }
});

test("npm install retries require an explicit npm E5xx error code, not a test assertion or local timeout", async () => {
  for (const [output, timedOut, retryable] of [["npm ERR! code E502\nprivate response", false, true],
    ["npm error code E503\nprivate response", false, true], ["npm error code E401", false, false],
    ["assertion: npm error code E502", false, false], ["npm error code E504", true, false]]) {
    const f = releaseFixture();
    try {
      const manifest = f.read("maintenance/manifest.json");
      const workspaces = manifest.packages.map(entry => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: f.read(`${entry.path}/package.json`) }));
      const plan = { packagePlans: manifest.packages.map((entry, i) => ({ id: entry.id, versionChange: i === 0 ? "bump" : "none", latestVersion: entry.upstreamVersion,
        upstreamGitHead: entry.upstreamGitHead, dependencyChanges: [] })), leanPlans: manifest.packages.map(entry => ({ id: entry.id, changed: false })) };
      await assert.rejects(stageVersions({ work: f.root, scratch: f.root, baseCommit: "a".repeat(40), state: { manifest, workspaces, plan },
        execute: async () => ({ ok: false, status: 1, timedOut, output }) }), error => Boolean(serverFailure(error)) === retryable && !error.message.includes("private response"));
    } finally { f.cleanup(); }
  }
});
