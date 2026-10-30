#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { packExtension } from "./lib/extension-package.mjs";
import { releaseEntries } from "./lib/package-selection.mjs";
import { jsonText, readJson } from "./lib/files.mjs";

// Built in the read-only verification job; write jobs only validate/upload.
export function validateReleaseAssets({ repoRoot, dir }) {
  const manifest = readJson(resolve(dir, "assets.json"));
  const version = readJson(resolve(repoRoot, "package.json")).version;
  const entries = releaseEntries(repoRoot);
  if (manifest.schemaVersion !== undefined && manifest.schemaVersion !== 2) throw new Error("Unsupported release asset schema");
  if (manifest.version !== version || manifest.files?.length !== entries.length) throw new Error("Wrong asset release version/count");
  const names = new Set();
  for (const entry of entries) {
    const item = manifest.files.find((file) => file.package === entry.packageName);
    const filename = `${entry.packageName.replace(/^@/, "").replaceAll("/", "-")}-${entry.version}.tgz`;
    if ((manifest.schemaVersion === 2 || item?.version !== undefined) && item?.version !== entry.version) throw new Error("Invalid release asset version");
    if (!item || item.filename !== filename || basename(item.filename) !== item.filename || names.has(item.filename)) throw new Error("Invalid release asset identity");
    const bytes = readFileSync(resolve(dir, item.filename));
    if (item.sha256 !== createHash("sha256").update(bytes).digest("hex") || item.integrity !== `sha512-${createHash("sha512").update(bytes).digest("base64")}`) throw new Error("Release asset hash mismatch");
    names.add(item.filename);
  }
  if (readdirSync(dir).sort().join(",") !== [...names, "assets.json"].sort().join(",")) throw new Error("Unexpected release asset files");
  return manifest.files.map((file) => ({ ...file, version: entries.find((entry) => entry.packageName === file.package).version, path: resolve(dir, file.filename) }));
}

if (process.argv.includes("--build")) {
  const dir = resolve(".release-assets");
  if (existsSync(dir) && readdirSync(dir).length) throw new Error("Release asset directory must be empty");
  mkdirSync(dir, { recursive: true });
  const version = readJson("package.json").version;
  const files = releaseEntries(process.cwd()).map((entry) => {
    const packed = packExtension(process.cwd(), entry, dir);
    if (packed.version !== entry.version) throw new Error("Package/manifest version mismatch");
    const bytes = readFileSync(packed.archive);
    return { package: entry.packageName, version: entry.version, filename: packed.filename, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
  });
  writeFileSync(resolve(dir, "assets.json"), jsonText({ schemaVersion: 2, version, files }));
  validateReleaseAssets({ repoRoot: process.cwd(), dir });
  console.log(`Packed ${files.length} selected release assets for batch ${version}`);
}
