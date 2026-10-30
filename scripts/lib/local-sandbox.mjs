import { spawn } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function failureExcerpt(output) {
  const lines = output.split(/\r?\n/), excerpts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*not ok \d|error TS\d|npm error|##\[error\]/.test(lines[i])) {
      excerpts.push(lines.slice(Math.max(0, i - 2), i + 38).join("\n")); i += 37;
    }
  }
  return `${excerpts.join("\n\n").slice(0, 35000)}\n\nOutput tail:\n${lines.slice(-45).join("\n")}`.slice(0, 45000);
}

// Only public system files, the running Node binary, the candidate and disposable HOME/TMP are visible.
// No host home, SSH, model/publish credentials or host /proc are exposed.
export function sandboxArgs({ repo, scratch, writable = [], network = true }) {
  if (process.platform !== "linux") throw new Error("Local maintenance requires Linux and bubblewrap");
  mkdirSync(join(scratch, "home"), { recursive: true });
  mkdirSync(join(scratch, "tmp"), { recursive: true });
  const args = ["--die-with-parent", "--new-session", "--unshare-all"];
  if (network) args.push("--share-net");
  // setup-node may install Node outside /usr (e.g. the GitHub tool cache).
  // Expose only that executable, not its parent directory or the host PATH.
  args.push("--clearenv", "--ro-bind", "/usr", "/usr",
    "--dir", "/opt", "--dir", "/opt/amox-runtime",
    "--ro-bind", realpathSync(process.execPath), "/opt/amox-runtime/node", "--dir", "/etc");
  for (const path of ["/etc/ssl/certs", "/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/hosts", "/etc/gai.conf", "/etc/localtime"]) {
    if (existsSync(path)) args.push("--ro-bind", path, path);
  }
  for (const path of ["/bin", "/lib", "/lib64"]) if (existsSync(path)) args.push("--ro-bind", path, path);
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/run",
    "--dir", "/home", "--bind", join(scratch, "home"), "/home/runner",
    "--bind", join(scratch, "tmp"), "/tmp", "--ro-bind", repo, "/workspace");
  const resolv = realpathSync("/etc/resolv.conf");
  args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
  if (!resolv.startsWith("/etc/")) args.push("--ro-bind", "/etc/resolv.conf", resolv);
  for (const [source, target] of writable) args.push("--bind", source, target);
  for (const [key, value] of Object.entries({ PATH: "/opt/amox-runtime:/usr/bin:/bin", HOME: "/home/runner", TMPDIR: "/tmp",
    LANG: "C.UTF-8", CI: "true", AMOX_INSIDE_SANDBOX: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0", NPM_CONFIG_USERCONFIG: "/dev/null", NPM_CONFIG_IGNORE_SCRIPTS: "true" })) {
    args.push("--setenv", key, value);
  }
  args.push("--chdir", "/workspace");
  return args;
}

export function sandboxRun({ repo, scratch, command, args = [], writable = [], network = true, signal,
  timeoutMs = 20 * 60_000, logPath }) {
  return new Promise((resolve, reject) => {
    let output = "", timedOut = false;
    const child = spawn("bwrap", [...sandboxArgs({ repo, scratch, writable, network }), "--", command, ...args],
      { env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] });
    const stop = () => child.kill("SIGKILL");
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const collect = (chunk) => {
      if (output.length < 4_000_000) output += chunk.toString("utf8");
      else stop();
    };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    child.on("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", stop); reject(error); });
    child.on("close", (status) => {
      clearTimeout(timer); signal?.removeEventListener("abort", stop);
      if (logPath) writeFileSync(logPath, `$ ${command} ${args.join(" ")}\n${output}`);
      resolve({ ok: status === 0 && !timedOut && !signal?.aborted, status, timedOut, output });
    });
  });
}
