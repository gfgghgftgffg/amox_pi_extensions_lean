import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { completion, send } from "../scripts/notify-maintenance.mjs";
import { RemoteHttpError, serverFailure } from "../scripts/lib/remote-errors.mjs";
import { RETRY_DELAY_MS, readRetryState, runWithServerRetries, writePrivateJson } from "../scripts/lib/maintenance-retries.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (name) => readFileSync(join(repo, name), "utf8");
const remote = new RemoteHttpError("redacted", { httpStatus: 503, phase: "model" });
async function queue(root, clock) {
  await assert.rejects(runWithServerRetries({ stateRoot: root, mode: "daily", now: () => clock, log: () => {}, run: async ({ attemptId }) => {
    writePrivateJson(join(root, "last-run.json"), { status: "failed", attemptId, serviceInvocation: "a".repeat(32), publicationStarted: false, repairPending: false, failure: serverFailure(remote) });
    throw remote;
  } }));
}

test("every postponement sends a pending ntfy notice with Beijing deadline and retry number; exhaustion sends failure", { skip: process.platform === "win32" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-retry-notify-"));
  try {
    const tokenFile = join(root, "token"); writeFileSync(tokenFile, "fake-notify-key", { mode: 0o600 });
    const config = { server: "https://ntfy.example.com/", topic: "fixture", tokenFile }, posts = [];
    let clock = Date.parse("2026-10-30T02:23:00.000Z");
    for (let count = 0; count <= 3; count++) {
      await assert.rejects(runWithServerRetries({ stateRoot: root, mode: count ? "retry" : "daily", now: () => clock, log: () => {}, run: async ({ attemptId }) => {
        writePrivateJson(join(root, "last-run.json"), { status: "failed", attemptId, publicationStarted: false, repairPending: false,
          failure: serverFailure(remote), message: "private provider response" });
        throw remote;
      } }));
      const state = JSON.parse(readFileSync(join(root, "last-run.json"), "utf8")), result = await completion(state, "exit-code");
      await send(config, state, result, async (_url, options) => { posts.push(JSON.parse(options.body)); assert.doesNotMatch(options.body, /fake-notify-key|private provider response/); return Response.json({}); });
      if (count < 3) {
        assert.equal(result.title, "等待重试"); assert.equal(result.pending, true); assert.equal(result.failed, undefined);
        assert.match(result.reason, /HTTP 503.*2 小时.*北京时间/);
        assert.ok(result.reason.includes(`第 ${count + 1}/3 次重试`));
        assert.deepEqual(posts[count].tags, ["hourglass_flowing_sand"]);
        const waiting = await runWithServerRetries({ stateRoot: root, mode: "retry", now: () => clock + 60000, log: () => {}, run: () => assert.fail("not due") });
        assert.equal(waiting.ran, false); assert.equal(posts.length, count + 1);
        clock = Date.parse(readRetryState(root).dueAt);
      } else { assert.equal(result.title, "重试耗尽"); assert.equal(result.failed, true); assert.deepEqual(posts[count].tags, ["warning"]); }
    }
    assert.equal(posts.length, 4, "three postponements plus one exhaustion notice, not polling notices");
    const state = JSON.parse(readFileSync(join(root, "last-run.json"), "utf8"));
    state.publicationStarted = true; state.retry = { status: "scheduled", count: 0, limit: 3, dueAt: new Date(clock + RETRY_DELAY_MS).toISOString() };
    assert.equal((await completion(state, "exit-code")).title, "需人工核对");
    state.publicationStarted = false;
    state.repairPending = true;
    assert.equal((await completion(state, "exit-code")).title, "需人工修复");
    state.repairPending = false;
    assert.notEqual((await completion(state, "timeout")).title, "等待重试");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("due condition is read-only and CLI polling neither starts maintenance nor consumes retry budget", { skip: process.platform !== "linux" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-retry-cli-"));
  try {
    const home = join(root, "home"); mkdirSync(home);
    const env = { ...process.env, HOME: home, AMOX_MAINTENANCE_STATE: root, AMOX_MODEL_CONFIG: join(home, "no-model.json"), AMOX_PUBLISH_ENV: join(home, "no-publish.env") };
    await queue(root, Date.now() - RETRY_DELAY_MS - 2000);
    const statePath = join(root, "retry-state.json");
    const before = readFileSync(statePath, "utf8");
    const due = spawnSync(process.execPath, [join(repo, "scripts/maintenance-retry-due.mjs")], { env, encoding: "utf8", timeout: 10000 });
    assert.equal(due.status, 0, due.stderr); assert.equal(readFileSync(statePath, "utf8"), before);
    const future = readRetryState(root); future.updatedAt = new Date().toISOString(); future.dueAt = new Date(Date.parse(future.updatedAt) + RETRY_DELAY_MS).toISOString();
    writePrivateJson(statePath, future);
    const waiting = spawnSync(process.execPath, [join(repo, "scripts/maintenance-retry-due.mjs")], { env, encoding: "utf8", timeout: 10000 });
    assert.equal(waiting.status, 1);
    const unchanged = readFileSync(statePath, "utf8"), last = readFileSync(join(root, "last-run.json"), "utf8");
    for (let i = 0; i < 2; i++) {
      const poll = spawnSync(process.execPath, [join(repo, "scripts/local-maintenance.mjs"), "--run", "--retry"], { env, encoding: "utf8", timeout: 10000 });
      assert.equal(poll.status, 0, poll.stderr); assert.match(poll.stdout, /skipped: waiting/);
    }
    assert.equal(readFileSync(statePath, "utf8"), unchanged); assert.equal(readFileSync(join(root, "last-run.json"), "utf8"), last);
    assert.equal(readdirSync(root).some(name => name.startsWith("run-")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("shared flock prevents daily/retry overlap without consuming a due retry", { skip: process.platform !== "linux" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-retry-lock-")); let holder;
  try {
    await queue(root, Date.now() - RETRY_DELAY_MS - 2000);
    const before = readFileSync(join(root, "retry-state.json"), "utf8"), home = join(root, "home"); mkdirSync(home);
    holder = spawn("flock", ["-n", join(root, "maintenance.lock"), process.execPath, "-e", "console.log('lock-held');process.stdin.resume();"], { stdio: ["pipe", "pipe", "pipe"] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("lock holder did not start")), 5000);
      holder.once("error", error => { clearTimeout(timer); reject(error); });
      holder.stdout.once("data", () => { clearTimeout(timer); resolve(); });
    });
    const poll = spawnSync(process.execPath, [join(repo, "scripts/local-maintenance.mjs"), "--run", "--retry"], {
      encoding: "utf8", timeout: 10000, env: { ...process.env, HOME: home, AMOX_MAINTENANCE_STATE: root,
        AMOX_MODEL_CONFIG: join(home, "no-model.json"), AMOX_PUBLISH_ENV: join(home, "no-publish.env") },
    });
    assert.equal(poll.status, 0, poll.stderr); assert.match(poll.stdout, /owns the lock; skipped without consuming a retry/);
    assert.equal(readFileSync(join(root, "retry-state.json"), "utf8"), before);
  } finally {
    if (holder?.pid && holder.exitCode === null && holder.signalCode === null) {
      const exited = once(holder, "exit"); holder.stdin.end(); await exited;
    } else holder?.stdin?.end();
    rmSync(root, { recursive: true, force: true });
  }
});

test("real notification CLI ignores skipped invocation polls but posts the actual postponed attempt", { skip: process.platform === "win32" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-retry-notify-cli-"));
  try {
    await queue(root, Date.now());
    const tokenFile = join(root, "token"), config = join(root, "config.json"), output = join(root, "post.json"), loader = join(root, "fetch.mjs");
    writeFileSync(tokenFile, "fake-only-key", { mode: 0o600 });
    writeFileSync(config, JSON.stringify({ server: "https://ntfy.example.com", topic: "fixture", tokenFile }), { mode: 0o600 });
    writeFileSync(loader, `import {writeFileSync} from 'node:fs';globalThis.fetch=async (_url,options)=>{writeFileSync(${JSON.stringify(output)},options.body);return Response.json({});};`);
    const invoke = (invocation, result) => spawnSync(process.execPath, ["--import", pathToFileURL(loader).href, join(repo, "scripts/notify-maintenance.mjs")], {
      encoding: "utf8", timeout: 10000, env: { ...process.env, AMOX_NOTIFY_CONFIG: config, AMOX_MAINTENANCE_STATE: root, INVOCATION_ID: invocation, SERVICE_RESULT: result },
    });
    for (const result of ["success", "exec-condition", "exec-condition"]) {
      const poll = invoke("b".repeat(32), result); assert.equal(poll.status, 0, poll.stderr); assert.equal(existsSync(output), false);
    }
    const actual = invoke("a".repeat(32), "exit-code"); assert.equal(actual.status, 0, actual.stderr);
    const payload = JSON.parse(readFileSync(output, "utf8"));
    assert.match(payload.title, /等待重试/); assert.match(payload.message, /HTTP 503.*北京时间.*1\/3/);
    assert.deepEqual(payload.tags, ["hourglass_flowing_sand"]); assert.doesNotMatch(readFileSync(output, "utf8"), /fake-only-key/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retry timer is persistent, due-gated and runs the same locked host entry with unchanged sandbox protections", () => {
  const timer = source("scripts/systemd/amox-pi-actions-retry.timer"), unit = source("scripts/systemd/amox-pi-actions-retry.service");
  assert.match(timer, /OnCalendar=\*-\*-\* \*:\*:00 UTC/); assert.match(timer, /Persistent=true/);
  assert.match(timer, /Unit=amox-pi-actions-retry.service/); assert.match(unit, /ExecCondition=.*maintenance-retry-due.mjs/);
  assert.match(source("scripts/systemd/amox-pi-actions.service"), /Wants=.*amox-pi-actions-retry.timer/);
  assert.match(unit, /local-maintenance.mjs --run --retry/); assert.match(unit, /Restart=no/);
  for (const flag of ["NoNewPrivileges=true", "PrivateTmp=true", "ProtectSystem=strict", "ProtectHome=read-only", "UMask=0077", "KillMode=control-group"]) assert.ok(unit.includes(flag));
  assert.match(unit, /ExecStopPost=-.*notify-maintenance.mjs/);
  assert.doesNotMatch(unit, /EnvironmentFile|systemd-run|sudo|Restart=always/);
});
