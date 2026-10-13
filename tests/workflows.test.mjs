// Offline guardrails for workflow permissions, execution and installation.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = join(repoRoot, ".github/workflows");
const read = (path) => readFileSync(join(repoRoot, path), "utf8").replaceAll("\r\n", "\n");
const workflow = (name) => read(`.github/workflows/${name}`);
function job(text, name, next) {
  const start = text.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `missing ${name}`);
  const end = next ? text.indexOf(`\n  ${next}:\n`, start + 1) : text.length;
  assert.ok(end > start);
  return text.slice(start, end);
}

test("every action is SHA-pinned and checkouts never persist credentials", () => {
  for (const file of readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"))) {
    const text = workflow(file);
    assert.doesNotMatch(text, /pull_request_target|workflow_run/);
    for (const line of text.split("\n").filter((line) => /^\s*(?:-\s+)?uses:/.test(line))) {
      assert.match(line, /^\s*(?:-\s+)?uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/, `${file}: ${line}`);
    }
    const checkouts = text.split(/uses: actions\/checkout@/).slice(1);
    for (const part of checkouts) assert.match(part.split(/\n\s+- (?:uses|name|run|id):/)[0], /persist-credentials: false/);
  }
});

test("hidden artifact bundles explicitly opt in without uploading the whole checkout", () => {
  const allowed = new Set([
    ".maintenance-candidate/", ".maintenance-candidate/diagnostics/",
    ".maintenance-candidate/adapted.json", ".maintenance-candidate/verified.json",
    ".maintenance-candidate/verification/", ".release-assets/",
  ]);
  const found = new Set();
  for (const file of readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"))) {
    for (const step of workflow(file).split(/\n {6}- /).slice(1)) {
      if (!step.startsWith("uses: actions/upload-artifact@")) continue;
      const path = step.match(/^ {10}path: (.+)$/m)?.[1];
      if (path && /(?:^|\/)\.[^/]+/.test(path)) {
        assert.match(step, /^ {10}include-hidden-files: true$/m, `${file}: ${path} would be silently excluded`);
        found.add(path);
      }
      if (/^ {10}include-hidden-files: true$/m.test(step)) {
        assert.ok(allowed.has(path), `${file}: hidden uploads must stay scoped to a known no-secret artifact`);
        assert.doesNotMatch(step, /secrets\./);
        assert.match(step, /^ {10}retention-days: 7$/m);
      }
    }
  }
  assert.deepEqual(found, allowed);
});

