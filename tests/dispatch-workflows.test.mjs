import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_VERSION, DEFAULT_REPO, dispatchWorkflows, parseArgs, renderUnits } from "../scripts/dispatch-workflows.mjs";

const token = "test-token-never-log-this";
const run = (id, status, conclusion) => ({ id, status, conclusion, event: "workflow_dispatch", head_branch: "main" });
const options = (args = []) => parseArgs(args);
function fixture(steps) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, request) => {
      const step = steps.shift();
      assert.ok(step, `unexpected API request ${request.method} ${url}`);
      assert.equal(request.method, step.method || "GET");
      assert.equal(url, `https://api.github.com/repos/${DEFAULT_REPO}${step.path}`);
      assert.equal(request.headers["X-GitHub-Api-Version"], API_VERSION);
      assert.equal(request.headers.Authorization, `Bearer ${token}`);
      assert.equal(request.redirect, "error");
      calls.push({ url, method: request.method, body: request.body });
      return new Response(step.status === 204 ? null : JSON.stringify(step.body), { status: step.status || 200 });
    },
    done: () => assert.equal(steps.length, 0),
  };
}
const workflowPath = "/actions/workflows/check-upstream.yml";
const active = { path: workflowPath, body: { state: "active" } };
const dispatch = { path: `${workflowPath}/dispatches`, method: "POST", body: { workflow_run_id: 42, run_url: "https://malicious.invalid/do-not-use-this", html_url: "not-used" } };

test("daily default dispatches only upstream; CI is an explicit optional selection", () => {
  assert.deepEqual(options().workflows, ["upstream"]);
  assert.deepEqual(options(["--workflow", "upstream", "--workflow", "ci", "--workflow", "ci"]).workflows, ["upstream", "ci"]);
  assert.equal(options(["--repo", "other-owner/fork"]).repo, "other-owner/fork");
  for (const args of [["--workflow", "release"], ["--repo", "owner/repo?token=x"], ["--repo", "x/../evil"], ["--timeout-minutes", "0"], ["--timeout-minutes", "181"], ["--timeout-minutes", "NaN"], ["--repo"], ["--install-timer", "--workflow", "ci"]]) assert.throws(() => options(args));
  assert.throws(() => options([token]), (error) => !error.message.includes(token));
});

test("dry run needs no GitHub credential and performs no network calls", () => {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const script = fileURLToPath(new URL("../scripts/dispatch-workflows.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--dry-run"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /check-upstream\.yml/);
  assert.doesNotMatch(result.stdout, /test\.yml|release\.yml/);
});

test("missing or malformed credentials fail before any request", async () => {
  const fetchImpl = () => assert.fail("must not make a request");
  await assert.rejects(dispatchWorkflows(options(), { fetchImpl }), /Missing GH_TOKEN/);
  await assert.rejects(dispatchWorkflows(options(), { token: "secret\nvalue", fetchImpl }), /whitespace/);
});

test("tracks only the exact returned run ID until success, never a guessed latest run", async () => {
  const f = fixture([active, dispatch, { path: "/actions/runs/42", body: run(42, "queued") }, { path: "/actions/runs/42", body: run(42, "in_progress") }, { path: "/actions/runs/42", body: run(42, "completed", "success") }]);
  const logs = [];
  const result = await dispatchWorkflows(options(), { ...f, token, pause: async () => {}, log: (text) => logs.push(text) });
  assert.deepEqual(result, [{ workflow: "upstream", id: 42, url: `https://github.com/${DEFAULT_REPO}/actions/runs/42` }]);
  assert.deepEqual(JSON.parse(f.calls[1].body), { ref: "main" });
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
  assert.doesNotMatch(logs.join("\n"), new RegExp(`${token}|malicious`));
  f.done();
});

test("inactive workflow stops before dispatch", async () => {
  const f = fixture([{ path: workflowPath, body: { state: "disabled_manually" } }]);
  await assert.rejects(dispatchWorkflows(options(), { ...f, token, log: () => {} }), /not active/);
  f.done();
});

test("HTTP failures never print even an echoed credential", async () => {
  const f = fixture([{ path: workflowPath, status: 403, body: { message: `server echoed ${token}` } }]);
  await assert.rejects(dispatchWorkflows(options(), { ...f, token }), (error) => /HTTP 403/.test(error.message) && !error.message.includes(token));
  f.done();
});

test("network ambiguity on POST is reported without automatic retries", async () => {
  let posts = 0;
  const fetchImpl = async (_url, request) => {
    if (request.method === "GET") return new Response(JSON.stringify({ state: "active" }));
    posts++;
    throw new Error(`network failure ${token}`);
  };
  await assert.rejects(dispatchWorkflows(options(), { token, fetchImpl, log: () => {} }), (error) => /may have been accepted/.test(error.message) && !error.message.includes(token));
  assert.equal(posts, 1);
});

test("legacy 204 or malformed dispatch response is never treated as successful execution", async () => {
  for (const response of [{ status: 204 }, { body: {} }, { body: { workflow_run_id: "42" } }]) {
    const f = fixture([active, { ...dispatch, ...response }]);
    await assert.rejects(dispatchWorkflows(options(), { ...f, token, log: () => {} }), /inspect Actions before retrying/);
    assert.equal(f.calls.length, 2);
    f.done();
  }
});

test("a failed or cancelled remote run fails the local service", async () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "action_required"]) {
    const f = fixture([active, dispatch, { path: "/actions/runs/42", body: run(42, "completed", conclusion) }]);
    await assert.rejects(dispatchWorkflows(options(), { ...f, token, log: () => {} }), new RegExp(`ended with ${conclusion}`));
    f.done();
  }
});

