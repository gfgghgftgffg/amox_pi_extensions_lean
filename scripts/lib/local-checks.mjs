import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adapterWritable, assertRegularPath, jsonText, lfText, readJson } from "./files.mjs";
import { releaseSummaryBlock } from "./release-validation.mjs";
import { failureExcerpt, sandboxRun } from "./local-sandbox.mjs";

export const LOCAL_CHECKS = [["npm", ["run", "check"]], ["npm", ["run", "contracts:check"]], ["npm", ["run", "verify:production"]],
  ["node", ["scripts/audit-dependencies.mjs"]], ["node", ["scripts/audit-dependencies.mjs", "--omit=dev"]]];
export function git(repo, args) {
  return execFileSync("git", ["-C", repo, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args],
    { encoding: "utf8", timeout: 90_000, maxBuffer: 20_000_000,
      env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME, LANG: "C.UTF-8", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" } }).trim();
}
export function checkpoint(repo) {
  git(repo, ["add", "--all"]);
  if (git(repo, ["diff", "--cached", "--name-only"])) {
    git(repo, ["-c", "user.name=amox local maintenance", "-c", "user.email=maintenance@example.invalid", "commit", "--quiet", "-m", "maintenance: review and check upstream update"]);
  }
  return git(repo, ["rev-parse", "HEAD"]);
}
export function protectedBaseline(repo, manifest) {
  return new Map(git(repo, ["ls-files", "-z"]).split("\0").filter(Boolean)
    .map((path) => [path, { text: readFileSync(assertRegularPath(repo, path), "utf8"), writable: adapterWritable(path, manifest) }]));
}
export function validateLocalChanges(repo, manifest, baseline, generated) {
  const current = new Set(git(repo, ["ls-files", "-z"]).split("\0").filter(Boolean));
  for (const [path, original] of baseline) {
    if (!existsSync(join(repo, path))) throw new Error(`Deleted baseline file: ${path}`);
    const actual = readFileSync(assertRegularPath(repo, path), "utf8");
    if (generated.has(path)) {
      if (actual !== generated.get(path)) throw new Error(`Protected generated file changed: ${path}`);
    } else if (!original.writable && actual !== original.text) throw new Error(`Protected file changed: ${path}`);
    if (/\/tests\//.test(path) && !lfText(actual).startsWith(lfText(original.text))) throw new Error(`Existing tests are append-only: ${path}`);
  }
  const untracked = git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  for (const path of [...current, ...untracked]) {
    if (!baseline.has(path) && !generated.has(path) && !adapterWritable(path, manifest)) throw new Error(`Unexpected new file: ${path}`);
    assertRegularPath(repo, path);
  }
}
export function measureDocs(repo, manifest) {
  const snapshot = readJson(join(repo, "maintenance/tool-contracts.json"));
  let upstreamTotal = 0, leanTotal = 0;
  for (const entry of manifest.packages) {
    const lean = snapshot.lean[entry.packageName], upstream = snapshot.upstream[entry.upstreamPackage];
    upstreamTotal += upstream.totals.registeredProxyTokens; leanTotal += lean.totals.registeredProxyTokens;
    for (const file of ["README.md", "README.zh-CN.md"]) {
      const path = join(repo, entry.path, file);
      let text = readFileSync(path, "utf8");
      const title = file === "README.md" ? "## Context footprint (character proxy)" : "## 上下文占用（字符代理）";
      const section = `${title}\n\n<!-- amox-measurement:start -->\n| Package | Registered character proxy |\n| --- | ---: |\n| ${entry.packageName} | ${lean.totals.registeredProxyTokens} |\n| ${entry.upstreamPackage} | ${upstream.totals.registeredProxyTokens} |\n\nFixed ceil(characters / 4), not provider billing tokens.\n<!-- amox-measurement:end -->\n\n`;
      const start = text.search(file === "README.md" ? /^## (Context|Token|Prompt|Measured).*$/mi : /^## 上下文占用.*$/m);
      const next = start < 0 ? -1 : text.indexOf("\n## ", start + 3);
      text = start < 0 ? `${text.trimEnd()}\n\n${section}` : text.slice(0, start) + section + (next < 0 ? "" : text.slice(next + 1));
      writeFileSync(path, text);
    }
  }
  for (const file of ["README.md", "README.zh-CN.md"]) {
    const root = join(repo, file);
    if (existsSync(root)) writeFileSync(root, readFileSync(root, "utf8").replace(/\*\*\d+(?:\.\d+)?%\*\*/, `**${((1 - leanTotal / upstreamTotal) * 100).toFixed(1)}%**`));
  }
}

// The same candidate is checkpointed and executed every time. Failed checks
// return real logs to Pi; only this host-side gate can mark a commit publishable.
export function createCheckGate({ repo, scratch, manifest, plan, baseCommit, baseline, generated, log = console.log,
  execute = sandboxRun }) {
  let attempt = 0, verifiedSha;
  return {
    invalidate() { verifiedSha = undefined; },
    verified() {
      if (!verifiedSha || git(repo, ["rev-parse", "HEAD"]) !== verifiedSha || git(repo, ["status", "--porcelain"])) throw new Error("No unchanged, locally verified candidate; no publication");
      validateLocalChanges(repo, manifest, baseline, generated);
      return verifiedSha;
    },
    async check(summary, signal) {
      verifiedSha = undefined;
      const version = readJson(join(repo, "package.json")).version;
      const block = releaseSummaryBlock({ version, summary });
      if (!existsSync(join(repo, "maintenance/agent-review.md"))) throw new Error("Write the source review first");
      validateLocalChanges(repo, manifest, baseline, generated);
      const logs = join(scratch, `checks-${++attempt}`); mkdirSync(logs, { recursive: true });
      const snapshot = join(scratch, "tool-contracts.json");
      writeFileSync(snapshot, readFileSync(join(repo, "maintenance/tool-contracts.json")));
      const capture = await execute({ repo, scratch, command: "npm", args: ["run", "contracts"], signal,
        writable: [[snapshot, "/workspace/maintenance/tool-contracts.json"]], logPath: join(logs, "contracts.log") });
      if (!capture.ok) return { ok: false, output: `Contract capture failed:\n${capture.output.slice(-45000)}` };
      writeFileSync(join(repo, "maintenance/tool-contracts.json"), readFileSync(snapshot));
      generated.set("maintenance/tool-contracts.json", readFileSync(snapshot, "utf8"));
      // leanCommit moves only after the exact source comparison has been offered
      // to the reviewing Pi; merging still requires exact-head three-platform CI.
      for (const lean of plan.leanPlans.filter((item) => item.changed)) manifest.packages.find((entry) => entry.id === lean.id).leanCommit = lean.remoteHead;
      writeFileSync(join(repo, "maintenance/manifest.json"), jsonText(manifest));
      generated.set("maintenance/manifest.json", jsonText(manifest));
      measureDocs(repo, manifest);
      const report = `# Local upstream maintenance\n\nBase: ${baseCommit}\nRelease after verified merge: v${version}\n\n${block}\n\nSource review: [agent-review.md](agent-review.md).\n\nThe local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.\n`;
      writeFileSync(join(repo, "maintenance/update-report.md"), report); generated.set("maintenance/update-report.md", report);
      validateLocalChanges(repo, manifest, baseline, generated);
      const sha = checkpoint(repo);
      for (const [command, args] of LOCAL_CHECKS) {
        log(`Local check ${attempt}: ${command} ${args.join(" ")}`);
        const checked = await execute({ repo, scratch, command, args, signal,
          logPath: join(logs, `${command}-${args.join("-").replaceAll("/", "_")}.log`) });
        if (!checked.ok) return { ok: false, output: `FAILED ${command} ${args.join(" ")} (exit ${checked.status}, timeout ${checked.timedOut}):\n${failureExcerpt(checked.output)}` };
      }
      if (git(repo, ["rev-parse", "HEAD"]) !== sha || git(repo, ["status", "--porcelain"])) throw new Error("Checks changed the candidate");
      validateLocalChanges(repo, manifest, baseline, generated);
      verifiedSha = sha;
      log(`All local checks passed for ${sha}`);
      return { ok: true, sha, output: `All local checks passed for ${sha}. Stop editing. Remote three-platform CI and fixed-host merge acceptance are still required.` };
    },
  };
}
