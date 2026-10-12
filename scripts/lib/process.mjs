import { spawnSync } from "node:child_process";

// Windows cannot spawn npm.cmd directly without a shell. Only trusted program
// names and safely quoted arguments pass through cmd; never model commands.
export function run(command, args, options = {}) {
  const isCmd = process.platform === "win32" && ["npm", "pi"].includes(command);
  if (!isCmd) return spawnSync(command, args, { encoding: "utf8", ...options });
  for (const arg of args) {
    if (/[\r\n"%]/.test(arg)) throw new Error("Unsupported Windows command argument");
  }
  const line = `${command}.cmd ${args.map((arg) => `"${arg}"`).join(" ")}`;
  return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/v:off", "/s", "/c", `"${line}"`], {
    encoding: "utf8", ...options, windowsVerbatimArguments: true,
  });
}

export function checkedRun(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout || result.status}`);
  }
  return result.stdout;
}
