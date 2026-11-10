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
import { createReadStream, existsSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";

export type BubbleColor = "pill" | "accent" | "success" | "warning" | "error";
export type Config = {
  bubbleColor?: BubbleColor;
  pruneOrphanSessionsBeforePush?: boolean;
  /** Managed paths present in the last successful push/pull; used to propagate deletions safely. */
  syncedPaths?: string[];
  version: 1; repoUrl: string; repoDir: string; mode: "manual" | "auto" | "off";
  paths: string[]; pullIntervalMinutes: number; watchIntervalMs: number; pushDebounceMs: number;
  lastPushAt?: string; lastPullAt?: string; lastResult?: string;
  retention?: { keepBackups: number; maxAgeDays: number };
};
export type Paths = { agentDir: string; configFile: string; backupDir: string };
export type GitExecutor = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; code: number; killed?: boolean }>;
export type Status = { busy?: string; error?: string; localChanges?: string; remoteChanges?: number; checkedAt?: string };
export type Backup = { id: string; createdAt: string; reason: string; includedPaths: string[] };
export type BackupSummary = Backup;
export type SyncResult = { changed: boolean; message: string; files: string[]; backupId?: string };
export type SessionEntry = { path: string; parentSession?: string; name?: string; bytes?: number; mtimeMs?: number };
export type PruneCandidate = { path: string; name: string; bytes: number };
export type PrunePlan = { candidates: PruneCandidate[]; skipped: number };
export type PruneResult = { removed: string[]; repoRemoved: number; skipped: number };

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
const ORPHAN_NAME = /^.+#[0-9a-f]{8}$/;
const SESSION_RECENT_MS = 10 * 60_000;
function baseName(value: string): string {
  const parts = value.replaceAll("\\", "/").split("/");
  return (parts.at(-1) ?? "").toLowerCase();
}
/** Pure candidate selection: parent basename + subagent name, iterated to a fixed point. */
export function selectOrphanSessions(entries: SessionEntry[], options: { activePath?: string; now?: number; recentMs?: number } = {}): PrunePlan {
  const now = options.now ?? Date.now();
  const recentMs = options.recentMs ?? SESSION_RECENT_MS;
  const active = options.activePath?.toLowerCase();
  const byBase = new Map<string, SessionEntry[]>();
  for (const entry of entries) {
    const base = baseName(entry.path);
    const list = byBase.get(base) ?? [];
    list.push(entry);
    byBase.set(base, list);
  }
  const isRecent = (entry: SessionEntry) => now - (entry.mtimeMs ?? 0) < recentMs;
  const isActive = (entry: SessionEntry) => active !== undefined && entry.path.toLowerCase() === active;
  const parentOf = (entry: SessionEntry) => {
    if (typeof entry.parentSession !== "string" || !entry.parentSession) return { state: "missing" as const };
    const list = byBase.get(baseName(entry.parentSession));
    if (!list?.length) return { state: "missing" as const };
    // Duplicate basenames are ambiguous; never treat either copy as an orphan.
    if (list.length !== 1) return { state: "ambiguous" as const };
    return { state: "found" as const, parent: list[0]! };
  };
  const compute = (protectRecent: boolean): Set<SessionEntry> => {
    const candidates = new Set<SessionEntry>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of entries) {
        if (candidates.has(entry) || isActive(entry)) continue;
        if (protectRecent && isRecent(entry)) continue;
        if (typeof entry.name !== "string" || !ORPHAN_NAME.test(entry.name)) continue;
        const parent = parentOf(entry);
        if (parent.state === "ambiguous") continue;
        if (parent.state === "missing" || candidates.has(parent.parent)) {
          candidates.add(entry);
          changed = true;
        }
      }
    }
    return candidates;
  };
  const structural = compute(false);
  const selected = compute(true);
  return {
    candidates: [...selected]
      .map(entry => ({ path: entry.path, name: entry.name!, bytes: Math.max(0, entry.bytes ?? 0) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    skipped: [...structural].filter(entry => !selected.has(entry)).length,
  };
}
/** A path is managed when it equals or is below one of the configured relative paths. */
function managedPath(relative: string, managed: string[]): boolean {
  return managed.some(item => relative === item || relative.startsWith(`${item}/`));
}
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
  if (config.bubbleColor !== undefined && !["pill", "accent", "success", "warning", "error"].includes(config.bubbleColor)) throw new Error("Unsupported bubble colour");
  if (config.pruneOrphanSessionsBeforePush !== undefined && typeof config.pruneOrphanSessionsBeforePush !== "boolean") throw new Error("pruneOrphanSessionsBeforePush must be boolean");
  if (config.syncedPaths !== undefined) {
    if (!Array.isArray(config.syncedPaths) || config.syncedPaths.some(item => typeof item !== "string")) throw new Error("syncedPaths must be a string array");
    const paths = config.syncedPaths.map(validatePath);
    if (new Set(paths).size !== paths.length) throw new Error("syncedPaths must not contain duplicates");
  }
  const retention = config.retention ?? { keepBackups: 20, maxAgeDays: 180 };
  if (!Number.isInteger(retention.keepBackups) || retention.keepBackups < 0 || !Number.isFinite(retention.maxAgeDays) || retention.maxAgeDays <= 0) throw new Error("Invalid backup retention: keepBackups must be a nonnegative integer and maxAgeDays positive");
  for (const key of ["pullIntervalMinutes", "watchIntervalMs", "pushDebounceMs"] as const) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
}
export function createConfig(repoUrl: string, paths = defaultPaths()): Config {
  const config: Config = { version: 1, repoUrl, repoDir: path.join(paths.agentDir, "amox-pi-sync-repo"), mode: "manual", paths: ["sessions", "missions"], pruneOrphanSessionsBeforePush: false, retention: { keepBackups: 20, maxAgeDays: 180 }, pullIntervalMinutes: 1440, watchIntervalMs: 10000, pushDebounceMs: 2500 };
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
// Local Git work is bounded; network transfers can legitimately take minutes
// for large session histories, and a killed transfer must never look successful.
const LOCAL_TIMEOUT_MS = 60_000;
const NETWORK_TIMEOUT_MS = 10 * 60_000;
// Git for Windows SSH can misdecode non-ASCII home paths; prefer native OpenSSH.
const nativeSsh = path.join(process.env.SystemRoot ?? "C:/Windows", "System32", "OpenSSH", "ssh.exe");
const sshCommand = process.platform === "win32" && existsSync(nativeSsh)
  ? `"${nativeSsh.replace(/\\/g, "/")}"` : "ssh";
const gitOptions = [
  "-c", "core.hooksPath=",
  "-c", "core.autocrlf=false",
  "-c", "core.eol=lf",
  "-c", "credential.interactive=false",
  "-c", `core.sshCommand=${sshCommand} -oBatchMode=yes -oConnectTimeout=10`,
];
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
  private async gitResult(args: string[], cwd = this.config.repoDir, timeoutMs = LOCAL_TIMEOUT_MS) {
    const result = await this.exec([...gitOptions, ...args], cwd, timeoutMs);
    // pi.exec can report code 0 for a process killed by its timeout; the killed
    // flag is the only reliable failure signal for that path.
    if (result.killed) throw new Error(`git ${args[0]} was terminated before completion (timeout or cancellation); no success was recorded. Verify the repository state before retrying.`);
    return result;
  }
  private async git(args: string[], cwd = this.config.repoDir, timeoutMs = LOCAL_TIMEOUT_MS): Promise<string> {
    const result = await this.gitResult(args, cwd, timeoutMs);
    if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}. Resolve repository conflicts manually; no force push or JSONL merge is performed.`);
    return result.stdout;
  }
  /** Keep raw bytes raw: local attributes override any text/EOL rules in the snapshot. */
  private async ensureAttributes(): Promise<void> {
    const file = path.join(this.config.repoDir, ".git", "info", "attributes");
    await noLinks(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let current = "";
    try { current = await fs.readFile(file, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (current.split(/\r?\n/).filter(Boolean).at(-1) === "* -text") return;
    await fs.writeFile(file, `${current}${current && !current.endsWith("\n") ? "\n" : ""}* -text\n`, { mode: 0o600 });
  }
  private async ensureRepo(): Promise<void> {
    await noLinks(this.config.repoDir);
    const gitDir = path.join(this.config.repoDir, ".git"); await noLinks(gitDir);
    if (!(await stat(gitDir))) {
      if (await stat(this.config.repoDir) && (await fs.readdir(this.config.repoDir)).length) throw new Error("Repository directory is nonempty but has no .git; choose an empty directory");
      await fs.mkdir(path.dirname(this.config.repoDir), { recursive: true });
      await this.git(["clone", "--", this.config.repoUrl, this.config.repoDir], path.dirname(this.config.repoDir), NETWORK_TIMEOUT_MS);
    }
    const origin = (await this.git(["remote", "get-url", "origin"])).trim();
    if (origin !== this.config.repoUrl) throw new Error("Repository origin differs from configured SSH URL; inspect it before syncing");
    const pushUrls = (await this.git(["remote", "get-url", "--push", "--all", "origin"])).trim().split(/\r?\n/);
    if (pushUrls.some(url => url !== this.config.repoUrl)) throw new Error("Repository push URL differs from configured SSH URL");
    await this.ensureAttributes();
    for (const file of (await this.git(["ls-files", "-z"])).split("\0").filter(Boolean)) validatePath(file);
  }
  private managedPaths(): string[] { return this.config.paths.map(validatePath); }
  private activeSessionRelative(): string | undefined {
    if (!this.activeSessionFile) return undefined;
    const absolute = path.resolve(this.paths.agentDir, this.activeSessionFile);
    let resolved = absolute;
    try { resolved = realpathSync.native(absolute); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const relative = path.relative(this.paths.agentDir, resolved);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
    return validatePath(relative.split(path.sep).join("/"));
  }
  private async localFileExists(relative: string): Promise<boolean> {
    const target = path.join(this.paths.agentDir, validatePath(relative));
    await noLinks(target);
    return Boolean(await stat(target));
  }
  private async readSessionHeader(file: string): Promise<{ parentSession?: string } | undefined> {
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      handle = await fs.open(file, "r");
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const first = buffer.subarray(0, bytesRead).toString("utf8").split("\n", 1)[0] ?? "";
      const header = JSON.parse(first);
      return { parentSession: typeof header?.parentSession === "string" && header.parentSession ? header.parentSession : undefined };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return undefined;
      throw error;
    } finally { await handle?.close(); }
  }
  private async readLastSessionName(file: string): Promise<string | undefined> {
    let name: string | undefined;
    let stream: ReturnType<typeof createReadStream> | undefined;
    try {
      stream = createReadStream(file, { encoding: "utf8" });
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.includes("session_info")) continue;
          try {
            const entry = JSON.parse(line);
            if (entry?.type === "session_info" && typeof entry.name === "string") name = entry.name;
          } catch { /* ignore malformed lines while a transcript is being written */ }
        }
      } finally { lines.close(); }
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    } finally { stream?.destroy(); }
  }
  private async scanSessionEntries(): Promise<SessionEntry[]> {
    if (!this.managedPaths().includes("sessions")) throw new Error("Prune requires \"sessions\" in managed paths");
    const root = path.join(this.paths.agentDir, "sessions");
    await noLinks(root);
    const rootInfo = await stat(root);
    if (!rootInfo) return [];
    if (!rootInfo.isDirectory()) throw new Error("sessions is not a directory");
    const entries: SessionEntry[] = [];
    const visit = async (absolute: string, relative: string): Promise<void> => {
      await noLinks(absolute);
      const info = await stat(absolute);
      if (!info) return;
      if (info.isDirectory()) {
        for (const child of (await fs.readdir(absolute)).sort()) await visit(path.join(absolute, child), `${relative}/${child}`);
        return;
      }
      if (!info.isFile() || !relative.toLowerCase().endsWith(".jsonl")) return;
      const header = await this.readSessionHeader(absolute);
      if (!header) return;
      const name = header.parentSession ? await this.readLastSessionName(absolute) : undefined;
      entries.push({ path: validatePath(`sessions/${relative}`), parentSession: header.parentSession, name, bytes: info.size, mtimeMs: info.mtimeMs });
    };
    for (const child of (await fs.readdir(root)).sort()) await visit(path.join(root, child), child);
    return entries;
  }
  private async stageDeletions(files: string[]): Promise<void> {
    let batch: string[] = []; let budget = 0;
    const flush = async () => {
      if (!batch.length) return;
      await this.git(["--literal-pathspecs", "add", "-A", "--", ...batch]);
      batch = []; budget = 0;
    };
    for (const file of files) {
      const cost = file.length * 2 + 3;
      if (budget + cost > 6000 && batch.length) await flush();
      batch.push(file); budget += cost;
    }
    await flush();
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
  private async apply(files: Files, reason: string, deletions: string[] = [], preserve: Set<string> = new Set()): Promise<SyncResult> {
    const changes: Files = new Map(); const replaced: string[] = []; const removed: string[] = [];
    let active = this.activeSessionFile ? path.resolve(this.paths.agentDir, this.activeSessionFile) : undefined;
    if (active) {
      try { active = await fs.realpath(active); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const sameActive = (target: string) => active && (process.platform === "win32"
      ? path.resolve(target).toLowerCase() === active.toLowerCase() : path.resolve(target) === active);
    for (const [relative, data] of files) {
      if (preserve.has(relative)) continue;
      const target = path.join(this.paths.agentDir, relative); await noLinks(target);
      const info = await stat(target);
      if (info && !info.isFile()) throw new Error(`File/directory conflict at ${relative}; move the local entry aside and retry`);
      const local = info ? await fs.readFile(target) : undefined;
      if (local?.equals(data)) continue;
      if (sameActive(target)) throw new Error(`Active session differs: ${relative}. Switch to a new session or close it before pull/restore; no files were applied.`);
      changes.set(relative, data); if (local) replaced.push(relative);
    }
    for (const relative of deletions) {
      validatePath(relative);
      const target = path.join(this.paths.agentDir, relative); await noLinks(target);
      const info = await stat(target);
      if (!info) continue;
      if (!info.isFile()) throw new Error(`File/directory conflict at ${relative}; move the local entry aside and retry`);
      if (sameActive(target)) throw new Error(`Active session cannot be deleted: ${relative}. Switch to a new session before pull/restore; no files were applied.`);
      removed.push(relative);
    }
    const preserved = preserve.size ? `; preserved ${preserve.size} local deletion(s) pending push` : "";
    if (!changes.size && !removed.length) return { changed: false, message: `Already up to date; no files applied or backup created${preserved}`, files: [] };
    const backup = await this.makeBackup(reason);
    await this.write(this.paths.agentDir, changes);
    for (const relative of removed) await fs.rm(path.join(this.paths.agentDir, relative), { force: true });
    const deleted = removed.length ? `; deleted ${removed.length} remote-deleted file(s)` : "";
    const message = `Applied ${changes.size} file(s)${deleted}; replaced ${replaced.length} differing local file(s) from remote/backup, preserved local-only files${preserved}. Recovery backup: ${backup.id}${replaced.length ? `; replaced: ${replaced.join(", ")}` : ""}`;
    this.config.lastResult = message;
    return { changed: changes.size > 0 || removed.length > 0, message, files: [...changes.keys()], backupId: backup.id };
  }
  async planPruneSessions(): Promise<PrunePlan> {
    return selectOrphanSessions(await this.scanSessionEntries(), { activePath: this.activeSessionRelative() });
  }
  async pruneOrphanSessions(expectedPaths?: string[]): Promise<PruneResult> { return this.run("prune", async () => {
    const plan = await this.planPruneSessions();
    const expected = expectedPaths === undefined ? undefined : new Set(expectedPaths.map(validatePath));
    const candidates = expected ? plan.candidates.filter(candidate => expected.has(candidate.path)) : plan.candidates;
    if (!candidates.length) return { removed: [], repoRemoved: 0, skipped: plan.skipped };
    const active = this.activeSessionRelative()?.toLowerCase();
    let skipped = plan.skipped;
    const selected: typeof candidates = [];
    for (const candidate of candidates) {
      const relative = validatePath(candidate.path);
      if (active && relative.toLowerCase() === active) { skipped++; continue; }
      const file = path.join(this.paths.agentDir, relative);
      await noLinks(file);
      const info = await stat(file);
      if (info && !info.isFile()) throw new Error(`Not a regular file: ${relative}`);
      // Recheck recency before touching the snapshot; a live subagent may have
      // written the file while the preview was open.
      if (info && Date.now() - info.mtimeMs < SESSION_RECENT_MS) { skipped++; continue; }
      selected.push(candidate);
    }
    if (!selected.length) return { removed: [], repoRemoved: 0, skipped };
    await this.ensureRepo();
    if ((await this.git(["diff", "--cached", "--name-only"])).trim()) throw new Error("Repository has staged changes; run Push or resolve them before pruning");
    if ((await this.git(["status", "--porcelain"])).trim()) throw new Error("Repository has uncommitted changes; run Push or resolve them before pruning");
    const repoRemoved: string[] = [];
    for (const candidate of selected) {
      const relative = validatePath(candidate.path);
      const file = path.join(this.config.repoDir, relative);
      await noLinks(file);
      const info = await stat(file);
      if (!info) continue;
      if (!info.isFile()) throw new Error(`Not a regular file in snapshot: ${relative}`);
      await fs.rm(file);
      repoRemoved.push(relative);
    }
    if (repoRemoved.length) {
      await this.stageDeletions(repoRemoved);
      await this.git(["commit", "-m", `amox-pi-sync: prune ${repoRemoved.length} orphan subagent session(s)`]);
    }
    const removed: string[] = [];
    for (const candidate of selected) {
      const relative = validatePath(candidate.path);
      if (active && relative.toLowerCase() === active) { skipped++; continue; }
      const file = path.join(this.paths.agentDir, relative);
      await noLinks(file);
      const info = await stat(file);
      if (!info) continue;
      if (!info.isFile()) throw new Error(`Not a regular file: ${relative}`);
      if (Date.now() - info.mtimeMs < SESSION_RECENT_MS) { skipped++; continue; }
      await fs.rm(file);
      removed.push(relative);
    }
    if (removed.length) {
      const deleted = new Set(removed);
      this.config.syncedPaths = this.config.syncedPaths?.filter(item => !deleted.has(item));
      await saveConfig(this.config, this.paths);
    }
    return { removed, repoRemoved: repoRemoved.length, skipped };
  }); }
  async check(): Promise<Status> { return this.run("check", async () => {
    this.status.checkedAt = undefined; this.status.remoteChanges = undefined;
    await this.ensureRepo(); await this.git(["fetch", "origin"], this.config.repoDir, NETWORK_TIMEOUT_MS);
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
    const upstream = await this.gitResult(["rev-parse", "--verify", "@{u}"], this.config.repoDir);
    const remoteChanges = upstream.code === 0 ? Number((await this.git(["rev-list", "--count", "HEAD..@{u}"])).trim()) : undefined;
    this.status.localChanges = localChanges; this.status.remoteChanges = remoteChanges;
    this.status.checkedAt = new Date().toISOString(); return { ...this.status, busy: undefined };
  }); }
  /** Fetch and integrate remote history without rewriting local commits. */
  private async integrateRemote(): Promise<{ merged: boolean; fastForward: boolean }> {
    await this.git(["fetch", "origin"], this.config.repoDir, NETWORK_TIMEOUT_MS);
    const relation = await this.gitResult(["merge-base", "--is-ancestor", "HEAD", "@{u}"]);
    if (relation.code === 0) {
      await this.git(["merge", "--ff-only", "@{u}"]);
      return { merged: false, fastForward: true };
    }
    if (relation.code !== 1) throw new Error(`git merge-base failed: ${relation.stderr.trim() || relation.stdout.trim() || `exit ${relation.code}`}`);
    // The remote is not ahead. Distinguish a local-only commit (nothing to
    // integrate) from true divergence before attempting a merge.
    const ahead = await this.gitResult(["merge-base", "--is-ancestor", "@{u}", "HEAD"]);
    if (ahead.code === 0) return { merged: false, fastForward: false };
    if (ahead.code !== 1) throw new Error(`git merge-base failed: ${ahead.stderr.trim() || ahead.stdout.trim() || `exit ${ahead.code}`}`);
    // Local and remote both have commits. Only accept a clean merge; any
    // conflict restores the previous clean repository.
    try {
      await this.git(["merge", "--no-edit", "@{u}"]);
      return { merged: true, fastForward: false };
    } catch (error) {
      try { await this.git(["merge", "--abort"]); } catch { /* no merge in progress */ }
      throw new Error(`Remote and local snapshots diverged, and the three-way merge was not clean. The repository was restored. Resolve the divergence manually. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async push(): Promise<string> { return this.run("push", async () => {
    await this.ensureRepo();
    if ((await this.git(["diff", "--cached", "--name-only"])).trim()) throw new Error("Repository has staged changes; inspect/commit them manually before sync");
    const files = await this.collect(this.paths.agentDir, true);
    // Validate the existing snapshot too; never follow nested symlinks or stage secrets.
    await this.collect(this.config.repoDir, true);
    const managed = this.managedPaths();
    // Only delete paths this device previously synced. Files that exist only in
    // the remote snapshot (not yet pulled) are never inferred as local deletions.
    const deletions = this.config.syncedPaths === undefined ? [] : this.config.syncedPaths
      .filter(item => managedPath(item, managed) && !files.has(item));
    await this.write(this.config.repoDir, files);
    const repoDeleted: string[] = [];
    for (const relative of deletions) {
      const file = path.join(this.config.repoDir, validatePath(relative));
      await noLinks(file);
      const info = await stat(file);
      if (!info) continue;
      if (!info.isFile()) throw new Error(`Not a regular file in snapshot: ${relative}`);
      await fs.rm(file);
      repoDeleted.push(relative);
    }
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
    if (repoDeleted.length) await this.stageDeletions(repoDeleted);
    const staged = (await this.git(["diff", "--cached", "--name-only"])).trim();
    if (staged) await this.git(["commit", "-m", `amox-pi-sync: ${new Date().toISOString()}`]);
    // A rejected non-fast-forward push is recoverable without force. Any other
    // failure, including a killed transfer, is final and records no success.
    const first = await this.gitResult(["push", "-u", "origin", "HEAD"], this.config.repoDir, NETWORK_TIMEOUT_MS);
    let integrated = false;
    if (first.code !== 0) {
      if (!/non-fast-forward|fetch first|\[rejected\]|Updates were rejected/i.test(first.stderr)) {
        throw new Error(`git push failed: ${first.stderr.trim() || first.stdout.trim() || `exit ${first.code}`}. Inspect the repository before retrying; no force push is performed.`);
      }
      const result = await this.integrateRemote();
      integrated = result.merged || result.fastForward;
      if (!integrated) throw new Error("git push was rejected, but the fetched remote is not ahead; inspect the repository before retrying.");
      await this.git(["push", "-u", "origin", "HEAD"], this.config.repoDir, NETWORK_TIMEOUT_MS);
    }
    this.config.lastPushAt = new Date().toISOString();
    this.config.syncedPaths = [...files.keys()].sort();
    const removed = repoDeleted.length ? `; removed ${repoDeleted.length} locally deleted file(s) from the snapshot` : "";
    this.config.lastResult = integrated
      ? `Integrated remote history and pushed managed snapshot${removed}; run Pull to apply remote files (no force push)`
      : `Pushed managed snapshot${removed} (no force push; unpulled remote files preserved)`;
    await saveConfig(this.config, this.paths);
    return this.config.lastResult;
  }); }
  async pull(): Promise<string> { return this.run("pull", async () => {
    await this.ensureRepo();
    if ((await this.git(["status", "--porcelain"])).trim()) throw new Error("Repository has uncommitted changes; resolve them before pulling");
    const result = await this.integrateRemote();
    const snapshot = await this.collect(this.config.repoDir, true);
    const snapshotPaths = new Set(snapshot.keys());
    const managed = this.managedPaths();
    const preserve = new Set<string>();
    const deletions: string[] = [];
    if (this.config.syncedPaths !== undefined) {
      for (const relative of this.config.syncedPaths) {
        if (!managedPath(relative, managed)) continue;
        if (!snapshotPaths.has(relative)) deletions.push(relative);
        else if (!(await this.localFileExists(relative))) preserve.add(relative);
      }
    }
    const applied = await this.apply(snapshot, "before applying remote snapshot", deletions, preserve);
    this.config.lastPullAt = new Date().toISOString();
    this.config.syncedPaths = [...snapshotPaths].sort();
    this.config.lastResult = `${result.merged ? "Merged diverged snapshots cleanly. " : ""}${applied.message}`;
    await saveConfig(this.config, this.paths); return this.config.lastResult;
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
