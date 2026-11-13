import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createJiti } from "jiti";
const { defaultPaths, createConfig, SyncService } = await createJiti(import.meta.url).import("../core.ts");

test("two real Git clients preserve bytes despite autocrlf, back up replacements and retain local-only files", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-roundtrip-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "true",
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  const initialized = git(["init", "--bare", "--initial-branch=main", bare], root);
  assert.equal(initialized.code, 0, initialized.stderr);
  const url = "git@example.invalid:private/sync.git";
  // Real Git commands and a local bare transport; never contact an external host.
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  const first = '{"message":"first"}\n';
  await fs.writeFile(file(a, ".gitattributes"), "* text=auto eol=lf\n");
  await fs.writeFile(file(a, "shared.jsonl"), first);
  await a.sync.push();
  await b.sync.pull();
  assert.equal(await fs.readFile(file(b, "shared.jsonl"), "utf8"), first);
  await fs.writeFile(file(b, "local-only.jsonl"), '{"message":"keep"}\n');
  const second = '{"message":"第二条"}\r\n';
  await fs.writeFile(file(a, "shared.jsonl"), second);
  await a.sync.push();
  await b.sync.pull();
  assert.equal(await fs.readFile(file(b, ".gitattributes"), "utf8"), "* text=auto eol=lf\n");
  assert.equal(await fs.readFile(file(b, "shared.jsonl"), "utf8"), second);
  assert.equal(await fs.readFile(file(b, "local-only.jsonl"), "utf8"), '{"message":"keep"}\n');
  const backups = await b.sync.listBackups();
  assert.ok(backups.length > 0);
  await b.sync.pull();
  assert.equal((await b.sync.listBackups()).length, backups.length);
  await b.sync.push();
  await a.sync.pull();
  assert.equal(await fs.readFile(file(a, "local-only.jsonl"), "utf8"), '{"message":"keep"}\n');
});

test("diverged real Git clients merge disjoint push changes without force", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-diverged-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  assert.equal(git(["init", "--bare", "--initial-branch=main", bare], root).code, 0);
  const url = "git@example.invalid:private/sync.git";
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, config, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  await fs.writeFile(file(a, "base.jsonl"), '{"message":"base"}\n');
  await a.sync.push();
  await b.sync.pull();
  await fs.writeFile(file(a, "a.jsonl"), '{"message":"a"}\n');
  await a.sync.push();
  await fs.writeFile(file(b, "b.jsonl"), '{"message":"b"}\n');
  const pushed = await b.sync.push();
  assert.match(pushed, /Integrated remote history/);
  assert.ok(b.config.lastPushAt);
  const merges = git(["log", "--merges", "--oneline"], b.config.repoDir);
  assert.equal(merges.code, 0, merges.stderr);
  assert.equal(merges.stdout.trim().split("\n").length, 1);
  await b.sync.pull();
  assert.equal(await fs.readFile(file(b, "a.jsonl"), "utf8"), '{"message":"a"}\n');
  await a.sync.pull();
  assert.equal(await fs.readFile(file(a, "b.jsonl"), "utf8"), '{"message":"b"}\n');
  assert.equal(await fs.readFile(file(a, "a.jsonl"), "utf8"), '{"message":"a"}\n');
});

test("diverged real Git clients merge disjoint pull changes and keep the repository clean", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-pull-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  assert.equal(git(["init", "--bare", "--initial-branch=main", bare], root).code, 0);
  const url = "git@example.invalid:private/sync.git";
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, config, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  await fs.writeFile(file(a, "base.jsonl"), '{"message":"base"}\n');
  await a.sync.push();
  await b.sync.pull();
  await fs.writeFile(file(a, "a.jsonl"), '{"message":"a"}\n');
  await a.sync.push();
  await fs.writeFile(file(b, "b.jsonl"), '{"message":"b"}\n');
  await fs.writeFile(path.join(b.config.repoDir, "sessions", "b.jsonl"), '{"message":"b"}\n');
  assert.equal(git(["add", "--", "sessions/b.jsonl"], b.config.repoDir).code, 0);
  assert.equal(git(["commit", "-m", "b local"], b.config.repoDir).code, 0);
  const result = await b.sync.pull();
  assert.match(result, /^Merged diverged snapshots cleanly\. Applied 1/);
  assert.ok(b.config.lastPullAt);
  assert.equal(git(["status", "--porcelain"], b.config.repoDir).stdout, "");
  assert.equal(git(["log", "--merges", "--oneline"], b.config.repoDir).stdout.trim().split("\n").length, 1);
  assert.equal(await fs.readFile(file(b, "a.jsonl"), "utf8"), '{"message":"a"}\n');
  assert.equal(await fs.readFile(file(b, "b.jsonl"), "utf8"), '{"message":"b"}\n');
  await b.sync.push();
  await a.sync.pull();
  assert.equal(await fs.readFile(file(a, "b.jsonl"), "utf8"), '{"message":"b"}\n');
});

