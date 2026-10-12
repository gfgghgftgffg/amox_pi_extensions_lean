import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanGitFixture } from "../helpers/clean-git-fixture.mjs";
import { buildCandidateArtifact } from "../../scripts/lib/candidate.mjs";
import { buildUpdatePlan, buildUpdateReport } from "../../scripts/lib/upstream-plan.mjs";
import { buildAdaptedBundle, validateAdaptedBundle } from "../../scripts/lib/adapted-candidate.mjs";
import { jsonText, nextPatch, readJson } from "../../scripts/lib/automation-policy.mjs";
import { run, checkedRun } from "../../scripts/lib/process.mjs";

// Opt-in CLI, deliberately outside tests/*.test.mjs: verify runs the ordinary
// suite inside a disposable clone and must never recursively invoke this test.
// No real model, provider credential, repository write token or publication.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const logs = resolve(process.argv[2] || join(root, ".tmp/maintenance-pipeline"));
mkdirSync(logs, { recursive: true });
const fixture = cleanGitFixture(root), repo = fixture.repo;
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => ["path", "systemroot", "windir", "comspec", "pathext", "temp", "tmp", "tmpdir", "home", "userprofile", "localappdata", "appdata", "https_proxy", "http_proxy", "no_proxy"].includes(name.toLowerCase())));
try {
  const base = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifest = readJson(join(repo, "maintenance/manifest.json"));
  const version = nextPatch(readJson(join(repo, "package.json")).version);
  const workspaces = manifest.packages.map(entry => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: readJson(join(repo, entry.path, "package.json")) }));
  const metadata = { npm: {}, git: {} };
  for (const [i, entry] of manifest.packages.entries()) {
    for (const [name, value] of Object.entries(workspaces[i].pkg.dependencies)) metadata.npm[name] = { latestStable: value, gitHead: entry.upstreamGitHead };
    metadata.git[entry.upstreamRepository] = { head: entry.upstreamGitHead };
    metadata.git[entry.leanRepository] = { head: entry.leanCommit };
  }
  const reviewedHead = manifest.packages[0].leanCommit === "f".repeat(40) ? "e".repeat(40) : "f".repeat(40);
  metadata.git[manifest.packages[0].leanRepository].head = reviewedHead;
  const plan = buildUpdatePlan({ manifest, workspaces, metadata });
  const dependencyCandidate = buildCandidateArtifact({ baseCommit: base, status: "lean-review", files: [{ path: "maintenance/update-report.md", content: buildUpdateReport({ plan, status: "lean-review", baseCommit: base }) }] });
  const review = { ready: true, reviewedPackages: [manifest.packages[0].id], summary: "Offline integration fixture: source review simulated; no adapter behavior change required." };
  const files = [{ path: "maintenance/agent-review.md", content: "# Offline fixture review\n\n" + "Simulated exact source identities, changelog, API and regression review; actual model calls are tested separately with an offline SDK provider. ".repeat(3) }];
  const out = join(repo, ".maintenance-candidate");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "adapted.json"), jsonText(buildAdaptedBundle({ baseCommit: base, dependencyCandidate, plan, review, files })));
  // Mock only source/main HEAD queries. Real installs, measurements, tests,
  // production verification, audits, commits and dependency-free apply run.
  const preload = join(out, "offline-git.mjs");
  writeFileSync(preload, `import cp from "node:child_process";\nimport { syncBuiltinESMExports } from "node:module";\nconst spawn=cp.spawnSync, exec=cp.execFileSync;\nfunction head(cmd,args){const at=args.indexOf("ls-remote");return cmd==="git" && at>=0 ? (args[at+1]==="origin" ? (process.env.AMOX_TEST_MAIN_HEAD || ${JSON.stringify(base)}) : ${JSON.stringify(reviewedHead)})+"\\tHEAD\\n" : undefined;}\ncp.spawnSync=(cmd,args,opts)=>{const value=head(cmd,args);return value===undefined ? spawn(cmd,args,opts) : {status:0,stdout:value,stderr:""};};\ncp.execFileSync=(cmd,args,opts)=>{const value=head(cmd,args);return value===undefined ? exec(cmd,args,opts) : opts?.encoding ? value : Buffer.from(value);};\nsyncBuiltinESMExports();\n`);
  const invoke = (phase, variables = {}) => run(process.execPath, ["--import", pathToFileURL(preload).href, "scripts/automate-maintenance.mjs", phase], { cwd: repo, env: { ...env, ...variables }, timeout: 600_000 });
  const result = invoke("verify");
  writeFileSync(join(logs, "verify.log"), `${result.stdout || ""}\n${result.stderr || ""}`);
  const checkLog = join(out, "verification/run-check.log");
  if (existsSync(checkLog)) writeFileSync(join(logs, "check.log"), readFileSync(checkLog));
  assert.equal(result.status, 0, `Verify failed; see ${logs}`);
  const bundle = readJson(join(out, "verified.json"));
  assert.equal(bundle.status, "verified");
  assert.equal(readJson(join(repo, "package.json")).version, version);
  console.log(checkedRun(process.execPath, ["scripts/release-assets.mjs", "--build"], { cwd: repo, env }));
  const release = checkedRun(process.execPath, ["scripts/release-plan.mjs", "--run"], { cwd: repo, env: { ...env, GITHUB_EVENT_NAME: "push", RELEASE_BEFORE_SHA: base } });
  assert.ok(release.includes("should_release=true") && release.includes(`tag=v${version}`));
  execFileSync("git", ["-C", repo, "reset", "--hard", base], { stdio: "ignore" });
  rmSync(join(repo, "node_modules"), { recursive: true, force: true });
  const validated = await validateAdaptedBundle({ bundle, repoRoot: repo, headSha: base, verified: true, gitHeadResolver: () => reviewedHead });
  assert.equal(validated.version, version);
  const stale = invoke("apply", { AMOX_TEST_MAIN_HEAD: "0".repeat(40) });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /main advanced/);
  const applied = invoke("apply");
  writeFileSync(join(logs, "apply.log"), `${applied.stdout || ""}\n${applied.stderr || ""}`);
  assert.equal(applied.status, 0, `Dependency-free apply failed; see ${logs}`);
  assert.equal(readJson(join(repo, "package.json")).version, version);
  console.log("Offline maintenance pipeline passed: independent verify, version generation, three real archives, release plan, stale-main refusal and dependency-free PR apply. No real model or publication.");
} finally { fixture.cleanup(); }
