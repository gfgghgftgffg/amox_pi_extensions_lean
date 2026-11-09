import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { default: extension } = await jiti.import("../index.ts");
const { createConfig, defaultPaths, saveConfig, SyncService } = await jiti.import("../core.ts");
const symbol = Symbol.for("pi-starline.pill-api.v1");

async function fixture(t, configured = true, starline = true) {
  const root = await mkdtemp(join(tmpdir(), "amox-sync-ui-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const previousApi = globalThis[symbol];
  process.env.PI_CODING_AGENT_DIR = root;
  const config = createConfig("git@github.com:example/private.git", defaultPaths(root));
  if (configured) await saveConfig(config, defaultPaths(root));
  const events = new Map(), commands = new Map();
  const statuses = [], widgets = [], notifications = [], gitCalls = [], dialogs = [];
  let bridge, source, anchor, disposals = 0, closes = 0, refreshes = 0;
  const choices = [];
  if (starline) globalThis[symbol] = {
    version: 1,
    register(key, action) { assert.equal(key, "pi-sync"); bridge = action; return () => { disposals++; }; },
    showBubble(ctx, content, pill) {
      source = content;
      anchor = pill;
      const callbacks = [];
      let closed = false;
      const handle = {
        refresh() { refreshes++; },
        close() { if (!closed) { closed = true; closes++; callbacks.forEach(fn => fn()); } },
        onClose(callback) { if (closed) callback(); else callbacks.push(callback); },
      };
      const body = content().body;
      if (content().hint.startsWith("↑/↓")) {
        const targets = body.filter(line => typeof line !== "string");
        dialogs.push({ title: content().title, options: targets.map(line => line.text), starline: true });
        const selected = choices.shift();
        queueMicrotask(() => {
          handle.close();
          targets.find(line => line.text === selected)?.onSelect();
        });
      }
      return handle;
    },
  };
  else delete globalThis[symbol];
  const ctx = {
    hasUI: true,
    sessionManager: { getSessionFile: () => join(root, "sessions", "current.jsonl") },
    ui: {
      setStatus: (...args) => statuses.push(args),
      setWidget: (...args) => widgets.push(args),
      notify: (...args) => notifications.push(args),
      select: async (title, options) => { dialogs.push({ title, options }); return choices.shift(); },
      input: async () => undefined,
      confirm: async () => true,
    },
  };
  extension({
    on: (name, action) => events.set(name, action),
    registerCommand: (name, command) => commands.set(name, command),
    exec: async (...args) => { gitCalls.push(args); throw new Error("Unexpected network/git execution"); },
  });
  t.after(async () => {
    await events.get("session_shutdown")?.({}, ctx);
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    if (previousApi === undefined) delete globalThis[symbol]; else globalThis[symbol] = previousApi;
    await rm(root, { recursive: true, force: true });
  });
  await events.get("session_start")({}, ctx);
  return {
    root, ctx, config, events, commands, statuses, widgets, notifications, gitCalls, choices, dialogs,
    click: pill => bridge({ ctx, pill }),
    content: () => source(), anchor: () => anchor,
    counts: () => ({ disposals, closes, refreshes }),
  };
}

test("manual startup is local-only and never creates an upstream widget", async t => {
  const f = await fixture(t);
  assert.deepEqual([...f.commands.keys()].sort(), ["sync-pull", "sync-push", "sync-settings", "sync-setup", "sync-status"]);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: manual"]);
  assert.ok(f.widgets.every(([, value]) => value === undefined));
  assert.equal(f.gitCalls.length, 0);
});

test("Starline and command status views use the same centered placement", async t => {
  const f = await fixture(t);
  const anchor = { centerColumn: 12, terminalWidth: 100 };
  f.click(anchor);
  const content = f.content();
  assert.equal(content.title, "Amox Pi Sync");
  assert.ok(content.body.some(line => typeof line === "string" && line.startsWith("Objects:") && line.includes("sessions") && line.includes("missions")));
  assert.ok(content.body.some(line => typeof line === "string" && line.includes("Remote updates: not checked")));
  assert.deepEqual(content.body.filter(line => typeof line !== "string").map(line => line.text), ["Check status", "Upload", "Pull", "Settings"]);
  assert.equal(f.anchor(), undefined);
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.equal(f.anchor(), undefined);
  assert.equal(f.content().title, content.title);
  assert.deepEqual(f.content().body.map(line => typeof line === "string" ? line : line.text), content.body.map(line => typeof line === "string" ? line : line.text));
  assert.equal(f.gitCalls.length, 0);
});

test("busy pill and popup reflect a running action and suppress duplicate buttons", async t => {
  const f = await fixture(t);
  const previous = SyncService.prototype.check;
  let release;
  let checks = 0;
  SyncService.prototype.check = async function () {
    checks++;
    await new Promise(resolve => { release = resolve; });
    return "Checked";
  };
  t.after(() => { SyncService.prototype.check = previous; });
  f.click();
  f.content().body.find(line => typeof line !== "string" && line.text === "Check status").onSelect();
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: checking"]);
  assert.equal(f.content().body.filter(line => typeof line !== "string").length, 0);
  await f.commands.get("sync-push").handler("", f.ctx);
  assert.equal(checks, 1);
  assert.match(f.notifications.at(-1)[0], /already checking/);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: manual"]);
  assert.ok(f.counts().refreshes >= 2);
});

test("failures remain visible in the capsule and details", async t => {
  const f = await fixture(t);
  const previous = SyncService.prototype.check;
  SyncService.prototype.check = async () => { throw new Error("SSH permission denied"); };
  t.after(() => { SyncService.prototype.check = previous; });
  f.click();
  f.content().body.find(line => typeof line !== "string" && line.text === "Check status").onSelect();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: error"]);
  assert.ok(f.content().body.some(line => typeof line === "string" && line.includes("SSH permission denied")));
});

test("settings only offers retained functionality", async t => {
  const f = await fixture(t);
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.equal(f.dialogs[0].starline, true);
  assert.deepEqual(f.dialogs[0].options, ["View Status", "Sync Mode [manual]", "Sync Paths [2]", "Backups", "Cleanup", "Diagnostics", "Back"]);
});

test("pill Settings and its submenus share the Starline renderer and selection survives close-before-callback", async t => {
  const f = await fixture(t);
  f.choices.push("Sync Mode [manual]", "Off", "Back");
  f.click({ centerColumn: 12, terminalWidth: 100 });
  await f.content().body.find(line => typeof line !== "string" && line.text === "Settings").onSelect();
  assert.equal(f.dialogs.length, 3);
  assert.ok(f.dialogs.every(dialog => dialog.starline));
  assert.deepEqual(f.dialogs.map(dialog => dialog.title), ["Amox Pi Sync", "Sync mode", "Amox Pi Sync"]);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: off"]);
  assert.equal(f.anchor(), undefined);
});

test("unconfigured startup and no-Starline command fallback are useful", async t => {
  const f = await fixture(t, false, false);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: setup"]);
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.match(f.notifications.at(-1)[0], /Not configured/);
  assert.equal(f.gitCalls.length, 0);
});

test("setup does not transfer data and malformed settings report an error", async t => {
  const f = await fixture(t, false);
  await f.commands.get("sync-setup").handler("git@github.com:example/new.git", f.ctx);
  assert.equal(f.gitCalls.length, 0);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: manual"]);
  await writeFile(join(f.root, "amox-pi-sync.json"), "not-json", "utf8");
  await f.events.get("session_start")({}, f.ctx);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: error"]);
  assert.ok(f.notifications.some(([, level]) => level === "error"));
});

test("shutdown disposes the bridge and clears its status", async t => {
  const f = await fixture(t);
  f.click();
  await f.events.get("session_shutdown")({}, f.ctx);
  assert.equal(f.counts().disposals, 1);
  assert.equal(f.counts().closes, 1);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", undefined]);
});

test("cleanup previews whole backups and requires confirmation before deleting", async t => {
  const f = await fixture(t, true, false);
  const previousPlan = SyncService.prototype.planCleanup;
  const previousApply = SyncService.prototype.applyCleanup;
  const removed = [];
  SyncService.prototype.planCleanup = async () => [{ id: "backup-1", createdAt: "2020-01-01T00:00:00Z" }];
  SyncService.prototype.applyCleanup = async ids => { removed.push(...ids); return ids.length; };
  t.after(() => {
    SyncService.prototype.planCleanup = previousPlan;
    SyncService.prototype.applyCleanup = previousApply;
  });
  f.choices.push("Cleanup", "Preview", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.deepEqual(removed, []);
  f.ctx.ui.confirm = async () => false;
  f.choices.push("Cleanup", "Run", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.deepEqual(removed, []);
  f.ctx.ui.confirm = async () => true;
  f.choices.push("Cleanup", "Run", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.deepEqual(removed, ["backup-1"]);
});
