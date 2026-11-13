import { stripVTControlCharacters } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { visibleWidth } from "@earendil-works/pi-tui";

const jiti = createJiti(import.meta.url);
const { default: extension } = await jiti.import("../index.ts");
const { createConfig, defaultPaths, saveConfig, SyncService } = await jiti.import("../core.ts");
const symbol = Symbol.for("pi-starline.pill-api.v1");
const plain = value => stripVTControlCharacters(value).replace(/^• /, "");
const palette = (light = false) => {
  const codes = light ? { text: 30, muted: 90, dim: 37, accent: 34, success: 32, warning: 33, error: 31 }
    : { text: 97, muted: 37, dim: 90, accent: 96, success: 92, warning: 93, error: 91 };
  return { fg: (tone, text) => { assert.ok(tone in codes, `Unknown semantic tone: ${tone}`); return `\x1b[${codes[tone]}m${text}\x1b[39m`; },
    getFgAnsi: tone => `\x1b[${codes[tone]}m`,
    bold: text => `\x1b[1m${text}\x1b[22m` };
};

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
      if (content().title !== "Amox Pi Sync") {
        const targets = body.filter(line => typeof line !== "string");
        dialogs.push({ title: content().title, options: targets.map(line => plain(line.text)), body, starline: true, anchor: { ...pill } });
        const selected = choices.shift();
        queueMicrotask(() => {
          handle.close();
          targets.find(line => plain(line.text) === selected)?.onSelect();
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
      theme: palette(),
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
  assert.deepEqual([...f.commands.keys()].sort(), ["delete-session", "sync-prune", "sync-pull", "sync-push", "sync-settings", "sync-setup", "sync-status"]);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Manual"]);
  assert.ok(f.widgets.every(([, value]) => value === undefined));
  assert.equal(f.gitCalls.length, 0);
});

test("Starline and command status views retain the clicked cell placement", async t => {
  const f = await fixture(t);
  const anchor = { centerColumn: 12, terminalWidth: 100 };
  f.click(anchor);
  const content = f.content();
  assert.equal(content.title, "Amox Pi Sync");
  assert.ok(content.body.some(line => typeof line === "string" && /^Paths:\s+sessions, missions$/.test(plain(line))));
  assert.ok(content.body.some(line => typeof line === "string" && /^Remote updates:\s+Not checked$/.test(plain(line))));
  assert.deepEqual(content.body.filter(line => typeof line !== "string").map(line => plain(line.text)), ["Check status", "Push", "Pull", "Prune orphan sessions", "Settings"]);
  assert.equal(f.anchor().centerColumn, anchor.centerColumn);
  assert.equal(f.anchor().terminalWidth, anchor.terminalWidth);
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.equal(f.anchor().centerColumn, anchor.centerColumn);
  assert.equal(f.anchor().terminalWidth, anchor.terminalWidth);
  assert.equal(f.content().title, content.title);
  assert.deepEqual(f.content().body.map(line => typeof line === "string" ? line : line.text), content.body.map(line => typeof line === "string" ? line : line.text));
  assert.equal(f.gitCalls.length, 0);
});

test("Starline colours and cell placement follow the pill across status, menus and confirmations", async t => {
  const f = await fixture(t);
  const pill = { startColumn: 2, endColumn: 14, centerColumn: 8, terminalWidth: 100,
    background: "\x1b[48;2;42;100;180m", foreground: "\x1b[97m" };
  f.click(pill);
  assert.equal(f.anchor().background, pill.background);
  assert.equal(f.anchor().foreground, pill.foreground);
  assert.equal(f.anchor().startColumn, pill.startColumn);
  assert.equal(f.anchor().endColumn, pill.endColumn);
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.equal(f.anchor().background, pill.background);
  f.choices.push("Mode: Manual", "Back", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  f.choices.push("Cancel");
  await f.commands.get("sync-setup").handler("git@github.com:example/new.git", f.ctx);
  assert.ok(f.dialogs.every(dialog => dialog.anchor.background === pill.background));
  assert.ok(f.dialogs.every(dialog => dialog.anchor.foreground === pill.foreground));
  assert.ok(f.dialogs.every(dialog => dialog.anchor.startColumn === pill.startColumn && dialog.anchor.endColumn === pill.endColumn));
});

test("bubble colour choice persists without Git and resolves the current theme on redraw", async t => {
  const f = await fixture(t);
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.equal(f.anchor().background, "\x1b[106m", "commands default to theme accent before a pill click");
  f.choices.push("Bubble colour: Follow pill", "Theme success", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.equal(f.dialogs[1].body.find(line => typeof line !== "string" && line.current).text, f.ctx.ui.theme.bold("• Follow pill"));
  const saved = JSON.parse(await readFile(join(f.root, "amox-pi-sync.json"), "utf8"));
  assert.equal(saved.bubbleColor, "success");
  f.click({ background: "\x1b[44m", foreground: "\x1b[97m" });
  assert.equal(f.anchor().background, "\x1b[102m");
  assert.equal(f.anchor().foreground, "", "Starline derives contrasting selection text");
  f.ctx.ui.theme = palette(true);
  assert.equal(f.anchor().background, "\x1b[42m");
  f.ctx.ui.theme.getFgAnsi = () => "\x1b[38;2;12;34;56m";
  assert.equal(f.anchor().background, "\x1b[48;2;12;34;56m");
  f.ctx.ui.theme.getFgAnsi = () => "\x1b[38;5;42m";
  assert.equal(f.anchor().background, "\x1b[48;5;42m");
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
  f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Check status").onSelect();
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Check"]);
  assert.equal(f.content().body.filter(line => typeof line !== "string").length, 0);
  await f.commands.get("sync-push").handler("", f.ctx);
  assert.equal(checks, 1);
  assert.match(f.notifications.at(-1)[0], /busy: Check/);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Manual"]);
  assert.ok(f.counts().refreshes >= 2);
});

test("failures remain visible in the capsule and details", async t => {
  const f = await fixture(t);
  const previous = SyncService.prototype.check;
  SyncService.prototype.check = async () => { throw new Error("SSH permission denied"); };
  t.after(() => { SyncService.prototype.check = previous; });
  f.click();
  f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Check status").onSelect();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Error"]);
  assert.ok(f.content().body.some(line => typeof line === "string" && line.includes("SSH permission denied")));
});

test("settings only offers retained functionality", async t => {
  const f = await fixture(t);
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.equal(f.dialogs[0].starline, true);
  assert.deepEqual(f.dialogs[0].options, ["Status", "Mode: Manual", "Paths: 2 configured", "Prune before push: Off", "Confirm session deletion: On", "Bubble colour: Follow pill", "Backups", "Cleanup", "Diagnostics", "Back"]);
});

test("pill Settings and its submenus share the Starline renderer and selection survives close-before-callback", async t => {
  const f = await fixture(t);
  f.choices.push("Mode: Manual", "Off", "Back");
  f.click({ centerColumn: 12, terminalWidth: 100 });
  await f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Settings").onSelect();
  assert.equal(f.dialogs.length, 3);
  assert.ok(f.dialogs.every(dialog => dialog.starline));
  assert.deepEqual(f.dialogs.map(dialog => dialog.title), ["Sync settings", "Sync mode", "Sync settings"]);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Off"]);
  assert.equal(f.anchor().centerColumn, 12);
  assert.equal(f.anchor().terminalWidth, 100);
});

test("unconfigured startup and no-Starline command fallback are useful", async t => {
  const f = await fixture(t, false, false);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Not configured"]);
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.match(f.notifications.at(-1)[0], /Not configured/);
  assert.equal(f.gitCalls.length, 0);
});

test("setup does not transfer data and malformed settings report an error", async t => {
  const f = await fixture(t, false);
  await f.commands.get("sync-setup").handler("git@github.com:example/new.git", f.ctx);
  assert.equal(f.gitCalls.length, 0);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Manual"]);
  await writeFile(join(f.root, "amox-pi-sync.json"), "not-json", "utf8");
  await f.events.get("session_start")({}, f.ctx);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Error"]);
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
  f.choices.push("Cleanup", "Delete eligible backups", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.deepEqual(removed, []);
  f.ctx.ui.confirm = async () => true;
  f.choices.push("Cleanup", "Delete eligible backups", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.deepEqual(removed, ["backup-1"]);
});

test("status separates muted labels, highlighted state and neutral values from selectable actions", async t => {
  const f = await fixture(t);
  f.click();
  const content = f.content();
  const rows = content.body.filter(line => typeof line === "string");
  const state = rows.find(line => /^State:\s+/.test(plain(line)));
  assert.match(state, /\x1b\[37mState:\s+\x1b\[39m\x1b\[96m\x1b\[1mManual/);
  assert.ok(rows.some(line => /^Paths:\s+sessions, missions$/.test(plain(line)) && line.includes("\x1b[97m")));
  assert.ok(rows.some(line => /^Remote:\s+git@github.com:example\/private.git$/.test(plain(line))));
  assert.ok(rows.some(line => /^Remote updates:\s+Not checked$/.test(plain(line)) && line.includes("\x1b[90m")));
  assert.ok(rows.includes(""));
  const actions = content.body.filter(line => typeof line !== "string");
  assert.deepEqual(actions.map(line => plain(line.text)), ["Check status", "Push", "Pull", "Prune orphan sessions", "Settings"]);
  for (const line of actions) {
    assert.ok(line.text.startsWith("\x1b[1m• "));
    assert.doesNotMatch(line.text, /\x1b\[(?:3\d|4\d|9\d|10\d|38;|48;)/, "action foreground/background must remain Starline-owned for selection contrast");
  }
  assert.match(content.hint, /↑↓.*Enter.*Esc/);
  assert.ok(visibleWidth(content.hint) <= 20, "Starline does not wrap hints; fit the 24-column minimum bubble");
  assert.doesNotMatch(content.body.map(line => plain(typeof line === "string" ? line : line.text)).join("\n"), /idle|upload|download|Objects/i);
});

test("colours are evaluated from the current theme without changing labels or actions", async t => {
  const f = await fixture(t);
  f.click();
  const dark = f.content();
  f.ctx.ui.theme = palette(true);
  const light = f.content();
  const lines = content => content.body.map(line => typeof line === "string" ? line : line.text);
  assert.deepEqual(lines(dark).map(plain), lines(light).map(plain));
  assert.notDeepEqual(lines(dark), lines(light));
  assert.ok(lines(light).some(line => /^State:\s+Manual$/.test(plain(line)) && line.includes("\x1b[34m")));
});

test("settings have a coloured overview, stable semantic choices and a marked current mode", async t => {
  const f = await fixture(t);
  f.choices.push("Mode: Manual", "Off", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  const menu = f.dialogs[0], picker = f.dialogs[1];
  assert.equal(menu.title, "Sync settings");
  assert.ok(menu.body.some(line => typeof line === "string" && /^State:\s+Manual$/.test(plain(line)) && line.includes("\x1b[96m")));
  assert.ok(menu.body.some(line => typeof line === "string" && /^Remote:\s+git@/.test(plain(line))));
  assert.deepEqual(picker.body.filter(line => typeof line !== "string" && line.current).map(line => plain(line.text)), ["Manual"]);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Off"]);
  const saved = JSON.parse(await readFile(join(f.root, "amox-pi-sync.json"), "utf8"));
  assert.equal(saved.mode, "off");
  assert.doesNotMatch(JSON.stringify(saved), /\\u001b|\x1b/);
});

test("Push and Pull retain the pre-push fingerprint and show direct operation names while busy", async t => {
  const f = await fixture(t);
  const original = { push: SyncService.prototype.push, pull: SyncService.prototype.pull, fingerprint: SyncService.prototype.fingerprint };
  let release, fingerprints = 0;
  SyncService.prototype.fingerprint = async () => { fingerprints++; return "pre-push-snapshot"; };
  SyncService.prototype.push = async () => { await new Promise(resolve => { release = resolve; }); };
  SyncService.prototype.pull = async () => "Pulled safely";
  t.after(() => Object.assign(SyncService.prototype, original));
  f.click();
  const pushing = f.commands.get("sync-push").handler("", f.ctx);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Push"]);
    assert.ok(f.content().body.some(line => typeof line === "string" && /^State:\s+Push$/.test(plain(line))));
    assert.ok(f.content().body.some(line => typeof line === "string" && /^Mode:\s+Manual$/.test(plain(line))));
    assert.equal(f.content().body.filter(line => typeof line !== "string").length, 0);
    await f.commands.get("sync-pull").handler("", f.ctx);
    assert.match(f.notifications.at(-1)[0], /busy: Push/);
  } finally { release?.(); await pushing; }
  assert.equal(fingerprints, 1);
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Last action:\s+Push completed$/.test(plain(line))));
  await f.commands.get("sync-pull").handler("", f.ctx);
  assert.equal(fingerprints, 1, "Pull must not use the pre-push fingerprint path");
  assert.ok(f.statuses.some(([, text]) => text === "Sync: Pull"));
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Manual"]);
});

test("check outcomes use success and warning tones without presenting unchecked data as synchronized", async t => {
  const f = await fixture(t), original = SyncService.prototype.check;
  let pending = true;
  SyncService.prototype.check = async function () {
    this.status.checkedAt = "2026-11-10T00:00:00.000Z";
    this.status.localChanges = pending ? "changed: 2" : "";
    this.status.remoteChanges = pending ? 3 : 0;
    return "Status checked";
  };
  t.after(() => { SyncService.prototype.check = original; });
  f.click();
  const check = () => f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Check status").onSelect();
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Local changes:\s+Not checked$/.test(plain(line))));
  check(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Local changes:\s+changed: 2$/.test(plain(line)) && line.includes("\x1b[93m")));
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Remote updates:\s+3$/.test(plain(line)) && line.includes("\x1b[93m")));
  pending = false;
  check(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Local changes:\s+None at last check$/.test(plain(line)) && line.includes("\x1b[92m")));
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Remote updates:\s+0$/.test(plain(line)) && line.includes("\x1b[92m")));
  assert.ok(f.content().body.some(line => typeof line === "string" && plain(line) === "Values reflect the last check."));
});

