import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { default: extension } = await jiti.import("../index.ts");
const { createConfig, defaultPaths, saveConfig, SyncService } = await jiti.import("../core.ts");
const bridgeKey = Symbol.for("pi-starline.pill-api.v1");
const deleteKey = Symbol.for("amox-pi-sync.pending-session-delete.v1");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate, description) {
  const deadline = Date.now() + 1500;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  assert.ok(predicate(), description);
}

// Exercise both reloaded extensions and hosts that reuse the lifecycle handlers.
async function fixture(t, { mode = "manual", configured = true, reuse = false, confirmSessionDelete } = {}) {
  const root = await mkdtemp(join(tmpdir(), "amox-sync-delete-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const previousBridge = globalThis[bridgeKey];
  const previousDelete = globalThis[deleteKey];
  process.env.PI_CODING_AGENT_DIR = root;
  delete globalThis[bridgeKey];
  delete globalThis[deleteKey];
  const config = createConfig("git@github.com:example/private.git", defaultPaths(root));
  Object.assign(config, { mode, watchIntervalMs: 10, pushDebounceMs: 5 });
  if (confirmSessionDelete !== undefined) config.confirmSessionDelete = confirmSessionDelete;
  else delete config.confirmSessionDelete; // existing configs default to confirmation on
  if (configured) await saveConfig(config, defaultPaths(root));
  const instances = [], trace = [], staleCalls = [], executions = [];
  const candidates = [
    { path: "sessions/current.jsonl", name: "Current session", bytes: 1024 },
    { path: "sessions/manual-fork.jsonl", name: "Renamed manual fork", bytes: 2048 },
  ];
  const state = { statuses: new Map(), confirm: true, veto: false, snapshot: "before", plans: [], deletions: [], pulls: [], pushes: [], fingerprints: [], withSessionCalls: 0 };
  const originals = new Map();
  function stub(name, implementation) {
    if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(SyncService.prototype, name));
    Object.defineProperty(SyncService.prototype, name, { configurable: true, writable: true, value: implementation });
  }
  const owner = service => instances.find(instance => instance.file === service.activeSessionFile);
  stub("initializeBaseline", async function () { trace.push(`${owner(this).name}:baseline`); });
  stub("fingerprint", async function () {
    state.fingerprints.push(owner(this).name);
    return state.snapshot;
  });
  stub("planDeleteSessionTree", async function (file) {
    state.plans.push({ service: this, file });
    trace.push(`${owner(this).name}:plan`);
    return { candidates };
  });
  stub("deleteSessionTree", async function (file, expectedPaths) {
    const instance = owner(this);
    state.deletions.push({ service: this, file, expectedPaths, instance });
    trace.push(`${instance.name}:delete`);
    // Exercise the executor captured by the service, not just its public fields.
    await this.exec(["test-delete-executor"], root);
    await state.deleteHook?.();
    if (state.deleteError) throw new Error(state.deleteError);
    state.snapshot = "after deletion";
    trace.push(`${instance.name}:deleted`);
    return { removed: candidates.map(candidate => candidate.path), repoRemoved: 2, skipped: 0 };
  });
  stub("pull", async function () { state.pulls.push(owner(this).name); trace.push(`${owner(this).name}:pull`); return "Pulled"; });
  stub("push", async function () { state.pushes.push(owner(this).name); trace.push(`${owner(this).name}:push`); return "Pushed"; });
  function instantiate(name, previous) {
    const instance = { name, file: join(root, "sessions", `${name === "old" ? "current" : "fresh"}.jsonl`), retired: false, events: previous?.events ?? new Map(), commands: previous?.commands ?? new Map(), notifications: [], statuses: [], confirmations: [] };
    instances.push(instance);
    const guard = (method, action) => (...args) => {
      if (instance.retired) {
        staleCalls.push(`${name}:${method}`);
        throw new Error(`Retired ${name} API used: ${method}`);
      }
      return action(...args);
    };
    instance.ctx = {
      hasUI: true,
      sessionManager: { getSessionFile: guard("getSessionFile", () => instance.file) },
      ui: {
        setStatus: guard("setStatus", (key, text) => {
          instance.statuses.push([key, text]);
          if (text === undefined) state.statuses.delete(key); else state.statuses.set(key, text);
        }),
        setWidget: guard("setWidget", () => {}),
        notify: guard("notify", (...args) => instance.notifications.push(args)),
        confirm: guard("confirm", async (...args) => { instance.confirmations.push(args); return state.confirm; }),
      },
      waitForIdle: guard("waitForIdle", async () => { trace.push(`${name}:idle`); }),
      newSession: guard("newSession", async ({ withSession }) => {
        trace.push(`${name}:newSession`);
        if (state.veto) return { cancelled: true };
        await instance.events.get("session_shutdown")({}, instance.ctx);
        trace.push(`${name}:shutdown`);
        instance.retired = true;
        const fresh = instantiate("fresh", reuse ? instance : undefined);
        await fresh.events.get("session_start")({ reason: "new", previousSessionFile: instance.file }, fresh.ctx);
        trace.push("fresh:started");
        await withSession(fresh.ctx);
        state.withSessionCalls++;
        return { cancelled: false };
      }),
    };
    if (!previous) extension({
      on: (name, handler) => instance.events.set(name, handler),
      registerCommand: (name, command) => instance.commands.set(name, command),
      exec: async (command, args) => {
        if (!reuse && instance.retired) { staleCalls.push(`${name}:pi.exec`); throw new Error("Retired executor"); }
        assert.equal(command, "git");
        assert.deepEqual(args, ["test-delete-executor"], "no real network/git operations in lifecycle fixture");
        executions.push(name);
        return { stdout: "", stderr: "", code: 0, killed: false };
      },
    });
    return instance;
  }
  t.after(async () => {
    try {
      for (const instance of instances) {
        if (!instance.retired) await instance.events.get("session_shutdown")({}, instance.ctx);
      }
    } finally {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(SyncService.prototype, name, descriptor);
        else delete SyncService.prototype[name];
      }
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDir;
      if (previousBridge === undefined) delete globalThis[bridgeKey]; else globalThis[bridgeKey] = previousBridge;
      if (previousDelete === undefined) delete globalThis[deleteKey]; else globalThis[deleteKey] = previousDelete;
      await rm(root, { recursive: true, force: true });
    }
  });
  const old = instantiate("old");
  await old.events.get("session_start")({ reason: "startup" }, old.ctx);
  await until(() => !old.statuses.at(-1)?.[1]?.match(/Sync: Pull/), "startup Pull settled");
  return { root, old, instances, trace, state, candidates, executions, staleCalls,
    delete: (args = "") => old.commands.get("delete-session").handler(args, old.ctx) };
}

