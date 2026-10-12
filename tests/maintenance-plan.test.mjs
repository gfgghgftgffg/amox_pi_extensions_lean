// Upstream maintenance plan tests: offline fixtures only. These lock down the
// safety rules (no downgrade, no prerelease, no silent "no update"), the exact
// minimal dependency-only candidate shape, lean-only review handling, and the
// deterministic maintenance report.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffJson } from "../scripts/lib/contract-diff.mjs";
import { applyPlanToManifest, applyPlanToWorkspacePackage, buildUpdatePlan, buildUpdateReport } from "../scripts/lib/upstream-plan.mjs";
import { fetchUpstreamMetadata, loadInjectedMetadata } from "../scripts/lib/upstream-metadata.mjs";

const HEAD = "a".repeat(40);

function fixtureManifest() {
  return {
    schemaVersion: 1,
    monorepo: { name: "amox-pi-extensions-lean" },
    packages: [
      {
        id: "pi-web-access-lean",
        path: "packages/pi-web-access-lean",
        packageName: "@gfgghgftgffg/pi-web-access-lean",
        upstreamPackage: "pi-web-access",
        upstreamVersion: "0.39.0",
        upstreamRepository: "https://example.test/pi-web-access.git",
        upstreamGitHead: "1".repeat(40),
        leanRepository: "https://example.test/pi-web-access-lean.git",
        leanCommit: "11".repeat(20),
      },
      {
        id: "rpiv-todo-lean",
        path: "packages/rpiv-todo-lean",
        packageName: "@gfgghgftgffg/rpiv-todo-lean",
        upstreamPackage: "@juicesharp/rpiv-todo",
        upstreamVersion: "2.13.5",
        upstreamRepository: "https://example.test/rpiv-mono.git",
        upstreamGitHead: "3".repeat(40),
        leanRepository: "https://example.test/rpiv-todo-lean.git",
        leanCommit: "33".repeat(20),
      },
      {
        id: "pi-subagents-lean",
        path: "packages/pi-subagents-lean",
        packageName: "@gfgghgftgffg/pi-subagents-lean",
        upstreamPackage: "@tintinweb/pi-subagents",
        upstreamVersion: "0.20.0",
        upstreamRepository: "https://example.test/pi-subagents.git",
        upstreamGitHead: "5".repeat(40),
        leanRepository: "https://example.test/pi-subagents-lean.git",
        leanCommit: "55".repeat(20),
      },
    ],
  };
}

function fixtureWorkspaces() {
  return [
    {
      id: "pi-web-access-lean",
      path: "packages/pi-web-access-lean",
      packageJsonPath: "packages/pi-web-access-lean/package.json",
      pkg: { name: "@gfgghgftgffg/pi-web-access-lean", version: "0.1.0", dependencies: { "pi-web-access": "0.39.0" } },
    },
    {
      id: "rpiv-todo-lean",
      path: "packages/rpiv-todo-lean",
      packageJsonPath: "packages/rpiv-todo-lean/package.json",
      pkg: { name: "@gfgghgftgffg/rpiv-todo-lean", version: "0.1.0", dependencies: { "@juicesharp/rpiv-i18n": "2.13.5", "@juicesharp/rpiv-todo": "2.13.5" } },
    },
    {
      id: "pi-subagents-lean",
      path: "packages/pi-subagents-lean",
      packageJsonPath: "packages/pi-subagents-lean/package.json",
      pkg: { name: "@gfgghgftgffg/pi-subagents-lean", version: "0.1.0", dependencies: { "@tintinweb/pi-subagents": "0.20.0" } },
    },
  ];
}

function fixtureMetadata({ npm = {}, git = {} } = {}) {
  const manifest = fixtureManifest();
  const metadata = {
    npm: {
      "pi-web-access": { latestStable: "0.39.0", gitHead: HEAD },
      "@juicesharp/rpiv-todo": { latestStable: "2.13.5", gitHead: HEAD },
      "@juicesharp/rpiv-i18n": { latestStable: "2.13.5", gitHead: HEAD },
      "@tintinweb/pi-subagents": { latestStable: "0.20.0", gitHead: HEAD },
    },
    git: {},
  };
  for (const [name, value] of Object.entries(npm)) metadata.npm[name].latestStable = value;
  for (const entry of manifest.packages) {
    metadata.git[entry.upstreamRepository] = { head: git[entry.upstreamRepository] ?? HEAD };
    metadata.git[entry.leanRepository] = { head: git[entry.leanRepository] ?? entry.leanCommit };
  }
  return metadata;
}

