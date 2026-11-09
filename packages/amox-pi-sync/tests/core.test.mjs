import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { defaultPaths, createConfig, loadConfig, saveConfig, validatePath, SyncService } = await jiti.import("../core.ts");

async function fixture(t, handler) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "amox-sync-core-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = defaultPaths(path.join(root, "agent"));
  await fs.mkdir(paths.agentDir, { recursive: true });
  const config = createConfig("git@example.org:private/sync.git", paths);
  const calls = [];
  const exec = async (raw, cwd) => {
    const args = [...raw];
    while (args[0] === "-c") args.splice(0, 2);
    calls.push({ args, raw, cwd });
    const custom = await handler?.(args, cwd);
    if (custom) return custom;
    if (args[0] === "clone") await fs.mkdir(path.join(config.repoDir, ".git"), { recursive: true });
    if (args[0] === "remote") return { stdout: config.repoUrl + "\n", stderr: "", code: 0 };
    if (args[0] === "rev-parse") return { stdout: "", stderr: "no upstream", code: 1 };
    return { stdout: "", stderr: "", code: 0 };
  };
  const service = new SyncService(config, paths, exec);
  const write = async (root, rel, data) => { const file = path.join(root, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data); return file; };
  return { root, paths, config, calls, service, write, exec };
}
test("defaultPaths honors PI_CODING_AGENT_DIR and explicit paths take precedence", async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), "amox-sync-env-")));
  const previous = process.env.PI_CODING_AGENT_DIR;
  t.after(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  });
  process.env.PI_CODING_AGENT_DIR = path.join(root, "isolated-agent");
  const paths = defaultPaths();
  assert.equal(paths.agentDir, path.resolve(process.env.PI_CODING_AGENT_DIR));
  assert.equal(paths.configFile, path.join(paths.agentDir, "amox-pi-sync.json"));
  assert.equal(paths.backupDir, path.join(paths.agentDir, "amox-pi-sync-backups"));
  const config = createConfig("git@example.org:private/sync.git");
  assert.equal(config.repoDir, path.join(paths.agentDir, "amox-pi-sync-repo"));
  await saveConfig(config);
  assert.deepEqual(await loadConfig(), config);
  const explicit = path.join(root, "explicit-agent");
  assert.equal(defaultPaths(explicit).agentDir, path.resolve(explicit));
});

