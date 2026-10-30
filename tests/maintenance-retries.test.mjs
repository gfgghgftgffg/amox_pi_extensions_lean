import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteHttpError, serverFailure, sdkHttpStatus } from "../scripts/lib/remote-errors.mjs";
import { MAX_SERVER_RETRIES, RETRY_DELAY_MS, readRetryState, retryDecision, retryIsDue, runWithServerRetries, writePrivateJson } from "../scripts/lib/maintenance-retries.mjs";

const origin = Date.parse("2026-10-30T02:23:00.000Z");
const remote = (status = 502) => new RemoteHttpError("redacted server failure", { httpStatus: status, phase: "model" });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amox-server-retry-")); let clock = origin, calls = 0;
  const step = (mode, error, overrides = {}) => runWithServerRetries({ stateRoot: root, mode, now: () => clock, log: () => {}, run: async ({ attemptId }) => {
    calls++;
    writePrivateJson(join(root, "last-run.json"), { attemptId, status: error ? "failed" : "no-update", publicationStarted: false, repairPending: false,
      failure: serverFailure(error) ?? { kind: "non-retryable" }, ...overrides });
    if (error) throw error;
  } });
  return { root, step, now: () => clock, advance: (ms) => { clock += ms; }, calls: () => calls, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("SDK envelopes recognize server statuses, not status-like provider body or assertion text", () => {
  assert.equal(sdkHttpStatus("gateway API error (502): private body", "gateway"), 502);
  assert.equal(sdkHttpStatus("OpenAI API error (503): private body", "openai"), 503);
  assert.equal(sdkHttpStatus("HTTP 504 Gateway timeout", "gateway"), 504);
  assert.equal(sdkHttpStatus("500: private body", "gateway"), 500);
  assert.equal(sdkHttpStatus("gateway API error (401): body says HTTP 502", "gateway"), 401);
  assert.equal(sdkHttpStatus("assertion expected HTTP 502", "gateway"), undefined);
  assert.equal(sdkHttpStatus("private body mentions gateway API error (503): unavailable", "gateway"), undefined);
  assert.equal(serverFailure(new Error("HTTP 502")), undefined);
  for (const status of [400, 401, 403, 404, 429, 501, 505]) assert.equal(serverFailure(remote(status)), undefined);
  for (const status of [500, 502, 503, 504]) assert.equal(serverFailure(remote(status)).httpStatus, status);
});

test("initial attempt plus at most three retries, each at least two hours later, persist across invocations", async () => {
  const f = fixture();
  try {
    assert.equal(RETRY_DELAY_MS, 2 * 60 * 60_000); assert.equal(MAX_SERVER_RETRIES, 3);
    await assert.rejects(f.step("daily", remote()), /redacted/);
    let state = readRetryState(f.root);
    assert.equal(state.status, "queued"); assert.equal(state.retries, 0);
    assert.equal(Date.parse(state.dueAt), f.now() + RETRY_DELAY_MS);
    const cycle = state.cycleId;
    for (let count = 1; count <= MAX_SERVER_RETRIES; count++) {
      f.advance(RETRY_DELAY_MS - 1);
      assert.equal(retryIsDue(f.root, f.now()), false);
      assert.equal((await f.step("retry", remote())).ran, false);
      assert.equal((await f.step("daily", remote())).ran, false, "daily/manual invocation cannot bypass pending backoff");
      assert.equal(f.calls(), count);
      f.advance(1); assert.equal(retryIsDue(f.root, f.now()), true);
      await assert.rejects(f.step("retry", remote(503)), /redacted/);
      state = readRetryState(f.root);
      assert.equal(state.cycleId, cycle); assert.equal(state.retries, count);
      assert.equal(state.status, count < 3 ? "queued" : "exhausted");
    }
    assert.equal(f.calls(), 4); assert.equal(readRetryState(f.root).dueAt, null);
    assert.equal((await f.step("retry", remote())).ran, false);
    assert.equal((await f.step("daily", remote())).reason, "retry-limit");
    assert.equal(f.calls(), 4);
    const last = JSON.parse(readFileSync(join(f.root, "last-run.json"), "utf8"));
    assert.equal(last.retry.status, "exhausted"); assert.equal(last.retry.count, 3);
    f.advance(24 * 60 * 60_000);
    await f.step("daily"); assert.equal(f.calls(), 5); assert.equal(readRetryState(f.root).retries, 0);
    assert.notEqual(readRetryState(f.root).cycleId, cycle, "next scheduled day starts a new bounded cycle");
  } finally { f.cleanup(); }
});

test("two-hour delay starts after the failed attempt finishes, not at process startup", async () => {
  const root = mkdtempSync(join(tmpdir(), "amox-retry-finish-clock-")); let clock = origin;
  try {
    await assert.rejects(runWithServerRetries({ stateRoot: root, mode: "daily", now: () => clock, log: () => {}, run: async ({ attemptId }) => {
      clock += 5 * 60_000;
      writePrivateJson(join(root, "last-run.json"), { attemptId, status: "failed", publicationStarted: false, repairPending: false, failure: serverFailure(remote()) });
      throw remote();
    } }));
    assert.equal(Date.parse(readRetryState(root).dueAt), origin + 5 * 60_000 + RETRY_DELAY_MS);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("successful retry clears the pending queue; polling does not call the model or consume retries", async () => {
  const f = fixture();
  try {
    assert.equal((await f.step("retry", remote())).ran, false); assert.equal(f.calls(), 0);
    await assert.rejects(f.step("daily", remote(500)));
    for (let i = 0; i < 5; i++) assert.equal((await f.step("retry", remote())).ran, false);
    assert.equal(f.calls(), 1); assert.equal(readRetryState(f.root).retries, 0);
    f.advance(RETRY_DELAY_MS);
    await f.step("retry");
    assert.equal(readRetryState(f.root).status, "succeeded"); assert.equal(readRetryState(f.root).retries, 1);
    f.advance(RETRY_DELAY_MS); assert.equal((await f.step("retry", remote())).ran, false);
    assert.equal(f.calls(), 2);
  } finally { f.cleanup(); }
});

test("ordinary failures, stale status and publication boundaries never authorize automatic reruns", async () => {
  for (const [error, override] of [[new Error("test failed with HTTP 502 in assertion"), {}], [remote(429), {}],
    [remote(), { publicationStarted: true }], [remote(), { repairPending: true }], [remote(), { repairPending: undefined }], [remote(), { pr: "https://github.com/example/repo/pull/1" }],
    [remote(), { mergeSha: "a".repeat(40) }], [remote(), { attemptId: "stale" }], [remote(), { status: "starting" }]]) {
    const f = fixture();
    try {
      await assert.rejects(f.step("daily", error, override));
      assert.equal(readRetryState(f.root).status, "failed");
      f.advance(RETRY_DELAY_MS); assert.equal((await f.step("retry", remote())).ran, false); assert.equal(f.calls(), 1);
    } finally { f.cleanup(); }
  }
});

test("state corruption and counter tampering fail closed rather than resetting the retry budget", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.step("daily", remote()));
    const state = readRetryState(f.root);
    assert.throws(() => retryDecision({ ...state, retries: 4 }, { mode: "retry", now: f.now() }), /Invalid/);
    assert.throws(() => retryDecision({ ...state, dueAt: state.updatedAt }, { mode: "retry", now: f.now() }), /Invalid queued/);
    writeFileSync(join(f.root, "retry-state.json"), "not-json", { mode: 0o600 });
    await assert.rejects(f.step("daily"), /unavailable or invalid/); assert.equal(f.calls(), 1);
    writePrivateJson(join(f.root, "retry-state.json"), state);
    if (process.platform !== "win32") {
      chmodSync(join(f.root, "retry-state.json"), 0o644);
      assert.throws(() => readRetryState(f.root), /unavailable or invalid/);
    }
  } finally { f.cleanup(); }
});
