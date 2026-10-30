import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedRun } from "../scripts/lib/process.mjs";
import { releaseEntries } from "../scripts/lib/package-selection.mjs";
import { validateReleaseAssets } from "../scripts/release-assets.mjs";
import { publishNpmArchives, NPM_REGISTRY } from "../scripts/publish-npm.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = "pi-web-access-lean", todo = "rpiv-todo-lean", sub = "pi-subagents-lean";

test("one-package and mixed-version batches build and publish only selected npm archives", async (t) => {
  for (const packageIds of [[web], [web, sub]]) await t.test(packageIds.join(","), async () => {
    const f = releaseFixture({ batchVersion: "9.0.0", packageIds, versions: { [web]: "1.2.4", [todo]: "2.3.4", [sub]: "3.4.5" } });
    try {
      const before = new Map(f.manifest.packages.filter((entry) => !packageIds.includes(entry.id))
        .map((entry) => [entry.id, readFileSync(join(f.root, entry.path, "package.json"), "utf8")]));
      checkedRun(process.execPath, [join(root, "scripts/release-assets.mjs"), "--build"], { cwd: f.root });
      const dir = join(f.root, ".release-assets"), indexPath = join(dir, "assets.json");
      const index = JSON.parse(readFileSync(indexPath, "utf8"));
      const entries = releaseEntries(f.root);
      assert.equal(index.version, "9.0.0"); assert.equal(index.schemaVersion, 2);
      assert.deepEqual(index.files.map((file) => file.package), entries.map((entry) => entry.packageName));
      assert.deepEqual(index.files.map((file) => file.version), entries.map((entry) => entry.version));
      assert.ok(index.files.every((file) => !file.filename.includes("9.0.0")), "batch tags must not replace independent npm versions");
      assert.equal(readdirSync(dir).length, packageIds.length + 1);
      assert.equal(validateReleaseAssets({ repoRoot: f.root, dir }).length, packageIds.length);
      const states = new Map(), lookups = [], uploads = [];
      const fetchImpl = async (url) => {
        assert.ok(url.startsWith(`${NPM_REGISTRY}/`));
        const [encoded, version] = url.slice(NPM_REGISTRY.length + 1).split("/"), name = decodeURIComponent(encoded);
        const entry = entries.find((item) => item.packageName === name);
        assert.ok(entry, `unselected package must not be queried: ${name}`); lookups.push(name);
        if (version) { assert.equal(version, entry.version); return states.has(name) ? Response.json(states.get(name)) : new Response(null, { status: 404 }); }
        return Response.json({ name, "dist-tags": { latest: states.get(name)?.version ?? "1.0.0" } });
      };
      const publish = async (path) => {
        const file = index.files.find((item) => join(dir, item.filename) === path); assert.ok(file);
        uploads.push(file.package); states.set(file.package, { name: file.package, version: file.version, dist: { integrity: file.integrity } });
      };
      const result = await publishNpmArchives({ repoRoot: f.root, dir, repository: "gfgghgftgffg/amox_pi_extensions_lean", dryRun: false, fetchImpl, publish, log: () => {} });
      assert.deepEqual(result.packages, entries.map((entry) => entry.packageName));
      assert.deepEqual(uploads, result.packages); assert.equal(new Set(lookups).size, packageIds.length);
      for (const [id, text] of before) assert.equal(readFileSync(join(f.root, `packages/${id}/package.json`), "utf8"), text);
      uploads.length = 0;
      await publishNpmArchives({ repoRoot: f.root, dir, repository: "gfgghgftgffg/amox_pi_extensions_lean", dryRun: false, fetchImpl, publish, log: () => {} });
      assert.deepEqual(uploads, [], "recovery must skip already verified selected versions");

      writeFileSync(join(dir, "unselected.tgz"), "extra");
      assert.throws(() => validateReleaseAssets({ repoRoot: f.root, dir }), /Unexpected release asset files/);
      rmSync(join(dir, "unselected.tgz"));
      writeFileSync(indexPath, JSON.stringify({ ...index, files: index.files.slice(1) }));
      assert.throws(() => validateReleaseAssets({ repoRoot: f.root, dir }), /version\/count/);
      writeFileSync(indexPath, JSON.stringify({ ...index, files: index.files.map((file) => ({ ...file, version: "9.0.0" })) }));
      assert.throws(() => validateReleaseAssets({ repoRoot: f.root, dir }), /asset version/);
    } finally { f.cleanup(); }
  });
});