for (const cancellation of ["confirmation", "newSession veto"]) {
  test(`/delete-session ${cancellation} retains files and resumes automatic sync`, async t => {
    const f = await fixture(t, { mode: "auto" });
    if (cancellation === "confirmation") f.state.confirm = false;
    else f.state.veto = true;
    const pullsBefore = f.state.pulls.length;
    await f.delete();
    assert.equal(f.state.plans.length, 1);
    assert.equal(f.state.deletions.length, 0);
    assert.equal(f.instances.length, 1);
    assert.equal(f.state.withSessionCalls, 0);
    assert.equal(f.trace.includes("old:newSession"), cancellation !== "confirmation");
    assert.equal(f.trace.includes("old:shutdown"), false);
    assert.equal(globalThis[deleteKey], undefined);
    assert.equal(f.state.pulls.length, pullsBefore + 1, "automatic Pull restarts after cancellation");
    await until(() => f.old.statuses.at(-1)[1] === "Sync: Auto", "cancelled operation clears busy state");
    f.state.snapshot = "changed after cancellation";
    await until(() => f.state.pushes.includes("old"), "automatic watcher resumes after cancellation");
    assert.deepEqual(f.staleCalls, []);
  });
}

for (const reuse of [false, true]) for (const mode of ["manual", "auto", "off"]) {
  test(`/delete-session ${reuse ? "reuses" : "rebuilds"} the extension before deleting in ${mode} mode`, async t => {
    const f = await fixture(t, { mode, reuse });
    const entered = deferred(), release = deferred();
    f.state.deleteHook = async () => { entered.resolve(); await release.promise; };
    const deleting = f.delete();
    try {
      await until(() => f.state.deletions.length === 1, "fresh deletion starts");
      await entered.promise;
      assert.equal(f.instances.length, 2);
      assert.equal(f.old.retired, true);
      assert.ok(f.trace.indexOf("old:shutdown") < f.trace.indexOf("fresh:delete"));
      assert.equal(f.state.pulls.includes("fresh"), false, "fresh startup must not Pull before deletion finishes");
      await sleep(35);
      assert.equal(f.state.pulls.includes("fresh"), false, "automatic timers must not start during deletion");
      assert.equal(f.state.pushes.includes("fresh"), false);
      assert.deepEqual(f.executions, [reuse ? "old" : "fresh"], "executor follows host extension lifecycle");
      assert.deepEqual(f.staleCalls, []);
    } finally { release.resolve(); await deleting; }
    const fresh = f.instances[1], deletion = f.state.deletions[0];
    assert.notEqual(deletion.service, f.state.plans[0].service);
    assert.equal(deletion.instance, fresh);
    assert.equal(deletion.service.activeSessionFile, fresh.file);
    assert.equal(deletion.file, f.old.file);
    assert.deepEqual(deletion.expectedPaths, f.candidates.map(candidate => candidate.path));
    assert.equal(f.state.withSessionCalls, 1);
    assert.equal(globalThis[deleteKey], undefined);
    assert.deepEqual(f.staleCalls, [], "outgoing ctx and pi must never be reused after shutdown");
    assert.ok(fresh.notifications.some(([message, level]) => level === "info" && /Deleted 2 local and 2 snapshot/.test(message)));
    assert.ok(!fresh.notifications.some(([, level]) => level === "error"));
    const confirmation = f.old.confirmations[0].join("\n");
    assert.match(confirmation, /Current session/);
    assert.match(confirmation, /Renamed manual fork/);
    if (mode === "auto") {
      assert.ok(f.trace.indexOf("fresh:deleted") < f.trace.indexOf("fresh:pull"));
      await until(() => f.state.pushes.includes("fresh"), "auto watcher must detect deletion without a later file edit");
      assert.equal(f.state.snapshot, "after deletion");
    } else {
      assert.deepEqual(f.state.pulls, []);
      assert.deepEqual(f.state.pushes, []);
    }
    await until(() => f.state.statuses.get("pi-sync") === `Sync: ${{ manual: "Manual", auto: "Auto", off: "Off" }[mode]}`, "global final state must not retain Delete session");
    await fresh.commands.get("sync-status").handler("", fresh.ctx);
    const details = fresh.notifications.at(-1)[0];
    assert.match(details, /Last action: (Delete session|Push|Pull) completed/);
    assert.doesNotMatch(details, /State: Delete session/);
    assert.deepEqual(f.staleCalls, []);
  });
}

