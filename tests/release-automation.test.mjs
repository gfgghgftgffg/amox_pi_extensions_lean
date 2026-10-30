import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chooseRelease } from "../scripts/release-plan.mjs";
import { validateReleaseAssets } from "../scripts/release-assets.mjs";
import { jsonText, readJson } from "../scripts/lib/files.mjs";
import { modelConfig } from "../scripts/lib/local-pi.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("automatic release requires a version bump, manual release must match", () => {
  assert.deepEqual(chooseRelease({ event: "push", previousVersion: "0.1.0", currentVersion: "0.1.1" }), { shouldRelease: true, tag: "v0.1.1" });
  assert.equal(chooseRelease({ event: "push", previousVersion: "0.1.1", currentVersion: "0.1.1" }).shouldRelease, false);
  assert.throws(() => chooseRelease({ event: "push", previousVersion: "0.2.0", currentVersion: "0.1.1" }), /downgrade/);
  assert.throws(() => chooseRelease({ event: "push", currentVersion: "0.1.1" }), /previous/);
  assert.deepEqual(chooseRelease({ event: "workflow_dispatch", currentVersion: "0.1.1", requestedTag: "v0.1.1" }), { shouldRelease: true, tag: "v0.1.1" });
  assert.throws(() => chooseRelease({ event: "workflow_dispatch", currentVersion: "0.1.1", requestedTag: "v0.1.0" }), /match/);
  assert.throws(() => chooseRelease({ event: "pull_request", currentVersion: "0.1.1" }), /Unsupported/);
});

test("model credentials are required and compatible endpoint config never executes commands", () => {
  assert.throws(() => modelConfig({}), /Configure/);
  const config = { provider: "custom", model: "model-id", apiKey: "dummy-key", baseUrl: "https://example.com/v1", api: "openai-responses" };
  assert.equal(modelConfig(config).thinking, "medium");
  for (const base of ["http://example.com", "https://user:secret@example.com", "!curl https://example.com", "https://example.com?key=secret"]) {
    assert.throws(() => modelConfig({ ...config, baseUrl: base }));
  }
  assert.throws(() => modelConfig({ ...config, thinking: "guess" }), /thinking/);
  assert.throws(() => modelConfig({ ...config, api: "arbitrary-program" }), /API/);
});

test("release assets accept exactly the three identity-bound archives and reject tampering", () => {
  const fixture = releaseFixture(), root = fixture.root;
  const dir = mkdtempSync(join(tmpdir(), "amox-release-assets-test-"));
  try {
    const version = readJson(join(root, "package.json")).version;
    const entries = readJson(join(root, "maintenance/manifest.json")).packages;
    const files = entries.map((entry) => {
      const filename = `${entry.packageName.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
      const bytes = Buffer.from(entry.packageName);
      writeFileSync(join(dir, filename), bytes);
      return { package: entry.packageName, filename, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
    });
    const save = () => writeFileSync(join(dir, "assets.json"), jsonText({ version, files }));
    save();
    assert.equal(validateReleaseAssets({ repoRoot: root, dir }).length, 3);
    files[0].filename = "../secret.tgz"; save();
    assert.throws(() => validateReleaseAssets({ repoRoot: root, dir }), /identity/);
    files[0].filename = `${entries[0].packageName.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`; save();
    writeFileSync(join(dir, files[0].filename), "tampered");
    assert.throws(() => validateReleaseAssets({ repoRoot: root, dir }), /hash/);
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