function planWith(metadataOverrides = {}, { manifest = fixtureManifest(), workspaces = fixtureWorkspaces() } = {}) {
  return buildUpdatePlan({ manifest, workspaces, metadata: fixtureMetadata(metadataOverrides) });
}

test("no update detected => status no-update with no changes", () => {
  const plan = planWith();
  assert.equal(plan.status, "no-update");
  assert.equal(plan.updateRequired, false);
  assert.equal(plan.leanReviewRequired, false);
  assert.deepEqual(plan.changedPackageIds, []);
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.packagePlans.every((entry) => entry.dependencyChanges.length === 0));
});

test("newer stable version yields the exact minimal dependency-only candidate", () => {
  const manifest = fixtureManifest();
  const workspaces = fixtureWorkspaces();
  const plan = buildUpdatePlan({ manifest, workspaces, metadata: fixtureMetadata({ npm: { "pi-web-access": "0.40.0" } }) });
  assert.equal(plan.status, "update");
  assert.deepEqual(plan.changedPackageIds, ["pi-web-access-lean"]);
  const packagePlan = plan.packagePlans.find((entry) => entry.id === "pi-web-access-lean");
  assert.deepEqual(packagePlan.dependencyChanges, [{ name: "pi-web-access", from: "0.39.0", to: "0.40.0", kind: "primary" }]);

  const nextPackage = applyPlanToWorkspacePackage(workspaces[0].pkg, packagePlan);
  assert.deepEqual(diffJson(workspaces[0].pkg, nextPackage, ""), [
    { path: "dependencies.pi-web-access", kind: "changed", from: "0.39.0", to: "0.40.0" },
  ]);

  const nextManifest = applyPlanToManifest(manifest, plan);
  const manifestDiff = manifest.packages
    .flatMap((entry, index) => diffJson(entry, nextManifest.packages[index], `packages.${index}`).map((change) => change.path))
    .sort();
  assert.deepEqual(manifestDiff, ["packages.0.upstreamGitHead", "packages.0.upstreamVersion"]);
  assert.equal(nextManifest.packages[0].upstreamVersion, "0.40.0");
  assert.equal(nextManifest.packages[0].upstreamGitHead, HEAD);
  // leanCommit baselines are never touched by a dependency candidate.
  for (const entry of plan.packagePlans) {
    const before = manifest.packages.find((candidate) => candidate.id === entry.id);
    const after = nextManifest.packages.find((candidate) => candidate.id === entry.id);
    assert.equal(after.leanCommit, before.leanCommit);
  }
});

test("tightly coupled deps move only when the same target version exists", () => {
  const both = planWith({ npm: { "@juicesharp/rpiv-todo": "2.14.0", "@juicesharp/rpiv-i18n": "2.14.0" } });
  const todoPlan = both.packagePlans.find((entry) => entry.id === "rpiv-todo-lean");
  assert.deepEqual(todoPlan.dependencyChanges, [
    { name: "@juicesharp/rpiv-todo", from: "2.13.5", to: "2.14.0", kind: "primary" },
    { name: "@juicesharp/rpiv-i18n", from: "2.13.5", to: "2.14.0", kind: "coupled" },
  ]);

  const mismatch = planWith({ npm: { "@juicesharp/rpiv-todo": "2.14.0", "@juicesharp/rpiv-i18n": "2.13.9" } });
  const mismatchPlan = mismatch.packagePlans.find((entry) => entry.id === "rpiv-todo-lean");
  assert.deepEqual(mismatchPlan.dependencyChanges, [
    { name: "@juicesharp/rpiv-todo", from: "2.13.5", to: "2.14.0", kind: "primary" },
  ]);
  assert.equal(mismatchPlan.coupledSkipped.length, 1);
  assert.ok(mismatch.warnings.some((warning) => warning.includes("@juicesharp/rpiv-i18n")), "mismatch must warn for human review");
});