test("/delete-session failure is explicit in the fresh context and pauses automatic sync", async t => {
  const f = await fixture(t, { mode: "auto" });
  f.state.deleteError = "snapshot commit denied";
  await f.delete();
  const fresh = f.instances[1];
  assert.ok(fresh);
  assert.ok(fresh.notifications.some(([message, level]) => level === "error" && /snapshot commit denied/.test(message)));
  assert.ok(fresh.notifications.some(([message]) => /Automatic sync is paused/.test(message)));
  assert.deepEqual(fresh.statuses.at(-1), ["pi-sync", "Sync: Error"]);
  const fingerprints = f.state.fingerprints.length;
  f.state.snapshot = "later edit";
  await sleep(70);
  assert.equal(f.state.fingerprints.length, fingerprints, "watcher remains stopped after failure");
  assert.equal(f.state.pulls.includes("fresh"), false);
  assert.equal(f.state.pushes.includes("fresh"), false);
  assert.deepEqual(f.executions, ["fresh"]);
  assert.deepEqual(f.staleCalls, []);
  assert.equal(globalThis[deleteKey], undefined);
});

test("/delete-session rejects arguments before previewing or switching", async t => {
  const f = await fixture(t);
  await f.delete("--yes");
  assert.match(f.old.notifications.at(-1)[0], /Usage: \/delete-session/);
  assert.deepEqual(f.state.plans, []);
  assert.deepEqual(f.state.deletions, []);
  assert.equal(f.old.confirmations.length, 0);
  assert.equal(f.trace.includes("old:newSession"), false);
});

test("/delete-session rejects an unconfigured extension", async t => {
  const f = await fixture(t, { configured: false });
  await f.delete();
  assert.match(f.old.notifications.at(-1)[0], /sync-setup/);
  assert.deepEqual(f.state.plans, []);
  assert.deepEqual(f.state.deletions, []);
  assert.equal(f.old.confirmations.length, 0);
  assert.equal(f.trace.includes("old:newSession"), false);
});

test("/delete-session rejects a busy sync without previewing or switching", async t => {
  const f = await fixture(t);
  const entered = deferred(), release = deferred();
  const originalPull = SyncService.prototype.pull;
  SyncService.prototype.pull = async () => { entered.resolve(); await release.promise; };
  const pulling = f.old.commands.get("sync-pull").handler("", f.old.ctx);
  try {
    await entered.promise;
    await f.delete();
    assert.match(f.old.notifications.at(-1)[0], /busy: Pull/);
    assert.deepEqual(f.state.plans, []);
    assert.deepEqual(f.state.deletions, []);
    assert.equal(f.old.confirmations.length, 0);
    assert.equal(f.trace.includes("old:newSession"), false);
  } finally {
    release.resolve();
    await pulling;
    SyncService.prototype.pull = originalPull;
  }
});

for (const confirmSessionDelete of [undefined, true, false]) {
  test(`/delete-session confirmation preference: ${confirmSessionDelete}`, async t => {
    const f = await fixture(t, { confirmSessionDelete });
    await f.delete();
    assert.equal(f.old.confirmations.length, confirmSessionDelete === false ? 0 : 1);
    assert.equal(f.state.plans.length, 1, "always scan even without confirmation");
    assert.deepEqual(f.state.deletions[0].expectedPaths, f.candidates.map(candidate => candidate.path));
    assert.equal(f.state.statuses.get("pi-sync"), "Sync: Manual");
  });
}

test("/delete-session without confirmation still requires UI and rejects force", async t => {
  const f = await fixture(t, { confirmSessionDelete: false });
  await f.delete("--force");
  assert.match(f.old.notifications.at(-1)[0], /Usage/);
  f.old.ctx.hasUI = false;
  await f.delete();
  assert.match(f.old.notifications.at(-1)[0], /interactive UI/);
  assert.deepEqual(f.state.plans, []);
  assert.deepEqual(f.state.deletions, []);
});
