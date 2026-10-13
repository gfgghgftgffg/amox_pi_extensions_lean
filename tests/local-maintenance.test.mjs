import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { createLocalTools, openLocalPi } from "../scripts/lib/local-pi.mjs";
import { githubClient } from "../scripts/lib/github-maintenance.mjs";
import { launcherEnvironment } from "../scripts/local-maintenance.mjs";
import { sandboxRun } from "../scripts/lib/local-sandbox.mjs";

// One real SDK conversation exercises failure -> repair -> recheck on the same
// file, without a model request or recursive execution of this test suite.
test("local Pi repairs the same candidate from check output with no discovery or credential exposure", async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-local-sdk-"));
  const repo = join(root, "repo"), context = join(root, "context"), sdk = join(root, "sdk");
  for (const path of [repo, context, sdk, join(repo, "packages/example/tests"), join(repo, ".pi/extensions")]) mkdirSync(path, { recursive: true });
  writeFileSync(join(repo, "package.json"), "{}\n");
  writeFileSync(join(repo, "packages/example/tests/existing.test.mjs"), "// original assertions\n");
  writeFileSync(join(repo, ".pi/extensions/untrusted.ts"), "throw new Error('must never load');\n");
  const manifest = { packages: [{ id: "example", path: "packages/example", entry: "index.ts" }] };
  const baseline = new Map([["packages/example/tests/existing.test.mjs", { text: "// original assertions\n" }]]);
  const regression = "packages/example/tests/pagination.test.mjs";
  const bad = 'assert.equal(rendered, "😀tail");\n', fixed = 'assert.equal(body, "😀tail");\n';
  let checks = 0, invalidations = 0, requests = 0, pi;
  const gate = { invalidate() { invalidations++; }, async check() {
    const text = readFileSync(join(repo, regression), "utf8"); checks++;
    if (checks === 1) { assert.equal(text, bad); return { ok: false, output: "Expected body 😀tail; rendered includes # unicode and pagination footer. Repair the body assertion." }; }
    assert.equal(text, fixed); return { ok: true, output: "All local checks passed for this same candidate." };
  } };
  const tools = createLocalTools({ repo, context, manifest, baseline, gate });
  const tool = (name) => tools.find((item) => item.name === name);
  try {
    assert.deepEqual(tools.map((item) => item.name).sort(), ["check", "edit", "list", "read", "write"]);
    await assert.rejects(tool("read").execute("a", { scope: "repo", path: ".git/config" }), /inventory/);
    await assert.rejects(tool("write").execute("b", { path: "package.json", content: "bad" }), /Protected/);
    await assert.rejects(tool("write").execute("c", { path: "packages/example/tests/existing.test.mjs", content: "removed assertions" }), /append-only/);
    const calls = [["write", { path: "maintenance/agent-review.md", content: "# Exact source review\n" }],
      ["write", { path: regression, content: bad }], ["check", { summary: "- Preserve complete emoji and correct pagination offsets." }],
      ["edit", { path: regression, oldText: bad, newText: fixed }], ["check", { summary: "- Preserve complete emoji and correct pagination offsets." }]];
    pi = await openLocalPi({ repo, scratch: sdk, tools, config: { provider: "offline-local", model: "offline", apiKey: "offline-not-a-real-key", thinking: "off" }, log: () => {},
      runtimeFactory: async (options) => {
        assert.equal(options.modelsPath, null); assert.equal(options.refreshOnCreate, false);
        const runtime = await ModelRuntime.create(options);
        runtime.registerProvider("offline-local", { api: "openai-completions", baseUrl: "https://unused.invalid/v1",
          models: [{ id: "offline", name: "Offline", input: ["text"], reasoning: false, contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
          streamSimple: (model, context) => {
            assert.ok(!JSON.stringify(context).includes("offline-not-a-real-key"));
            const step = calls[requests++]; assert.ok(requests <= calls.length + 1, "bounded conversation");
            if (requests === 4) assert.match(JSON.stringify(context), /rendered includes/);
            const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id,
              content: step ? [{ type: "toolCall", id: `call-${requests}`, name: step[0], arguments: step[1] }] : [{ type: "text", text: "Done" }],
              stopReason: step ? "toolUse" : "stop", timestamp: Date.now(),
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
            const stream = createAssistantMessageEventStream(); queueMicrotask(() => stream.push({ type: "done", reason: message.stopReason, message })); return stream;
          } });
        return runtime;
      } });
    await pi.prompt("Review, check, repair this candidate and check again.");
    assert.equal(checks, 2); assert.equal(invalidations, 3); assert.equal(requests, calls.length);
    assert.equal(readFileSync(join(repo, regression), "utf8"), fixed);
    assert.equal(readFileSync(join(repo, "packages/example/tests/existing.test.mjs"), "utf8"), baseline.get("packages/example/tests/existing.test.mjs").text);
  } finally { pi?.dispose(); rmSync(root, { recursive: true, force: true }); }
});

test("remote acceptance requires all three actual platforms at the exact SHA; mutation requests are not retried", async () => {
  const sha = "a".repeat(40), seen = [];
  let complete = false;
  const api = githubClient("example/repo", "fake-publish-token", async (url, options) => {
    seen.push([url, options]);
    if (url.endsWith("/pulls")) throw new Error("ambiguous connection failure with private response");
    const body = url.includes("/jobs?") ? { jobs: ["ubuntu-latest", "windows-latest", "macos-latest"].map((os) => ({ name: `check + contracts + production + audit (${os})`, conclusion: os === "macos-latest" && !complete ? "skipped" : "success" }))
      .concat([{ name: "all-platforms-pass", conclusion: "success" }]) } : { workflow_runs: [{ id: 1, head_sha: sha, event: "pull_request", status: "completed", conclusion: "success", html_url: "https://github.com/example/repo/actions/runs/1" }] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  assert.equal((await api.waitForCI(sha, { timeoutMs: 1000, log: () => {} })).ok, false);
  complete = true; assert.equal((await api.waitForCI(sha, { timeoutMs: 1000, log: () => {} })).ok, true);
  await assert.rejects(api.request("/pulls", { method: "POST", body: {} }), /uncertain/);
  assert.equal(seen.filter(([url]) => url.endsWith("/pulls")).length, 1);
  assert.ok(seen.some(([url]) => url.includes(`head_sha=${sha}`)));
});

test("execution sandbox has no host credentials or host home and cannot rewrite candidate source", { skip: process.platform !== "linux" || !existsSync("/usr/bin/bwrap") || process.env.AMOX_INSIDE_SANDBOX === "1" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-local-sandbox-"));
  const repo = join(root, "repo"); mkdirSync(repo); writeFileSync(join(repo, "README.md"), "sealed source\n");
  const secret = join(root, "private-credential"); writeFileSync(secret, "fake-host-only-key");
  const previous = process.env.GH_TOKEN; process.env.GH_TOKEN = "fake-host-only-key";
  try {
    const launch = launcherEnvironment(root);
    assert.equal(launch.TMPDIR, join(root, "tmp")); assert.ok(existsSync(launch.TMPDIR));
    assert.equal(launch.GH_TOKEN, undefined, "launcher passes disk-backed TMP, not publication credentials");
    const code = `const a=require('node:assert/strict'),f=require('node:fs');a.equal(process.env.GH_TOKEN,undefined);a.equal(f.existsSync(${JSON.stringify(secret)}),false);a.equal(f.existsSync('/home/ubuntu/.ssh'),false);a.throws(()=>f.writeFileSync('/workspace/README.md','changed'),{code:'EROFS'});console.log('isolated-check-ok');`;
    const checked = await sandboxRun({ repo, scratch: join(root, "sandbox"), command: "/usr/bin/node", args: ["-e", code], network: false, timeoutMs: 15000 });
    assert.equal(checked.ok, true, checked.output); assert.match(checked.output, /isolated-check-ok/);
    assert.equal(readFileSync(join(repo, "README.md"), "utf8"), "sealed source\n"); assert.ok(existsSync(secret));
  } finally { previous === undefined ? delete process.env.GH_TOKEN : process.env.GH_TOKEN = previous; rmSync(root, { recursive: true, force: true }); }
});
