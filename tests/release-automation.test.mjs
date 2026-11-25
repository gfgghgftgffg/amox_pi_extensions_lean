import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { planReleases } from "../scripts/release-plan.mjs";
import { validateReleaseAssets } from "../scripts/release-assets.mjs";
import { jsonText, readJson } from "../scripts/lib/files.mjs";
import { modelConfig } from "../scripts/lib/local-pi.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const web = { id: "web", packageName: "@gfgghgftgffg/web", version: "1.2.4" };
const todo = { id: "todo", packageName: "@gfgghgftgffg/todo", version: "2.3.4" };
const manifest = { packages: [web, todo] };
const tag = (version, commit = "a".repeat(40)) => ({ name: `@gfgghgftgffg/web@${version}`, commit });

test("each package is a release candidate only when its own version is ahead of its last tag", () => {
  const planned = planReleases({ event: "push", manifest, tags: [tag("1.2.3"), { name: "@gfgghgftgffg/todo@2.3.4", commit: "c".repeat(40) }] });
  assert.deepEqual(planned.releases.map((release) => release.tag), ["@gfgghgftgffg/web@1.2.4"]);
  assert.equal(planned.shouldRelease, true);
  assert.equal(planned.baseSha, "a".repeat(40));

  const unchanged = planReleases({ event: "push", manifest, tags: [tag("1.2.4"), { name: "@gfgghgftgffg/todo@2.3.4", commit: "c".repeat(40) }] });
  assert.deepEqual(unchanged, { shouldRelease: false, releases: [], baseSha: "" });
  assert.throws(() => planReleases({ event: "push", manifest, tags: [tag("1.2.5")] }), /downgrade/);
  assert.throws(() => planReleases({ event: "pull_request", manifest, tags: [] }), /Unsupported/);
});

test("legacy batch tags seed the baseline for packages without a package tag", () => {
  const legacy = new Map([[web.id, { version: "1.2.3", commit: "d".repeat(40) }]]);
  const planned = planReleases({ event: "push", manifest, tags: [{ name: "v0.1.43", commit: "d".repeat(40) }], legacyBaselines: legacy,
    previousVersions: new Map([[todo.id, { version: "2.3.4", commit: "d".repeat(40) }]]) });
  assert.deepEqual(planned.releases.map((release) => release.tag), ["@gfgghgftgffg/web@1.2.4"]);
  assert.equal(planned.baseSha, "d".repeat(40));
});

test("a package with no release history follows its previous main version", () => {
  const pushed = (previousVersions, previousBase = true) => planReleases({ event: "push", manifest: { packages: [todo] }, tags: [{ name: "v0.1.43", commit: "d".repeat(40) }], previousVersions, previousBase });
  // Untouched initial version: already handled, never republished.
  assert.equal(pushed(new Map([[todo.id, { version: "2.3.4", commit: "e".repeat(40) }]])).shouldRelease, false);
  // Bumped after it was added: release the new version.
  assert.deepEqual(pushed(new Map([[todo.id, { version: "2.3.3", commit: "e".repeat(40) }]])).releases.map((item) => item.tag), ["@gfgghgftgffg/todo@2.3.4"]);
  // Introduced by this push: release the initial version.
  assert.deepEqual(pushed(new Map()).releases.map((item) => item.tag), ["@gfgghgftgffg/todo@2.3.4"]);
  assert.throws(() => pushed(new Map([[todo.id, { version: "2.3.5", commit: "e".repeat(40) }]])), /downgrade/);
  // Without a trustworthy comparison base a new package is not guessed into a release.
  assert.equal(pushed(new Map(), false).shouldRelease, false);
  // An empty manual dispatch only releases versions with a known baseline.
  assert.equal(planReleases({ event: "workflow_dispatch", manifest: { packages: [todo] }, tags: [{ name: "v0.1.43", commit: "d".repeat(40) }] }).shouldRelease, false);
});

test("the oldest candidate baseline keeps verification wide enough for every release", () => {
  const newer = "b".repeat(40), older = "a".repeat(40);
  const times = { [newer]: 200, [older]: 100 };
  const two = { packages: [{ ...web, version: "1.2.5" }, { ...todo, version: "2.3.5" }] };
  const planned = planReleases({ event: "push", manifest: two, tags: [tag("1.2.3", newer), { name: "@gfgghgftgffg/todo@2.3.4", commit: older }],
    commitTime: (commit) => times[commit] ?? 0 });
  assert.equal(planned.releases.length, 2);
  assert.equal(planned.baseSha, older);
});