test("a real conflicting pull aborts, names the conflict and leaves no merge state", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-conflict-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  assert.equal(git(["init", "--bare", "--initial-branch=main", bare], root).code, 0);
  const url = "git@example.invalid:private/sync.git";
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, config, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  await fs.writeFile(file(a, "shared.jsonl"), '{"message":"base"}\n');
  await a.sync.push();
  await b.sync.pull();
  await fs.writeFile(file(a, "shared.jsonl"), '{"message":"a"}\n');
  await a.sync.push();
  await fs.writeFile(file(b, "shared.jsonl"), '{"message":"b"}\n');
  await fs.writeFile(path.join(b.config.repoDir, "sessions", "shared.jsonl"), '{"message":"b"}\n');
  assert.equal(git(["add", "--", "sessions/shared.jsonl"], b.config.repoDir).code, 0);
  assert.equal(git(["commit", "-m", "b local"], b.config.repoDir).code, 0);
  const localHead = git(["rev-parse", "HEAD"], b.config.repoDir).stdout.trim();
  const lastPullAt = b.config.lastPullAt;
  await assert.rejects(b.sync.pull(), error => {
    assert.match(error.message, /not clean/);
    assert.match(error.message, /shared\.jsonl/);
    return true;
  });
  assert.equal(b.config.lastPullAt, lastPullAt);
  assert.equal(await fs.readFile(file(b, "shared.jsonl"), "utf8"), '{"message":"b"}\n');
  assert.equal(git(["rev-parse", "HEAD"], b.config.repoDir).stdout.trim(), localHead);
  assert.equal(git(["status", "--porcelain"], b.config.repoDir).stdout, "");
  assert.equal(git(["rev-parse", "--verify", "MERGE_HEAD"], b.config.repoDir).code, 128);
});

test("manual session deletion propagates through push and pull", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-delete-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  assert.equal(git(["init", "--bare", "--initial-branch=main", bare], root).code, 0);
  const url = "git@example.invalid:private/sync.git";
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, config, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  await fs.writeFile(file(a, "gone.jsonl"), '{"message":"delete me"}\n');
  await fs.writeFile(file(a, "keep.jsonl"), '{"message":"keep"}\n');
  await a.sync.push();
  await b.sync.pull();
  await fs.rm(file(b, "gone.jsonl"));
  const pushed = await b.sync.push();
  assert.match(pushed, /removed 1 locally deleted file/);
  await assert.rejects(fs.access(file(b, "gone.jsonl")));
  await assert.rejects(fs.access(path.join(b.config.repoDir, "sessions", "gone.jsonl")));
  const pulled = await a.sync.pull();
  assert.match(pulled, /deleted 1 remote-deleted file/);
  await assert.rejects(fs.access(file(a, "gone.jsonl")));
  await fs.access(file(a, "keep.jsonl"));
  assert.deepEqual(a.config.syncedPaths, ["sessions/keep.jsonl"]);
  assert.deepEqual(b.config.syncedPaths, ["sessions/keep.jsonl"]);
});

test("prune removes the snapshot copy so a later pull cannot resurrect the session", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-prune-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  assert.equal(git(["init", "--bare", "--initial-branch=main", bare], root).code, 0);
  const url = "git@example.invalid:private/sync.git";
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, config, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  const old = new Date(Date.now() - 20 * 60_000);
  const orphan = '{"type":"session","version":3,"id":"orphan","parentSession":"/old/home/sessions/missing.jsonl"}\n'
    + '{"type":"session_info","name":"tr_coding#abcd1234"}\n';
  await fs.writeFile(file(a, "orphan.jsonl"), orphan);
  await fs.utimes(file(a, "orphan.jsonl"), old, old);
  await fs.writeFile(file(a, "keep.jsonl"), '{"message":"keep"}\n');
  await a.sync.push();
  await b.sync.pull();
  await fs.utimes(file(b, "orphan.jsonl"), old, old);
  const result = await b.sync.pruneOrphanSessions();
  assert.deepEqual(result, { removed: ["sessions/orphan.jsonl"], repoRemoved: 1, skipped: 0 });
  await assert.rejects(fs.access(file(b, "orphan.jsonl")));
  await assert.rejects(fs.access(path.join(b.config.repoDir, "sessions", "orphan.jsonl")));
  await b.sync.push();
  await a.sync.pull();
  await assert.rejects(fs.access(file(a, "orphan.jsonl")));
  await fs.access(file(a, "keep.jsonl"));
  assert.deepEqual(b.config.syncedPaths, ["sessions/keep.jsonl"]);
  assert.deepEqual(a.config.syncedPaths, ["sessions/keep.jsonl"]);
});

