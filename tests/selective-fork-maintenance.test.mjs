import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadRepoState } from "../scripts/check-upstream.mjs";
import { buildUpdatePlan, applyPlanToManifest, buildUpdateReport } from "../scripts/lib/upstream-plan.mjs";
import { fetchUpstreamMetadata, requiredGitUrls } from "../scripts/lib/upstream-metadata.mjs";
import { maintenancePackageIds } from "../scripts/lib/package-selection.mjs";
import { adapterWritable, nextPatch } from "../scripts/lib/files.mjs";
import { createForkReviewTools, createLocalTools } from "../scripts/lib/local-pi.mjs";
import { assertForkPolicy, changedSourceFiles, deferForkReview, fetchPublishedSource, publishedTextFiles, reviewSelectiveForks, validateForkReview } from "../scripts/lib/fork-review.mjs";
import { validateForkPort } from "../scripts/lib/local-checks.mjs";
import { RemoteHttpError } from "../scripts/lib/remote-errors.mjs";
import { stageVersions } from "../scripts/local-maintenance.mjs";
import { completion, send } from "../scripts/notify-maintenance.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const state = loadRepoState(root), fork = state.manifest.packages.find(e => e.id === "amox-pi-sync");
function metadata(version = fork.upstreamVersion) {
  const npm = {}, git = {};
  for (const entry of state.manifest.packages) {
    if (entry.maintenanceMode === "selective-fork") { npm[entry.upstreamPackage] = { latestStable: version }; continue; }
    for (const [name, version] of Object.entries(state.workspaces.find(w => w.id === entry.id).pkg.dependencies)) npm[name] = { latestStable: version, gitHead: entry.upstreamGitHead };
    git[entry.upstreamRepository] = { head: entry.upstreamGitHead ?? "a".repeat(40) };
    if (entry.leanRepository) git[entry.leanRepository] = { head: entry.leanCommit };
  }
  return { npm, git };
}
const planFor = version => buildUpdatePlan({ ...state, metadata: metadata(version) });
const decision = (value, area = value === "skip" ? "removed-feature" : "raw-sync", files = ["core.ts"]) => ({ changes: [{ decision: value, area, files, reason: "具体源码表明这是对应功能的改动，需要按现有功能边界处理。" }] });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "amox-fork-review-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, "repo"), stateRoot = join(dir, "state"), runDir = join(dir, "run");
  mkdirSync(join(repo, fork.path), { recursive: true }); mkdirSync(stateRoot); mkdirSync(runDir);
  writeFileSync(join(repo, fork.path, "MAINTENANCE.md"), "Keep raw data, safety and Starline. Never restore config merging.\n");
  writeFileSync(join(repo, fork.path, "core.ts"), "// independent implementation\n");
  const source = async (_name, version) => ({ files: new Map([["core.ts", version === fork.upstreamVersion ? "// before\n" : "// after\n"]]), integrity: `fixture-${version}` });
  return { repo, stateRoot, runDir, manifest: state.manifest, plan: planFor("0.1.2"), source };
}