test("CI remains read-only, secret-free and covers complete verification", () => {
  const text = workflow("test.yml");
  for (const event of ["push", "pull_request", "workflow_dispatch"]) assert.match(text, new RegExp(`\\n {2}${event}:\\n`));
  assert.doesNotMatch(text, /\n {2}schedule:\n/);
  assert.match(text, /permissions:\n {2}contents: read/);
  assert.doesNotMatch(text, /secrets\./);
  assert.match(text, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(text, /name: all-platforms-pass/);
  assert.match(text, /needs: check\n\s+if: always\(\)/);
  for (const command of ["npm ci --ignore-scripts", "npm run check", "npm run test:maintenance-pipeline", "npm run contracts:check", "npm run verify:production", "npm audit --audit-level=high", "npm audit --omit=dev --audit-level=high"]) assert.ok(text.includes(command));
});

test("upstream detection, restricted adaptation, independent verification and PR writing are isolated", () => {
  const text = workflow("check-upstream.yml");
  assert.doesNotMatch(text, /\n {2}schedule:\n/);
  assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(text, /\n {2}(?:push|pull_request):\n/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  const probe = job(text, "model-probe", "detect");
  assert.match(text, /model_probe_only:[\s\S]{0,200}default: false/);
  assert.match(probe, /inputs\.model_probe_only == true/);
  assert.match(probe, /timeout-minutes: 3/);
  assert.match(probe, /automate-maintenance\.mjs probe-model/);
  assert.match(probe, /secrets\.MAINTENANCE_API_KEY/);
  assert.doesNotMatch(probe, /secrets\.GITHUB_TOKEN|contents: write|pull-requests: write|upload-artifact/);
  const detect = job(text, "detect", "adapt");
  const adapt = job(text, "adapt", "verify");
  const verify = job(text, "verify", "open-pr");
  const privileged = job(text, "open-pr");
  assert.match(detect, /inputs\.model_probe_only != true/);
  assert.match(detect, /automate-maintenance\.mjs prepare/);
  assert.doesNotMatch(detect, /secrets\.|contents: write|pull-requests: write/);
  assert.match(adapt, /secrets\.MAINTENANCE_API_KEY/);
  assert.match(adapt, /automate-maintenance\.mjs adapt/);
  assert.doesNotMatch(adapt, /secrets\.GITHUB_TOKEN|contents: write|pull-requests: write/);
  assert.match(verify, /automate-maintenance\.mjs verify/);
  assert.match(verify, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(verify, /matrix\.os == 'ubuntu-latest'/);
  assert.doesNotMatch(verify, /secrets\.|contents: write|pull-requests: write/);
  assert.match(privileged, /needs\.verify\.outputs\.verified == 'true'/);
  assert.match(privileged, /contents: write/);
  assert.match(privileged, /pull-requests: write/);
  assert.match(privileged, /automate-maintenance\.mjs apply/);
  assert.ok(privileged.indexOf("automate-maintenance.mjs apply") < privileged.indexOf("peter-evans/create-pull-request@"));
  assert.doesNotMatch(privileged, /npm (ci|install|run)|MAINTENANCE_API_KEY/);
  assert.match(privileged, /draft: always-true/);
  assert.match(privileged, /branch: maintenance\/upstream-update/);
  const runner = read("scripts/lib/maintenance-agent.mjs");
  assert.match(runner, /modelsPath: null/);
  assert.match(runner, /SessionManager\.inMemory/);
  assert.match(runner, /customTools: controls\.tools/);
  assert.doesNotMatch(read("scripts/lib/maintenance-tools.mjs"), /from "node:child_process"|createBashTool|process\.env|fetch\(/);
});

test("reviewed version bumps auto-release, privileged jobs never execute dependencies", () => {
  const text = workflow("release.yml");
  assert.match(text, /\n {2}push:\n {4}branches: \[main\]/);
  assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(text, /\n {2}(?:pull_request|schedule):\n/);
  assert.match(text, /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/);
  const plan = job(text, "plan", "verify");
  const verify = job(text, "verify", "release");
  const release = job(text, "release");
  assert.match(plan, /release-plan\.mjs --run/);
  assert.match(plan, /fetch-depth: 0/);
  assert.match(verify, /needs\.plan\.outputs\.should_release == 'true'/);
  assert.match(verify, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(verify, /create-release\.mjs --verify-only/);
  assert.match(verify, /release-assets\.mjs --build/);
  assert.doesNotMatch(verify, /secrets\./);
  assert.match(release, /environment: release/);
  assert.match(release, /contents: write/);
  assert.match(release, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(release, /create-release\.mjs --assets-dir/);
  assert.doesNotMatch(release, /npm (ci|install|run|publish)/);
  assert.doesNotMatch(text, /\n  npm:|PUBLISH_NPM|NPM_TOKEN|npm-publish|publish-packages/);
});

test("only supported workflows remain; obsolete bots, probes and npm publishing are pruned", () => {
  assert.deepEqual(readdirSync(workflowsDir).filter((name) => name.endsWith(".yml")).sort(), ["check-upstream.yml", "release.yml", "test.yml"]);
  assert.ok(!existsSync(join(repoRoot, ".github/dependabot.yml")));
  assert.ok(!existsSync(join(repoRoot, "scripts/publish-packages.mjs")));
});

test("public README owns installation and Actions setup; docs retain maintainer details", () => {
  const readme = read("README.md");
  const maintenance = read("docs/maintenance.md");
  assert.doesNotMatch(readme, /phase\s*[12]|你审查|你确认|你的电脑|不自动合并|VPS|tmux/i);
  assert.match(readme, /docs\/maintenance\.md/);
  assert.match(readme, /安装和使用扩展不需要配置 Actions/);
  for (const name of ["MAINTENANCE_API_KEY", "MAINTENANCE_PROVIDER", "MAINTENANCE_MODEL", "MAINTENANCE_BASE_URL", "MAINTENANCE_API", "MAINTENANCE_THINKING"]) {
    assert.ok(readme.includes(name), `README missing ${name}`);
  }
  assert.match(readme, /02:23 UTC/);
  assert.match(readme, /北京时间 10:23/);
  assert.match(readme, /docs\/local-scheduler\.md/);
  assert.match(readme, /dispatch-workflows\.mjs/);
  assert.doesNotMatch(readme, /04:17 UTC|北京时间 12:17/);
  assert.match(readme, /Release notes 复用适配 agent/);
  assert.doesNotMatch(readme, /高负载|事件可能被丢弃|没有运行记录不等于/);
  assert.match(readme, /没有上游更新时不调用模型/);
  assert.match(readme, /不发布 npm 包/);
  assert.doesNotMatch(readme, /pi install npm:|NPM_TOKEN|PUBLISH_NPM/);
  assert.doesNotMatch(readme, /sub2api\.amox\.cc|gpt-6\.1-sol/);
  assert.ok(!existsSync(join(repoRoot, "docs/actions-setup.md")), "obsolete Actions setup page should be removed");
  assert.match(maintenance, /最小改动/);
  assert.match(maintenance, /Approve workflows to run/);
  assert.match(maintenance, /不是[\s\S]{0,10}操作系统级沙箱/);
  assert.doesNotMatch(maintenance, /你审查|你确认|Settings →|## 自动流程/);
  const manifest = JSON.parse(read("maintenance/manifest.json"));
  for (const entry of manifest.packages) {
    assert.ok(readme.includes(`node scripts/install-extension.mjs ${entry.id}`));
    assert.ok(readme.includes(`${entry.path}/README.zh-CN.md`));
    for (const file of ["README.md", "README.zh-CN.md"]) {
      const doc = read(`${entry.path}/${file}`);
      assert.doesNotMatch(doc, /pi install git:|phase 1/);
      assert.ok(doc.includes(`node scripts/install-extension.mjs ${entry.id}`));
    }
  }
  assert.doesNotMatch(readme, /pi install git:/);
});

test("README and maintainer docs keep local links and anchors valid", () => {
  const documents = ["README.md", ...readdirSync(join(repoRoot, "docs")).filter((file) => file.endsWith(".md")).map((file) => `docs/${file}`)];
  for (const file of documents) {
    for (const [, href] of read(file).matchAll(/\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:\/\//i.test(href)) continue;
      const [target, anchor] = href.split("#");
      const path = target ? resolve(repoRoot, dirname(file), decodeURIComponent(target)) : join(repoRoot, file);
      assert.ok(existsSync(path), `${file}: missing link target ${href}`);
      if (anchor) {
        const headings = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => /^#+ /.test(line))
          .map((line) => line.replace(/^#+ /, "").trim().toLowerCase().replace(/ /g, "-"));
        assert.ok(headings.includes(decodeURIComponent(anchor)), `${file}: missing anchor ${href}`);
      }
    }
  }
});

test("official registry is pinned and no lockfile download uses the old mirror", () => {
  assert.equal(read(".npmrc").trim(), "registry=https://registry.npmjs.org/");
  assert.match(read(".gitattributes"), /\* text=auto eol=lf/);
  const lock = JSON.parse(read("package-lock.json"));
  for (const record of Object.values(lock.packages)) {
    if (record.resolved?.startsWith("http")) assert.ok(record.resolved.startsWith("https://registry.npmjs.org/"), record.resolved);
  }
});

test("daily scheduling has one local entry point and no native GitHub cron", () => {
  for (const file of readdirSync(workflowsDir)) {
    assert.doesNotMatch(workflow(file), /\n {2}schedule:|cron:|schedule-probe|trigger-diagnostic/);
  }
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["maintenance:dispatch"], "node scripts/dispatch-workflows.mjs");
  const scheduler = read("scripts/dispatch-workflows.mjs");
  assert.match(scheduler, /flock/);
  assert.match(scheduler, /workflow_run_id/);
  assert.match(scheduler, /run\.conclusion !== "success"/);
  assert.doesNotMatch(scheduler, /pi --print|MAINTENANCE_API_KEY|secrets\./);
});