test("targeted tree deletion commits before local removal and propagates without resurrection", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amox-git-tree-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env, GIT_AUTHOR_NAME: "Sync Test", GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync Test", GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
  };
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
  };
  const bare = path.join(root, "remote.git");
  assert.equal(git(["init", "--bare", "--initial-branch=main", bare], root).code, 0);
  const url = "git@example.invalid:private/sync.git";
  const exec = async (args, cwd) => {
    const actual = [...args];
    const clone = actual.indexOf("clone");
    if (clone >= 0) actual[clone + 2] = bare;
    const result = git(actual, cwd);
    if (actual.includes("get-url") && result.code === 0) result.stdout = `${url}\n`;
    return result;
  };
  const make = async name => {
    const paths = defaultPaths(path.join(root, name));
    await fs.mkdir(path.join(paths.agentDir, "sessions"), { recursive: true });
    const config = createConfig(url, paths);
    return { paths, config, sync: new SyncService(config, paths, exec) };
  };
  const a = await make("a"), b = await make("b");
  const file = (client, name) => path.join(client.paths.agentDir, "sessions", name);
  const old = new Date(Date.now() - 20 * 60_000);
  const orphan = '{"type":"session","version":3,"id":"orphan","parentSession":"/old/home/sessions/missing.jsonl"}\n'
    + '{"type":"session_info","name":"tr_coding#abcd1234"}\n';
  await fs.writeFile(file(a, "orphan.jsonl"), orphan);
  await fs.utimes(file(a, "orphan.jsonl"), old, old);
  await fs.writeFile(file(a, "keep.jsonl"), '{"message":"keep"}\n');
  await fs.writeFile(file(a, "child.jsonl"), JSON.stringify({ type: "session", parentSession: String.raw`C:\old\ORPHAN.jsonl` }) + '\n{"type":"session_info","name":"renamed manual fork"}\n');
  await fs.writeFile(file(a, "unrelated.jsonl"), '{"type":"session","parentSession":"/old/missing.jsonl"}\n{"type":"session_info","name":"tr_coding#deadbeef"}\n');
  await a.sync.push();
  await b.sync.pull();
  await fs.utimes(file(b, "orphan.jsonl"), old, old);
  const plan = await b.sync.planDeleteSessionTree(file(b, "orphan.jsonl"));
  const expected = ["sessions/child.jsonl", "sessions/orphan.jsonl"];
  assert.deepEqual(plan.candidates.map(c => c.path), expected);
  const before = git(["rev-parse", "HEAD"], b.config.repoDir).stdout;
  const result = await b.sync.deleteSessionTree(file(b, "orphan.jsonl"), expected);
  assert.deepEqual(result, { removed: expected, repoRemoved: 2, skipped: 0 });
  assert.notEqual(git(["rev-parse", "HEAD"], b.config.repoDir).stdout, before);
  assert.equal(git(["status", "--porcelain"], b.config.repoDir).stdout, "");
  await b.sync.pull();
  await assert.rejects(fs.access(file(b, "child.jsonl")));
  await assert.rejects(fs.access(file(b, "orphan.jsonl")));
  await assert.rejects(fs.access(file(b, "orphan.jsonl")));
  await assert.rejects(fs.access(path.join(b.config.repoDir, "sessions", "orphan.jsonl")));
  await b.sync.push();
  await a.sync.pull();
  await assert.rejects(fs.access(file(a, "orphan.jsonl")));
  await fs.access(file(a, "keep.jsonl"));
  await fs.access(file(a, "unrelated.jsonl"));
  await assert.rejects(fs.access(file(a, "child.jsonl")));
  assert.deepEqual(b.config.syncedPaths, ["sessions/keep.jsonl", "sessions/unrelated.jsonl"]);
  assert.deepEqual(a.config.syncedPaths, ["sessions/keep.jsonl", "sessions/unrelated.jsonl"]);
});
