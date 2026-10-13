#!/usr/bin/env node
// Local daily entry point. No npm dependencies, Pi session or model calls.
import { mkdirSync, mkdtempSync, existsSync, openSync, closeSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");
const unitName = "amox-pi-actions";
const workflows = { upstream: "check-upstream.yml", ci: "test.yml" };
export const API_VERSION = "2026-03-10";
export const DEFAULT_REPO = "gfgghgftgffg/amox_pi_extensions_lean";

export function parseArgs(args) {
  const options = { repo: DEFAULT_REPO, workflows: [], timeoutMinutes: 180 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--install-timer") options.install = true;
    else if (["--repo", "--workflow", "--timeout-minutes"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--repo") options.repo = value;
      if (arg === "--workflow") {
        if (!Object.hasOwn(workflows, value)) throw new Error("--workflow must be upstream or ci; releases stay version-gated in Actions");
        options.workflows.push(value);
      }
      if (arg === "--timeout-minutes") options.timeoutMinutes = Number(value);
    } else throw new Error("Unknown option; use --help. Tokens must not be passed on the command line");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.repo)) throw new Error("--repo must be OWNER/REPO");
  if (!Number.isInteger(options.timeoutMinutes) || options.timeoutMinutes < 1 || options.timeoutMinutes > 180) throw new Error("--timeout-minutes must be an integer from 1 to 180");
  options.workflows = [...new Set(options.workflows.length ? options.workflows : ["upstream"])];
  if (options.install && (options.dryRun || options.workflows.join() !== "upstream" || options.timeoutMinutes !== 180)) throw new Error("Timer installation only supports the daily upstream default");
  return options;
}

export async function dispatchWorkflows(options, {
  token,
  fetchImpl = fetch,
  now = Date.now,
  pause = sleep,
  log = console.log,
  pollMs = 30_000,
} = {}) {
  if (!token?.trim()) throw new Error("Missing GH_TOKEN (or GITHUB_TOKEN): configure a GitHub token outside the repository; the model API key cannot be used");
  token = token.trim();
  if (/\s/.test(token)) throw new Error("GitHub token must not contain whitespace");
  const deadline = now() + options.timeoutMinutes * 60_000;
  const base = `https://api.github.com/repos/${options.repo}`;
  const api = async (path, method = "GET", body) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("Local monitoring deadline exceeded; any remote run remains unchanged");
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(Math.min(30_000, remaining)),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "amox-pi-local-maintenance",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error(`${method} ${path}: network error or timeout${method === "POST" ? "; dispatch may have been accepted; inspect Actions before retrying" : ""}`);
    }
    if (!response.ok) {
      const hint = response.status === 401 ? "check token validity/expiry" : response.status === 403 ? "check Actions read/write permission, repository access and rate limits" : response.status === 404 ? "check repository/workflow name and token repository access" : "inspect GitHub Actions/API availability";
      // Never print request headers, credentials or potentially echoed response bodies.
      throw new Error(`${method} ${path}: HTTP ${response.status}; ${hint}`);
    }
    if (response.status === 204) throw new Error("Dispatch accepted without a run ID; inspect Actions before retrying (API 2026-03-10 is required)");
    try { return await response.json(); }
    catch { throw new Error(`${method} ${path}: invalid JSON response; inspect Actions before retrying`); }
  };
  const results = [];
  for (const name of options.workflows) {
    const path = `/actions/workflows/${workflows[name]}`;
    const workflow = await api(path);
    if (workflow.state !== "active") throw new Error(`${workflows[name]} is not active; enable it in GitHub Actions`);
    log(`Dispatch ${workflows[name]} on ${options.repo}@main`);
    // Never automatically retry POST: a lost response must not create duplicate runs.
    const dispatch = await api(`${path}/dispatches`, "POST", { ref: "main" });
    const id = dispatch.workflow_run_id;
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Dispatch returned no valid run ID; inspect Actions before retrying");
    const url = `https://github.com/${options.repo}/actions/runs/${id}`;
    log(`Accepted run ${id}: ${url}`);
    let previous;
    for (;;) {
      const run = await api(`/actions/runs/${id}`);
      if (run.id !== id || run.event !== "workflow_dispatch" || run.head_branch !== "main") throw new Error(`Unexpected run identity for ${id}; stopped monitoring`);
      if (run.status !== previous) { log(`Run ${id}: ${run.status}`); previous = run.status; }
      if (run.status === "completed") {
        if (run.conclusion !== "success") throw new Error(`Run ${id} ended with ${run.conclusion || "unknown conclusion"}: ${url}`);
        log(`Run ${id}: success`);
        results.push({ workflow: name, id, url });
        break;
      }
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error(`Monitoring timed out for ${url}; remote run was not cancelled`);
      await pause(Math.min(pollMs, remaining));
    }
  }
  return results;
}

