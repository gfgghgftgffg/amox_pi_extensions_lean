// Guardrails for the two remaining workflows; no model/candidate workflow.
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
  const start = text.indexOf(`\n  ${name}:\n`), end = next ? text.indexOf(`\n  ${next}:\n`, start + 1) : text.length;
  assert.ok(start > 0 && end > start, `missing ${name}`); return text.slice(start, end);
}
test("every action is SHA-pinned and checkouts never persist credentials", () => {
  for (const file of readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"))) {
    const text = workflow(file);
    assert.doesNotMatch(text, /pull_request_target|workflow_run/);
    for (const line of text.split("\n").filter((line) => /^\s*(?:-\s+)?uses:/.test(line))) {
      assert.match(line, /^\s*(?:-\s+)?uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/, `${file}: ${line}`);
    }
    for (const part of text.split(/uses: actions\/checkout@/).slice(1)) assert.match(part.split(/\n\s+- (?:uses|name|run|id):/)[0], /persist-credentials: false/);
  }
});
test("hidden release uploads stay scoped to validated archives", () => {
  const text = workflow("release.yml");
  assert.match(text, /path: \.release-assets\//);
  assert.match(text, /include-hidden-files: true/);
  assert.match(text, /retention-days: 7/);
  assert.doesNotMatch(workflow("test.yml"), /include-hidden-files: true/);
});
test("CI remains read-only, secret-free and verifies the exact candidate on all platforms", () => {
  const text = workflow("test.yml");
  for (const event of ["push", "pull_request", "workflow_dispatch"]) assert.match(text, new RegExp(`\\n {2}${event}:\\n`));
  assert.match(text, /permissions:\n {2}contents: read/); assert.doesNotMatch(text, /secrets\./);
  assert.match(text, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(text, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(text, /name: all-platforms-pass/); assert.match(text, /needs: check\n\s+if: always\(\)/);
  for (const command of ["npm ci --ignore-scripts", "npm run check", "npm run contracts:check", "npm run verify:production", "npm audit --audit-level=high", "npm audit --omit=dev --audit-level=high"]) assert.ok(text.includes(command));
  assert.doesNotMatch(text, /maintenance-pipeline|maintenance-candidate|adapted\.json|verified\.json/);
});
test("reviewed version bumps auto-release with isolated GitHub-write and npm-OIDC jobs", () => {
  const text = workflow("release.yml");
  assert.match(text, /\n {2}push:\n {4}branches: \[main\]/); assert.match(text, /\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(text, /\n {2}(?:pull_request|schedule):\n/);
  assert.match(text, /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/);
  const plan = job(text, "plan", "verify"), verify = job(text, "verify", "release"), release = job(text, "release", "npm"), npm = job(text, "npm");
  assert.match(plan, /release-plan\.mjs --run/); assert.match(plan, /fetch-depth: 0/);
  assert.match(verify, /needs\.plan\.outputs\.should_release == 'true'/);
  assert.match(verify, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(verify, /create-release\.mjs --verify-only/); assert.match(verify, /release-assets\.mjs --build/);
  assert.doesNotMatch(verify, /secrets\./);
  assert.match(release, /environment: release/); assert.match(release, /contents: write/);
  assert.match(release, /ref: \$\{\{ github\.sha \}\}/); assert.match(release, /create-release\.mjs --assets-dir/);
  assert.doesNotMatch(release, /npm (ci|install|run|publish)|id-token:/);
  assert.match(npm, /needs: \[plan, verify, release\]/);
  assert.match(npm, /runs-on: ubuntu-latest/); assert.match(npm, /environment: release/);
  assert.match(npm, /contents: read/); assert.doesNotMatch(npm, /contents: write|secrets\./);
  assert.match(npm, /id-token: write/); assert.equal((text.match(/id-token: write/g) || []).length, 1);
  assert.match(npm, /ref: \$\{\{ github\.sha \}\}/); assert.match(npm, /EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(npm, /node-version: "22\.22\.1"/); assert.match(npm, /package-manager-cache: false/);
  assert.match(npm, /npm install --global --ignore-scripts --registry=https:\/\/registry\.npmjs\.org\/ npm@11\.15\.0/);
  assert.match(npm, /name: release-assets/); assert.match(npm, /publish-npm\.mjs --assets-dir \.release-assets --publish/);
  assert.doesNotMatch(npm, /npm (ci|run|publish)|npm install --(?:prefix|workspace)/);
  assert.doesNotMatch(text, /PUBLISH_NPM|NPM_TOKEN|NODE_AUTH_TOKEN|publish-packages/);
});
test("retired maintenance workflows, artifacts, probes and dispatcher are removed", () => {
  assert.deepEqual(readdirSync(workflowsDir).filter((name) => name.endsWith(".yml")).sort(), ["release.yml", "test.yml"]);
  for (const file of [".github/dependabot.yml", "scripts/dispatch-workflows.mjs", "scripts/automate-maintenance.mjs", "scripts/validate-candidate.mjs", "scripts/lib/adapted-candidate.mjs", "scripts/publish-packages.mjs"]) assert.ok(!existsSync(join(repoRoot, file)));
  for (const file of readdirSync(workflowsDir)) assert.doesNotMatch(workflow(file), /\n {2}schedule:|cron:|MAINTENANCE_API_KEY|model_probe_only/);
});
test("public docs describe local Pi, reviewed npm publication and independent installation", () => {
  const readme = read("README.zh-CN.md"), english = read("README.md"), maintenance = read("docs/maintenance.md"), scheduler = read("docs/local-scheduler.md");
  assert.match(english, /\[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(readme, /\[English\]\(README\.md\)/);
  assert.match(english, /no model calls when there are no upstream updates/);
  assert.match(english, /02:23 UTC \(10:23 Beijing time\)/);
  assert.match(english, /pi update --extensions/); assert.match(english, /one-time npm setup/);
  assert.match(english, /docs\/npm-publishing\.md/);
  assert.match(readme, /安装和使用扩展不需要配置 Actions/); assert.match(readme, /没有上游更新.*不调用模型/);
  assert.match(readme, /02:23 UTC/); assert.match(readme, /北京时间 10:23/); assert.match(readme, /docs\/local-scheduler\.md/);
  assert.match(readme, /Release notes 复用本地 Pi/); assert.match(readme, /首次 npm 配置/);
  assert.match(readme, /pi update --extensions/); assert.match(readme, /docs\/npm-publishing\.zh-CN\.md/);
  for (const file of ["docs/npm-publishing.md", "docs/npm-publishing.zh-CN.md"]) {
    const guide = read(file); assert.match(guide, /release\.yml/); assert.match(guide, /Re-run failed jobs/);
    assert.match(guide, /--fetch-retries=0/); assert.match(guide, /npm publish/); assert.match(guide, /2 (days|天)/);
    assert.doesNotMatch(guide, /npm login|npm whoami|Use npm account|使用 npm 账号|Confirm the account/);
  }
  for (const doc of [readme, english]) assert.doesNotMatch(doc, /sub2api\.amox\.cc|gpt-6\.1-sol|MAINTENANCE_API_KEY|dispatch-workflows/);
  assert.match(maintenance, /最小改动/); assert.match(maintenance, /Approve workflows to run/);
  assert.match(maintenance, /不是操作系统级沙箱/); assert.match(scheduler, /bubblewrap/);
  assert.match(maintenance, /README 只描述当前/); assert.match(read("maintenance/daily-update.md"), /更新现有段落，不追加逐版本升级历史/);
  assert.match(scheduler, /同一.*候选/); assert.match(scheduler, /固定主机自动合并/);
  assert.match(english, /head-SHA condition/); assert.match(readme, /以 head SHA 为条件单次合并/);
  for (const entry of JSON.parse(read("maintenance/manifest.json")).packages) {
    for (const doc of [english, readme]) assert.ok(doc.includes(`pi install npm:${entry.packageName}`));
    assert.ok(english.includes(`node scripts/install-extension.mjs ${entry.id}`));
    assert.ok(readme.includes(`node scripts/install-extension.mjs ${entry.id}`));
    assert.ok(readme.includes(`${entry.path}/README.zh-CN.md`));
    for (const file of ["README.md", "README.zh-CN.md"]) {
      const doc = read(`${entry.path}/${file}`); assert.doesNotMatch(doc, /pi install git:|phase 1/);
      assert.ok(doc.includes(`node scripts/install-extension.mjs ${entry.id}`));
      assert.ok(doc.includes(`pi install npm:${entry.packageName}`)); assert.ok(doc.includes("pi update --extensions"));
      assert.doesNotMatch(doc, /^#{1,6} .*?(?:reviewed upgrade|previous upgrade|lean-author review|upgrade history|change ?log|release notes|本次审查|历史审查|作者审查|已审核升级|升级历史|更新日志)/im);
      assert.match(doc, /\[MAINTENANCE\.md\]\(MAINTENANCE\.md\)/);
    }
  }
});
test("README and maintainer docs keep local links and anchors valid", () => {
  const documents = ["README.md", "README.zh-CN.md", ...readdirSync(join(repoRoot, "docs")).filter((file) => file.endsWith(".md")).map((file) => `docs/${file}`)];
  for (const file of documents) for (const [, href] of read(file).matchAll(/\]\(([^)]+)\)/g)) {
    if (/^[a-z]+:\/\//i.test(href)) continue;
    const [target, anchor] = href.split("#"), path = target ? resolve(repoRoot, dirname(file), decodeURIComponent(target)) : join(repoRoot, file);
    assert.ok(existsSync(path), `${file}: missing ${href}`);
    if (anchor) {
      const headings = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => /^#+ /.test(line))
        .map((line) => line.replace(/^#+ /, "").trim().toLowerCase().replace(/ /g, "-"));
      assert.ok(headings.includes(decodeURIComponent(anchor)), `${file}: missing ${href}`);
    }
  }
});
test("official registry and fixed lockfile download surface remain enforced", () => {
  assert.equal(read(".npmrc").trim(), "registry=https://registry.npmjs.org/"); assert.match(read(".gitattributes"), /\* text=auto eol=lf/);
  for (const record of Object.values(JSON.parse(read("package-lock.json")).packages)) if (record.resolved?.startsWith("http")) assert.ok(record.resolved.startsWith("https://registry.npmjs.org/"), record.resolved);
});
test("one daily local Pi entry point has locking and bounded execution, not dispatch", () => {
  const pkg = JSON.parse(read("package.json")); assert.equal(pkg.scripts["maintenance:local"], "node scripts/local-maintenance.mjs --run");
  const runner = read("scripts/local-maintenance.mjs"); assert.match(runner, /flock/); assert.match(runner, /120m/); assert.match(runner, /gate\.verified\(\)/);
  assert.doesNotMatch(runner, /workflow_run_id|workflow_dispatch|--force/);
  assert.match(runner, /api\.mergeVerified/); assert.match(runner, /gate\.verified\(\) !== sha/);
  const publisher = read("scripts/lib/github-maintenance.mjs");
  assert.match(publisher, /draft: false/); assert.match(publisher, /method: "PUT", body: \{ sha, merge_method: "merge" \}/);
  assert.match(publisher, /once: true, pullNumber: pull\.number/);
  assert.match(read("scripts/lib/local-pi.mjs"), /SessionManager\.inMemory/);
  assert.match(read("scripts/systemd/amox-pi-actions.timer"), /OnCalendar=\*-\*-\* 02:23:00 UTC/);
  assert.match(read("scripts/systemd/amox-pi-actions.service"), /local-maintenance\.mjs --run/);
  assert.doesNotMatch(read("scripts/systemd/amox-pi-actions.service"), /EnvironmentFile|Restart=always/);
});
