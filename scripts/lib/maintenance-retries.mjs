import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serverFailure, validServerFailure } from "./remote-errors.mjs";

export const RETRY_DELAY_MS = 2 * 60 * 60_000;
export const MAX_SERVER_RETRIES = 3;
const DAY = 24 * 60 * 60_000, DAILY_OFFSET = (2 * 60 + 23) * 60_000;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const STATUSES = new Set(["running", "queued", "succeeded", "failed", "exhausted"]);
const iso = (time) => new Date(time).toISOString();
export const dailyCycle = (now) => Math.floor((now - DAILY_OFFSET) / DAY);
function timestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) && iso(Date.parse(value)) === value; }

export function validateRetryState(state) {
  if (state?.schemaVersion !== 1 || !UUID.test(state.cycleId ?? "") || !UUID.test(state.attemptId ?? "")
    || !Number.isInteger(state.dailyCycle) || !STATUSES.has(state.status)
    || !Number.isInteger(state.retries) || state.retries < 0 || state.retries > MAX_SERVER_RETRIES
    || !timestamp(state.createdAt) || !timestamp(state.updatedAt)) throw new Error("Invalid maintenance retry state; no automatic reset");
  if (state.status === "queued" && (!validServerFailure(state.failure) || state.retries >= MAX_SERVER_RETRIES
    || !timestamp(state.dueAt) || Date.parse(state.dueAt) < Date.parse(state.updatedAt) + RETRY_DELAY_MS)) {
    throw new Error("Invalid queued retry; no automatic run");
  }
  if (state.status === "exhausted" && (state.retries !== MAX_SERVER_RETRIES || !validServerFailure(state.failure))) throw new Error("Invalid exhausted retry state");
  return state;
}

export function readRetryState(stateRoot) {
  const file = join(stateRoot, "retry-state.json");
  try {
    if (process.platform !== "win32" && (statSync(file).mode & 0o077)) throw new Error("Maintenance retry state must be private (600)");
    return validateRetryState(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error("Maintenance retry state is unavailable or invalid; inspect it before recovery");
  }
}
export function writePrivateJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}

export function retryDecision(previous, { mode, now }) {
  if (!["daily", "retry"].includes(mode) || !Number.isFinite(now)) throw new Error("Invalid retry invocation");
  if (previous) validateRetryState(previous);
  if (previous?.status === "queued") {
    if (now < Date.parse(previous.dueAt)) return { run: false, reason: "waiting", dueAt: previous.dueAt };
    return { run: true, retries: previous.retries + 1, cycleId: previous.cycleId, dailyCycle: previous.dailyCycle, createdAt: previous.createdAt };
  }
  if (mode === "retry") return { run: false, reason: "no-pending-retry" };
  if (previous?.status === "exhausted" && dailyCycle(now) <= previous.dailyCycle) return { run: false, reason: "retry-limit" };
  return { run: true, retries: 0 };
}
export function retryIsDue(stateRoot, now = Date.now()) {
  const state = readRetryState(stateRoot);
  return state?.status === "queued" && retryDecision(state, { mode: "retry", now }).run;
}

// Caller must hold maintenance.lock for the complete attempt and state update.
// The retry timer only polls this durable state; no process sleeps for two hours.
export async function runWithServerRetries({ stateRoot, mode, run, now = Date.now, id = randomUUID, log = console.log }) {
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const start = now(), decision = retryDecision(readRetryState(stateRoot), { mode, now: start });
  if (!decision.run) { log(`Maintenance skipped: ${decision.reason}${decision.dueAt ? ` until ${decision.dueAt}` : ""}`); return { ran: false, ...decision }; }
  const running = { schemaVersion: 1, cycleId: decision.cycleId ?? id(), attemptId: id(),
    dailyCycle: decision.dailyCycle ?? dailyCycle(start), createdAt: decision.createdAt ?? iso(start),
    retries: decision.retries, status: "running", updatedAt: iso(start), dueAt: null, failure: null };
  writePrivateJson(join(stateRoot, "retry-state.json"), running);
  log(`Maintenance attempt: ${running.attemptId}, server retry ${running.retries}/${MAX_SERVER_RETRIES}`);
  let failed = false, failure;
  try { await run({ attemptId: running.attemptId }); }
  catch (error) { failed = true; failure = error; }
  const finished = now();
  let last;
  try { last = JSON.parse(readFileSync(join(stateRoot, "last-run.json"), "utf8")); } catch { /* No stale state can authorize a retry. */ }
  const matching = last?.attemptId === running.attemptId;
  const descriptor = serverFailure(failure);
  const safe = matching && last.status === "failed" && last.publicationStarted === false && last.repairPending === false && !last.pr && !last.mergeSha;
  const eligible = Boolean(descriptor && safe);
  const scheduled = failed && eligible && running.retries < MAX_SERVER_RETRIES;
  const exhausted = failed && eligible && running.retries === MAX_SERVER_RETRIES;
  const result = { ...running, status: !failed ? "succeeded" : scheduled ? "queued" : exhausted ? "exhausted" : "failed",
    updatedAt: iso(finished), dueAt: scheduled ? iso(finished + RETRY_DELAY_MS) : null, failure: descriptor ?? null };
  writePrivateJson(join(stateRoot, "retry-state.json"), validateRetryState(result));
  if (matching) {
    last.retry = { status: scheduled ? "scheduled" : exhausted ? "exhausted" : failed ? "not-retryable" : "complete",
      count: running.retries, limit: MAX_SERVER_RETRIES, dueAt: result.dueAt,
      ...(descriptor ? { httpStatus: descriptor.httpStatus } : {}) };
    writePrivateJson(join(stateRoot, "last-run.json"), last);
  }
  if (scheduled) log(`HTTP ${descriptor.httpStatus}: retry ${running.retries + 1}/${MAX_SERVER_RETRIES} scheduled at ${result.dueAt}`);
  if (exhausted) log(`HTTP ${descriptor.httpStatus}: all ${MAX_SERVER_RETRIES} server retries exhausted; no further automatic attempt`);
  if (failed) throw failure;
  return { ran: true, state: result };
}
