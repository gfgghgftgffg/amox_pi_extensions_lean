import assert from "node:assert/strict";
import { symlinkSkip } from "./helpers/fs-capabilities.mjs";
import test from "node:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCandidateArtifact } from "../scripts/lib/candidate.mjs";
import { buildUpdatePlan, buildUpdateReport } from "../scripts/lib/upstream-plan.mjs";
import { applyFiles, assertRegularPath, jsonText, nextPatch, readJson, sha256, validateFiles, validateReview } from "../scripts/lib/automation-policy.mjs";
import { buildAdaptedBundle, expectedGenerated, validateAdaptedBundle } from "../scripts/lib/adapted-candidate.mjs";
import { createMaintenanceTools } from "../scripts/lib/maintenance-tools.mjs";
import { formatMaintenanceModelFailure, runMaintenanceAgent } from "../scripts/lib/maintenance-agent.mjs";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = "a".repeat(40);
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "amox-automation-policy-"));
  for (const path of ["package.json", "package-lock.json", "maintenance", "packages", "README.md", "docs"]) {
    cpSync(join(root, path), join(repo, path), { recursive: true, filter: (path) => !path.split(/[\\/]/).includes("node_modules") });
  }
  const manifest = readJson(join(repo, "maintenance/manifest.json"));
  const workspaces = manifest.packages.map((entry) => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: readJson(join(repo, entry.path, "package.json")) }));
  const metadata = { npm: {}, git: {} };
  for (const { entry, pkg } of manifest.packages.map((entry, i) => ({ entry, pkg: workspaces[i].pkg }))) {
    for (const [name, version] of Object.entries(pkg.dependencies)) metadata.npm[name] = { latestStable: version, gitHead: entry.upstreamGitHead };
    metadata.git[entry.upstreamRepository] = { head: entry.upstreamGitHead };
    metadata.git[entry.leanRepository] = { head: entry.leanCommit };
  }
  metadata.git[manifest.packages[0].leanRepository].head = manifest.packages[0].leanCommit === "f".repeat(40) ? "e".repeat(40) : "f".repeat(40);
  const plan = buildUpdatePlan({ manifest, workspaces, metadata });
  const dependencyCandidate = buildCandidateArtifact({ baseCommit: sha, status: "lean-review", files: [{ path: "maintenance/update-report.md", content: buildUpdateReport({ plan, status: "lean-review", baseCommit: sha }) }] });
  const review = { ready: true, reviewedPackages: [manifest.packages[0].id], summary: "Reviewed old/new lean sources and kept upstream delegation; no unresolved differences." };
  const report = { path: "maintenance/agent-review.md", content: "# Agent review\n\n" + "Verified exact source revisions, changelog, API, lifecycle and regression behavior. ".repeat(3) };
  const context = join(repo, ".context");
  for (const revision of ["before", "after"]) {
    const dir = join(context, manifest.packages[0].id, `lean-${revision}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.ts"), "export default function extension() {}\n");
  }
  return { repo, manifest, plan, dependencyCandidate, review, report, context,
    options: { repoRoot: repo, headSha: sha, gitHeadResolver: (url) => metadata.git[url].head },
    cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
function proposal(f, files = [f.report]) {
  return buildAdaptedBundle({ baseCommit: sha, dependencyCandidate: f.dependencyCandidate, plan: f.plan, review: f.review, files });
}

test("patch versions are deterministic canonical and overflow-safe", () => {
  assert.equal(nextPatch("1.2.9"), "1.2.10");
  for (const value of ["01.2.3", "1.2.3-beta", "x", "1.2.9007199254740991"]) assert.throws(() => nextPatch(value));
});

test("agent file policy rejects configs, dependencies, licenses, traversal and tampering", () => {
  const f = fixture();
  try {
    const make = (path, content = "text") => ({ path, content, contentSha256: sha256(content) });
    for (const path of [".github/workflows/test.yml", "package.json", "package-lock.json", "packages/pi-web-access-lean/package.json", "packages/pi-web-access-lean/LICENSE", "../secret", "/secret", "a\\b"]) {
      assert.throws(() => validateFiles([make(path)], f.repo, f.manifest), path);
    }
    assert.throws(() => validateFiles([make("README.md"), make("README.md")], f.repo, f.manifest), /Duplicate/);
    assert.throws(() => validateFiles([{ ...make("README.md"), contentSha256: "f".repeat(64) }], f.repo, f.manifest), /Hash/);
    const path = `${f.manifest.packages[0].path}/tests/existing.test.mjs`;
    writeFileSync(join(f.repo, path), "assert.equal(realBehavior, expected);\n");
    assert.throws(() => validateFiles([make(path, "assert.ok(true);")], f.repo, f.manifest), /append-only/);
    validateFiles([make(path, readFileSync(join(f.repo, path), "utf8") + "assert.ok(newBehavior);\n")], f.repo, f.manifest);
  } finally { f.cleanup(); }
});

test("append-only tests tolerate LF/CRLF without permitting assertion changes", async () => {
  const f = fixture();
  try {
    const path = `${f.manifest.packages[0].path}/tests/line-endings.test.mjs`;
    const original = "assert.equal(realBehavior, expected);\r\n";
    writeFileSync(join(f.repo, path), original);
    const content = original.replaceAll("\r\n", "\n") + "assert.ok(newBehavior);\n";
    validateFiles([{ path, content, contentSha256: sha256(content) }], f.repo, f.manifest);
    const tools = createMaintenanceTools({ repoRoot: f.repo, contextRoot: f.context, manifest: f.manifest, plan: f.plan }).tools;
    await tools.find((tool) => tool.name === "maintenance_write").execute("write", { path, content });
    await assert.rejects(tools.find((tool) => tool.name === "maintenance_write").execute("bad", { path, content: "assert.ok(true);\n" }), /append-only/);
  } finally { f.cleanup(); }
});

test("LF-only conversion does not count as regression coverage for an adapter change", async () => {
  const f = fixture();
  try {
    const entry = f.manifest.packages[0];
    const source = `${entry.path}/${entry.entry}`;
    const original = readFileSync(join(f.repo, source), "utf8").replaceAll("\r\n", "\n");
    const path = `${entry.path}/tests/eol-only.test.mjs`;
    const before = "assert.equal(realBehavior, expected);\r\n";
    writeFileSync(join(f.repo, path), before);
    await assert.rejects(validateAdaptedBundle({ ...f.options, bundle: proposal(f, [f.report,
      { path: source, content: original + "\n// meaningful adapter change\n" },
      { path, content: before.replaceAll("\r\n", "\n") },
    ]) }), /regression/);
  } finally { f.cleanup(); }
});

test("artifact application validates all paths before any write", () => {
  const f = fixture();
  try {
    const before = readFileSync(join(f.repo, "README.md"), "utf8");
    assert.throws(() => applyFiles(f.repo, [{ path: "README.md", content: "changed" }, { path: "../outside", content: "bad" }]));
    assert.equal(readFileSync(join(f.repo, "README.md"), "utf8"), before);
  } finally { f.cleanup(); }
});

test("symlink and dangling-symlink aliases are forbidden", { skip: symlinkSkip }, () => {
  const f = fixture();
  try {
    symlinkSync(join(f.repo, "missing"), join(f.repo, "README-alias.md"));
    assert.throws(() => assertRegularPath(f.repo, "README-alias.md", { allowMissing: true }), /Symlink/);
    symlinkSync(join(f.repo, "packages"), join(f.repo, "alias"));
    assert.throws(() => assertRegularPath(f.repo, "alias/pi-web-access-lean/index.ts"), /Symlink/);
  } finally { f.cleanup(); }
});

test("directory aliases are rejected on every OS, including Windows junctions", () => {
  const f = fixture();
  try {
    symlinkSync(join(f.repo, "packages"), join(f.repo, "directory-alias"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertRegularPath(f.repo, "directory-alias/pi-web-access-lean/index.ts"), /Symlink/);
  } finally { f.cleanup(); }
});

test("agent must explicitly approve and review every changed package", () => {
  const f = fixture();
  try {
    validateReview(f.review, f.plan);
    assert.throws(() => validateReview({ ...f.review, ready: false }, f.plan), /unresolved/);
    assert.throws(() => validateReview({ ...f.review, reviewedPackages: [] }, f.plan), /every/);
  } finally { f.cleanup(); }
});

test("proposals reject stale baselines, forged plans, unfinished review and protected edits", async () => {
  const f = fixture();
  try {
    await validateAdaptedBundle({ bundle: proposal(f), ...f.options });
    await assert.rejects(validateAdaptedBundle({ bundle: { ...proposal(f), baseCommit: "b".repeat(40) }, ...f.options }), /baseline/);
    await assert.rejects(validateAdaptedBundle({ bundle: { ...proposal(f), status: "verified" }, ...f.options }), /state/);
    const forged = proposal(f); forged.plan.changedPackageIds.push("forged");
    await assert.rejects(validateAdaptedBundle({ bundle: forged, ...f.options }), /plan/);
    f.plan.changedPackageIds.pop();
    await assert.rejects(validateAdaptedBundle({ bundle: proposal(f, [f.report, { path: ".github/workflows/test.yml", content: "bad" }]), ...f.options }), /Protected/);
    await assert.rejects(validateAdaptedBundle({ bundle: proposal(f), ...f.options, gitHeadResolver: () => "c".repeat(40) }), /HEAD changed/);
  } finally { f.cleanup(); }
});

test("adapter edits require regression coverage and cannot weaken existing tests", async () => {
  const f = fixture();
  try {
    const path = `${f.manifest.packages[0].path}/index.ts`;
    const source = { path, content: readFileSync(join(f.repo, path), "utf8") + "\n// minimal change\n" };
    await assert.rejects(validateAdaptedBundle({ bundle: proposal(f, [f.report, source]), ...f.options }), /regression/);
    const regression = { path: `${f.manifest.packages[0].path}/tests/upstream-update.test.mjs`, content: "import test from 'node:test'; test('new API', () => {});\n" };
    await validateAdaptedBundle({ bundle: proposal(f, [f.report, source, regression]), ...f.options });
  } finally { f.cleanup(); }
});

test("verified bundle allows only deterministic version/manifest/lock changes and measured snapshots", async () => {
  const f = fixture();
  try {
    const expected = expectedGenerated({ repoRoot: f.repo, dependencyWrites: f.dependencyCandidate.files, plan: f.plan });
    const snapshot = readJson(join(f.repo, "maintenance/tool-contracts.json"));
    for (const record of Object.values(snapshot.lean)) record.version = expected.version;
    expected.map.set("maintenance/tool-contracts.json", jsonText(snapshot));
    expected.map.set("maintenance/update-report.md", "# Verified\n<!-- amox-maintenance-adapted; verified -->\n");
    const files = [...expected.map].map(([path, content]) => ({ path, content })).concat([f.report]);
    const bundle = buildAdaptedBundle({ ...proposal(f), status: "verified", files });
    const checked = await validateAdaptedBundle({ bundle, ...f.options, verified: true });
    assert.equal(checked.version, nextPatch(readJson(join(f.repo, "package.json")).version));
    const bad = structuredClone(bundle);
    const pkg = bad.files.find((file) => file.path === "package.json");
    const value = JSON.parse(pkg.content); value.scripts.postinstall = "steal credentials";
    pkg.content = jsonText(value); pkg.contentSha256 = sha256(pkg.content);
    await assert.rejects(validateAdaptedBundle({ bundle: bad, ...f.options, verified: true }), /Unauthorized/);
    const snap = bundle.files.find((file) => file.path === "maintenance/tool-contracts.json");
    const forged = JSON.parse(snap.content); Object.values(forged.lean)[0].tools[0].proxyTokens++;
    snap.content = jsonText(forged); snap.contentSha256 = sha256(snap.content);
    await assert.rejects(validateAdaptedBundle({ bundle, ...f.options, verified: true }), /accounting/);
  } finally { f.cleanup(); }
});

test("restricted tools cannot read secrets, execute commands or rewrite old assertions", async () => {
  const f = fixture();
  try {
    const controls = createMaintenanceTools({ repoRoot: f.repo, contextRoot: f.context, manifest: f.manifest, plan: f.plan });
    const tools = new Map(controls.tools.map((tool) => [tool.name, tool]));
    assert.deepEqual([...tools.keys()].sort(), ["maintenance_edit", "maintenance_finish", "maintenance_list", "maintenance_read", "maintenance_write"]);
    await assert.rejects(tools.get("maintenance_read").execute("1", { scope: "repo", path: ".git/config" }), /allowlist/);
    await assert.rejects(tools.get("maintenance_write").execute("1", { path: "package.json", content: "bad" }), /Protected/);
    const oldTest = `${f.manifest.packages[0].path}/tests/existing.test.mjs`;
    // A missing test path can be created, but package configuration never can.
    await tools.get("maintenance_write").execute("1", { path: oldTest, content: "assert.equal(actual, expected);\n" });
    await tools.get("maintenance_write").execute("1", { path: f.report.path, content: f.report.content });
    await assert.rejects(tools.get("maintenance_finish").execute("1", f.review), /Read/);
    const entry = f.manifest.packages[0];
    await tools.get("maintenance_read").execute("1", { scope: "repo", path: `${entry.path}/MAINTENANCE.md` });
    for (const revision of ["before", "after"]) await tools.get("maintenance_read").execute("1", { scope: "upstream", path: `${entry.id}/lean-${revision}/index.ts` });
    await tools.get("maintenance_finish").execute("1", f.review);
    assert.deepEqual(controls.finish(), f.review);
    await assert.rejects(tools.get("maintenance_write").execute("1", { path: "README.md", content: "late write" }), /finished/);
  } finally { f.cleanup(); }
});

test("model failures expose only bounded diagnostic metadata, never error bodies or credentials", () => {
  const secret = "private-key-and-transcript-must-not-appear";
  for (const [message, category, status] of [
    [`Request timed out. ${secret}`, "request_timeout", "unknown"],
    [`gateway API error (401): ${secret}`, "authentication", "401"],
    [`gateway API error (403): ${secret}`, "authorization", "403"],
    [`HTTP 429: ${secret}`, "rate_limit", "429"],
    [`gateway API error (402): ${secret}`, "quota", "402"],
    [`gateway API error (400): invalid input ${secret}`, "request_rejected", "400"],
    [`gateway API error (503): ${secret}`, "provider_server_error", "503"],
    [`fetch failed ${secret}`, "transport", "unknown"],
    [`Input is too long ${secret}`, "context_limit", "unknown"],
    [`${secret}`, "provider_error", "unknown"],
  ]) {
    const output = formatMaintenanceModelFailure([{ stopReason: "error", errorMessage: message }], { turns: 3, elapsedMs: 600_000 });
    assert.ok(output.includes(`category=${category}`), output);
    assert.ok(output.includes(`status=${status}`), output);
    assert.match(output, /turns=3, elapsed_seconds=600/);
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes(message));
  }
});

test("stage limits and aborts are distinct from provider request timeouts", () => {
  const errors = [{ stopReason: "aborted", errorMessage: "never publish this" }];
  assert.match(formatMaintenanceModelFailure(errors, { turns: 60, elapsedMs: 10_000, abortCause: "turns" }), /category=turn_limit/);
  assert.match(formatMaintenanceModelFailure(errors, { turns: 1, elapsedMs: 1_200_000, abortCause: "time" }), /category=stage_time_limit/);
  assert.match(formatMaintenanceModelFailure(errors, { turns: 1, elapsedMs: 1_000 }), /category=aborted/);
  const output = formatMaintenanceModelFailure(errors, { turns: "never publish this", elapsedMs: "never publish this", abortCause: "never publish this" });
  assert.match(output, /turns=unknown, elapsed_seconds=unknown/);
  assert.doesNotMatch(output, /never publish this/);
});

test("real Pi SDK runs the restricted tool loop offline without loading repository extensions", async () => {
  const f = fixture();
  const names = ["MAINTENANCE_PROVIDER", "MAINTENANCE_MODEL", "MAINTENANCE_API_KEY", "MAINTENANCE_BASE_URL", "MAINTENANCE_THINKING"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const entry = f.manifest.packages[0];
  const calls = [
    ["maintenance_read", { scope: "repo", path: `${entry.path}/MAINTENANCE.md` }],
    ["maintenance_read", { scope: "upstream", path: `${entry.id}/lean-before/index.ts` }],
    ["maintenance_read", { scope: "upstream", path: `${entry.id}/lean-after/index.ts` }],
    ["maintenance_write", { path: f.report.path, content: f.report.content }],
    ["maintenance_finish", f.review],
  ];
  let requests = 0;
  try {
    process.env.MAINTENANCE_PROVIDER = "offline-maintenance";
    process.env.MAINTENANCE_MODEL = "offline-model";
    process.env.MAINTENANCE_API_KEY = "offline-key-not-a-real-credential";
    process.env.MAINTENANCE_THINKING = "off";
    delete process.env.MAINTENANCE_BASE_URL;
    const review = await runMaintenanceAgent({ repoRoot: f.repo, contextRoot: f.context, manifest: f.manifest, plan: f.plan,
      runtimeFactory: async (options) => {
        const runtime = await ModelRuntime.create(options);
        runtime.registerProvider("offline-maintenance", {
          api: "openai-completions", baseUrl: "https://unused.invalid/v1",
          models: [{ id: "offline-model", name: "Offline fixture", input: ["text"], reasoning: false, contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
          streamSimple: (model, context) => {
            assert.ok(!JSON.stringify(context).includes("offline-key-not-a-real-credential"));
            const step = calls[requests++];
            if (requests > calls.length + 1) throw new Error("Unexpected unbounded tool loop");
            const content = step ? [{ type: "toolCall", id: `call-${requests}`, name: step[0], arguments: step[1] }] : [{ type: "text", text: "Finished" }];
            const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content, stopReason: step ? "toolUse" : "stop", timestamp: Date.now(),
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
            const stream = createAssistantMessageEventStream();
            queueMicrotask(() => stream.push({ type: "done", reason: message.stopReason, message }));
            return stream;
          },
        });
        return runtime;
      },
    });
    assert.deepEqual(review, f.review);
    assert.ok(requests >= calls.length);
    assert.equal(readFileSync(join(f.repo, f.report.path), "utf8"), f.report.content);
  } finally {
    for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
    f.cleanup();
  }
});