test("configuration defaults, SSH validation, strict paths and ancestor overlaps", async t => {
  const f = await fixture(t);
  assert.deepEqual(f.config.paths, ["sessions", "missions"]);
  assert.equal(f.config.mode, "manual");
  assert.equal(await loadConfig(f.paths), null);
  await saveConfig(f.config, f.paths);
  assert.deepEqual(await loadConfig(f.paths), f.config);
  assert.equal(validatePath("themes\\blue"), "themes/blue");
  for (const p of ["", "../sessions", "/sessions", "C:\\sessions", "sessions/../auth.json", "sessions/.git/config", "missions/settings.json", "missions/.env.local", "auth.json", "credentials.json", "npm", "bin", "node_modules", "packages", "a/", "a//b", "a/CON", "a/foo.", "amox-pi-sync.json"]) assert.throws(() => validatePath(p), undefined, p);
  for (const url of ["https://example.org/a", "file:///a", "-evil", "git://example.org/a", "git@host:-evil", "ssh://host/a?x", "ssh://host/a#x", "ssh://user:pass@host/a"]) assert.throws(() => createConfig(url, f.paths), undefined, url);
  assert.equal(createConfig("ssh://git@example.org:2222/private/repo.git", f.paths).version, 1);
  assert.throws(() => new SyncService({ ...f.config, paths: ["sessions", "sessions/a"] }, f.paths, f.exec), /overlap/);
  assert.throws(() => new SyncService({ ...f.config, repoDir: path.join(f.paths.agentDir, "sessions", "repo") }, f.paths, f.exec), /overlap/);
  assert.throws(() => new SyncService({ ...f.config, paths: ["custom"], repoDir: path.join(f.paths.agentDir, "custom") }, f.paths, f.exec), /overlap/);
});
test("read-only legacy migration retains only allowed selected paths and modes", async t => {
  const f = await fixture(t);
  const legacy = { version: 1, repoUrl: f.config.repoUrl, autoMode: "full-auto", policy: { includedPaths: ["settings.json", "missions", "npm", "missions"] } };
  const file = await f.write(f.paths.agentDir, "pi-sync-suite.json", JSON.stringify(legacy));
  const before = await fs.readFile(file);
  const migrated = await loadConfig(f.paths);
  assert.deepEqual(migrated.paths, ["missions"]); assert.equal(migrated.mode, "auto");
  assert.deepEqual(await fs.readFile(file), before);
  await assert.rejects(fs.access(f.paths.configFile));
  assert.notEqual(migrated.repoDir, path.join(f.paths.agentDir, "sync-suite-repo"));
});
test("pull clones, ff-only, backup, remote-wins report, local-only preservation and binary bytes", async t => {
  const f = await fixture(t);
  await f.write(f.paths.agentDir, "sessions/same.jsonl", "local");
  await f.write(f.paths.agentDir, "sessions/local.jsonl", "keep");
  await f.write(f.paths.agentDir, "settings.json", "untouched");
  await f.write(f.config.repoDir, ".git/HEAD", "mock");
  const bytes = Buffer.from([0, 255, 128, 65]);
  await f.write(f.config.repoDir, "sessions/same.jsonl", bytes);
  const result = await f.service.pull();
  assert.match(result, /replaced 1/);
  const backupId = (await f.service.listBackups())[0].id;
  assert.deepEqual(await fs.readFile(path.join(f.paths.agentDir, "sessions/same.jsonl")), bytes);
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "sessions/local.jsonl"), "utf8"), "keep");
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "settings.json"), "utf8"), "untouched");
  assert.equal(await fs.readFile(path.join(f.paths.backupDir, backupId, "files/sessions/same.jsonl"), "utf8"), "local");
  assert.ok(f.calls.some(c => c.args.join(" ") === "pull --ff-only origin"));
  assert.ok(!f.calls.some(c => c.args.includes("--force") || c.args.includes("--rebase")));
  assert.equal((await loadConfig(f.paths)).lastPullAt, f.config.lastPullAt);
});
test("active changed session blocks entire apply; unchanged active session allowed", async t => {
  const f = await fixture(t);
  await f.write(f.paths.agentDir, "sessions/active.jsonl", "local");
  await f.write(f.config.repoDir, ".git/HEAD", "mock");
  await f.write(f.config.repoDir, "missions/a", "incoming");
  await f.write(f.config.repoDir, "sessions/active.jsonl", "remote");
  f.service.activeSessionFile = path.join(f.paths.agentDir, "sessions/active.jsonl");
  await assert.rejects(f.service.pull(), /Active session.*Switch/);
  await assert.rejects(fs.access(path.join(f.paths.agentDir, "missions/a")));
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "sessions/active.jsonl"), "utf8"), "local");
  await f.write(f.config.repoDir, "sessions/active.jsonl", "local");
  assert.match(await f.service.pull(), /Applied 1/);
});
test("restore backs up current state, keeps local-only and checks active session", async t => {
  const f = await fixture(t);
  await f.write(f.paths.agentDir, "sessions/a", "original");
  const backup = await f.service.backup();
  await f.write(f.paths.agentDir, "sessions/a", "changed");
  await f.write(f.paths.agentDir, "sessions/new", "keep");
  f.service.activeSessionFile = "sessions/a";
  await assert.rejects(f.service.restore(backup.id), /Active session/);
  f.service.activeSessionFile = undefined;
  const result = await f.service.restore(backup.id);
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "sessions/a"), "utf8"), "original");
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "sessions/new"), "utf8"), "keep");
  assert.match(result, /Applied 1/);
  const recovery = (await f.service.listBackups()).find(b => b.id !== backup.id);
  assert.equal(await fs.readFile(path.join(f.paths.backupDir, recovery.id, "files/sessions/a"), "utf8"), "changed");
  assert.equal((await f.service.listBackups()).length, 2);
  await assert.rejects(f.service.restore("../../bad"), /not found/);
});
test("push stages only explicit safe paths, raw sessions bypass scanner and retries pending push", async t => {
  const f = await fixture(t);
  await f.write(f.paths.agentDir, "sessions/a", "token=abcdefghijklmnop");
  await f.write(f.paths.agentDir, "missions/a", "normal");
  await f.service.push(); await f.service.push();
  assert.equal(f.calls.filter(c => c.args[0] === "clone").length, 1);
  assert.equal(f.calls.filter(c => c.args[0] === "push").length, 2);
  const added = f.calls.find(c => c.args.includes("add")).args;
  assert.deepEqual(added, ["--literal-pathspecs", "add", "--", "sessions/a", "missions/a"]);
  assert.ok(!f.calls.some(c => c.args.includes("-A")));
  await f.write(f.paths.agentDir, "missions/.env", "secret");
  await assert.rejects(f.service.push(), /Forbidden/);
  await fs.rm(path.join(f.paths.agentDir, "missions/.env"));
  await f.write(f.paths.agentDir, "missions/a", "token=abcdefghijklmnop");
  await assert.rejects(f.service.push(), /Secret-like/);
});
test("nested .git/settings/credentials are rejected before staging, including tracked files", async t => {
  for (const bad of ["sessions/.git/config", "missions/settings.json", "sessions/credentials.json"]) {
    const f = await fixture(t);
    await f.write(f.paths.agentDir, bad, "secret");
    await assert.rejects(f.service.push(), /Forbidden/);
    assert.ok(!f.calls.some(c => c.args.includes("add")));
  }
  const f = await fixture(t, args => args[0] === "ls-files" ? { stdout: "settings.json\0", stderr: "", code: 0 } : undefined);
  await assert.rejects(f.service.push(), /Forbidden/);
});
test("nested symlinks and destination symlinks are refused", async t => {
  const f = await fixture(t);
  const outside = await f.write(f.root, "outside/private.txt", "private");
  await fs.mkdir(path.join(f.paths.agentDir, "sessions"));
  const link = path.join(f.paths.agentDir, "sessions/link");
  const makeLink = () => fs.symlink(path.dirname(outside), link, process.platform === "win32" ? "junction" : "dir");
  await makeLink();
  await assert.rejects(f.service.push(), /symlink/);
  await fs.rm(link);
  await f.write(f.config.repoDir, ".git/HEAD", "mock");
  await f.write(f.config.repoDir, "sessions/link/private.txt", "remote");
  await makeLink();
  await assert.rejects(f.service.pull(), /symlink/);
  assert.equal(await fs.readFile(outside, "utf8"), "private");
});
test("exclusive busy and cross-instance filesystem lock reject without queuing, then release", async t => {
  let release; let entered;
  const ready = new Promise(r => { entered = r; });
  const wait = new Promise(r => { release = r; });
  const f = await fixture(t, async args => { if (args[0] === "clone") { entered(); await wait; } });
  const running = f.service.check(); await ready;
  await assert.rejects(f.service.backup(), /busy/);
  const second = new SyncService(f.config, f.paths, f.exec);
  await assert.rejects(second.backup(), /locked by another process/);
  release(); await running;
  assert.equal(f.service.status.busy, undefined);
  await second.backup();
  await assert.rejects(fs.access(`${f.paths.configFile}.lock`));
});
test("git failures retain actionable status, unlock, and never apply local data", async t => {
  const f = await fixture(t, args => args[0] === "pull" ? { stdout: "", stderr: "Not possible to fast-forward", code: 128 } : undefined);
  await f.write(f.config.repoDir, ".git/HEAD", "mock");
  await f.write(f.config.repoDir, "sessions/a", "remote");
  await f.write(f.paths.agentDir, "sessions/a", "local");
  await assert.rejects(f.service.pull(), /fast-forward.*Resolve repository conflicts/);
  assert.match(f.service.status.error, /fast-forward/);
  assert.equal(f.service.status.busy, undefined);
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "sessions/a"), "utf8"), "local");
  await f.service.backup();
});
test("fingerprints are stable and content-sensitive; doctor is offline and does not clone", async t => {
  const f = await fixture(t);
  await f.write(f.paths.agentDir, "sessions/a", Buffer.from([0, 255]));
  const first = await f.service.fingerprint(); assert.equal(await f.service.fingerprint(), first);
  await f.write(f.paths.agentDir, "sessions/a", Buffer.from([0, 254]));
  assert.notEqual(await f.service.fingerprint(), first);
  const checks = await f.service.doctor();
  assert.ok(checks.some(c => c.name === "repository" && !c.ok));
  assert.ok(!f.calls.some(c => ["clone", "fetch", "pull", "push"].includes(c.args[0])));
});
test("cleanup previews oldest excess and expired backups, never the newest retained ones", async t => {
  const f = await fixture(t);
  f.config.retention = { keepBackups: 2, maxAgeDays: 180 };
  const backups = [];
  for (const age of [1, 2, 3, 181]) {
    const backup = await f.service.backup();
    backup.createdAt = new Date(Date.now() - age * 86400000).toISOString();
    await fs.writeFile(path.join(f.paths.backupDir, backup.id, "manifest.json"), JSON.stringify(backup));
    backups.push(backup);
  }
  const plan = await f.service.planCleanup();
  assert.deepEqual(plan.map(b => b.id), backups.slice(2).map(b => b.id));
  assert.match(plan[0].reason, /exceeds/); assert.match(plan[1].reason, /older/);
  assert.equal((await f.service.listBackups()).length, 4, "preview must not delete");
  f.config.retention.keepBackups = 10;
  assert.deepEqual((await f.service.planCleanup()).map(b => b.id), [backups[3].id]);
});
test("manual cleanup deletes complete selected recovery points only and rejects escaping IDs", async t => {
  const f = await fixture(t);
  await f.write(f.paths.agentDir, "sessions/a", "current");
  await f.write(f.config.repoDir, ".git/HEAD", "mock");
  const first = await f.service.backup(); const second = await f.service.backup();
  assert.equal((await f.service.planCleanup()).length, 0);
  for (const bad of ["..", "../sessions", "../../repo", "/absolute", String.raw`a\b`, String.raw`C:\x`, "unknown"]) {
    await assert.rejects(f.service.applyCleanup([first.id, bad]), /Invalid|Unknown/);
    await fs.access(path.join(f.paths.backupDir, first.id, "manifest.json"));
  }
  await fs.mkdir(path.join(f.paths.backupDir, "incomplete"));
  await assert.rejects(f.service.applyCleanup(["incomplete"]), /Unknown or incomplete/);
  assert.equal(await f.service.applyCleanup([first.id, first.id]), 1);
  await assert.rejects(fs.access(path.join(f.paths.backupDir, first.id)));
  await fs.access(path.join(f.paths.backupDir, second.id, "files/sessions/a"));
  assert.equal(await fs.readFile(path.join(f.paths.agentDir, "sessions/a"), "utf8"), "current");
  await fs.access(path.join(f.config.repoDir, ".git/HEAD"));
});