test("error text cannot inject terminal controls or override its semantic error colour", async t => {
  const f = await fixture(t), original = SyncService.prototype.check;
  SyncService.prototype.check = async () => { throw new Error("\x1b[2J\x1b[32mSSH denied\x1b[0m"); };
  t.after(() => { SyncService.prototype.check = original; });
  f.click();
  f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Check status").onSelect();
  await new Promise(resolve => setImmediate(resolve));
  const row = f.content().body.find(line => typeof line === "string" && /^Error:\s+/.test(plain(line)));
  assert.match(row, /\x1b\[91mSSH denied/);
  assert.doesNotMatch(row, /\x1b\[2J|\x1b\[32m/);
  assert.doesNotMatch(f.notifications.at(-1)[0], /\x1b/);
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Last action:\s+Check failed$/.test(plain(line))));
});

test("native fallback keeps plain labels, descriptions and semantic selection without a colour API", async t => {
  const f = await fixture(t, true, false);
  f.ctx.ui.theme = undefined;
  await f.commands.get("sync-status").handler("", f.ctx);
  const status = f.notifications.at(-1)[0];
  assert.match(status, /State: Manual/); assert.match(status, /Paths: sessions, missions/); assert.match(status, /Remote:/);
  assert.doesNotMatch(status, /\x1b|idle|upload|download/i);
  f.choices.push("Mode: Manual", "Off", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Off"]);
  assert.ok(f.dialogs.some(dialog => dialog.title.includes("Manual and Off still allow Push and Pull")));
  assert.ok(f.dialogs.every(dialog => dialog.options.every(option => !option.includes("\x1b"))));
});

test("diagnostic result payloads do not expand the status bubble into a JSON dump", async t => {
  const f = await fixture(t), original = SyncService.prototype.doctor;
  SyncService.prototype.doctor = async () => ({ remote: "ok", paths: ["sessions", "missions"] });
  t.after(() => { SyncService.prototype.doctor = original; });
  f.choices.push("Diagnostics", "Doctor", "Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  f.click();
  assert.ok(f.notifications.some(([text]) => text.includes('"remote": "ok"')));
  assert.ok(f.content().body.some(line => typeof line === "string" && /^Last action:\s+Doctor completed$/.test(plain(line))));
  assert.ok(f.content().body.every(line => typeof line !== "string" || !line.includes('"remote"')));
});

test("RPC uses plain native UI even if a Starline bridge is present", async t => {
  const f = await fixture(t);
  f.ctx.mode = "rpc";
  f.ctx.ui.theme = undefined;
  await f.commands.get("sync-status").handler("", f.ctx);
  assert.match(f.notifications.at(-1)[0], /State: Manual/);
  assert.doesNotMatch(f.notifications.at(-1)[0], /\x1b/);
  f.choices.push("Back");
  await f.commands.get("sync-settings").handler("", f.ctx);
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.dialogs[0].starline, undefined);
});

test("Prune orphan sessions previews candidates, then deletes exactly the confirmed paths", async t => {
  const f = await fixture(t);
  const previousPlan = SyncService.prototype.planPruneSessions;
  const previousPrune = SyncService.prototype.pruneOrphanSessions;
  let expected;
  let finish;
  const pruned = new Promise(resolve => { finish = resolve; });
  SyncService.prototype.planPruneSessions = async () => ({
    candidates: [
      { path: "sessions/a.jsonl", name: "tr_coding#aaaaaaa1", bytes: 1024 },
      { path: "sessions/b.jsonl", name: "general-purpose#bbbbbbb2", bytes: 2048 },
    ],
    skipped: 1,
  });
  SyncService.prototype.pruneOrphanSessions = async paths => {
    expected = paths;
    finish();
    return { removed: ["sessions/a.jsonl"], repoRemoved: 1, skipped: 1 };
  };
  t.after(() => { SyncService.prototype.planPruneSessions = previousPlan; SyncService.prototype.pruneOrphanSessions = previousPrune; });
  f.choices.push("Confirm");
  f.click();
  f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Prune orphan sessions").onSelect();
  await pruned;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(expected, ["sessions/a.jsonl", "sessions/b.jsonl"]);
  const dialog = f.dialogs.find(item => item.title === "Prune orphan sessions?");
  assert.ok(dialog);
  const preview = dialog.body.map(line => plain(typeof line === "string" ? line : line.text)).join("\n");
  assert.match(preview, /2 orphan subagent session\(s\), 3\.0 KB total/);
  assert.match(preview, /tr_coding#aaaaaaa1/);
  assert.match(preview, /general-purpose#bbbbbbb2/);
  assert.match(preview, /Skipped: 1/);
  assert.match(f.notifications.at(-1)[0], /Pruned 1 local and 1 snapshot session/);
});

test("Prune before push runs before manual Push and /sync-push, and a prune failure only warns", async t => {
  const f = await fixture(t);
  const previousPrune = SyncService.prototype.pruneOrphanSessions;
  const previousPush = SyncService.prototype.push;
  const order = [];
  let fail = false;
  let finish;
  const pushed = new Promise(resolve => { finish = resolve; });
  SyncService.prototype.pruneOrphanSessions = async () => {
    order.push("prune");
    if (fail) throw new Error("prune unavailable");
    return { removed: [], repoRemoved: 0, skipped: 0 };
  };
  SyncService.prototype.push = async () => {
    order.push("push");
    finish();
    return "Pushed managed snapshot";
  };
  t.after(() => { SyncService.prototype.pruneOrphanSessions = previousPrune; SyncService.prototype.push = previousPush; });
  f.choices.push("Prune before push: Off");
  await f.commands.get("sync-settings").handler("", f.ctx);
  const saved = JSON.parse(await readFile(join(f.root, "amox-pi-sync.json"), "utf8"));
  assert.equal(saved.pruneOrphanSessionsBeforePush, true);
  f.click();
  f.content().body.find(line => typeof line !== "string" && plain(line.text) === "Push").onSelect();
  await pushed;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ["prune", "push"]);
  order.length = 0;
  await f.commands.get("sync-push").handler("", f.ctx);
  assert.deepEqual(order, ["prune", "push"]);
  order.length = 0;
  fail = true;
  await f.commands.get("sync-push").handler("", f.ctx);
  assert.deepEqual(order, ["prune", "push"]);
  assert.ok(f.notifications.some(([text, level]) => level === "warning" && text.includes("prune unavailable")));
});

test("/sync-prune --yes skips confirmation but still previews and deletes", async t => {
  const f = await fixture(t);
  const previousPlan = SyncService.prototype.planPruneSessions;
  const previousPrune = SyncService.prototype.pruneOrphanSessions;
  let expected;
  SyncService.prototype.planPruneSessions = async () => ({
    candidates: [{ path: "sessions/a.jsonl", name: "tr_coding#aaaaaaa1", bytes: 10 }], skipped: 0,
  });
  SyncService.prototype.pruneOrphanSessions = async paths => {
    expected = paths;
    return { removed: ["sessions/a.jsonl"], repoRemoved: 1, skipped: 0 };
  };
  t.after(() => { SyncService.prototype.planPruneSessions = previousPlan; SyncService.prototype.pruneOrphanSessions = previousPrune; });
  f.choices.push("Back");
  await f.commands.get("sync-prune").handler("--yes", f.ctx);
  assert.deepEqual(expected, ["sessions/a.jsonl"]);
  assert.ok(!f.dialogs.some(dialog => dialog.title === "Prune orphan sessions?"));
  assert.ok(f.notifications.some(([text]) => text.includes("Pruning 1 orphan session")));
});
test("long status values are truncated so bubble actions remain visible", async t => {
  const f = await fixture(t);
  const configFile = join(f.root, "amox-pi-sync.json");
  const stored = JSON.parse(await readFile(configFile, "utf8"));
  stored.lastResult = "x".repeat(500);
  await writeFile(configFile, JSON.stringify(stored));
  await f.events.get("session_start")({}, f.ctx);
  f.click();
  const row = f.content().body.find(line => typeof line === "string" && /^Last sync:/.test(plain(line)));
  assert.ok(row);
  assert.ok(plain(row).length <= 180, plain(row));
  assert.ok(f.content().body.some(line => typeof line !== "string" && plain(line.text) === "Settings"));
});

for (const starline of [true, false]) for (const initial of [undefined, true, false]) {
  test(`confirmation preference is local-only in Auto (${starline ? "Starline" : "native"}, ${initial})`, async t => {
    const f = await fixture(t, true, starline);
    const stored = { ...f.config, mode: "auto" };
    if (initial === undefined) delete stored.confirmSessionDelete;
    else stored.confirmSessionDelete = initial;
    await saveConfig(stored, defaultPaths(f.root));
    const original = { fingerprint: SyncService.prototype.fingerprint, pull: SyncService.prototype.pull };
    let fingerprints = 0, pulls = 0;
    SyncService.prototype.fingerprint = async () => { fingerprints++; return "unchanged"; };
    SyncService.prototype.pull = async () => { pulls++; };
    t.after(() => Object.assign(SyncService.prototype, original));
    await f.events.get("session_start")({}, f.ctx);
    await new Promise(resolve => setImmediate(resolve));
    fingerprints = pulls = 0;
    f.choices.push(`Confirm session deletion: ${initial === false ? "Off" : "On"}`, "Back");
    await f.commands.get("sync-settings").handler("", f.ctx);
    const saved = JSON.parse(await readFile(join(f.root, "amox-pi-sync.json"), "utf8"));
    assert.equal(saved.confirmSessionDelete, initial === false);
    assert.equal(saved.mode, "auto");
    assert.ok(f.dialogs.at(-1).options.includes(`Confirm session deletion: ${initial === false ? "On" : "Off"}`));
    assert.equal(fingerprints, 0, "preference must not restart timers/fingerprinting");
    assert.equal(pulls, 0, "preference must not trigger startup Pull");
    assert.deepEqual(f.gitCalls, []);
    assert.deepEqual(f.statuses.at(-1), ["pi-sync", "Sync: Auto"]);
    await f.events.get("session_shutdown")({}, f.ctx);
  });
}

test("setup preserves deletion preference when replacing a repository", async t => {
  const f = await fixture(t, true, false);
  await saveConfig({ ...f.config, confirmSessionDelete: false }, defaultPaths(f.root));
  await f.events.get("session_start")({}, f.ctx);
  await f.commands.get("sync-setup").handler("git@github.com:example/replacement.git", f.ctx);
  const saved = JSON.parse(await readFile(join(f.root, "amox-pi-sync.json"), "utf8"));
  assert.equal(saved.confirmSessionDelete, false);
  assert.equal(saved.repoUrl, "git@github.com:example/replacement.git");
  assert.deepEqual(f.gitCalls, []);
});