test("manual Release releases one explicit unreleased package tag", () => {
  const tags = [tag("1.2.3"), { name: "@gfgghgftgffg/todo@2.3.4", commit: "c".repeat(40) }];
  const planned = planReleases({ event: "workflow_dispatch", requestedTag: "@gfgghgftgffg/web@1.2.4", manifest, tags });
  assert.deepEqual(planned.releases.map((release) => release.tag), ["@gfgghgftgffg/web@1.2.4"]);
  // A first release of a version that has no tag yet can be requested explicitly.
  const initial = planReleases({ event: "workflow_dispatch", requestedTag: "@gfgghgftgffg/todo@2.3.4", manifest: { packages: [todo] }, tags: [{ name: "v0.1.43", commit: "d".repeat(40) }] });
  assert.deepEqual(initial.releases.map((release) => release.tag), ["@gfgghgftgffg/todo@2.3.4"]);
  assert.throws(() => planReleases({ event: "workflow_dispatch", requestedTag: "@gfgghgftgffg/todo@2.3.4", manifest: { packages: [todo] }, tags: [{ name: "@gfgghgftgffg/todo@2.3.4", commit: "c".repeat(40) }] }), /not newer/);
  assert.throws(() => planReleases({ event: "workflow_dispatch", requestedTag: "@gfgghgftgffg/web@9.9.9", manifest, tags }), /does not match/);
  assert.throws(() => planReleases({ event: "workflow_dispatch", requestedTag: "v1.2.4", manifest, tags }), /package tag/);
  // An empty manual tag behaves like a push: every current candidate.
  assert.deepEqual(planReleases({ event: "workflow_dispatch", manifest, tags }).releases.map((item) => item.tag), ["@gfgghgftgffg/web@1.2.4"]);
});

test("model credentials are required and compatible endpoint config never executes commands", () => {
  assert.throws(() => modelConfig({}), /Configure/);
  const config = { provider: "custom", model: "model-id", apiKey: "dummy-key", baseUrl: "https://example.com/v1", api: "openai-responses" };
  assert.equal(modelConfig(config).thinking, "medium");
  assert.equal(modelConfig({ ...config, provider: "sub2api-gpt-only", api: "openai-codex-responses" }).api, "openai-codex-responses");
  for (const base of ["http://example.com", "https://user:secret@example.com", "!curl https://example.com", "https://example.com?key=secret"]) {
    assert.throws(() => modelConfig({ ...config, baseUrl: base }));
  }
  assert.throws(() => modelConfig({ ...config, thinking: "guess" }), /thinking/);
  assert.throws(() => modelConfig({ ...config, api: "arbitrary-program" }), /API/);
});

for (const packageIds of [undefined, ["amox-pi-sync"]]) test(`release assets bind ${packageIds ? "the independently versioned sync release" : "all six package releases"} and reject tampering`, () => {
  const fixture = releaseFixture(packageIds ? { versions: { "amox-pi-sync": "0.1.0" } } : {}), root = fixture.root;
  const dir = mkdtempSync(join(tmpdir(), "amox-release-assets-test-"));
  try {
    const entries = readJson(join(root, "maintenance/manifest.json")).packages.filter((entry) => !packageIds || packageIds.includes(entry.id));
    const releases = entries.map((entry) => ({ id: entry.id, package: entry.packageName, version: entry.version, tag: `${entry.packageName}@${entry.version}` }));
    const files = entries.map((entry) => {
      const filename = `${entry.packageName.replace(/^@/, "").replaceAll("/", "-")}-${entry.version}.tgz`;
      const bytes = Buffer.from(entry.packageName);
      writeFileSync(join(dir, filename), bytes);
      return { package: entry.packageName, version: entry.version, filename, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
    });
    const save = () => writeFileSync(join(dir, "assets.json"), jsonText({ schemaVersion: 3, files }));
    save();
    assert.equal(validateReleaseAssets({ repoRoot: root, dir, releases }).length, packageIds ? 1 : entries.length);
    files[0].filename = "../secret.tgz"; save();
    assert.throws(() => validateReleaseAssets({ repoRoot: root, dir, releases }), /identity/);
    files[0].filename = `${entries[0].packageName.replace(/^@/, "").replaceAll("/", "-")}-${entries[0].version}.tgz`; save();
    writeFileSync(join(dir, files[0].filename), "tampered");
    assert.throws(() => validateReleaseAssets({ repoRoot: root, dir, releases }), /hash/);
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