test("downgrade metadata is rejected instead of reported as no-update", () => {
  const plan = planWith({ npm: { "pi-web-access": "0.38.0" } });
  assert.equal(plan.status, "error");
  assert.ok(plan.errors.some((error) => error.code === "downgrade"));
  const coupled = planWith({ npm: { "@juicesharp/rpiv-todo": "2.14.0", "@juicesharp/rpiv-i18n": "2.12.0" } });
  assert.equal(coupled.status, "error");
  assert.ok(coupled.errors.some((error) => error.code === "downgrade"));
});

test("prerelease or missing metadata is rejected instead of silently ignored", () => {
  for (const latest of ["0.40.0-rc.1", "0.40", ""]) {
    const plan = planWith({ npm: { "pi-web-access": latest } });
    assert.equal(plan.status, "error", `latest=${JSON.stringify(latest)} must error`);
    assert.ok(plan.errors.some((error) => error.code === "invalid-metadata"));
  }
  const metadata = fixtureMetadata();
  delete metadata.npm["pi-web-access"];
  const plan = buildUpdatePlan({ manifest: fixtureManifest(), workspaces: fixtureWorkspaces(), metadata });
  assert.equal(plan.status, "error");
});

test("a version bump also requires a valid upstream git HEAD", () => {
  const metadata = fixtureMetadata({ npm: { "pi-web-access": "0.40.0" } });
  metadata.npm["pi-web-access"].gitHead = "not-a-sha";
  const plan = buildUpdatePlan({ manifest: fixtureManifest(), workspaces: fixtureWorkspaces(), metadata });
  assert.equal(plan.status, "error");
  assert.ok(plan.errors.some((error) => error.code === "invalid-metadata"));
});

test("lean-only newer HEAD is reported for manual reuse review and preserves leanCommit", () => {
  const manifest = fixtureManifest();
  const plan = buildUpdatePlan({
    manifest,
    workspaces: fixtureWorkspaces(),
    metadata: fixtureMetadata({ git: { "https://example.test/rpiv-todo-lean.git": "9".repeat(40) } }),
  });
  assert.equal(plan.status, "lean-only");
  assert.equal(plan.updateRequired, false);
  assert.equal(plan.leanReviewRequired, true);
  assert.ok(plan.warnings.some((warning) => warning.includes("manual reuse review")));
  // No dependency bumps => applying the plan leaves the manifest, including
  // leanCommit, byte-for-byte equivalent.
  const nextManifest = applyPlanToManifest(manifest, plan);
  assert.deepEqual(nextManifest, manifest);
  const report = buildUpdateReport({ plan, status: "lean-review", baseCommit: "f".repeat(40) });
  assert.match(report, /manual reuse review/);
  assert.match(report, /leanCommit 基线未改动/);
  assert.match(report, /维护提示词/);
  assert.match(report, /<!-- amox-maintenance-candidate; status: lean-review -->/);
});

test("report is deterministic and includes the saved minimal-change prompt", () => {
  const plan = planWith({ npm: { "pi-web-access": "0.40.0" } });
  const first = buildUpdateReport({ plan, status: "ready", baseCommit: "f".repeat(40) });
  const second = buildUpdateReport({ plan, status: "ready", baseCommit: "f".repeat(40) });
  assert.equal(first, second);
  assert.match(first, /node scripts\/check-upstream\.mjs --apply/);
  assert.match(first, /只升级依赖，不改 index\.ts/);
  assert.match(first, /不会自动合并|不会自动合并或发布/);
});

