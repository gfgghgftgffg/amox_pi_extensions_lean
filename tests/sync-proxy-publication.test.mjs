import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync, gzipSync } from "node:zlib";
import { releaseFixture } from "./helpers/package-release-fixture.mjs";
import { packageEntries, packExtension } from "../scripts/lib/extension-package.mjs";
import { validateNpmArchive } from "../scripts/publish-npm.mjs";

const repository = "gfgghgftgffg/amox_pi_extensions_lean";

test("sync publication requires the declared SSH helper and verifies its exact bytes", () => {
  const fixture = releaseFixture({ batchVersion: "9.0.0", versions: { "amox-pi-sync": "0.1.0" }, packageIds: ["amox-pi-sync"] });
  const dir = mkdtempSync(join(tmpdir(), "amox-proxy-archive-"));
  try {
    const entry = packageEntries(fixture.root, ["amox-pi-sync"])[0];
    const packed = packExtension(fixture.root, entry, dir);
    const bytes = readFileSync(packed.archive);
    const asset = { path: packed.archive };
    const validate = (selected = entry) => validateNpmArchive({ repoRoot: fixture.root, asset, entry: selected, version: "0.1.0", repository });
    assert.equal(validate().version, "0.1.0");
    assert.throws(() => validate({ ...entry, sourceFiles: ["index.ts", "core.ts"] }), /Unexpected npm archive path/);
    const helper = readFileSync(join(fixture.root, entry.path, "ssh-proxy.mjs"));
    const tar = gunzipSync(bytes), offset = tar.indexOf(helper);
    assert.ok(offset >= 0, "published archive includes the helper source");
    tar[offset] ^= 1;
    writeFileSync(packed.archive, gzipSync(tar));
    assert.throws(() => validate(), /differs.*ssh-proxy\.mjs/);
    writeFileSync(packed.archive, bytes);
    const pkg = fixture.read(`${entry.path}/package.json`);
    pkg.files = pkg.files.filter(file => file !== "ssh-proxy.mjs");
    fixture.write(`${entry.path}/package.json`, pkg);
    packExtension(fixture.root, entry, dir);
    assert.throws(() => validate(), /Incomplete npm package archive/);
  } finally { fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