test("rejects unrelated events, branches or run IDs", async () => {
  for (const identity of [{ event: "push" }, { head_branch: "other" }, { id: 43 }]) {
    const f = fixture([active, dispatch, { path: "/actions/runs/42", body: { ...run(42, "completed", "success"), ...identity } }]);
    await assert.rejects(dispatchWorkflows(options(), { ...f, token, log: () => {} }), /Unexpected run identity/);
    f.done();
  }
});

test("a bounded timeout never cancels or redispatches the remote job", async () => {
  let time = 0;
  const f = fixture([active, dispatch, { path: "/actions/runs/42", body: run(42, "waiting") }]);
  await assert.rejects(dispatchWorkflows(options(["--timeout-minutes", "1"]), {
    ...f, token, log: () => {}, now: () => time, pollMs: 60_000, pause: async (delay) => { time += delay; },
  }), /deadline exceeded/);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
  f.done();
});

test("an upstream failure prevents additional requested CI runs", async () => {
  const f = fixture([active, dispatch, { path: "/actions/runs/42", body: run(42, "completed", "failure") }]);
  await assert.rejects(dispatchWorkflows(options(["--workflow", "upstream", "--workflow", "ci"]), { ...f, token, log: () => {} }), /ended with failure/);
  f.done();
});

test("explicit upstream and CI runs are sequential and independently monitored", async () => {
  const ciPath = "/actions/workflows/test.yml";
  const f = fixture([active, dispatch, { path: "/actions/runs/42", body: run(42, "completed", "success") }, { path: ciPath, body: { state: "active" } }, { path: `${ciPath}/dispatches`, method: "POST", body: { workflow_run_id: 43 } }, { path: "/actions/runs/43", body: run(43, "completed", "success") }]);
  const results = await dispatchWorkflows(options(["--workflow", "upstream", "--workflow", "ci"]), { ...f, token, log: () => {} });
  assert.deepEqual(results.map(({ id }) => id), [42, 43]);
  f.done();
});

test("system timer is persistent, daily and privilege-restricted without auto-retries", () => {
  const values = { user: "ubuntu", node: "/usr/bin/node", root: "/home/ubuntu/project", tokenFile: "/home/ubuntu/.config/amox-pi-actions.env", stateDir: "/home/ubuntu/.local/state/amox-pi-actions" };
  const units = renderUnits(values);
  assert.match(units.timer, /OnCalendar=\*-\*-\* 02:23:00 UTC/);
  assert.match(units.timer, /Persistent=true/);
  assert.match(units.service, /Type=oneshot\nUser=ubuntu/);
  assert.match(units.service, /Environment="AMOX_ACTIONS_STATE_DIR=\/home\/ubuntu\/\.local\/state\/amox-pi-actions"/);
  assert.match(units.service, /WorkingDirectory=\/home\/ubuntu\/project\n/);
  assert.match(units.service, /EnvironmentFile=\/home\/ubuntu\/\.config\/amox-pi-actions\.env\n/);
  assert.match(units.service, /Restart=no/);
  assert.match(units.service, /NoNewPrivileges=true/);
  assert.match(units.service, /ProtectSystem=strict/);
  assert.doesNotMatch(units.service, /--workflow ci|release\.yml|MAINTENANCE_API_KEY|Bearer/);
  for (const overrides of [{ user: "ubuntu\nExecStart=bad" }, { root: "/a\nExecStart=bad" }, { node: "relative" }, { repo: "owner/repo\nExecStart=bad" }, { stateDir: "/a%h" }, { tokenFile: "/a%h" }, { root: "/path with spaces" }]) assert.throws(() => renderUnits({ ...values, ...overrides }));
});


test("generated system units pass the real Linux systemd parser", { skip: process.platform !== "linux" }, () => {
  const probe = spawnSync("systemd-analyze", ["--version"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") return;
  const dir = mkdtempSync(join(tmpdir(), "amox-unit-test-"));
  try {
    const stateDir = join(dir, "state");
    mkdirSync(stateDir);
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const units = renderUnits({ user: userInfo().username, node: process.execPath, root, tokenFile: join(dir, "token.env"), stateDir });
    const service = join(dir, "amox-pi-actions.service");
    const timer = join(dir, "amox-pi-actions.timer");
    writeFileSync(service, units.service);
    writeFileSync(timer, units.timer);
    const result = spawnSync("systemd-analyze", ["verify", service, timer], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("real flock prevents a simultaneous CLI run before any API request", { skip: process.platform !== "linux", timeout: 10_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-lock-test-"));
  const lockFile = join(dir, `${DEFAULT_REPO.replace("/", "_")}.lock`);
  const mock = join(dir, "no-network.mjs");
  writeFileSync(mock, 'globalThis.fetch = () => { throw new Error("Network must never be called"); };');
  const holder = spawn("flock", ["-x", lockFile, process.execPath, "-e", 'console.log("locked"); setInterval(() => {}, 1000);'], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await once(holder.stdout, "data", { signal: AbortSignal.timeout(3_000) });
    const env = { ...process.env, GH_TOKEN: token, AMOX_ACTIONS_STATE_DIR: dir, NODE_OPTIONS: `--import ${mock}` };
    delete env.AMOX_ACTIONS_LOCK_HELD;
    const script = fileURLToPath(new URL("../scripts/dispatch-workflows.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 5_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /holds the lock; skipped/);
    assert.doesNotMatch(result.stdout + result.stderr, /Dispatch|Bearer|test-token/);
  } finally {
    if (holder.exitCode === null && holder.signalCode === null) {
      const exit = once(holder, "exit");
      process.kill(-holder.pid, "SIGTERM");
      await exit;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
