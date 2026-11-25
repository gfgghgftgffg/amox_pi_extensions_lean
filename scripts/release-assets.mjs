#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { packageEntries, packExtension } from "./lib/extension-package.mjs";
import { packageTag } from "./lib/release-tags.mjs";
import { jsonText, readJson } from "./lib/files.mjs";
import { isExactStableVersion } from "./lib/semver.mjs";

export function parseReleaseList(text) {
  let parsed;
  try { parsed = JSON.parse(text ?? ""); }
  catch { throw new Error("RELEASES must be the JSON release list from the release plan"); }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("RELEASES must contain the planned package releases");
  const seen = new Set();
  return parsed.map((release) => {
    if (!release || typeof release.package !== "string" || !isExactStableVersion(release.version)) throw new Error("Invalid planned release entry");
    if (release.tag !== packageTag(release.package, release.version)) throw new Error(`Invalid planned release tag: ${release.tag}`);
    if (seen.has(release.tag)) throw new Error(`Duplicate planned release: ${release.tag}`);
    seen.add(release.tag);
    return { id: release.id, package: release.package, version: release.version, tag: release.tag };
  });
}

export function archiveName(packageName, version) {
  return `${packageName.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

// Built in the read-only verification job; write jobs only validate/upload.
// Every archive is bound to the planned package release and its own version.
export function validateReleaseAssets({ repoRoot, dir, releases = parseReleaseList(process.env.RELEASES) }) {
  const manifest = readJson(resolve(dir, "assets.json"));
  if (manifest.schemaVersion !== 3 || !Array.isArray(manifest.files)) throw new Error("Unsupported release asset schema");
  const entries = packageEntries(repoRoot);
  if (manifest.files.length !== releases.length) throw new Error("Wrong release asset count");
  const names = new Set();
  const assets = [];
  for (const release of releases) {
    const item = manifest.files.find((file) => file.package === release.package);
    const filename = archiveName(release.package, release.version);
    const entry = entries.find((candidate) => candidate.packageName === release.package);
    if (!entry || entry.version !== release.version) throw new Error(`Planned release is not the current package version: ${release.package}`);
    if (!item || item.version !== release.version || item.filename !== filename || basename(item.filename) !== item.filename || names.has(item.filename)) {
      throw new Error(`Invalid release asset identity: ${release.tag}`);
    }
    const bytes = readFileSync(resolve(dir, item.filename));
    if (item.sha256 !== createHash("sha256").update(bytes).digest("hex") || item.integrity !== `sha512-${createHash("sha512").update(bytes).digest("base64")}`) throw new Error(`Release asset hash mismatch: ${release.tag}`);
    names.add(item.filename);
    assets.push({ ...item, path: resolve(dir, item.filename) });
  }
  if (readdirSync(dir).sort().join(",") !== [...names, "assets.json"].sort().join(",")) throw new Error("Unexpected release asset files");
  return assets;
}

if (process.argv.includes("--build")) {
  const dir = resolve(".release-assets");
  if (existsSync(dir) && readdirSync(dir).length) throw new Error("Release asset directory must be empty");
  mkdirSync(dir, { recursive: true });
  const releases = parseReleaseList(process.env.RELEASES);
  const entries = packageEntries(process.cwd());
  const files = releases.map((release) => {
    const entry = entries.find((candidate) => candidate.packageName === release.package);
    if (!entry || entry.version !== release.version) throw new Error(`Planned release is not the current package version: ${release.package}`);
    const packed = packExtension(process.cwd(), entry, dir);
    if (packed.name !== release.package || packed.version !== release.version) throw new Error("Package/manifest version mismatch");
    const bytes = readFileSync(packed.archive);
    return { package: release.package, version: release.version, filename: packed.filename, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
  });
  writeFileSync(resolve(dir, "assets.json"), jsonText({ schemaVersion: 3, files }));
  validateReleaseAssets({ repoRoot: process.cwd(), dir, releases });
  console.log(`Packed ${files.length} package release asset(s): ${releases.map((release) => release.tag).join(", ")}`);
}
