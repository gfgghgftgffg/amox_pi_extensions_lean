import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completion, loadConfig, send } from "../scripts/notify-maintenance.mjs";

const sha = "a".repeat(40), state = { status: "merged-after-ci", mergeSha: sha, version: "0.1.10" };
const run = { id: 1, head_sha: sha, event: "push", head_branch: "main", status: "completed", conclusion: "success", html_url: "https://github.com/gfgghgftgffg/amox_pi_extensions_lean/actions/runs/1" };
const api = { request: async path => path.includes("/jobs?") ? { jobs: [{ name: "Publish verified archives to npm (OIDC, no package hooks)", conclusion: "success" }] } : { workflow_runs: [run] } };

test("completion covers no-update, failure, timeout and pending PR without changing maintenance", async () => {
  assert.equal((await completion({ status: "no-update" }, "success")).title, "无更新");
  assert.equal((await completion(state, "timeout")).failed, true);
  assert.equal((await completion(state, "exit-code")).title, "失败");
  assert.equal((await completion({}, "success")).failed, true);
  assert.equal((await completion({ status: "pending-maintenance-pr" }, "success")).title, "跳过");
});
test("publication success reuses the exact Release and successful npm job, not merely PR merge", async () => {
  assert.equal((await completion(state, "success", { api })).title, "发布成功");
  assert.equal((await completion(state, "success", { api: { request: async () => ({ workflow_runs: [{ ...run, conclusion: "failure" }] }) } })).failed, true);
  const skippedNpm = { request: async path => path.includes("/jobs?") ? { jobs: [] } : api.request(path) };
  assert.equal((await completion(state, "success", { api: skippedNpm })).failed, true);
  let time = 0;
  const pending = { request: async () => ({ workflow_runs: [] }) };
  assert.equal((await completion(state, "success", { api: pending, now: () => time, wait: async n => { time += n; }, timeoutMs: 10 })).title, "发布等待超时");
});
test("private ntfy config and a single authenticated POST, without redirects or secret output", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-ntfy-")), tokenFile = join(dir, "token"), path = join(dir, "config.json");
  try {
    writeFileSync(tokenFile, "fake-private-token\n", { mode: 0o600 });
    writeFileSync(path, JSON.stringify({ server: "https://ntfy.example.com", topic: "maintenance", tokenFile }), { mode: 0o600 });
    const config = loadConfig(path); let posts = 0;
    await send(config, { message: "do not forward fake-private-token" }, { title: "测试", reason: "fixture" }, async (url, options) => {
      posts++; assert.equal(url, "https://ntfy.example.com/"); assert.equal(options.redirect, "manual");
      assert.equal(options.headers.authorization, "Bearer fake-private-token"); assert.doesNotMatch(options.body, /fake-private-token/);
      return new Response("{}", { status: 200 });
    });
    assert.equal(posts, 1);
    writeFileSync(tokenFile, "Token created for fixture user:\n  tk_fixtureTOKEN123\n");
    await send(config, {}, { title: "测试", reason: "fixture" }, async (_url, options) => {
      assert.equal(options.headers.authorization, "Bearer tk_fixtureTOKEN123");
      assert.doesNotMatch(options.body, /tk_fixtureTOKEN123|Token created/);
      return new Response("{}", { status: 200 });
    });
    await assert.rejects(send(config, {}, { title: "测试", reason: "fixture" }, async () => new Response(null, { status: 302 })), /not accept/);
    writeFileSync(path, JSON.stringify({ ...config, server: "https://user:secret@ntfy.example.com" })); assert.throws(() => loadConfig(path));
    chmodSync(path, 0o644); assert.throws(() => loadConfig(path));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("service stop hook reports every outcome and ignores notification errors", () => {
  const unit = readFileSync(new URL("../scripts/systemd/amox-pi-actions.service", import.meta.url), "utf8");
  assert.match(unit, /ExecStopPost=-\/usr\/bin\/node .*\/scripts\/notify-maintenance\.mjs/);
  assert.match(unit, /TimeoutStopSec=95min/); assert.match(unit, /Restart=no/);
  assert.doesNotMatch(unit, /OnSuccess=|OnFailure=|NTFY_TOKEN/);
});
