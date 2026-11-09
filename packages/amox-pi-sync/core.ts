/*
 * Reduced derivative of pi-sync-suite (config, snapshot, backup, git and engine).
 * MIT License — Copyright (c) 2026 Murat
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

export type Config = {
  version: 1; repoUrl: string; repoDir: string; mode: "manual" | "auto" | "off";
  paths: string[]; pullIntervalMinutes: number; watchIntervalMs: number; pushDebounceMs: number;
  lastPushAt?: string; lastPullAt?: string; lastResult?: string;
  retention?: { keepBackups: number; maxAgeDays: number };
};
export type Paths = { agentDir: string; configFile: string; backupDir: string };
export type GitExecutor = (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string; code: number }>;
export type Status = { busy?: string; error?: string; localChanges?: string; remoteChanges?: number; checkedAt?: string };
export type Backup = { id: string; createdAt: string; reason: string; includedPaths: string[] };
export type BackupSummary = Backup;
export type SyncResult = { changed: boolean; message: string; files: string[]; backupId?: string };

// Canonicalize the trusted agent root (including existing parents). macOS /var
// and /tmp are OS aliases; links inside managed data are still rejected below.
function canonicalRoot(input: string): string {
  let parent = path.resolve(input);
  const missing: string[] = [];
  for (;;) {
    try { return path.join(realpathSync.native(parent), ...missing.reverse()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = path.dirname(parent);
      if (next === parent) throw error;
      missing.push(path.basename(parent));
      parent = next;
    }
  }
}
export function defaultPaths(agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent")): Paths {
  agentDir = canonicalRoot(agentDir);
  return { agentDir, configFile: path.join(agentDir, "amox-pi-sync.json"), backupDir: path.join(agentDir, "amox-pi-sync-backups") };
}
const forbidden = /^(?:auth(?:\..*)?|settings(?:\..*)?|credentials?(?:\..*)?|\.env(?:\..*)?|\.git(?:\..*)?|git|\.ssh|npm|bin|node_modules|packages|local-packages|pi-sync-suite\.json|pi-sync-environment(?:-ignore)?\.json|sync-suite-repo|sync-suite-backups|sync-suite-chat-exports|amox-pi-sync(?:\..*|-.*)?)$/i;
/** Agent-relative portable paths only; all components are checked, including nested files. */
export function validatePath(input: string): string {
  if (typeof input !== "string" || !input || /[\x00-\x1f<>:"|?*]/.test(input) || /^[\\/]/.test(input)) throw new Error(`Unsafe relative path: ${input}`);
  const clean = input.replaceAll("\\", "/");
  if (clean.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || forbidden.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error(`Forbidden sync path: ${input}`);
  return clean;
}
function inside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}
function overlaps(a: string, b: string): boolean { return inside(a, b) || inside(b, a); }
function remote(url: string): void {
  if (typeof url !== "string" || /[\s\x00-\x1f]/.test(url)) throw new Error("Use an SSH git URL: git@host:path or ssh://user@host/path");
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9][a-zA-Z0-9.-]*:[a-zA-Z0-9_~][a-zA-Z0-9._~/-]*$/.test(url) && !url.split(":")[1]!.split("/").includes("..")) return;
  try {
    const u = new URL(url);
    if (u.protocol === "ssh:" && u.hostname && !u.password && !u.search && !u.hash && /^\/[a-zA-Z0-9_~][a-zA-Z0-9._~/-]*$/.test(u.pathname) && !/%|\.\./.test(url) && /^[a-zA-Z0-9._-]*$/.test(u.username)) return;
  } catch { /* reject below */ }
  throw new Error("Use an SSH git URL: git@host:path or ssh://user@host/path");
}
function validate(config: Config, paths: Paths): void {
  remote(config.repoUrl);
  if (config.version !== 1 || !["manual", "auto", "off"].includes(config.mode)) throw new Error("Unsupported sync version or mode");
  if (!path.isAbsolute(config.repoDir)) throw new Error("repoDir must be absolute");
  if (!Array.isArray(config.paths)) throw new Error("paths must be an array");
  const selected = config.paths.map(validatePath).map(p => path.resolve(paths.agentDir, p));
  for (let i = 0; i < selected.length; i++) {
    const p = selected[i]!;
    if (selected.slice(i + 1).some(other => overlaps(p, other))) throw new Error("Managed paths must not overlap");
    if ([config.repoDir, paths.backupDir, paths.configFile, `${paths.configFile}.lock`, path.join(paths.agentDir, "pi-sync-suite.json")].some(other => overlaps(p, other))) throw new Error("Managed paths overlap sync config, repository or backup directory");
  }
  if (overlaps(config.repoDir, paths.backupDir) || inside(config.repoDir, paths.agentDir) || inside(config.repoDir, paths.configFile) || inside(paths.backupDir, paths.agentDir)) throw new Error("Unsafe repository/backup directory nesting");
  const retention = config.retention ?? { keepBackups: 20, maxAgeDays: 180 };
  if (!Number.isInteger(retention.keepBackups) || retention.keepBackups < 0 || !Number.isFinite(retention.maxAgeDays) || retention.maxAgeDays <= 0) throw new Error("Invalid backup retention: keepBackups must be a nonnegative integer and maxAgeDays positive");
  for (const key of ["pullIntervalMinutes", "watchIntervalMs", "pushDebounceMs"] as const) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
}
export function createConfig(repoUrl: string, paths = defaultPaths()): Config {
  const config: Config = { version: 1, repoUrl, repoDir: path.join(paths.agentDir, "amox-pi-sync-repo"), mode: "manual", paths: ["sessions", "missions"], retention: { keepBackups: 20, maxAgeDays: 180 }, pullIntervalMinutes: 1440, watchIntervalMs: 10000, pushDebounceMs: 2500 };
  validate(config, paths); return config;
}
async function stat(file: string) { try { return await fs.lstat(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } }
async function noLinks(file: string): Promise<void> {
  const full = path.resolve(file); const parent = path.dirname(full);
  if (parent !== full) await noLinks(parent);
  if ((await stat(full))?.isSymbolicLink()) throw new Error(`Refusing symlink: ${full}`);
}
export async function loadConfig(paths = defaultPaths()): Promise<Config | null> {
  await noLinks(paths.configFile);
  if (await stat(paths.configFile)) {
    const config = JSON.parse(await fs.readFile(paths.configFile, "utf8")) as Config;
    validate(config, paths); return config;
  }
  const oldFile = path.join(paths.agentDir, "pi-sync-suite.json");
  await noLinks(oldFile);
  if (!(await stat(oldFile))) return null;
  const old = JSON.parse(await fs.readFile(oldFile, "utf8"));
  if (old.version !== 1) throw new Error("Unsupported legacy config version");
  const config = createConfig(old.repoUrl, paths);
  config.mode = old.autoMode === "off" ? "off" : ["full-auto", "config-only-auto"].includes(old.autoMode) ? "auto" : "manual";
  const allowed = Array.isArray(old.policy?.includedPaths) ? old.policy.includedPaths.filter((p: unknown) => p === "sessions" || p === "missions") : [];
  if (allowed.length) config.paths = [...new Set<string>(allowed)];
  for (const key of ["pullIntervalMinutes", "watchIntervalMs", "pushDebounceMs"] as const) if (old[key] !== undefined) config[key] = old[key];
  validate(config, paths); return config;
}
export async function saveConfig(config: Config, paths = defaultPaths()): Promise<void> {
  validate(config, paths); await noLinks(paths.configFile);
  await fs.mkdir(path.dirname(paths.configFile), { recursive: true });
  const temp = `${paths.configFile}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600, flag: "wx" }); await fs.rename(temp, paths.configFile); }
  finally { await fs.rm(temp, { force: true }); }
}

// Raw sessions are opaque bytes and intentionally bypass content scanning. Use a
// trusted PRIVATE repository: sessions may contain credentials or private text.
const secret = /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|\bghp_[A-Za-z0-9_]{30,}\b|\bsk-[A-Za-z0-9_-]{20,}\b|\b(?:api[_-]?key|token|password|secret)\b\s*[:=]\s*["']?[^"'\s]{12,}/i;
const gitOptions = ["-c", "core.hooksPath=", "-c", "core.autocrlf=false", "-c", "credential.interactive=false", "-c", "core.sshCommand=ssh -oBatchMode=yes -oConnectTimeout=10"];
type Files = Map<string, Buffer>;
export class SyncService {
  public status: Status = {};
  public activeSessionFile?: string;
  constructor(public config: Config, public paths: Paths, private exec: GitExecutor) { validate(config, paths); }
  private async run<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (this.status.busy) throw new Error(`Sync busy: ${this.status.busy}; retry when it finishes`);
    this.status.busy = name; this.status.error = undefined;
    let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
    const lockFile = `${this.paths.configFile}.lock`;
    try {
      validate(this.config, this.paths);
      await noLinks(lockFile); await fs.mkdir(path.dirname(lockFile), { recursive: true });
      try { lock = await fs.open(lockFile, "wx", 0o600); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Sync locked by another process: ${lockFile}. If its process exited, verify no sync is running before removing this lock.`); throw e; }
      await lock.writeFile(JSON.stringify({ pid: process.pid, operation: name, createdAt: new Date().toISOString() }));
      return await work();
    } catch (e) { this.status.error = e instanceof Error ? e.message : String(e); throw e; }
    finally { try { if (lock) { await lock.close(); await fs.unlink(lockFile); } } finally { this.status.busy = undefined; } }
  }
  private async git(args: string[], cwd = this.config.repoDir): Promise<string> {
    const result = await this.exec([...gitOptions, ...args], cwd);
    if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}. Resolve repository conflicts manually; no force push or JSONL merge is performed.`);
    return result.stdout;
  }
  private async ensureRepo(): Promise<void> {
    await noLinks(this.config.repoDir);
    const gitDir = path.join(this.config.repoDir, ".git"); await noLinks(gitDir);
    if (!(await stat(gitDir))) {
      if (await stat(this.config.repoDir) && (await fs.readdir(this.config.repoDir)).length) throw new Error("Repository directory is nonempty but has no .git; choose an empty directory");
      await fs.mkdir(path.dirname(this.config.repoDir), { recursive: true });
      await this.git(["clone", "--", this.config.repoUrl, this.config.repoDir], path.dirname(this.config.repoDir));
    }
    const origin = (await this.git(["remote", "get-url", "origin"])).trim();
    if (origin !== this.config.repoUrl) throw new Error("Repository origin differs from configured SSH URL; inspect it before syncing");
    const pushUrls = (await this.git(["remote", "get-url", "--push", "--all", "origin"])).trim().split(/\r?\n/);
    if (pushUrls.some(url => url !== this.config.repoUrl)) throw new Error("Repository push URL differs from configured SSH URL");
    for (const file of (await this.git(["ls-files", "-z"])).split("\0").filter(Boolean)) validatePath(file);
  }
  private async collect(root: string, scan = false): Promise<Files> {
    const files: Files = new Map();
    const visit = async (relative: string): Promise<void> => {
      validatePath(relative);
      const absolute = path.join(root, relative); await noLinks(absolute);
      const info = await stat(absolute); if (!info) return;
      if (info.isDirectory()) { for (const child of (await fs.readdir(absolute)).sort()) await visit(`${relative}/${child}`); }
      else if (info.isFile()) {
        const data = await fs.readFile(absolute);
        if (scan && relative.split("/")[0] !== "sessions" && secret.test(data.toString("utf8"))) throw new Error(`Secret-like content in ${relative}; remove credentials before syncing`);
        files.set(relative, data);
      } else throw new Error(`Not a regular file: ${relative}`);
    };
    for (const item of this.config.paths) await visit(validatePath(item));
    return files;
  }
  private async write(root: string, files: Files): Promise<void> {
    for (const [relative, data] of files) {
      const file = path.join(root, validatePath(relative)); await noLinks(file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(tmp, data, { flag: "wx", mode: 0o600 }); await fs.rename(tmp, file); }
      finally { await fs.rm(tmp, { force: true }); }
    }
  }
  private async makeBackup(reason: string): Promise<Backup> {
    const files = await this.collect(this.paths.agentDir);
    const id = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`;
    const root = path.join(this.paths.backupDir, id); await noLinks(root);
    await fs.mkdir(path.join(root, "files"), { recursive: true });
    await this.write(path.join(root, "files"), files);
    const manifest: Backup = { id, createdAt: new Date().toISOString(), reason, includedPaths: [...this.config.paths] };
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
    return manifest;
  }
  private async backups(): Promise<Backup[]> {
    await noLinks(this.paths.backupDir);
    if (!(await stat(this.paths.backupDir))) return [];
    const result: Backup[] = [];
    for (const entry of await fs.readdir(this.paths.backupDir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Refusing backup symlink: ${entry.name}`);
      if (!entry.isDirectory()) continue;
      const file = path.join(this.paths.backupDir, entry.name, "manifest.json"); await noLinks(file);
      if (!(await stat(file))) continue; // interrupted backup, not restorable
      const manifest = JSON.parse(await fs.readFile(file, "utf8")) as Backup;
      if (manifest.id !== entry.name || !Array.isArray(manifest.includedPaths) || !Number.isFinite(Date.parse(manifest.createdAt)) || typeof manifest.reason !== "string") throw new Error(`Invalid backup manifest: ${entry.name}`);
      manifest.includedPaths.forEach(validatePath);
      const filesDir = path.join(this.paths.backupDir, entry.name, "files"); await noLinks(filesDir);
      if (!(await stat(filesDir))?.isDirectory()) throw new Error(`Incomplete backup: ${entry.name}`);
      result.push(manifest);
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async apply(files: Files, reason: string): Promise<SyncResult> {
    const changes: Files = new Map(); const replaced: string[] = [];
    for (const [relative, data] of files) {
      const target = path.join(this.paths.agentDir, relative); await noLinks(target);
      const info = await stat(target);
      if (info && !info.isFile()) throw new Error(`File/directory conflict at ${relative}; move the local entry aside and retry`);
      const local = info ? await fs.readFile(target) : undefined;
      if (local?.equals(data)) continue;
      const activePath = this.activeSessionFile && path.resolve(this.paths.agentDir, this.activeSessionFile);
      let active = activePath;
      if (activePath) {
        try { active = await fs.realpath(activePath); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      const samePath = active && (process.platform === "win32" ? path.resolve(target).toLowerCase() === active.toLowerCase() : path.resolve(target) === active);
      if (samePath) throw new Error(`Active session differs: ${relative}. Switch to a new session or close it before pull/restore; no files were applied.`);
      changes.set(relative, data); if (local) replaced.push(relative);
    }
    if (!changes.size) return { changed: false, message: "Already up to date; no files applied or backup created", files: [] };
    const backup = await this.makeBackup(reason);
    await this.write(this.paths.agentDir, changes);
    const message = `Applied ${changes.size} file(s); replaced ${replaced.length} differing local file(s) from remote/backup, preserved local-only files. Recovery backup: ${backup.id}${replaced.length ? `; replaced: ${replaced.join(", ")}` : ""}`;
    this.config.lastResult = message;
    return { changed: changes.size > 0, message, files: [...changes.keys()], backupId: backup.id };
  }
  async check(): Promise<Status> { return this.run("check", async () => {
    this.status.checkedAt = undefined; this.status.remoteChanges = undefined;
    await this.ensureRepo(); await this.git(["fetch", "origin"]);
    const local = await this.collect(this.paths.agentDir, true);
    const snapshot = await this.collect(this.config.repoDir, true);
    let added = 0; let changed = 0; let remoteOnly = 0;
    for (const [file, data] of local) {
      const other = snapshot.get(file);
      if (!other) added++;
      else if (!data.equals(other)) changed++;
    }
    for (const file of snapshot.keys()) if (!local.has(file)) remoteOnly++;
    const localChanges = added || changed || remoteOnly ? `added/local-only: ${added}; changed: ${changed}; remote-only: ${remoteOnly}` : "";
    const upstream = await this.exec([...gitOptions, "rev-parse", "--verify", "@{u}"], this.config.repoDir);
    const remoteChanges = upstream.code === 0 ? Number((await this.git(["rev-list", "--count", "HEAD..@{u}"])).trim()) : undefined;
    this.status.localChanges = localChanges; this.status.remoteChanges = remoteChanges;
    this.status.checkedAt = new Date().toISOString(); return { ...this.status, busy: undefined };
  }); }
  async push(): Promise<string> { return this.run("push", async () => {
    await this.ensureRepo();
    if ((await this.git(["diff", "--cached", "--name-only"])).trim()) throw new Error("Repository has staged changes; inspect/commit them manually before sync");
    const files = await this.collect(this.paths.agentDir, true);
    // Validate the existing snapshot too; never follow nested symlinks or stage secrets.
    await this.collect(this.config.repoDir, true);
    await this.write(this.config.repoDir, files);
    let batch: string[] = []; let budget = 0;
    for (const file of files.keys()) {
      // Include quoting/argument overhead within Windows' command-line limit.
      const cost = file.length * 2 + 3;
      if (budget + cost > 6000 && batch.length) {
        await this.git(["--literal-pathspecs", "add", "--", ...batch]); batch = []; budget = 0;
      }
      batch.push(file); budget += cost;
    }
    if (batch.length) await this.git(["--literal-pathspecs", "add", "--", ...batch]);
    const staged = (await this.git(["diff", "--cached", "--name-only"])).trim();
    if (staged) await this.git(["commit", "-m", `amox-pi-sync: ${new Date().toISOString()}`]);
    // Always retry push, even when the previous attempt committed but failed offline.
    await this.git(["push", "-u", "origin", "HEAD"]);
    this.config.lastPushAt = new Date().toISOString();
    this.config.lastResult = "Pushed managed snapshot (no force push; remote-only files preserved)";
    await saveConfig(this.config, this.paths);
    return this.config.lastResult;
  }); }
  async pull(): Promise<string> { return this.run("pull", async () => {
    await this.ensureRepo();
    if ((await this.git(["status", "--porcelain"])).trim()) throw new Error("Repository has uncommitted changes; resolve them before ff-only pull");
    await this.git(["pull", "--ff-only", "origin"]);
    const result = await this.apply(await this.collect(this.config.repoDir, true), "before applying remote snapshot");
    this.config.lastPullAt = new Date().toISOString(); await saveConfig(this.config, this.paths); return result.message;
  }); }
  async backup(): Promise<Backup> { return this.run("backup", () => this.makeBackup("manual")); }
  async listBackups(): Promise<Backup[]> { return this.run("listBackups", () => this.backups()); }
  async restore(id = "latest"): Promise<string> { return this.run("restore", async () => {
    const list = await this.backups(); const found = id === "latest" ? list[0] : list.find(b => b.id === id);
    if (!found) throw new Error(`Backup not found: ${id}`);
    // Never trust absolute source paths or a path list supplied by a manifest.
    const result = await this.apply(await this.collect(path.join(this.paths.backupDir, found.id, "files")), `before restoring ${found.id}`);
    await saveConfig(this.config, this.paths); return result.message;
  }); }
  /** Preview only. Nothing is removed automatically, including in auto mode. */
  async planCleanup(): Promise<BackupSummary[]> { return this.run("planCleanup", async () => {
    const retention = this.config.retention ?? { keepBackups: 20, maxAgeDays: 180 };
    const cutoff = Date.now() - retention.maxAgeDays * 86400000;
    return (await this.backups()).flatMap((backup, index) => {
      const expired = Date.parse(backup.createdAt) < cutoff;
      const excess = index >= retention.keepBackups;
      return expired || excess ? [{ ...backup, reason: expired ? `older than ${retention.maxAgeDays} days` : `exceeds newest ${retention.keepBackups} backups` }] : [];
    });
  }); }
  /** UI must preview and confirm first; IDs may explicitly select retained backups. */
  async applyCleanup(ids: string[]): Promise<number> { return this.run("applyCleanup", async () => {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id || id === "." || id === ".." || /[\\/\\\\:\x00-\x1f]/.test(id))) throw new Error("Invalid backup ID for cleanup");
    const known = new Set((await this.backups()).map(backup => backup.id));
    const unique = [...new Set(ids)];
    // Validate the complete selection before deleting anything.
    for (const id of unique) {
      if (!known.has(id)) throw new Error(`Unknown or incomplete backup: ${id}`);
      const target = path.resolve(this.paths.backupDir, id);
      if (path.dirname(target) !== path.resolve(this.paths.backupDir) || [this.paths.agentDir, this.config.repoDir, this.paths.configFile, ...this.config.paths.map(p => path.join(this.paths.agentDir, p))].some(p => inside(target, p))) throw new Error(`Unsafe backup deletion: ${id}`);
      await noLinks(target);
    }
    for (const id of unique) await fs.rm(path.join(this.paths.backupDir, id), { recursive: true });
    return unique.length;
  }); }
  /** Read-only polling: no operation lock or status changes, one file buffer at a time. */
  async fingerprint(): Promise<string> {
    validate(this.config, this.paths);
    const hash = createHash("sha256");
    const visit = async (relative: string): Promise<void> => {
      validatePath(relative);
      const absolute = path.join(this.paths.agentDir, relative); await noLinks(absolute);
      const info = await stat(absolute); if (!info) return;
      if (info.isDirectory()) {
        for (const child of (await fs.readdir(absolute)).sort()) await visit(`${relative}/${child}`);
      } else if (info.isFile()) {
        const data = await fs.readFile(absolute);
        hash.update(JSON.stringify([relative, data.length])).update(data);
      } else throw new Error(`Not a regular file: ${relative}`);
    };
    for (const item of this.config.paths) await visit(validatePath(item));
    return hash.digest("hex");
  }
  async log(): Promise<string> { return this.run("log", async () => { await this.ensureRepo(); return (await this.git(["log", "--oneline", "-8"])).trim(); }); }
  async doctor(): Promise<{ name: string; ok: boolean; message: string }[]> { return this.run("doctor", async () => {
    const checks: { name: string; ok: boolean; message: string }[] = [];
    const check = async (name: string, work: () => Promise<string>) => { try { checks.push({ name, ok: true, message: await work() }); } catch (e) { checks.push({ name, ok: false, message: String(e) }); } };
    await check("git", () => this.git(["--version"], this.paths.agentDir));
    await check("paths", async () => { await this.collect(this.paths.agentDir); return this.config.paths.join(", "); });
    await check("repository", async () => {
      await noLinks(this.config.repoDir);
      if (!(await stat(path.join(this.config.repoDir, ".git")))) throw new Error("Not cloned; check/push/pull will initialize it");
      const url = (await this.git(["remote", "get-url", "origin"])).trim();
      if (url !== this.config.repoUrl) throw new Error("origin differs from configured URL");
      return await this.git(["status", "--short", "--branch"]);
    });
    await check("identity", async () => `${(await this.git(["var", "GIT_AUTHOR_IDENT"], await stat(this.config.repoDir) ? this.config.repoDir : this.paths.agentDir)).trim()}`);
    return checks;
  }); }
}