export function renderUnits({ user, node, root, tokenFile, stateDir, repo = DEFAULT_REPO }) {
  if (!/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("Unsupported service user");
  parseArgs(["--repo", repo]);
  if ([node, root, tokenFile, stateDir].some((path) => !path.startsWith("/") || /[\s"\\%$\0]/.test(path))) throw new Error("Unit paths must be absolute and must not contain whitespace, quotes, backslashes, % or $");
  const quote = (value) => {
    if (/[\r\n\0%$]/.test(value)) throw new Error("Unit values must not contain control characters, % or $");
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  };
  return {
    service: `[Unit]
Description=Daily reviewed Pi extension maintenance (GitHub workflow dispatch)
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=${user}
WorkingDirectory=${root}
EnvironmentFile=${tokenFile}
Environment=${quote(`AMOX_ACTIONS_STATE_DIR=${stateDir}`)}
ExecStart=${quote(node)} ${quote(join(root, "scripts/dispatch-workflows.mjs"))} --repo ${repo}
TimeoutStartSec=190min
Restart=no
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${stateDir}
`,
    timer: `[Unit]
Description=Daily upstream check at 02:23 UTC (10:23 Beijing)

[Timer]
OnCalendar=*-*-* 02:23:00 UTC
Persistent=true
AccuracySec=1min
Unit=${unitName}.service

[Install]
WantedBy=timers.target
`,
  };
}

function installTimer(options) {
  if (process.platform !== "linux" || process.getuid() === 0) throw new Error("Run --install-timer as a normal Linux user; it invokes sudo only to install system units");
  const destination = "/etc/systemd/system";
  const files = [`${unitName}.service`, `${unitName}.timer`];
  for (const name of files) if (existsSync(join(destination, name))) throw new Error(`${name} already exists; refusing to overwrite an installed unit`);
  const configDir = join(homedir(), ".config");
  const tokenFile = join(configDir, `${unitName}.env`);
  const stateDir = join(homedir(), ".local/state", unitName);
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, "# GitHub fine-grained PAT: only this repository; Actions read/write.\n# Do not use the model API key. Keep this file outside Git (mode 600).\nGH_TOKEN=\n", { mode: 0o600, flag: "wx" });
  const units = renderUnits({ user: userInfo().username, node: process.execPath, root: projectRoot, tokenFile, stateDir, repo: options.repo });
  const staging = mkdtempSync(join(tmpdir(), `${unitName}-`));
  const command = (name, args) => {
    const result = spawnSync(name, args, { stdio: "inherit" });
    if (result.error || result.status !== 0) throw new Error(`${name} failed; check sudo/systemd availability (units remain disabled)`);
  };
  try {
    writeFileSync(join(staging, files[0]), units.service);
    writeFileSync(join(staging, files[1]), units.timer);
    command("systemd-analyze", ["verify", ...files.map((name) => join(staging, name))]);
    for (const name of files) command("sudo", ["-n", "install", "-m", "644", join(staging, name), join(destination, name)]);
    command("sudo", ["-n", "systemctl", "daemon-reload"]);
  } finally { rmSync(staging, { recursive: true, force: true }); }
  console.log(`Installed but NOT enabled. Set GH_TOKEN securely in ${tokenFile}, then run:`);
  console.log(`sudo systemctl start ${unitName}.service\nsudo systemctl enable --now ${unitName}.timer`);
}

function help() {
  console.log(`Usage: node scripts/dispatch-workflows.mjs [--workflow upstream|ci] [--repo OWNER/REPO]
  Default: dispatch Check upstream on main and wait for its actual conclusion.
  --workflow may be repeated; workflows run sequentially, stopping on failure.
  --timeout-minutes N   Total API/monitoring deadline, 1..180 (default 180).
  --dry-run             Show targets without credentials, network or a dispatch.
  --install-timer       Install a DISABLED daily systemd timer (Linux + sudo).
  GH_TOKEN/GITHUB_TOKEN must be a GitHub token with Actions read/write access.
  Credentials stay outside Git. Release remains gated by reviewed version changes.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return help();
  if (options.install) return installTimer(options);
  if (options.dryRun) {
    for (const name of options.workflows) console.log(`Would dispatch ${workflows[name]} on ${options.repo}@main; wait for completion (no network/model calls).`);
    return;
  }
  if (process.platform !== "linux") throw new Error("The local scheduler uses Linux flock; use GitHub's manual Run workflow on other platforms");
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token?.trim()) throw new Error("Missing GH_TOKEN/GITHUB_TOKEN; configure the repository-external credential file before enabling the timer");
  // flock is released by the OS on exit/crash, including while polling remote runs.
  const stateDir = process.env.AMOX_ACTIONS_STATE_DIR || join(homedir(), ".local/state", unitName);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (process.env.AMOX_ACTIONS_LOCK_HELD !== "1") {
    const lockFile = join(stateDir, `${options.repo.replace("/", "_")}.lock`);
    closeSync(openSync(lockFile, "a", 0o600));
    const result = spawnSync("flock", ["-n", "-E", "75", lockFile, process.execPath, scriptPath, ...process.argv.slice(2)], {
      stdio: "inherit", env: { ...process.env, AMOX_ACTIONS_LOCK_HELD: "1" },
    });
    if (result.error) throw new Error("Cannot launch flock; install util-linux before running the scheduler");
    if (result.status === 75) { console.log("Another local maintenance run holds the lock; skipped."); return; }
    if (result.status === null) throw new Error(`Scheduler child stopped by ${result.signal || "an unknown signal"}`);
    process.exitCode = result.status;
    return;
  }
  return dispatchWorkflows(options, { token });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  Promise.resolve().then(main).catch((error) => {
    console.error(`Local Actions scheduler failed: ${error.message}`);
    process.exitCode = 1;
  });
}