test("check compares agent bytes with snapshot without changing a clean repository", async t => {
  const git = (cwd, args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const f = await fixture(t, (args, cwd) => {
    if (["ls-files", "rev-parse", "rev-list"].includes(args[0])) {
      const result = spawnSync("git", args, { cwd, encoding: "utf8" });
      return { stdout: result.stdout, stderr: result.stderr, code: result.status };
    }
  });
  await f.write(f.config.repoDir, "sessions/same", "same");
  await f.write(f.config.repoDir, "sessions/changed", "original");
  await f.write(f.config.repoDir, "sessions/remote", "remote-only");
  git(f.config.repoDir, ["init"]);
  git(f.config.repoDir, ["add", "--", "sessions"]);
  git(f.config.repoDir, ["-c", "user.name=Test", "-c", "user.email=test@example.org", "commit", "-m", "snapshot"]);
  const indexBefore = await fs.readFile(path.join(f.config.repoDir, ".git/index"));
  const headBefore = git(f.config.repoDir, ["rev-parse", "HEAD"]);
  await f.write(f.paths.agentDir, "sessions/same", "same");
  await f.write(f.paths.agentDir, "sessions/changed", "edited agent data");
  await f.write(f.paths.agentDir, "sessions/added", "new local file");
  assert.equal(git(f.config.repoDir, ["diff", "--stat"]), "");
  const result = await f.service.check();
  assert.equal(result.localChanges, "added/local-only: 1; changed: 1; remote-only: 1");
  assert.equal(result.remoteChanges, undefined, "no upstream is unknown, not zero");
  assert.ok(result.checkedAt);
  assert.equal(await fs.readFile(path.join(f.config.repoDir, "sessions/changed"), "utf8"), "original");
  await assert.rejects(fs.access(path.join(f.config.repoDir, "sessions/added")));
  assert.deepEqual(await fs.readFile(path.join(f.config.repoDir, ".git/index")), indexBefore);
  assert.equal(git(f.config.repoDir, ["rev-parse", "HEAD"]), headBefore);
  assert.equal(git(f.config.repoDir, ["diff", "--stat"]), "");
  assert.equal(git(f.config.repoDir, ["ls-files", "--others", "--exclude-standard"]), "");
  await assert.rejects(fs.access(f.paths.backupDir));
  await assert.rejects(fs.access(f.paths.configFile));
});

test("check publishes checkedAt only after successful remote checks", async t => {
  let fail;
  const f = await fixture(t, args => {
    if (args[0] === fail) return { stdout: "", stderr: "offline", code: 128 };
    if (args[0] === "rev-parse") return { stdout: "upstream\n", stderr: "", code: 0 };
    if (args[0] === "rev-list") return { stdout: "3\n", stderr: "", code: 0 };
  });
  assert.equal((await f.service.check()).remoteChanges, 3);
  for (const command of ["fetch", "rev-list"]) {
    fail = command;
    await assert.rejects(f.service.check(), /offline/);
    assert.equal(f.service.status.checkedAt, undefined);
    assert.equal(f.service.status.remoteChanges, undefined);
  }
  for (const { raw } of f.calls) {
    assert.ok(raw.includes("credential.interactive=false"));
    assert.ok(raw.includes("core.sshCommand=ssh -oBatchMode=yes -oConnectTimeout=10"));
  }
});

test("check scans both data trees and never stages forbidden or secret content", async t => {
  for (const where of ["agent", "repo"]) {
    const f = await fixture(t);
    await f.write(where === "agent" ? f.paths.agentDir : f.config.repoDir, "missions/a", "token=abcdefghijklmnop");
    if (where === "repo") await f.write(f.config.repoDir, ".git/HEAD", "mock");
    await assert.rejects(f.service.check(), /Secret-like/);
    assert.equal(f.service.status.checkedAt, undefined);
    assert.ok(!f.calls.some(c => c.args.includes("add")));
  }
});

test("fingerprint remains read-only during a push and across a held filesystem lock", async t => {
  let release; let entered;
  const ready = new Promise(r => { entered = r; });
  const wait = new Promise(r => { release = r; });
  const f = await fixture(t, async args => {
    if (args[0] === "push") { entered(); await wait; }
  });
  await f.write(f.paths.agentDir, "sessions/a", "data");
  f.service.status.error = "prior error";
  const prior = { ...f.service.status };
  const first = await f.service.fingerprint();
  assert.deepEqual(f.service.status, prior);
  await assert.rejects(fs.access(`${f.paths.configFile}.lock`));
  const running = f.service.push();
  await ready;
  try {
    const busyStatus = { ...f.service.status };
    const lockBefore = await fs.readFile(`${f.paths.configFile}.lock`);
    assert.equal(await f.service.fingerprint(), first);
    assert.deepEqual(f.service.status, busyStatus);
    const second = new SyncService(f.config, f.paths, f.exec);
    assert.equal(await second.fingerprint(), first);
    assert.deepEqual(second.status, {});
    assert.deepEqual(await fs.readFile(`${f.paths.configFile}.lock`), lockBefore);
    await f.write(f.paths.agentDir, "missions/.env", "forbidden");
    await assert.rejects(f.service.fingerprint(), /Forbidden/);
    assert.deepEqual(f.service.status, busyStatus, "polling errors must not overwrite operation status");
  } finally { release(); await running; }
});

test("push batches literal pathspecs within a Windows argument budget", async t => {
  const f = await fixture(t);
  const expected = [];
  for (let i = 0; i < 100; i++) {
    const file = `sessions/${String(i).padStart(3, "0")}-${"x".repeat(90)}`;
    expected.push(file);
    await f.write(f.paths.agentDir, file, "data");
  }
  await f.service.push();
  const batches = f.calls.filter(c => c.args.includes("add"));
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flatMap(c => c.args.slice(3)), expected);
  for (const { args } of batches) {
    assert.deepEqual(args.slice(0, 3), ["--literal-pathspecs", "add", "--"]);
    assert.ok(args.slice(3).reduce((total, file) => total + file.length * 2 + 3, 0) <= 6000);
  }
});

test("unchanged pulls do not create more recovery backups", async t => {
  const f = await fixture(t);
  await f.write(f.config.repoDir, ".git/HEAD", "mock");
  await f.write(f.config.repoDir, "sessions/a", "remote");
  await f.service.pull();
  const backups = await f.service.listBackups();
  assert.equal(backups.length, 1);
  assert.match(await f.service.pull(), /up to date/);
  assert.deepEqual(await f.service.listBackups(), backups);
  assert.match(await f.service.pull(), /up to date/);
  assert.deepEqual(await f.service.listBackups(), backups);
});