test("fetchUpstreamMetadata fails visibly on network errors and malformed payloads", async () => {
  const manifest = fixtureManifest();
  const workspaces = fixtureWorkspaces();
  await assert.rejects(
    fetchUpstreamMetadata({
      manifest,
      workspaces,
      fetchImpl: async () => {
        throw new Error("ECONNRESET");
      },
      gitHeadResolver: () => HEAD,
    }),
    /npm registry 请求失败/,
  );
  await assert.rejects(
    fetchUpstreamMetadata({
      manifest,
      workspaces,
      fetchImpl: async () => ({ ok: true, json: async () => ({ "dist-tags": { latest: "1.2.3-beta.1" } }) }),
      gitHeadResolver: () => HEAD,
    }),
    /预发布/,
  );
  await assert.rejects(
    fetchUpstreamMetadata({
      manifest,
      workspaces,
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
      gitHeadResolver: () => HEAD,
    }),
    /dist-tags\.latest/,
  );
  const ok = await fetchUpstreamMetadata({
    manifest,
    workspaces,
    fetchImpl: async (url) => {
      const name = decodeURIComponent(url.slice("https://registry.npmjs.org/".length));
      return { ok: true, json: async () => ({ "dist-tags": { latest: "0.39.0" }, versions: { "0.39.0": { name, version: "0.39.0", gitHead: HEAD } } }) };
    },
    gitHeadResolver: () => HEAD,
  });
  assert.equal(ok.npm["pi-web-access"].latestStable, "0.39.0");
  assert.equal(Object.keys(ok.git).length, 6);
});

test("injected metadata files are shape-validated", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-metadata-test-"));
  try {
    const malformed = join(dir, "malformed.json");
    writeFileSync(malformed, "{ not json");
    assert.throws(() => loadInjectedMetadata(malformed), /无法解析 metadata JSON/);
    const badShape = join(dir, "bad-shape.json");
    writeFileSync(badShape, JSON.stringify({ npm: { "pi-web-access": { latestStable: "1.2.3-rc", gitHead: HEAD } }, git: {} }));
    assert.throws(() => loadInjectedMetadata(badShape), /latestStable/);
    const missingGit = join(dir, "missing-git.json");
    writeFileSync(missingGit, JSON.stringify({ npm: {}, git: { "https://example.test/x.git": { head: "zzz" } } }));
    assert.throws(() => loadInjectedMetadata(missingGit), /head/);
    const valid = join(dir, "valid.json");
    writeFileSync(valid, JSON.stringify({ npm: {}, git: {} }));
    assert.deepEqual(loadInjectedMetadata(valid), { npm: {}, git: {} });
    assert.ok(readFileSync(valid, "utf8").includes("npm"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("publication gitHead is distinct from live repository HEAD; missing publication never falls back", async () => {
  const metadata = fixtureMetadata({ npm: { "pi-web-access": "0.40.0" } });
  metadata.npm["pi-web-access"].gitHead = "b".repeat(40);
  metadata.git["https://example.test/pi-web-access.git"].head = "c".repeat(40);
  const manifest = fixtureManifest();
  const plan = buildUpdatePlan({ manifest, workspaces: fixtureWorkspaces(), metadata });
  assert.equal(plan.status, "update");
  assert.equal(plan.packagePlans[0].remoteGitHead, "c".repeat(40));
  assert.equal(applyPlanToManifest(manifest, plan).packages[0].upstreamGitHead, "b".repeat(40));
  metadata.npm["pi-web-access"].gitHead = "b".repeat(40) + "\n";
  assert.equal(buildUpdatePlan({ manifest, workspaces: fixtureWorkspaces(), metadata }).status, "error", "publication SHA must be exactly 40 characters");
  delete metadata.npm["pi-web-access"].gitHead;
  const missing = buildUpdatePlan({ manifest, workspaces: fixtureWorkspaces(), metadata });
  assert.equal(missing.status, "error");
  assert.match(missing.errors.map((e) => e.message).join("\n"), /npm publication gitHead/);
  await assert.rejects(fetchUpstreamMetadata({ manifest, workspaces: fixtureWorkspaces(), gitHeadResolver: () => "c".repeat(40), fetchImpl: async (url) => {
    const name = decodeURIComponent(url.slice("https://registry.npmjs.org/".length));
    return { ok: true, json: async () => ({ "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": { name, version: "1.0.0" } } }) };
  } }), /publication gitHead/);
});
