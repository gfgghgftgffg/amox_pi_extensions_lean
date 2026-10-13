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
  for (const event of ["push", "pull_request", "workflow_dispatch", "schedule"]) assert.match(text, new RegExp(`\\n {2}${event}:\\n`));
  assert.match(text, /permissions:\n {2}contents: read/);
  assert.doesNotMatch(text, /secrets\./);
  assert.match(text, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(text, /name: all-platforms-pass/);
  assert.match(text, /needs: check\n\s+if: always\(\)/);
  for (const command of ["npm ci --ignore-scripts", "npm run check", "npm run test:maintenance-pipeline", "npm run contracts:check", "npm run verify:production", "npm audit --audit-level=high", "npm audit --omit=dev --audit-level=high"]) assert.ok(text.includes(command));
});

test("upstream detection, restricted adaptation, independent verification and PR writing are isolated", () => {
  const text = workflow("check-upstream.yml");
  assert.match(text, /\n {2}schedule:\n/);
  assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(text, /\n {2}(?:push|pull_request):\n/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  const detect = job(text, "detect", "adapt");
  const adapt = job(text, "adapt", "verify");
  const verify = job(text, "verify", "open-pr");
  const privileged = job(text, "open-pr");
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
  const release = job(text, "release", "npm");
  const npm = job(text, "npm");
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
  assert.match(npm, /vars\.PUBLISH_NPM == 'true'/);
  assert.match(npm, /environment: npm-publish/);
  assert.match(npm, /secrets\.NPM_TOKEN/);
  assert.doesNotMatch(npm, /npm (ci|install|run)|contents: write|MAINTENANCE_API_KEY/);
  assert.match(npm, /publish-packages\.mjs/);
  const publisher = read("scripts/publish-packages.mjs");
  assert.match(publisher, /"--ignore-scripts"/);
  assert.match(publisher, /validateReleaseAssets/);
});

test("dependabot cannot bypass controlled upstream engine upgrades", () => {
  const text = read(".github/dependabot.yml");
  assert.match(text, /package-ecosystem: github-actions/);
  for (const name of ["pi-web-access", "@juicesharp/rpiv-todo", "@juicesharp/rpiv-i18n", "@tintinweb/pi-subagents"]) assert.ok(text.includes(`dependency-name: "${name}"`));
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
  assert.match(readme, /04:17 UTC/);
  assert.match(readme, /北京时间 10:23/);
  assert.match(readme, /北京时间 12:17/);
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

test("daily cron stays stable and temporary probes cannot execute maintenance or full CI", () => {
  for (const [file, daily, first] of [["check-upstream.yml", "23 2 * * *", "detect"], ["test.yml", "17 4 * * *", "check"]]) {
    const text = workflow(file);
    const crons = [...text.matchAll(/^    - cron: "([^"]+)"$/gm)].map((match) => match[1]);
    assert.equal(crons[0], daily);
    if (crons.length === 1) {
      assert.doesNotMatch(text, /schedule-probe|Temporary registration probe/);
      continue;
    }
    assert.equal(crons.length, 2, "only one bounded temporary probe is allowed");
    const probe = job(text, "schedule-probe", first);
    assert.ok(probe.includes(`github.event_name == 'schedule' && github.event.schedule == '${crons[1]}'`));
    assert.match(probe, /timeout-minutes: 2/);
    assert.match(probe, /date -u/);
    assert.doesNotMatch(probe, /secrets\.|vars\.|uses:|npm |node |automate-maintenance/);
    assert.ok(job(text, first, first === "detect" ? "adapt" : "all-platforms").includes(`github.event.schedule != '${crons[1]}'`));
    if (first === "check") {
      assert.ok(job(text, "all-platforms").includes(`github.event.schedule != '${crons[1]}'`));
      assert.ok(text.includes("github.event.schedule || 'normal'"), "probe must not cancel a real CI run");
    }
  }
});
