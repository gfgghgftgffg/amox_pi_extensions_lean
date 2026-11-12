import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import { packExtension } from "../scripts/lib/extension-package.mjs";
import { validateNpmArchive } from "../scripts/publish-npm.mjs";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";

test("goal publication verifies both declared helper sources and rejects missing, undeclared or modified helpers", () => {
  const fixture = releaseFixture({ batchVersion: "9.0.0", versions: { "pi-goal-x-lean": "0.1.0" }, packageIds: ["pi-goal-x-lean"] });
  const dir = mkdtempSync(join(tmpdir(), "amox-goal-publication-"));
  try {
    const entry = fixture.manifest.packages.find(item => item.id === "pi-goal-x-lean");
    const packed = packExtension(fixture.root, entry, dir), bytes = readFileSync(packed.archive);
    const validate = (selected = entry) => validateNpmArchive({ repoRoot: fixture.root, entry: selected,
      asset: { path: packed.archive }, version: "0.1.0", repository: "gfgghgftgffg/amox_pi_extensions_lean" });
    assert.equal(validate().version, "0.1.0");
    assert.throws(() => validate({ ...entry, maintenanceMode: undefined }), /Unexpected npm archive path/);
    assert.throws(() => validate({ ...entry, sourceFiles: ["index.ts"] }), /Unexpected npm archive path/);
    for (const file of ["integration.ts", "delegation.ts"]) {
      const tar = gunzipSync(bytes), source = readFileSync(join(fixture.root, entry.path, file));
      const offset = tar.indexOf(source); assert.ok(offset >= 0, file);
      tar[offset] ^= 1; writeFileSync(packed.archive, gzipSync(tar));
      assert.throws(() => validate(), new RegExp(`differs.*${file.replace(".", "\\.")}`));
    }
    writeFileSync(packed.archive, bytes);
    const pkg = fixture.read(`${entry.path}/package.json`);
    pkg.files = pkg.files.filter(file => file !== "delegation.ts");
    fixture.write(`${entry.path}/package.json`, pkg); packExtension(fixture.root, entry, dir);
    assert.throws(() => validate(), /Incomplete npm package archive/);
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
