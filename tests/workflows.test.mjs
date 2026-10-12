// Workflow/security configuration guardrails, checked offline without a YAML
// dependency: every external action must be pinned to a full commit SHA with a
// version comment, no privileged triggers may appear, the write-scoped PR job
// must not install dependencies, and release must be manual + environment
// gated.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = join(repoRoot, ".github", "workflows");

function readWorkflow(name) {
  return readFileSync(join(workflowsDir, name), "utf8");
}

test("all workflows pin every external action to a full SHA with a version comment", () => {
  const files = readdirSync(workflowsDir).filter((file) => file.endsWith(".yml"));
  assert.ok(files.length >= 3, "expected at least three workflows");
  for (const file of files) {
    const text = readWorkflow(file);
    assert.doesNotMatch(text, /pull_request_target/, `${file} must not use pull_request_target`);
    assert.doesNotMatch(text, /workflow_run/, `${file} must not use workflow_run`);
    const usesLines = text.split("\n").filter((line) => /^\s*uses:/.test(line));
    assert.ok(usesLines.length > 0, `${file} must use at least one action`);
    for (const line of usesLines) {
      assert.match(line, /^\s*uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/, `${file}: unpinned action -> ${line.trim()}`);
    }
    if (/actions\/checkout@/.test(text)) {
      assert.match(text, /persist-credentials: false/, `${file}: checkout must not persist credentials`);
    }
  }
});

test("CI workflow covers push/PR/manual/schedule with read-only permissions and audits", () => {
  const text = readWorkflow("test.yml");
  assert.match(text, /^on:/m);
  assert.match(text, /\n {2}push:\n/);
  assert.match(text, /\n {2}pull_request:\n/);
  assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.match(text, /\n {2}schedule:\n/);
  assert.match(text, /permissions:\n {2}contents: read/);
  assert.doesNotMatch(text, /secrets\./, "PR CI must not use secrets");
  assert.match(text, /npm ci --ignore-scripts/);
  assert.match(text, /npm run check/);
  assert.match(text, /npm run contracts:check/);
  assert.match(text, /npm run verify:production/);
  assert.match(text, /npm audit --audit-level=high/);
  assert.match(text, /npm audit --omit=dev --audit-level=high/);
  assert.match(text, /name: ci-diagnostics\n\s+path: diagnostics\/\n/);
  assert.doesNotMatch(text, /path: \*\*/);
});

test("check-upstream stages a read-only candidate and applies it in a write-scoped job without installs", () => {
  const text = readWorkflow("check-upstream.yml");
  assert.match(text, /\n {2}schedule:\n/);
  assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(text, /\n {2}push:\n/);
  assert.doesNotMatch(text, /\n {2}pull_request:\n/);
  assert.match(text, /concurrency:\n {2}group: check-upstream\n {2}cancel-in-progress: false/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /node scripts\/check-upstream\.mjs --apply --out-dir \.maintenance-candidate/);
  assert.match(text, /node scripts\/workflow\/candidate-status\.mjs/);
  assert.match(text, /steps\.candidate\.outputs\.has_candidate == 'true'/);
  assert.match(text, /contents: write/);
  assert.match(text, /pull-requests: write/);
  assert.match(text, /draft: always-true/);
  assert.match(text, /branch: maintenance\/upstream-update/);

  const validateIndex = text.indexOf("node scripts/validate-candidate.mjs --artifact .maintenance-candidate/candidate.json --repo . --apply");
  const prIndex = text.indexOf("peter-evans/create-pull-request@");
  assert.ok(validateIndex > 0 && prIndex > validateIndex, "candidate must be validated before any token/PR step");

  const privileged = text.slice(text.indexOf("open-pr:"));
  assert.doesNotMatch(privileged, /npm (ci|install)/, "write-scoped job must never install dependencies");
  assert.doesNotMatch(privileged, /check-upstream\.mjs --apply/, "write-scoped job must not run the generation flow");
});

test("release workflow is manual-only, environment gated, and never publishes to npm", () => {
  const text = readWorkflow("release.yml");
  assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(text, /\n {2}push:\n/);
  assert.doesNotMatch(text, /\n {2}pull_request:\n/);
  assert.doesNotMatch(text, /\n {2}schedule:\n/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /environment: release/);
  assert.match(text, /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/);
  assert.match(text, /node scripts\/create-release\.mjs --verify-only/);
  assert.match(text, /node scripts\/create-release\.mjs$/m);
  assert.match(text, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(text, /npm publish/);
  const releaseJob = text.slice(text.indexOf("  release:"));
  assert.doesNotMatch(releaseJob, /npm (ci|install|run)/, "release job must not execute dependencies");
});

test("dependabot keeps action pins fresh and ignores upstream engine bumps", () => {
  const text = readFileSync(join(repoRoot, ".github", "dependabot.yml"), "utf8");
  assert.match(text, /package-ecosystem: github-actions/);
  assert.match(text, /package-ecosystem: npm/);
  for (const name of ["pi-web-access", "@juicesharp/rpiv-todo", "@juicesharp/rpiv-i18n", "@tintinweb/pi-subagents"]) {
    assert.ok(text.includes(`dependency-name: "${name}"`), `dependabot must ignore ${name}`);
  }
});

test("finished docs/manifests have no phase scaffold language and document setup boundaries", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const manifest = readFileSync(join(repoRoot, "maintenance/manifest.json"), "utf8");
  const setupDoc = readFileSync(join(repoRoot, "docs", "actions-setup.md"), "utf8");
  const maintenanceDoc = readFileSync(join(repoRoot, "docs", "maintenance.md"), "utf8");
  assert.doesNotMatch(readme, /phase\s*[12]/i);
  assert.doesNotMatch(manifest, /"?phase"?/);
  assert.match(readme, /docs\/maintenance\.md/);
  assert.match(readme, /docs\/actions-setup\.md/);
  assert.match(setupDoc, /Approve workflows to run/);
  assert.match(setupDoc, /不是[\s\S]{0,10}操作系统级沙箱/);
  assert.match(setupDoc, /triggering-a-workflow/);
  assert.match(setupDoc, /secure-use/);
  assert.match(maintenanceDoc, /manual reuse review/);
  assert.match(maintenanceDoc, /最小改动/);
});

test("root packaging ships LICENSE and docs guides", () => {
  const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  for (const required of ["LICENSE", "docs/"]) {
    assert.ok(rootPackage.files.includes(required), `root package files must include ${required}`);
  }
  assert.ok(rootPackage.scripts["maintenance:plan"], "root must expose maintenance:plan");
  assert.ok(rootPackage.scripts["maintenance:stage"], "root must expose maintenance:stage");
});