function archive(entries) {
  const blocks = [];
  for (const { path, content = "fixture\n", type = 48 } of entries) {
    const body = Buffer.from(content), h = Buffer.alloc(512);
    h.write(path, 0, 100); h.write("0000644\0", 100); h.write("0000000\0", 108); h.write("0000000\0", 116);
    h.write(body.length.toString(8).padStart(11, "0") + "\0", 124); h.write("00000000000\0", 136);
    h.fill(32, 148, 156); h[156] = type; h.write("ustar\0", 257); h.write("00", 263);
    const sum = h.reduce((a, b) => a + b, 0); h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(h, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
const integrity = data => `sha512-${createHash("sha512").update(data).digest("base64")}`;

test("selective sync watches published stable versions without a runtime dependency or moving Git HEAD", async () => {
  assert.equal(fork.maintenanceMode, "selective-fork");
  assert.equal(requiredGitUrls(state.manifest).includes(fork.upstreamRepository), false);
  assert.equal(planFor(fork.upstreamVersion).status, "no-update");
  const plan = planFor("0.1.2");
  assert.equal(plan.status, "fork-review"); assert.equal(plan.forkReviewRequired, true);
  assert.deepEqual(maintenancePackageIds(plan), []);
  assert.deepEqual(applyPlanToManifest(state.manifest, plan), state.manifest);
  assert.match(buildUpdateReport({ plan }), /amox-pi-sync.*SELECTIVE REVIEW/);
  assert.equal(planFor("0.1.0").status, "error");
  assert.equal(planFor("0.2.0-beta.1").status, "error");
  const requested = [];
  await fetchUpstreamMetadata({ ...state, fetchImpl: async url => {
    const name = decodeURIComponent(url.slice("https://registry.npmjs.org/".length)); requested.push(name);
    const info = metadata()["npm"][name];
    return { ok: true, json: async () => ({ "dist-tags": { latest: info.latestStable }, versions: { [info.latestStable]: { name, version: info.latestStable, ...(info.gitHead ? { gitHead: info.gitHead } : {}) } } }) };
  }, gitHeadResolver: url => { assert.notEqual(url, fork.upstreamRepository); return "a".repeat(40); } });
  assert.equal(requested.filter(name => name === "pi-sync-suite").length, 1);
});

test("fork decision covers all changed files and cannot silently skip retained behavior or port removed features", () => {
  assert.equal(validateForkReview(decision("port"), ["core.ts"]).decision, "port");
  assert.equal(validateForkReview(decision("skip"), ["core.ts"]).decision, "skip");
  assert.throws(() => validateForkReview(decision("skip", "backups"), ["core.ts"]), /silently skipped/);
  assert.throws(() => validateForkReview(decision("port", "removed-feature"), ["core.ts"]), /retained/);
  assert.throws(() => validateForkReview(decision("port"), ["core.ts", "index.ts"]), /Every changed/);
  assert.throws(() => validateForkReview(decision("port", "raw-sync", ["not-in-diff.ts"]), ["core.ts"]), /evidence/);
  const mixed = { changes: [...decision("port").changes, ...decision("ask", "uncertain").changes] };
  assert.equal(validateForkReview(mixed, ["core.ts"]).decision, "ask");
  assert.deepEqual(changedSourceFiles(new Map([["a.ts", "old"], ["deleted.ts", "x"]]), new Map([["a.ts", "new"], ["new.ts", "y"]])), ["a.ts", "deleted.ts", "new.ts"]);
});

for (const value of ["skip", "ask"]) test(`${value} is durably cached but never advances integrated baseline or selects sync for publication`, async t => {
  const f = fixture(t); let reviews = 0, downloads = 0;
  const source = async (...args) => { downloads++; return f.source(...args); };
  const review = async () => { reviews++; return decision(value); };
  const [first] = await reviewSelectiveForks({ ...f, source, review });
  assert.equal(first.decision, value); assert.equal(reviews, 1); assert.equal(downloads, 2);
  assert.deepEqual(maintenancePackageIds(f.plan), []);
  assert.deepEqual(applyPlanToManifest(f.manifest, f.plan), f.manifest);
  const [second] = await reviewSelectiveForks({ ...f, plan: planFor("0.1.2"), source, review });
  assert.equal(second.cached, true); assert.equal(reviews, 1); assert.equal(downloads, 2);
  const saved = JSON.parse(readFileSync(join(f.stateRoot, "fork-review-amox-pi-sync.json"), "utf8"));
  assert.equal(saved.from, fork.upstreamVersion); assert.equal(saved.to, "0.1.2"); assert.equal(saved.decision, value);
  writeFileSync(join(f.repo, fork.path, "MAINTENANCE.md"), "Updated owner policy requires another review.\n");
  await reviewSelectiveForks({ ...f, plan: planFor("0.1.2"), source, review });
  assert.equal(reviews, 2);
});

test("port is never cached as merged; later releases still compare against integrated baseline after a skip", async t => {
  const f = fixture(t), from = [];
  const source = async (...args) => { from.push(args[1]); return f.source(...args); };
  await reviewSelectiveForks({ ...f, source, review: async () => decision("skip") });
  const nextPlan = planFor("0.1.3");
  for (let i = 0; i < 2; i++) {
    const [report] = await reviewSelectiveForks({ ...f, source, plan: structuredClone(nextPlan), review: async () => decision("port") });
    assert.equal(report.decision, "port"); assert.equal(report.cached, undefined);
  }
  assert.deepEqual(from, [fork.upstreamVersion, "0.1.2", fork.upstreamVersion, "0.1.3", fork.upstreamVersion, "0.1.3"]);
  assert.equal(JSON.parse(readFileSync(join(f.stateRoot, "fork-review-amox-pi-sync.json"), "utf8")).decision, "skip");
});

test("uncertain sync does not block independently affected engine packages", async t => {
  const f = fixture(t);
  f.plan.packagePlans[0].versionChange = "bump";
  await reviewSelectiveForks({ ...f, review: async () => ({ changes: [...decision("port").changes, ...decision("ask", "uncertain").changes] }) });
  assert.equal(f.plan.forkPlans[0].decision, "ask");
  assert.deepEqual(maintenancePackageIds(f.plan), [f.plan.packagePlans[0].id]);
  assert.equal(adapterWritable(`${fork.path}/core.ts`, f.manifest, f.plan), false);
});

test("only an approved port enables fork source writes, baseline advancement and its independent version bump", async t => {
  const f = fixture(t);
  await reviewSelectiveForks({ ...f, review: async () => decision("port") });
  assert.deepEqual(maintenancePackageIds(f.plan), [fork.id]);
  for (const file of ["index.ts", "core.ts", "MAINTENANCE.md", "tests/focused.test.mjs"]) {
    assert.equal(adapterWritable(`${fork.path}/${file}`, f.manifest), false);
    assert.equal(adapterWritable(`${fork.path}/${file}`, f.manifest, f.plan), true);
  }
  assert.equal(adapterWritable(`${fork.path}/package.json`, f.manifest, f.plan), false);
  assert.equal(adapterWritable(`${fork.path}/arbitrary.ts`, f.manifest, f.plan), false);
  writeFileSync(join(f.repo, "package.json"), readFileSync(join(root, "package.json")));
  writeFileSync(join(f.repo, "package-lock.json"), "fixture lock\n"); mkdirSync(join(f.repo, "maintenance"));
  for (const workspace of state.workspaces) {
    mkdirSync(join(f.repo, workspace.path), { recursive: true });
    writeFileSync(join(f.repo, workspace.packageJsonPath), JSON.stringify(workspace.pkg));
  }
  const staged = await stageVersions({ work: f.repo, state: { ...state, plan: f.plan }, scratch: f.runDir, baseCommit: "b".repeat(40), execute: async () => ({ ok: true }) });
  assert.deepEqual(staged.packageIds, [fork.id]);
  const selected = staged.manifest.packages.find(e => e.id === fork.id);
  assert.equal(selected.version, nextPatch(fork.version)); assert.equal(selected.upstreamVersion, "0.1.2"); assert.equal(selected.upstreamRef, "npm:pi-sync-suite@0.1.2");
  assert.deepEqual(JSON.parse(readFileSync(join(f.repo, fork.path, "package.json"))).dependencies, {});
  for (const entry of state.manifest.packages.filter(e => e.id !== fork.id)) assert.deepEqual(staged.manifest.packages.find(e => e.id === entry.id), entry);
});

test("unverifiable published source or incomplete model judgement becomes an explicit owner decision", async t => {
  const f = fixture(t);
  const [unavailable] = await reviewSelectiveForks({ ...f, source: async () => { throw new Error("Unsupported archive"); }, review() { throw new Error("must not invoke model"); } });
  assert.equal(unavailable.decision, "ask"); assert.equal(unavailable.recheck, true);
  const [incomplete] = await reviewSelectiveForks({ ...f, plan: planFor("0.1.2"), review: async () => ({ changes: [] }) });
  assert.equal(incomplete.decision, "ask"); assert.equal(incomplete.recheck, true); assert.match(incomplete.changes[0].reason, /未产生完整/);
});

test("HTTP 503 from source or reviewer preserves the existing bounded server retry boundary", async t => {
  const f = fixture(t), error = new RemoteHttpError("fixture", { httpStatus: 503, phase: "upstream-read" });
  await assert.rejects(reviewSelectiveForks({ ...f, source: async () => { throw error; } }), e => e === error);
  await assert.rejects(reviewSelectiveForks({ ...f, review: async () => { throw error; } }), e => e === error);
  assert.equal(existsSync(join(f.stateRoot, "fork-review-amox-pi-sync.json")), false);
});

test("published archive parser verifies SHA-512 and rejects traversal, links, duplicates and corruption", () => {
  const good = archive([{ path: "package/core.ts", content: "export const data = 1;\n" }]);
  assert.equal(publishedTextFiles(good, integrity(good)).get("core.ts"), "export const data = 1;\n");
  assert.throws(() => publishedTextFiles(good, integrity(Buffer.from("bad"))), /integrity/);
  for (const entries of [[{ path: "package/../escape" }], [{ path: "package/link", type: 50 }], [{ path: "package/a" }, { path: "package/a" }]]) {
    const bad = archive(entries); assert.throws(() => publishedTextFiles(bad, integrity(bad)));
  }
  const binary = archive([{ path: "package/binary", content: "bad\0data" }]);
  assert.throws(() => publishedTextFiles(binary, integrity(binary)), /Non-text/);
});

test("source acquisition uses only exact registry versions and never executes package lifecycle hooks", async () => {
  const name = "pi-sync-suite", version = "0.1.2", data = archive([
    { path: "package/package.json", content: JSON.stringify({ name, version, scripts: { postinstall: "never run" } }) },
    { path: "package/core.ts", content: "// published source\n" },
  ]);
  const urls = [], tarball = "https://registry.npmjs.org/pi-sync-suite/-/pi-sync-suite-0.1.2.tgz";
  const source = await fetchPublishedSource(name, version, { fetchImpl: async (url, options) => {
    urls.push(url); assert.equal(options.redirect, "error");
    return new Response(url === tarball ? data : JSON.stringify({ name, version, dist: { tarball, integrity: integrity(data) } }));
  } });
  assert.deepEqual(urls, ["https://registry.npmjs.org/pi-sync-suite/0.1.2", tarball]); assert.equal(source.files.size, 2);
  await assert.rejects(fetchPublishedSource(name, version, { fetchImpl: async () => new Response(JSON.stringify({ name, version, dist: { tarball: "https://evil.invalid/archive.tgz" } })) }), /Untrusted/);
  await assert.rejects(fetchPublishedSource(name, version, { fetchImpl: async () => new Response(null, { status: 503 }) }), e => e instanceof RemoteHttpError && e.httpStatus === 503);
});

test("review tools are strictly read-only and require policy plus all changed before/after evidence", async t => {
  const f = fixture(t);
  await reviewSelectiveForks({ ...f, review: async () => decision("skip") });
  const reviewer = createForkReviewTools({ repo: f.repo, context: join(f.runDir, "context"), entry: fork, evidence: { changedFiles: ["core.ts"] } });
  assert.deepEqual(reviewer.tools.map(t => t.name), ["list", "read", "submit_review"]);
  const submit = reviewer.tools.find(t => t.name === "submit_review"), read = reviewer.tools.find(t => t.name === "read");
  assert.throws(() => reviewer.getReview(), /No structured/);
  await assert.rejects(submit.execute("1", decision("port")), /policy/);
  await assert.rejects(read.execute("1", { scope: "repo", path: ".git/config" }), /inventory/);
  await read.execute("1", { scope: "repo", path: `${fork.path}/MAINTENANCE.md` });
  await assert.rejects(submit.execute("1", decision("port")), /local fork implementation/);
  await read.execute("1", { scope: "repo", path: `${fork.path}/core.ts` });
  await assert.rejects(submit.execute("1", decision("port")), /changed published source/);
  for (const revision of ["before", "after"]) await read.execute("1", { scope: "upstream", path: `${fork.id}/upstream-${revision}/core.ts` });
  await submit.execute("1", decision("port")); assert.equal(reviewer.getReview().decision, "port");
  const tools = createLocalTools({ repo: f.repo, context: join(f.runDir, "context"), manifest: f.manifest, plan: planFor("0.1.2"), baseline: new Map(), gate: { invalidate() { throw new Error("Must not reach gate"); } } });
  await assert.rejects(tools.find(t => t.name === "write").execute("1", { path: `${fork.path}/core.ts`, content: "unsafe" }), /Protected/);
});

test("uncertainty discovered while porting pauses publication and persists an owner decision for later daily runs", async t => {
  const f = fixture(t), [report] = await reviewSelectiveForks({ ...f, review: async () => decision("port") });
  let invalidated = 0, requested;
  const tools = createLocalTools({ repo: f.repo, context: join(f.runDir, "context"), manifest: f.manifest, plan: f.plan, baseline: new Map(),
    gate: { invalidate() { invalidated++; }, check() { throw new Error("No check after owner pause"); } },
    onOwnerDecision(value) {
      requested = value;
      Object.assign(report, deferForkReview(f.stateRoot, report, value));
      f.plan.forkPlans[0].decision = "ask";
    } });
  const ask = tools.find(tool => tool.name === "ask_owner"); assert.ok(ask);
  const question = { packageId: fork.id, reason: "移植过程中发现并发覆盖策略存在无法自动确定的兼容性取舍。", files: [`${fork.path}/core.ts`] };
  await assert.rejects(ask.execute("a", { ...question, packageId: "pi-web-access-lean" }), /selected fork/);
  await assert.rejects(ask.execute("a", { ...question, files: ["package.json"] }), /selected fork/);
  const result = await ask.execute("a", question);
  assert.equal(result.terminate, true); assert.equal(invalidated, 1); assert.deepEqual(requested, question);
  assert.equal(report.decision, "ask");
  await assert.rejects(tools.find(tool => tool.name === "write").execute("a", { path: `${fork.path}/core.ts`, content: "bypass" }), /paused/);
  await assert.rejects(tools.find(tool => tool.name === "check").execute("a", { summary: "do not publish" }), /paused/);
  const [cached] = await reviewSelectiveForks({ ...f, plan: planFor("0.1.2"), review() { throw new Error("Must reuse pending report"); } });
  assert.equal(cached.cached, true); assert.equal(cached.deferredDuringAdaptation, true); assert.equal(cached.decision, "ask");
  const notice = await completion({ status: "fork-decision-required", forkReviews: [report], ownerDecision: question }, "success");
  assert.equal(notice.needsDecision, true); assert.match(notice.reason, /暂停当前候选/); assert.match(notice.reason, /并发覆盖策略/);
});

test("automatic adaptation cannot rewrite the owner's feature decisions", () => {
  const notes = "# Maintenance\n\n## 功能取舍与维护边界\nNever restore removed modules.\n\n## Repository integration\nSource review below.\n";
  assert.doesNotThrow(() => assertForkPolicy(notes, notes.replace("Source review below.", "Updated reviewed source ref.")));
  assert.throws(() => assertForkPolicy(notes, notes.replace("Never restore", "Always restore")), /owner's fork feature/);
  assert.throws(() => assertForkPolicy(notes, "Removed policy"), /Missing fork feature/);
});

test("fork release gate requires source and regression changes without a Git subprocess or platform PATH", t => {
  const f = fixture(t), baseline = new Map();
  mkdirSync(join(f.repo, fork.path, "tests"));
  writeFileSync(join(f.repo, fork.path, "index.ts"), "// existing entrypoint\n");
  writeFileSync(join(f.repo, fork.path, "tests/existing.test.mjs"), "// preserved assertion\n");
  for (const path of ["index.ts", "core.ts", "tests/existing.test.mjs"]) {
    const name = `${fork.path}/${path}`; baseline.set(name, { text: readFileSync(join(f.repo, name), "utf8") });
  }
  assert.equal(existsSync(join(f.repo, ".git")), false, "regression discovery must not require a Git checkout or Linux PATH");
  f.plan.forkPlans[0].decision = "port";
  assert.throws(() => validateForkPort(f.repo, f.manifest, f.plan, baseline), /no implementation change/);
  writeFileSync(join(f.repo, fork.path, "core.ts"), "// selected retained-behavior correction\n");
  assert.throws(() => validateForkPort(f.repo, f.manifest, f.plan, baseline), /focused regression/);
  writeFileSync(join(f.repo, fork.path, "tests/focused.test.mjs"), "// new targeted regression\n");
  assert.doesNotThrow(() => validateForkPort(f.repo, f.manifest, f.plan, baseline));
});

test("owner decision notification includes version delta, rationale and files without disguising release failures", async t => {
  const f = fixture(t), [report] = await reviewSelectiveForks({ ...f, review: async () => decision("ask", "uncertain") });
  const pending = await completion({ status: "fork-decision-required", forkReviews: [report] }, "success");
  assert.equal(pending.title, "需你决定"); assert.equal(pending.needsDecision, true); assert.equal(pending.failed, undefined);
  assert.match(pending.reason, /0\.1\.1 → 0\.1\.2/); assert.match(pending.reason, /core\.ts/); assert.match(pending.reason, /fork-review-amox-pi-sync\.json/);
  const merged = { status: "merged-after-ci", mergeSha: "a".repeat(40), version: "0.1.17", forkReviews: [report] };
  let queried = 0;
  const api = { request: async path => { queried++; return path.includes("/jobs?") ? { jobs: [] } : { workflow_runs: [{ head_sha: merged.mergeSha, event: "push", head_branch: "main", status: "completed", conclusion: "success", id: 1 }] }; } };
  const failed = await completion(merged, "success", { api });
  assert.equal(queried, 2); assert.equal(failed.failed, true); assert.equal(failed.needsDecision, true); assert.equal(failed.title, "未发布");
  const skipped = await completion({ status: "fork-skipped", forkReviews: [{ ...report, decision: "skip", changes: decision("skip").changes }] }, "success");
  assert.equal(skipped.title, "上游已审查"); assert.equal(skipped.needsDecision, undefined);
});

test("ntfy owner-decision delivery is one POST, elevated priority and bounded UTF-8, including sync package versions", { skip: process.platform === "win32" }, async t => {
  const dir = mkdtempSync(join(tmpdir(), "amox-fork-notify-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tokenFile = join(dir, "token"); writeFileSync(tokenFile, "fake-private-token", { mode: 0o600 });
  let calls = 0;
  const config = { server: "https://ntfy.invalid/", topic: "test", tokenFile };
  await send(config, { packages: [{ name: fork.packageName, version: "0.1.1" }] }, { title: "需你决定", reason: "具体判断", needsDecision: true }, async (_url, options) => {
    calls++; const body = JSON.parse(options.body); assert.equal(body.priority, 4); assert.deepEqual(body.tags, ["question"]); assert.match(body.message, /amox-pi-sync@0\.1\.1/); return new Response("{}");
  });
  await send(config, {}, { title: "需你决定", reason: "中文💬".repeat(10000), needsDecision: true }, async (_url, options) => {
    calls++; const body = JSON.parse(options.body); assert.ok(Buffer.byteLength(body.message) <= 3800); assert.doesNotMatch(body.message, /\uFFFD/); assert.match(body.message, /通知已截短/); return new Response("{}");
  });
  assert.equal(calls, 2);
});
